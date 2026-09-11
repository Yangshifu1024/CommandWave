/**
 * Pure model for the native prompt card (block model): segment resolution,
 * editor visibility gating and history navigation. No xterm/DOM imports —
 * everything here is unit tested.
 */

import type { PromptSettings } from "../../store/settingsStore";
import type { EnvInfo } from "../ipc";
import { formatDuration } from "../commandHistory";

export interface SegmentView {
  id: string;
  text: string;
  /** CSS color for the segment text. */
  color: string;
}

/** Language segment ids with a version detector on the Rust side. */
export const LANGUAGE_SEGMENT_IDS = [
  "node",
  "bun",
  "deno",
  "python",
  "go",
  "rust",
  "java",
  "ruby",
  "php",
  "dotnet",
] as const;

/** Default per-segment colors (readable on light and dark themes). */
const DEFAULT_COLORS: Record<string, string> = {
  cwd: "var(--accent)",
  git: "#3fb950",
  duration: "var(--fg-dim)",
  exit: "var(--danger)",
  language: "#a371f7",
};

/** Small glyphs for the language version segments. */
const LANGUAGE_GLYPHS: Record<string, string> = {
  node: "⬢",
  bun: "🥟",
  deno: "🦕",
  python: "🐍",
  go: "🐹",
  rust: "🦀",
  java: "☕",
  ruby: "💎",
  php: "🐘",
  dotnet: ".NET",
};

/** Abbreviate the home directory to `~` (path and home both normalized). */
export function abbrevHome(path: string, home: string | null): string {
  if (!home) return path;
  const norm = path.replace(/[\\/]+$/, "");
  const h = home.replace(/[\\/]+$/, "");
  if (norm === h) return "~";
  if (norm.startsWith(h + "/")) return "~" + norm.slice(h.length);
  if (norm.startsWith(h + "\\")) return "~" + norm.slice(h.length);
  return path;
}

interface SegmentContext {
  cwd: string | null;
  home: string | null;
  env: EnvInfo | null;
  durationMs: number | null;
  lastExitCode: number | null;
}

function colorFor(prompt: PromptSettings, id: string, fallbackKey: string): string {
  return prompt.colors[id] ?? DEFAULT_COLORS[fallbackKey] ?? "var(--fg)";
}

function segment(id: string, ctx: SegmentContext, prompt: PromptSettings): SegmentView | null {
  if (id === "cwd") {
    if (!ctx.cwd) return null;
    return {
      id,
      text: abbrevHome(ctx.cwd, ctx.home),
      color: colorFor(prompt, "cwd", "cwd"),
    };
  }
  if (id === "git") {
    const git = ctx.env?.git;
    if (!git) return null;
    const dirty = git.dirtyCount > 0 ? ` *${git.dirtyCount}` : "";
    return { id, text: `${git.branch}${dirty}`, color: colorFor(prompt, "git", "git") };
  }
  if (id === "duration") {
    if (ctx.durationMs === null || ctx.durationMs < 0) return null;
    return {
      id,
      text: formatDuration(ctx.durationMs),
      color: colorFor(prompt, "duration", "duration"),
    };
  }
  if (id === "exit") {
    // Warp style: only shown when the previous command failed.
    if (ctx.lastExitCode === null || ctx.lastExitCode === 0) return null;
    return { id, text: `✕ ${ctx.lastExitCode}`, color: colorFor(prompt, "exit", "exit") };
  }
  if ((LANGUAGE_SEGMENT_IDS as readonly string[]).includes(id)) {
    const lang = ctx.env?.languages.find((l) => l.id === id);
    if (!lang) return null;
    const glyph = LANGUAGE_GLYPHS[id] ?? "";
    return {
      id,
      text: glyph ? `${glyph} ${lang.version}` : lang.version,
      color: colorFor(prompt, id, "language"),
    };
  }
  if (id.startsWith("text:")) {
    const literal = id.slice("text:".length);
    if (!literal) return null;
    return { id, text: literal, color: colorFor(prompt, id, id) };
  }
  return null;
}

/** Resolve the configured segment lists into renderable views. */
export function resolveSegments(
  prompt: PromptSettings,
  ctx: SegmentContext,
): { left: SegmentView[]; right: SegmentView[] } {
  const render = (ids: string[]) =>
    ids.flatMap((id) => segment(id, ctx, prompt) ?? []);
  return { left: render(prompt.left), right: render(prompt.right) };
}

/** Every segment id the pane needs environment data for. */
export function wantedEnvSegments(prompt: PromptSettings): string[] {
  const ids = [...prompt.left, ...prompt.right].filter(
    (id) => id === "git" || (LANGUAGE_SEGMENT_IDS as readonly string[]).includes(id),
  );
  return [...new Set(ids)];
}

export interface EditorGate {
  mode: string;
  /** The pane is the focused pane of the active tab. */
  paneActive: boolean;
  /** OSC 133 C seen and D pending (a command is running). */
  running: boolean;
  /** The shell owns the screen (alternate screen / TUI app). */
  altScreen: boolean;
  copyMode: boolean;
  broadcast: boolean;
  /** tmux control-mode mirrored pane (prompt state unknown). */
  tmuxPane: boolean;
  /** The pane's PTY has exited. */
  exited: boolean;
}

/** Whether the native input card should own the keyboard right now. */
export function editorVisible(g: EditorGate): boolean {
  return (
    g.mode === "blocks" &&
    g.paneActive &&
    !g.running &&
    !g.altScreen &&
    !g.copyMode &&
    !g.broadcast &&
    !g.tmuxPane &&
    !g.exited
  );
}

/**
 * Input-line history navigation. `index` points into a most-recent-first
 * list; -1 is the live draft. Up moves to older entries, Down back toward
 * the draft; both clamp at the ends.
 */
export interface HistoryState {
  index: number;
  draft: string;
}

export function historyUp(state: HistoryState, history: string[]): HistoryState {
  const next = Math.min(state.index + 1, history.length - 1);
  if (next < 0) return state;
  return { index: next, draft: state.draft };
}

export function historyDown(state: HistoryState): HistoryState {
  const next = state.index - 1;
  if (next < -1) return { index: -1, draft: state.draft };
  return { index: next, draft: state.draft };
}

export function historyText(state: HistoryState, history: string[]): string {
  if (state.index < 0 || state.index >= history.length) return state.draft;
  return history[state.index] ?? state.draft;
}
