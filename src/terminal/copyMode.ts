/**
 * Copy Mode: a tmux/iTerm2-style modal state for navigating scrollback with
 * the keyboard. The state machine here is pure — TerminalPane applies its
 * intents to the xterm instance, so key routing is unit-testable.
 *
 * Line-oriented (like tmux copy mode): the cursor walks whole buffer lines;
 * `v` (or V / Space) anchors a selection start, moving extends it, and
 * y / Enter / ⌘C copies. q or Esc exits.
 */

export interface CopyModeState {
  /** absolute buffer line of the cursor */
  cursor: number;
  /** anchor line once a selection started (inclusive), else null */
  anchor: number | null;
}

/** Terminal surface Copy Mode drives (xterm IBuffer satisfies the shape). */
export interface CopyModeTerminal {
  readonly buffer: {
    active: {
      readonly length: number;
      readonly viewportY: number;
      readonly viewportHeight?: number;
    };
  };
  scrollToLine(line: number): void;
}

export type CopyModeInput =
  | { t: "move"; delta: -1 | 1 }
  | { t: "page"; delta: -1 | 1 }
  | { t: "half-page"; delta: -1 | 1 }
  | { t: "goto-top" }
  | { t: "goto-bottom" }
  | { t: "toggle-anchor" }
  | { t: "copy" }
  | { t: "exit" };

export interface CopyModeKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** Map a raw key event to a Copy Mode input, or null when unhandled. */
export function copyModeKey(e: CopyModeKey, mac = false): CopyModeInput | null {
  const primary = mac ? e.metaKey : e.ctrlKey;
  switch (e.key) {
    case "k":
    case "ArrowUp":
      return { t: "move", delta: -1 };
    case "j":
    case "ArrowDown":
      return { t: "move", delta: 1 };
    case "h":
    case "ArrowLeft":
    case "Backspace":
      return null; // line-oriented mode has no horizontal motion
    case "l":
    case "ArrowRight":
      return null;
    case "b":
      return { t: "page", delta: -1 };
    case "f":
    case " ":
      return { t: "page", delta: 1 };
    case "u":
      return { t: "half-page", delta: -1 };
    case "d":
      return { t: "half-page", delta: 1 };
    case "g":
    case "Home":
      return { t: "goto-top" };
    case "G":
    case "End":
      return { t: "goto-bottom" };
    case "v":
    case "V":
      return { t: "toggle-anchor" };
    case "y":
    case "Enter":
      return { t: "copy" };
    case "q":
    case "Escape":
      return { t: "exit" };
    case "c":
      if (primary) return { t: "copy" };
      return null;
    default:
      return null;
  }
}

function viewportH(term: CopyModeTerminal): number {
  return term.buffer.active.viewportHeight ?? 24;
}

/** Enter Copy Mode with the cursor at the viewport's top line. */
export function enterCopyMode(term: CopyModeTerminal): CopyModeState {
  return { cursor: term.buffer.active.viewportY, anchor: null };
}

/**
 * Advance the state machine; returns the next state, or null when the mode
 * should exit. `copy` returns the state (caller reads the range) — the
 * caller exits on copy per tmux convention.
 */
export function applyCopyModeInput(
  state: CopyModeState,
  input: CopyModeInput,
  term: CopyModeTerminal,
): CopyModeState | null {
  const max = term.buffer.active.length - 1;
  const clamp = (n: number) => Math.min(max, Math.max(0, n));
  switch (input.t) {
    case "move":
      return { ...state, cursor: clamp(state.cursor + input.delta) };
    case "page":
      return { ...state, cursor: clamp(state.cursor + input.delta * viewportH(term)) };
    case "half-page":
      return { ...state, cursor: clamp(state.cursor + input.delta * Math.max(1, Math.floor(viewportH(term) / 2))) };
    case "goto-top":
      return { ...state, cursor: 0 };
    case "goto-bottom":
      return { ...state, cursor: max };
    case "toggle-anchor":
      return { ...state, anchor: state.anchor === null ? state.cursor : null };
    case "copy":
    case "exit":
      return null;
  }
}

/** Selection range for copying, or null when nothing anchored. */
export function copyModeRange(state: CopyModeState): { from: number; to: number } | null {
  if (state.anchor === null) return null;
  return {
    from: Math.min(state.anchor, state.cursor),
    to: Math.max(state.anchor, state.cursor) + 1,
  };
}

/** Lines to visually highlight (cursor line, or the whole selection). */
export function copyModeHighlight(state: CopyModeState): { from: number; to: number } {
  if (state.anchor === null) return { from: state.cursor, to: state.cursor + 1 };
  return {
    from: Math.min(state.anchor, state.cursor),
    to: Math.max(state.anchor, state.cursor) + 1,
  };
}
