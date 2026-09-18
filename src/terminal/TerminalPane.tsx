import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import type { ILink } from "@xterm/xterm";
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
import { formatDuration, lastDurationMs, subscribeCommands, suggestCommands } from "./commandHistory";
import { resolveBackdrop } from "./backdrop";
import { parseOsc1337File, type OscImage } from "./oscImages";
import { decodeSixel, type SixelImage } from "./sixel";
import { captureReplay, clearReplay } from "./instantReplay";
import { detachedPane } from "./detachedWindow";
import { decryptSecret, isUnlocked, resolveSecretRefs, secretRefs } from "./secrets";
import { secretsList } from "./ipc";
import { tmuxController } from "./tmuxController";
import { parseOsc133, linesBetween } from "./paneMarks";
import { recordCommand } from "./commandHistory";
import { resolveTheme, isDarkTheme, withAlpha } from "./themes";
import {
  colorSchemeReport,
  isColorSchemeQuery,
  isColorSchemeReportMode,
  schemeReport,
} from "./colorScheme";

/** Last path segment of a directory string, for badge placeholders. */
function lastSegment(cwd: string | null): string | null {
  if (!cwd) return null;
  const trimmed = cwd.replace(/[\\/]+$/, "");
  const seg = trimmed.split(/[\\/]/).filter(Boolean).pop();
  return seg ?? trimmed;
}
import { terminalManager, type TerminalEntry } from "./manager";
import { notifyCommandFinished, onPtyExit, openExternal, openWithEditor, ptyAttach, ptyClose, ptyResize, ptyWrite, sendNotification, setProgress, spawnPty, type OutputSink } from "./ipc";
import { parseFileLink } from "./fileLinks";
import { matchAgent } from "../agent/recognition";
import {
  forgetPane,
  reportActivity,
  reportAgentDetected,
  reportAttentionSignal,
  reportHookEvent,
  reportTitle,
} from "../agent/statusController";
import { paneStatus } from "../agent/statusStore";

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

/**
 * Push a CSI ? 997 polarity report when the pane's program subscribed to them
 * (DECSET 2031). Edge-triggered: an unchanged polarity says nothing, so font
 * or cursor changes never emit bytes.
 */
function reportColorScheme(entry: TerminalEntry, dark: boolean): void {
  if (entry.ptyId === null) return;
  const report = schemeReport(entry.colorSchemeWatched, entry.reportedDark, dark);
  if (!report) return;
  entry.reportedDark = dark;
  ptyWrite(entry.ptyId, report);
}

interface TerminalPaneProps {
  paneId: string;
  cwd?: string | null;
  /** tmux control mode: mirror this tmux pane instead of spawning a PTY. */
  tmuxPaneId?: string | null;
}

/**
 * One terminal pane: owns an xterm.js instance and the PTY session that
 * feeds it. The xterm element is re-parented by the terminal manager, so
 * mounting/unmounting tracks the pane's lifetime, not tab visibility.
 */
