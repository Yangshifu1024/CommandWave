/**
 * Pure signal classifiers for agent state (Tier 1).
 *
 * Two sources, both needing no agent cooperation:
 *  - the OSC 0/2 window title state machine (Claude `✳`/spinner, Gemini
 *    `◇`/`✋`/`✦`, Codex spinners), and
 *  - plain output text (curated error patterns, prompt-shaped last lines).
 */

export type AgentState = "working" | "needs-you" | "error" | "done" | "idle";

/** Highest-urgency first; used when a pane shows several candidates. */
export const STATE_PRIORITY: AgentState[] = [
  "needs-you",
  "error",
  "working",
  "done",
  "idle",
];

export function stateRank(state: AgentState): number {
  const i = STATE_PRIORITY.indexOf(state);
  return i < 0 ? STATE_PRIORITY.length : i;
}

function codePoint(ch: string): number {
  return ch.codePointAt(0) ?? 0;
}

/** Braille spinner frames (U+2800–U+28FF) — the busy indicator in Claude/Codex. */
export function hasBraille(text: string): boolean {
  for (const ch of text) {
    const cp = codePoint(ch);
    if (cp >= 0x2800 && cp <= 0x28ff) return true;
  }
  return false;
}

/**
 * Infer a state from an agent's window title, or null when the title carries
 * no recognisable state (an unrelated program set it).
 */
export function classifyTitle(title: string): AgentState | null {
  if (!title) return null;
  if (title.includes("✋")) return "needs-you"; // Gemini: action required
  if (title.includes("✳")) return "idle"; // Claude: ready for input
  if (title.includes("✦")) return "working"; // Gemini: working
  if (title.includes("◇")) return "idle"; // Gemini: ready
  if (hasBraille(title)) return "working";
  return null;
}

/**
 * True when a printed line matches any configured error pattern. Patterns
 * are compiled case-insensitively; a Rust-style inline `(?i)` prefix (which
 * JS does not support) is tolerated and stripped.
 */
export function matchesErrorPattern(text: string, patterns: string[]): boolean {
  for (const raw of patterns) {
    if (!raw) continue;
    const pattern = raw.startsWith("(?i)") ? raw.slice(4) : raw;
    try {
      if (new RegExp(pattern, "i").test(text)) return true;
    } catch {
      // ignore invalid user patterns
    }
  }
  return false;
}

/** Prompt-shaped tail: "(y/n)", "Press enter", a trailing "?" or ":". */
export function looksLikePrompt(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/\((y\/n|yes\/no)\)\s*[?:]?\s*$/i.test(t)) return true;
  if (/\b(press|hit)\s+(enter|any key)\b/i.test(t)) return true;
  if (/[?:]\s*$/.test(t) && t.length < 200) return true;
  return false;
}

/** Last non-empty line of a text block. */
export function lastLine(text: string): string {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (l) return l;
  }
  return "";
}

/**
 * Classify the state implied by a pane that has gone quiet. Errors win,
 * then prompt-shaped output (waiting on the user), otherwise the turn is
 * considered finished.
 */
export function classifyIdle(lastOutput: string, errorPatterns: string[]): AgentState {
  if (matchesErrorPattern(lastOutput, errorPatterns)) return "error";
  if (looksLikePrompt(lastLine(lastOutput))) return "needs-you";
  return "done";
}

/** Human-readable notification title for a state. */
export function stateLabel(state: AgentState): string {
  switch (state) {
    case "needs-you":
      return "needs you";
    case "error":
      return "errored";
    case "done":
      return "finished";
    case "working":
      return "is working";
    default:
      return "is idle";
  }
}
