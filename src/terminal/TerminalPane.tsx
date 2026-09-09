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
import { getTheme } from "./themes";
import { terminalManager } from "./manager";
import { onPtyExit, openExternal, ptyClose, ptyResize, ptyWrite, spawnPty } from "./ipc";

interface TerminalPaneProps {
  paneId: string;
  cwd?: string | null;
  shell?: string | null;
}

/**
 * One terminal pane: owns an xterm.js instance and the PTY session that
 * feeds it. The xterm element is re-parented by the terminal manager, so
 * mounting/unmounting tracks the pane's lifetime, not tab visibility.
 */
export function TerminalPane({ paneId, cwd, shell }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const entryRef = useRef<ReturnType<typeof terminalManager.create> | null>(null);
  // Select the profile object (stable reference), derive values locally:
  // zustand v5 requires selectors not to build fresh objects per read.
  const profile = useSettingsStore(
    (s) =>
      s.settings.profiles.find((p) => p.id === s.settings.defaultProfileId) ??
      s.settings.profiles[0],
  );
  const fontFamily = profile?.fontFamily ?? appearanceDefaults.fontFamily;
  const fontSize = profile?.fontSize ?? appearanceDefaults.fontSize;
  const themeName = profile?.themeName ?? appearanceDefaults.themeName;

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
      overviewRuler: { width: 12 },
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
      unlistenExit?.();
      if (entry.ptyId !== null) ptyClose(entry.ptyId);
      terminalManager.dispose(paneId);
    };
  }, [paneId, cwd, shell]);

  return <div ref={containerRef} className="terminal-pane" />;
}
