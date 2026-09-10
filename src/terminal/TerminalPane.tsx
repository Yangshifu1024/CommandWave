import { useEffect, useLayoutEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";

import {
  appearanceDefaults,
  scrollbackLines,
  useSettingsStore,
} from "../store/settingsStore";
import { useAppStore } from "../store/appStore";
import { parseOscCwd } from "./paneTitle";
import { normalizeRect, pixelToCell, rectText } from "./rectSelect";
import { parseOsc133 } from "./paneMarks";
import { getTheme } from "./themes";
import { terminalManager } from "./manager";
import { notifyCommandFinished, onPtyExit, openExternal, ptyClose, ptyResize, ptyWrite, spawnPty } from "./ipc";

interface TerminalPaneProps {
  paneId: string;
  cwd?: string | null;
  shell?: string | null;
  /** Profile the pane was spawned with (null = default). */
  profileId?: string | null;
}

/**
 * One terminal pane: owns an xterm.js instance and the PTY session that
 * feeds it. The xterm element is re-parented by the terminal manager, so
 * mounting/unmounting tracks the pane's lifetime, not tab visibility.
 */
export function TerminalPane({ paneId, cwd, shell, profileId }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const entryRef = useRef<ReturnType<typeof terminalManager.create> | null>(null);
  // Select the profile object (stable reference), derive values locally:
  // zustand v5 requires selectors not to build fresh objects per read.
  // Appearance follows the pane's spawn profile, so split panes from
  // different profiles can coexist with different looks.
  const profile = useSettingsStore((s) => {
    if (profileId != null) {
      const p = s.settings.profiles.find((x) => x.id === profileId);
      if (p) return p;
    }
    return (
      s.settings.profiles.find((p) => p.id === s.settings.defaultProfileId) ??
      s.settings.profiles[0]
    );
  });
  const fontFamily = profile?.fontFamily ?? appearanceDefaults.fontFamily;
  const fontDelta = useSettingsStore((s) => s.settings.ui.fontSizeDelta);
  const fontSize = Math.max(
    6,
    (profile?.fontSize ?? appearanceDefaults.fontSize) + fontDelta,
  );
  const themeName = profile?.themeName ?? appearanceDefaults.themeName;
  const inCopyMode = useAppStore((s) => s.copyModePane === paneId);

  // Live-apply appearance changes to the existing terminal instance.
  useEffect(() => {
    const term = termRef.current;
    const entry = entryRef.current;
    if (!term || !entry) return;
    term.options.fontFamily = fontFamily;
    term.options.fontSize = fontSize;
    term.options.theme = getTheme(themeName);
    entry.doFit();
  }, [fontFamily, fontSize, themeName]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let exited = false;
    let unlistenExit: (() => void) | undefined;

    const term = new Terminal({
      fontFamily,
      fontSize,
      theme: getTheme(themeName),
      cursorBlink: true,
      scrollback: scrollbackLines,
      // required for SearchAddon highlight decorations (IDecoration API)
      allowProposedApi: true,
      // No overviewRuler: xterm paints its canvas opaque white when no
      // decorations exist, showing up as a white strip on the right edge.
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);

    const search = new SearchAddon();
    term.loadAddon(search);

    const entry = terminalManager.create(paneId, term, fit);
    entry.search = search;
    entryRef.current = entry;
    entry.doFit = () => {
      try {
        fit.fit();
      } catch {
        return;
      }
      if (entry.ptyId !== null) {
        ptyResize(entry.ptyId, term.rows, term.cols);
      }
    };
    // The manager opened the terminal into its pool; PaneView re-parents it.

    // Clickable links open with the system handler.
    term.loadAddon(new WebLinksAddon((_event, uri) => void openExternal(uri)));

    // Prefer the GPU renderer; fall back silently where WebGL is unavailable.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // DOM/canvas renderer keeps working
    }

    const observer = new ResizeObserver(() => {
      if (terminalManager.isAttached(paneId)) entry.doFit();
    });
    observer.observe(container);

    // ⌥/Alt-drag rectangle (column) selection: capture the mousedown before
    // xterm's flow selection, highlight the column block, copy on release.
    const cellMetrics = () => {
      const el = term.element;
      if (!el) return null;
      // Prefer xterm's own cell metrics; fall back to element size / grid.
      const core = (term as unknown as {
        _core?: { _renderService?: { dimensions?: { css?: { cell?: { width: number; height: number } } } } };
      })._core;
      const css = core?._renderService?.dimensions?.css?.cell;
      const cellWidth = css?.width || el.clientWidth / term.cols;
      const cellHeight = css?.height || el.clientHeight / term.rows;
      return { cellWidth, cellHeight, cols: term.cols, rows: term.rows, baseY: term.buffer.active.baseY };
    };
    const rectCleanup = () => {
      for (const { deco, marker } of rectDecos) {
        try { deco.dispose(); } catch { /* disposed */ }
        try { marker.dispose(); } catch { /* disposed */ }
      }
      rectDecos = [];
    };
    let rectDecos: { deco: import("@xterm/xterm").IDecoration; marker: import("@xterm/xterm").IMarker }[] = [];
    let rectStart: { x: number; y: number } | null = null;
    let rectCur: { x: number; y: number } | null = null;
    const paintRect = () => {
      rectCleanup();
      if (!rectStart || !rectCur) return;
      const rect = normalizeRect({
        x1: rectStart.x, y1: rectStart.y, x2: rectCur.x, y2: rectCur.y,
      });
      const buf = term.buffer.active;
      const refLine = buf.baseY + buf.cursorY;
      for (let y = rect.y1; y <= rect.y2; y++) {
        const marker = term.registerMarker(y - refLine);
        if (!marker || marker.line < 0) continue;
        try {
          const deco = term.registerDecoration({
            marker,
            x: rect.x1,
            width: rect.x2 - rect.x1 + 1,
            backgroundColor: "rgba(79, 156, 249, 0.30)",
            layer: "top",
          });
          if (deco) rectDecos.push({ deco, marker });
          else marker.dispose();
        } catch {
          marker.dispose();
        }
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || !e.altKey) return;
      const metrics = cellMetrics();
      const el = term.element;
      if (!metrics || !el) return;
      e.preventDefault();
      e.stopPropagation();
      const bounds = el.getBoundingClientRect();
      const cell = () =>
        pixelToCell(e.clientX - bounds.left, e.clientY - bounds.top, metrics);
      rectStart = cell();
      rectCur = rectStart;
      paintRect();
      const onMove = (ev: MouseEvent) => {
        rectCur = pixelToCell(ev.clientX - bounds.left, ev.clientY - bounds.top, metrics);
        paintRect();
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (rectStart && rectCur) {
          const text = rectText(term.buffer.active, {
            x1: rectStart.x, y1: rectStart.y, x2: rectCur.x, y2: rectCur.y,
          });
          if (text) void navigator.clipboard?.writeText(text).catch(() => {});
        }
        rectStart = null;
        rectCur = null;
        rectCleanup();
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
    term.element?.addEventListener("mousedown", onMouseDown, true);

    term.onData((data) => {
      if (entry.ptyId !== null && !exited) {
        ptyWrite(entry.ptyId, data);
      }
    });

    term.onTitleChange((title) => {
      useAppStore.getState().onPaneTitle(paneId, title);
    });

    // Shell integration: OSC 7 ("file://host/path") and ConEmu-style OSC 9;9
    // both report the shell's working directory; use them for tab titles.
    term.parser.registerOscHandler(7, (data) => {
      const cwd = parseOscCwd(data);
      if (cwd) useAppStore.getState().onPaneCwd(paneId, cwd);
      return false;
    });
    term.parser.registerOscHandler(9, (data) => {
      if (data.startsWith("9;")) {
        const cwd = parseOscCwd(data.slice(2));
        if (cwd) useAppStore.getState().onPaneCwd(paneId, cwd);
      }
      return false;
    });

    // Shell integration: OSC 133 prompt marks (A=prompt, C=command running,
    // D;exit=finished) drive prompt jumping, exit-code highlights and
    // copy-last-output.
    let lastPromptMarker: ReturnType<Terminal["registerMarker"]> | null = null;
    term.parser.registerOscHandler(133, (data) => {
      const parsed = parseOsc133(data);
      if (!parsed) return false;
      if (parsed.kind === "prompt") {
        const marker = term.registerMarker(0);
        if (marker) {
          terminalManager.addMark(paneId, "prompt", marker);
          lastPromptMarker = marker;
        }
      } else if (parsed.kind === "output") {
        const marker = term.registerMarker(0);
        if (marker) terminalManager.addMark(paneId, "output", marker);
        entry.runningPrompt = lastPromptMarker;
        entry.runningSince = Date.now();
      } else if (parsed.kind === "finish") {
        if (parsed.exitCode !== 0 && entry.runningPrompt && entry.runningPrompt.line >= 0) {
          try {
            // Flag the failed command's prompt line.
            term.registerDecoration({
              marker: entry.runningPrompt,
              backgroundColor: "rgba(224, 108, 117, 0.28)",
              layer: "top",
            });
          } catch {
            // decoration API unavailable — skip highlight
          }
        }
        // Notify when a non-trivial command finished while unfocused.
        const ranMs = entry.runningSince !== null ? Date.now() - entry.runningSince : 0;
        const notify =
          useSettingsStore.getState().settings.notifications.commandCompletion;
        if (notify && ranMs >= 2000 && !document.hasFocus()) {
          const tab = useAppStore
            .getState()
            .tabs.find((t) => paneId in t.paneMeta);
          void notifyCommandFinished(
            parsed.exitCode,
            tab?.title ?? "CommandWave",
          );
        }
        entry.runningPrompt = null;
        entry.runningSince = null;
      }
      return false;
    });

    try {
      fit.fit();
    } catch {
      // ignore first-fit failures
    }

    spawnPty({ rows: term.rows, cols: term.cols, cwd: cwd ?? null, shell: shell ?? null }, (data) => {
      term.write(data);
    })
      .then((handle) => {
        if (disposed) {
          ptyClose(handle.ptyId);
          return;
        }
        entry.ptyId = handle.ptyId;
        entry.doFit(); // size may have changed while the shell was starting
      })
      .catch((err) => {
        term.write(`\r\n\x1b[31mFailed to start shell: ${err}\x1b[0m\r\n`);
      });

    onPtyExit((ptyId, exitCode) => {
      if (ptyId !== entry.ptyId) return;
      exited = true;
      term.write(
        `\r\n\x1b[2m[Process completed (exit code ${exitCode})]\x1b[0m\r\n`,
      );
    }).then((u) => {
      unlistenExit = u;
    });

    return () => {
      disposed = true;
      observer.disconnect();
      term.element?.removeEventListener("mousedown", onMouseDown, true);
      if (useAppStore.getState().copyModePane === paneId) {
        useAppStore.setState({ copyModePane: null });
      }
      unlistenExit?.();
      if (entry.ptyId !== null) ptyClose(entry.ptyId);
      terminalManager.dispose(paneId);
    };
  }, [paneId, cwd, shell]);

  return (
    <div ref={containerRef} className="terminal-pane">
      {inCopyMode && (
        <div className="copy-mode-banner" role="status">
          COPY MODE · hjkl/↑↓ move · ⌃/⌥f/b page · v select · y copy · q quit
        </div>
      )}
    </div>
  );
}