export function TerminalPane({ paneId, cwd, tmuxPaneId }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const entryRef = useRef<ReturnType<typeof terminalManager.create> | null>(null);
  // One global settings object (stable reference); appearance follows it live.
  const settings = useSettingsStore((s) => s.settings);
  const fontFamily = settings.fontFamily ?? appearanceDefaults.fontFamily;
  const fontSize = Math.max(
    6,
    (settings.fontSize ?? appearanceDefaults.fontSize) + settings.ui.fontSizeDelta,
  );
  const themeName = settings.themeName ?? appearanceDefaults.themeName;
  // The escape-sequence handlers outlive the render that registered them, so
  // they read the polarity from this ref instead of closing over the theme.
  const darkRef = useRef(isDarkTheme(themeName));
  darkRef.current = isDarkTheme(themeName);
  const inCopyMode = useAppStore((s) => s.copyModePane === paneId);
  const broadcasting = useAppStore((s) => s.broadcast);
  const backdrop = useMemo(() => resolveBackdrop(settings), [settings]);
  // Badge placeholders resolve against the live pane meta (cwd etc.).
  const badgeTemplate = settings.badge ?? null;
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
        .replaceAll(
          "{duration}",
          (lastDurationMs(paneId) ?? -1) >= 0
            ? formatDuration(lastDurationMs(paneId) ?? -1)
            : "—",
        )
    : null;
  // Badges with {duration} refresh when a command finishes.
  const [, bumpHistory] = useState(0);
  useEffect(() => subscribeCommands(() => bumpHistory((v) => v + 1)), []);

  // Live-apply appearance changes to the existing terminal instance.
  useEffect(() => {
    const term = termRef.current;
    const entry = entryRef.current;
    if (!term || !entry) return;
    term.options.fontFamily = fontFamily;
    term.options.fontSize = fontSize;
    term.options.theme = resolveTheme(themeName, settings.customColors);
    if (settings.cursorStyle) term.options.cursorStyle = settings.cursorStyle;
    if (settings.cursorBlink !== null && settings.cursorBlink !== undefined) {
      term.options.cursorBlink = settings.cursorBlink;
    }
    if (settings.lineHeight) term.options.lineHeight = settings.lineHeight;
    if (settings.letterSpacing) term.options.letterSpacing = settings.letterSpacing;
    if (settings.scrollback) term.options.scrollback = settings.scrollback;
    entry.doFit();
    // A program that subscribed to polarity reports (DECSET 2031) has to hear
    // about a theme flip, otherwise it keeps the colors it queried at startup.
    reportColorScheme(entry, darkRef.current);
  }, [fontFamily, fontSize, themeName, settings]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let exited = false;
    let unlistenExit: (() => void) | undefined;

    const theme = resolveTheme(themeName, settings.customColors);
    if (backdrop.translucent) {
      // Composite over the pane's backdrop image / the desktop (window is
      // created with transparent: true; body paints opaque otherwise).
      const bg = theme.background ?? "#1a1d23";
      const rgba = withAlpha(typeof bg === "string" ? bg : "#1a1d23", backdrop.bgAlpha);
      if (rgba) theme.background = rgba;
    }
    const term = new Terminal({
      fontFamily,
      fontSize,
      theme,
      cursorBlink: settings.cursorBlink ?? true,
      cursorStyle: settings.cursorStyle ?? "block",
      lineHeight: settings.lineHeight ?? 1,
      letterSpacing: settings.letterSpacing ?? 0,
      scrollback: settings.scrollback ?? scrollbackLines,
      allowTransparency: backdrop.translucent,
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
      if (tmuxPaneId) {
        tmuxController.resizePane(tmuxPaneId, term.cols, term.rows);
      } else if (entry.ptyId !== null) {
        ptyResize(entry.ptyId, term.rows, term.cols);
      }
    };
    // The manager opened the terminal into its pool; PaneView re-parents it.

    // Clickable links open with the system handler.
    term.loadAddon(new WebLinksAddon((_event, uri) => void openExternal(uri)));

    // File paths (optionally :line:col) open with the configured editor.
    const FILE_LINK_RE = /(?:[A-Za-z]:)?(?:[~/.\w-]+[/\\]){1,}[\w.+-]+(?::\d+(?::\d+)?)?/g;
    const openFileLink = (linkText: string) => {
      const link = parseFileLink(linkText);
      if (!link) return;
      const settings = useSettingsStore.getState().settings;
      const editor = settings.editorCommand?.trim();
      if (editor) {
        const target = link.line !== null ? `${link.path}:${link.line}` : link.path;
        openWithEditor(editor, target);
      } else {
        void openExternal(link.path);
      }
    };
    term.registerLinkProvider({
      provideLinks: (lineNumber, callback) => {
        const line = term.buffer.active.getLine(lineNumber - 1);
        if (!line) {
          callback([]);
          return;
        }
        const text = line.translateToString(true);
        const links: ILink[] = [];
        FILE_LINK_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = FILE_LINK_RE.exec(text))) {
          if (parseFileLink(m[0]) === null) continue;
          const start = m.index;
          const end = start + m[0].length - 1;
          const linkText = m[0];
          links.push({
            range: { start: { x: start, y: lineNumber - 1 }, end: { x: end, y: lineNumber - 1 } },
            text: linkText,
            activate: (_e: MouseEvent, text: string) => openFileLink(text),
          });
        }
        callback(links);
      },
    });

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
      // tmux-mirrored panes forward input as send-keys commands.
      if (tmuxPaneId) {
        tmuxController.handleInput(tmuxPaneId, data);
        return;
      }
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
    // Trigger/auto-answer payloads may reference vault secrets
    // ({secret:name}); unresolved refs are sent verbatim.
    const sendResolved = async (text: string): Promise<string> => {
      if (!secretRefs(text).length) return text;
      if (!isUnlocked()) return text;
      try {
        return await resolveSecretRefs(text, async (name) => {
          const blob = (await secretsList()).find((e) => e.name === name);
          return blob ? await decryptSecret(blob) : null;
        });
      } catch {
        return text;
      }
    };
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
          void sendResolved(param ?? "").then((text) => ptyWrite(entry.ptyId!, text));
        }
      }
      const answer = matchAutoAnswer(line, settings.autoAnswers);
      if (answer && entry.ptyId !== null) {
        void sendResolved(answer.reply).then((text) => ptyWrite(entry.ptyId!, `${text}\r`));
      }
    };
    const handleTriggerChunk = (chunk: Uint8Array | string) => {
      const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      // Agent activity: only tracked once a known agent is recognised.
      reportActivity(paneId, stripAnsi(text));
      const { lines, rest } = feedLines(triggerBuf, text);
      triggerBuf = rest;
      for (const line of lines) evaluateLine(line);
      updateAutocomplete();
    };

    // Inline images (imgcat OSC 1337): decoded into a per-pane tray.
    const imgTray = document.createElement("div");
    imgTray.className = "pane-image-tray";
    container.appendChild(imgTray);
    const pushImage = (img: OscImage) => {
      const el = document.createElement("img");
      const mime = img.mime || "image/png";
      let binary = "";
      for (const b of img.bytes) binary += String.fromCharCode(b);
      el.src = `data:${mime};base64,${btoa(binary)}`;
      el.title = img.name;
      el.addEventListener("click", () => el.remove());
      imgTray.appendChild(el);
      while (imgTray.children.length > 3) imgTray.firstElementChild?.remove();
    };
    const pushSixel = (img: SixelImage) => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.putImageData(
          new ImageData(
            new Uint8ClampedArray(img.rgba.buffer as ArrayBuffer),
            img.width,
            img.height,
          ),
          0,
          0,
        );
        const el = document.createElement("img");
        el.src = canvas.toDataURL();
        el.title = "sixel image";
        el.addEventListener("click", () => el.remove());
        imgTray.appendChild(el);
        while (imgTray.children.length > 3) imgTray.firstElementChild?.remove();
      } catch {
        // canvas unavailable
      }
    };
    term.parser.registerOscHandler(1337, (data) => {
      if (!data.startsWith("File=")) return false;
      const img = parseOsc1337File(data);
      if (img) pushImage(img);
      return false;
    });

    // Sixel graphics (DCS q … ST) decode into the same image tray.
    term.parser.registerDcsHandler({ final: "q" }, (data) => {
      const img = decodeSixel(data);
      if (img) pushSixel(img);
      return false;
    });

    // Instant Replay snapshots: capture the tail of the buffer every 10s so
    // ⇧⌘B-style replay can show the pane's state in the recent past.
    const replayTimer = setInterval(() => {
      if (exited) return;
      captureReplay(paneId, term.buffer.active);
    }, 10_000);

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
      // Tier 1: the agent's OSC 0/2 title encodes busy / ready / needs-input.
      reportTitle(paneId, title);
    });

    // BEL: many agents ring once when they want the user (aider's default).
    term.onBell(() => reportAttentionSignal(paneId));

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
      // ConEmu-style progress (OSC 9;4;progress[;state]) → taskbar.
      const progress = /^9;4;(\d+(?:\.\d+)?)(?:;.*)?$/.exec(data);
      if (progress) {
        setProgress(Number.parseFloat(progress[1]));
      }
      // Plain OSC 9 is the ConEmu/kitty desktop-notification form (Codex,
      // Gemini and others emit it when an action is required).
      if (!data.startsWith("9;")) reportAttentionSignal(paneId, data);
      return false;
    });
    // rxvt/urxvt desktop notification ("notify;title;body").
    term.parser.registerOscHandler(777, (data) => {
      reportAttentionSignal(paneId, data);
      return false;
    });

    // Color-scheme reporting (DECSET 2031): the program subscribes to be told
    // when the terminal's light/dark polarity changes, and CSI ? 996 n asks for
    // the current polarity. xterm.js implements neither, so the mode is tracked
    // here and the answer travels over the ordinary PTY write path.
    term.parser.registerCsiHandler({ prefix: "?", final: "h" }, (params) => {
      if (!isColorSchemeReportMode(params)) return false;
      entry.colorSchemeWatched = true;
      // A fresh subscriber gets the current polarity right away.
      reportColorScheme(entry, darkRef.current);
      return false;
    });
    term.parser.registerCsiHandler({ prefix: "?", final: "l" }, (params) => {
      if (!isColorSchemeReportMode(params)) return false;
      entry.colorSchemeWatched = false;
      // Forget the last report: a later re-subscribe must answer again.
      entry.reportedDark = null;
      return false;
    });
    term.parser.registerCsiHandler({ prefix: "?", final: "n" }, (params) => {
      if (!isColorSchemeQuery(params)) return false;
      if (entry.ptyId !== null) {
        // An explicit question is always answered, flipped polarity or not.
        entry.reportedDark = darkRef.current;
        ptyWrite(entry.ptyId, colorSchemeReport(darkRef.current));
      }
      // Swallow it: xterm's device-status handler would drop 996 unanswered.
      return true;
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
        // Tier 1: recognise a known agent from the command line.
        if (runningCommandText) {
          const agent = matchAgent(runningCommandText);
          if (agent) reportAgentDetected(paneId, agent);
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
        const ranMs = entry.runningSince !== null ? Date.now() - entry.runningSince : 0;
        if (paneStatus(paneId)) {
          // A recognised agent's foreground command returned to the shell:
          // report the process-level finish / failure.
          reportHookEvent(paneId, parsed.exitCode === 0 ? "finished" : "error");
        } else {
          // Ordinary command: notify when it finished while unfocused.
          const notify =
            useSettingsStore.getState().settings.notifications.events.finished;
          if (notify && ranMs >= 2000 && !document.hasFocus()) {
            const tab = useAppStore
              .getState()
              .tabs.find((t) => paneId in t.paneMeta);
            void notifyCommandFinished(
              parsed.exitCode,
              tab?.title ?? "CommandWave",
            );
          }
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

    // Self-heal: shells spawned during the window's startup window can come
    // up wedged (no banner, no echo — conhost deadlock). If nothing was
    // written within 6s while the PTY is still alive, replace it once.
    let spawnRetries = 0;
    let spawnWithRetry: (() => void) | null = null;

    const handleOutput = (data: Uint8Array | string) => {
      term.write(data);
      handleTriggerChunk(data);
    };

    if (tmuxPaneId) {
      // tmux control mode: no local PTY; output arrives via the controller.
      entry.tmuxPaneId = tmuxPaneId;
    } else if (detachedPane && detachedPane.paneId === paneId) {
      entry.ptyId = detachedPane.ptyId;
      const sink: OutputSink = (data) => {
        term.write(data);
        handleTriggerChunk(data);
      };
      ptyAttach(detachedPane.ptyId, sink);
    } else {
      spawnWithRetry = () => {
        spawnPty({ rows: term.rows, cols: term.cols, cwd: cwd ?? null, shell: settings.shell ?? null, env: settings.env ?? null, paneId }, handleOutput)
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
      };
      spawnWithRetry();
    }

    // Watchdog: swap a wedged shell for a fresh one (single retry). The
    // test is *visible content*, not raw output — conhost emits an
    // initialization sequence even for wedged shells.
    const watchdog = setTimeout(() => {
      if (disposed || exited || tmuxPaneId) return;
      if (entry.ptyId === null || spawnRetries >= 1 || !spawnWithRetry) return;
      const b = term.buffer.active;
      for (let i = 0; i < b.length; i++) {
        const line = b.getLine(i);
        if (line && line.translateToString(true).trim()) return; // healthy
      }
      spawnRetries += 1;
      const wedged = entry.ptyId;
      entry.ptyId = null;
      ptyClose(wedged);
      spawnWithRetry();
    }, 6000);

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
      clearTimeout(watchdog);
      clearInterval(replayTimer);
      observer.disconnect();
      term.element?.removeEventListener("mousedown", onMouseDown, true);
      if (useAppStore.getState().copyModePane === paneId) {
        useAppStore.setState({ copyModePane: null });
      }
      unlistenExit?.();
      // Panes moved to another window keep their PTY alive.
      if (entry.ptyId !== null && !useAppStore.getState().isDetaching(paneId)) {
        ptyClose(entry.ptyId);
      }
      terminalManager.dispose(paneId);
      clearReplay(paneId);
      forgetPane(paneId);
    };
  }, [paneId, cwd]);

  return (
    <div ref={containerRef} className="terminal-pane">
      {inCopyMode && (
        <div className="copy-mode-banner" role="status">
          COPY MODE · hjkl/↑↓ move · ⌃/⌥f/b page · v select · y copy · q quit
        </div>
      )}
      {backdrop.imageUrl && (
        <div
          className="pane-bg-image"
          style={{
            backgroundImage: `url("${backdrop.imageUrl}")`,
            opacity: backdrop.imageOpacity,
          }}
        />
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
