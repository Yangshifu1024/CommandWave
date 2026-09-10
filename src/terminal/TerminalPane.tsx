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
import { compileTriggers, feedLines, matchAutoAnswer, matchTriggers, stripAnsi } from "./triggers";
import { completionSuffix, extractInput, filterSuggestions } from "./autocomplete";
import { suggestCommands } from "./commandHistory";
import { parseOsc133, linesBetween } from "./paneMarks";
import { recordCommand } from "./commandHistory";
import { resolveTheme, withAlpha } from "./themes";

/** Last path segment of a directory string, for badge placeholders. */
function lastSegment(cwd: string | null): string | null {
  if (!cwd) return null;
  const trimmed = cwd.replace(/[\\/]+$/, "");
  const seg = trimmed.split(/[\\/]/).filter(Boolean).pop();
  return seg ?? trimmed;
}
import { terminalManager } from "./manager";
import { notifyCommandFinished, onPtyExit, openExternal, ptyClose, ptyResize, ptyWrite, sendNotification, spawnPty } from "./ipc";

/** Short beep via WebAudio (trigger "sound" action). */
let audioCtx: AudioContext | null = null;
function playBeep(): void {
  try {
    audioCtx ??= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch {
    // audio unavailable — silent
  }
}

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
  const broadcasting = useAppStore((s) => s.broadcast);
  // Badge placeholders resolve against the live pane meta (cwd etc.).
  const badgeTemplate = profile?.badge ?? null;
  const paneCwd = useAppStore((s) => {
    for (const tab of s.tabs) {
      const meta = tab.paneMeta[paneId];
      if (meta) return meta.cwd ?? meta.spawnCwd ?? null;
    }
    return null;
  });
  const badgeText = badgeTemplate
    ? badgeTemplate
        .replaceAll("{cwd}", lastSegment(paneCwd) ?? "—")
        .replaceAll("{profile}", profile?.name ?? "—")
    : null;

  // Live-apply appearance changes to the existing terminal instance.
  useEffect(() => {
    const term = termRef.current;
    const entry = entryRef.current;
    if (!term || !entry) return;
    term.options.fontFamily = fontFamily;
    term.options.fontSize = fontSize;
    term.options.theme = resolveTheme(themeName, profile?.customColors ?? null);
    if (profile?.cursorStyle) term.options.cursorStyle = profile.cursorStyle;
    if (profile?.cursorBlink !== null && profile?.cursorBlink !== undefined) {
      term.options.cursorBlink = profile.cursorBlink;
    }
    if (profile?.lineHeight) term.options.lineHeight = profile.lineHeight;
    if (profile?.letterSpacing) term.options.letterSpacing = profile.letterSpacing;
    if (profile?.scrollback) term.options.scrollback = profile.scrollback;
    entry.doFit();
  }, [fontFamily, fontSize, themeName, profile]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let exited = false;
    let unlistenExit: (() => void) | undefined;

    const opacity = profile?.backgroundOpacity ?? null;
    const theme = resolveTheme(themeName, profile?.customColors ?? null);
    if (opacity !== null && opacity < 1) {
      // Composite over the pane's backdrop color (see .terminal-pane CSS).
      const bg = theme.background ?? "#1a1d23";
      const rgba = withAlpha(typeof bg === "string" ? bg : "#1a1d23", opacity);
      if (rgba) theme.background = rgba;
    }
    const term = new Terminal({
      fontFamily,
      fontSize,
      theme,
      cursorBlink: profile?.cursorBlink ?? true,
      cursorStyle: profile?.cursorStyle ?? "block",
      lineHeight: profile?.lineHeight ?? 1,
      letterSpacing: profile?.letterSpacing ?? 0,
      scrollback: profile?.scrollback ?? scrollbackLines,
      allowTransparency: opacity !== null && opacity < 1,
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
      // Alt+1..3 accept an autocomplete suggestion (ESC-prefixed digit).
      if (/^\x1b[1-3]$/.test(data) && tryAutocompleteKey(data[1])) return;
      if (useAppStore.getState().broadcast) {
        // Broadcast input: every live pane receives the keystrokes.
        for (const e of terminalManager.allEntries()) {
          if (e.ptyId !== null) ptyWrite(e.ptyId, data);
        }
        return;
      }
      if (entry.ptyId !== null && !exited) {
        ptyWrite(entry.ptyId, data);
      }
    });

    // Triggers & auto-answers: accumulate printed text into lines and match
    // them against the user's trigger list (invalid regexes are skipped).
    let triggerBuf = "";
    const decoder = new TextDecoder();
    const evaluateLine = (rawLine: string) => {
      const line = stripAnsi(rawLine);
      if (!line.trim()) return;
      const settings = useSettingsStore.getState().settings;
      for (const hit of matchTriggers(line, compileTriggers(settings.triggers))) {
        const { action, param } = hit.def;
        if (action === "highlight") {
          try {
            const marker = term.registerMarker(-1);
            if (marker && marker.line >= 0) {
              const deco = term.registerDecoration({
                marker,
                backgroundColor: param || "rgba(224, 200, 80, 0.35)",
                layer: "top",
              });
              if (!deco) marker.dispose();
            }
          } catch {
            // decoration API unavailable
          }
        } else if (action === "notify") {
          void sendNotification(param || "Trigger fired", line.slice(0, 120));
        } else if (action === "sound") {
          playBeep();
        } else if (action === "send-text" && entry.ptyId !== null) {
          ptyWrite(entry.ptyId, param ?? "");
        }
      }
      const answer = matchAutoAnswer(line, settings.autoAnswers);
      if (answer && entry.ptyId !== null) {
        ptyWrite(entry.ptyId, `${answer.reply}\r`);
      }
    };
    const handleTriggerChunk = (chunk: Uint8Array | string) => {
      const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      const { lines, rest } = feedLines(triggerBuf, text);
      triggerBuf = rest;
      for (const line of lines) evaluateLine(line);
      updateAutocomplete();
    };

    // Inline autocomplete: a small imperative overlay above the prompt that
    // lists history commands extending the current input; Alt+1..3 or click
    // completes by sending the missing suffix.
    let tryAutocompleteKey: (digit: string) => boolean = () => false;
    const acEl = document.createElement("div");
    acEl.className = "autocomplete hidden";
    let acInput = "";
    let acItems: string[] = [];
    const renderAutocomplete = () => {
      if (acItems.length === 0) {
        acEl.classList.add("hidden");
        return;
      }
      acEl.classList.remove("hidden");
      acEl.replaceChildren(
        ...acItems.map((s, i) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = s;
          btn.dataset.acIndex = String(i);
          return btn;
        }),
      );
    };
    const updateAutocomplete = () => {
      if (!useSettingsStore.getState().settings.ui.autocomplete) {
        acItems = [];
        renderAutocomplete();
        return;
      }
      const buf = term.buffer.active;
      const line = buf.getLine(buf.baseY + buf.cursorY);
      const input = line ? extractInput(line.translateToString(true)) : null;
      if (input === null) {
        acItems = [];
        acInput = "";
      } else if (input !== acInput) {
        acInput = input;
        acItems = filterSuggestions(input, suggestCommands(input, 3));
      }
      renderAutocomplete();
    };
    acEl.addEventListener("mousedown", (e) => {
      const btn = (e.target as HTMLElement).closest("button");
      const idx = Number(btn?.dataset.acIndex ?? -1);
      if (idx >= 0 && entry.ptyId !== null && acItems[idx]) {
        const suffix = completionSuffix(acInput, acItems[idx]);
        if (suffix) ptyWrite(entry.ptyId, suffix);
      }
      e.preventDefault();
      acItems = [];
      renderAutocomplete();
    });
    container.appendChild(acEl);
    tryAutocompleteKey = (digit) => {
      const item = acItems[Number(digit) - 1];
      if (!item || entry.ptyId === null) return false;
      const suffix = completionSuffix(acInput, item);
      if (!suffix) return false;
      ptyWrite(entry.ptyId, suffix);
      acItems = [];
      renderAutocomplete();
      return true;
    };

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
    let runningCommandText: string | null = null;
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
        // The prompt line holds the command text being executed.
        if (lastPromptMarker && lastPromptMarker.line >= 0) {
          const line = term.buffer.active.getLine(lastPromptMarker.line);
          runningCommandText = line ? line.translateToString(true).trim() : null;
        }
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
        // Record into the command history (Recent Commands / autocomplete).
        if (runningCommandText) {
          const prompts = entry.marks.filter(
            (m) => m.kind === "prompt" && m.marker.line >= 0,
          );
          const promptLine = prompts.length > 0 ? prompts[prompts.length - 1].marker.line : undefined;
          const outputEnd = term.buffer.active.length;
          const outputFrom = promptLine !== undefined && promptLine >= 0 ? promptLine + 1 : Math.max(0, outputEnd - 5);
          recordCommand({
            paneId,
            command: runningCommandText,
            durationMs: ranMs > 0 ? ranMs : -1,
            exitCode: parsed.exitCode,
            cwd:
              useAppStore.getState().tabs.find((t) => paneId in t.paneMeta)?.paneMeta[paneId]
                ?.cwd ?? null,
            output: linesBetween(term.buffer.active, outputFrom, outputEnd),
            at: Date.now(),
          });
        }
        runningCommandText = null;
      }
      return false;
    });

    try {
      fit.fit();
    } catch {
      // ignore first-fit failures
    }

    spawnPty({ rows: term.rows, cols: term.cols, cwd: cwd ?? null, shell: shell ?? null, env: profile?.env ?? null }, (data) => {
      term.write(data);
      handleTriggerChunk(data);
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
      {badgeText && <div className="pane-badge">{badgeText}</div>}
      {broadcasting && (
        <div className="broadcast-banner" role="status">
          BROADCAST INPUT — keystrokes go to every pane (toggle to disable)
        </div>
      )}
    </div>
  );
}
