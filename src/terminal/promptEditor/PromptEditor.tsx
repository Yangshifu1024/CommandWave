import { useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from "react";

import {
  appearanceDefaults,
  defaultPromptSettings,
  useSettingsStore,
} from "../../store/settingsStore";
import {
  allCommands,
  lastDurationMs,
  subscribeCommands,
  suggestCommands,
} from "../commandHistory";
import { completionSuffix, filterSuggestions } from "../autocomplete";
import { envInfo, ptyWrite, type EnvInfo } from "../ipc";
import { getHomeDir } from "../paneTitle";
import { terminalManager } from "../manager";
import {
  resolveSegments,
  wantedEnvSegments,
  historyDown,
  historyText,
  historyUp,
  type HistoryState,
} from "./promptModel";

export interface PromptEditorHandle {
  focus(): void;
  /** Route characters that reached xterm while the card owns input. */
  append(text: string): void;
  backspace(): void;
  submit(): void;
}

interface PromptEditorProps {
  paneId: string;
  cwd: string | null;
  /** Called after a submit so the host can hide the card until the D mark. */
  onSubmitted: () => void;
  /** Ref holding the imperative handle (owned by the host pane). */
  handleRef: RefObject<PromptEditorHandle | null>;
}

/**
 * The native input card of the block model: a bottom-pinned card with a
 * configurable segment header (cwd / git / duration / exit / languages) and
 * a multi-line input area. Visible only while the shell is idle at a prompt
 * (the host gates mounting on `editorVisible`).
 */
export function PromptEditor({ paneId, cwd, onSubmitted, handleRef }: PromptEditorProps) {
  const settings = useSettingsStore((s) => s.settings);
  // Belt for stores persisted before the prompt schema existed.
  const prompt = settings.prompt ?? defaultPromptSettings;
  const fontFamily = settings.fontFamily ?? appearanceDefaults.fontFamily;
  const fontSize = Math.max(
    6,
    (settings.fontSize ?? appearanceDefaults.fontSize) + settings.ui.fontSizeDelta,
  );

  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");
  const [histState, setHistState] = useState<HistoryState>({ index: -1, draft: "" });
  const [env, setEnv] = useState<EnvInfo | null>(null);
  const [, bumpCommands] = useState(0);
  const localHistory = useRef<string[]>([]);
  const submitRef = useRef<() => void>(() => {});

  // Refresh duration/exit/history when a command finishes anywhere.
  useEffect(() => subscribeCommands(() => bumpCommands((v) => v + 1)), []);

  // Environment segments (git + language versions) per directory, debounced.
  const wantedKey = wantedEnvSegments(prompt).join(",");
  useEffect(() => {
    const wanted = wantedKey ? wantedKey.split(",") : [];
    if (!cwd || wanted.length === 0) {
      setEnv(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void envInfo(cwd, wanted).then((info) => {
        if (!cancelled) setEnv(info);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cwd, wantedKey]);

  const durationMs = lastDurationMs(paneId);
  const lastExitCode = useMemo(() => {
    const recs = allCommands();
    for (let i = recs.length - 1; i >= 0; i--) {
      if (recs[i].paneId === paneId) return recs[i].exitCode;
    }
    return null;
  }, [paneId, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const history = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const cmd of localHistory.current) {
      if (!seen.has(cmd)) {
        seen.add(cmd);
        out.push(cmd);
      }
    }
    const recs = allCommands();
    for (let i = recs.length - 1; i >= 0; i--) {
      const r = recs[i];
      if (r.paneId !== paneId || seen.has(r.command)) continue;
      seen.add(r.command);
      out.push(r.command);
    }
    return out;
  }, [paneId, histState]); // eslint-disable-line react-hooks/exhaustive-deps

  const segments = useMemo(
    () =>
      resolveSegments(prompt, {
        cwd,
        home: getHomeDir(),
        env,
        durationMs,
        lastExitCode,
      }),
    [prompt, cwd, env, durationMs, lastExitCode],
  );

  const ghost = useMemo(() => {
    if (!input || input.includes("\n")) return null;
    const best = filterSuggestions(input, suggestCommands(input, 3))[0];
    if (!best) return null;
    const suffix = completionSuffix(input, best);
    return suffix ? { suggestion: best, suffix } : null;
  }, [input]);

  const submit = () => {
    const entry = terminalManager.get(paneId);
    const text = input.replace(/\n+$/, "");
    if (entry?.ptyId != null) {
      if (text.length > 0) {
        localHistory.current = [text, ...localHistory.current].slice(0, 100);
        ptyWrite(entry.ptyId, text + "\r");
      } else {
        ptyWrite(entry.ptyId, "\r");
      }
    }
    setInput("");
    setHistState({ index: -1, draft: "" });
    onSubmitted();
  };
  submitRef.current = submit;

  useImperativeHandle(handleRef, () => ({
    focus: () => inputRef.current?.focus({ preventScroll: true }),
    append: (t) => setInput((v) => v + t),
    backspace: () => setInput((v) => v.slice(0, -1)),
    submit: () => submitRef.current(),
  }));

  // Own the keyboard while visible; hand it back to xterm when unmounted.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    const term = terminalManager.get(paneId)?.term;
    return () => term?.focus();
  }, [paneId]);

  // A plain click on the output area (no drag selection) returns focus to
  // the card — the terminal buffer is view-only while the card owns input.
  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      const card = cardRef.current;
      if (!card || !(e.target instanceof Node)) return;
      if (card.contains(e.target)) return;
      const pane = card.closest(".pane");
      if (!pane || !pane.contains(e.target)) return;
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) return;
      inputRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);

  // ⌘/Ctrl+L (prompt.focus command) — dispatched per active pane.
  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<{ paneId?: string }>).detail;
      if (!detail || detail.paneId === paneId) {
        inputRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("cw-focus-prompt", onFocus);
    return () => window.removeEventListener("cw-focus-prompt", onFocus);
  }, [paneId]);

  const applyHistory = (next: HistoryState) => {
    setHistState(next);
    setInput(historyText(next, history));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (ghost) setInput(input + ghost.suffix);
      return;
    }
    if (e.key === "ArrowUp" && !input.includes("\n")) {
      e.preventDefault();
      applyHistory(historyUp(histState, history));
      return;
    }
    if (e.key === "ArrowDown" && !input.includes("\n")) {
      e.preventDefault();
      applyHistory(historyDown(histState));
      return;
    }
    if (e.key === "c" && e.ctrlKey && !e.metaKey && !e.shiftKey) {
      // With a selection this stays the default copy; otherwise it clears
      // the line and sends ^C so the shell resets the prompt.
      const el = e.currentTarget;
      if (el.selectionStart === el.selectionEnd) {
        e.preventDefault();
        setInput("");
        setHistState({ index: -1, draft: "" });
        const entry = terminalManager.get(paneId);
        if (entry?.ptyId != null) ptyWrite(entry.ptyId, "\x03");
      }
    }
  };

  const autoSize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const symbolClass =
    lastExitCode == null ? "" : lastExitCode === 0 ? " ok" : " fail";

  return (
    <div className="prompt-card" ref={cardRef}>
      <div className="prompt-header">
        <div className="prompt-seg-group">
          {segments.left.map((s) => (
            <span key={s.id + s.text} className="prompt-seg" style={{ color: s.color }}>
              {s.text}
            </span>
          ))}
        </div>
        <div className="prompt-seg-group right">
          {segments.right.map((s) => (
            <span key={s.id + s.text} className="prompt-seg" style={{ color: s.color }}>
              {s.text}
            </span>
          ))}
        </div>
      </div>
      <div className="prompt-input-row" style={{ fontFamily: fontFamily || undefined, fontSize }}>
        <span className={`prompt-symbol${symbolClass}`}>{prompt.inputSymbol}</span>
        <textarea
          ref={inputRef}
          className="prompt-input"
          rows={1}
          value={input}
          spellCheck={false}
          onChange={(e) => {
            setInput(e.target.value);
            autoSize(e.target);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {ghost && (
        <button
          type="button"
          className="prompt-ghost-row"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setInput(input + ghost.suffix)}
        >
          ⇥ {ghost.suggestion}
        </button>
      )}
    </div>
  );
}
