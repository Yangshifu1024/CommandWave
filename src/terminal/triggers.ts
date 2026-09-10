/**
 * Trigger engine: iTerm2-style regex triggers over printed terminal lines,
 * plus auto-answers (prompt → instant reply). Pure matching logic lives
 * here; TerminalPane owns the line accumulation and the side effects.
 */

import type { AutoAnswer, Trigger } from "../store/settingsStore";

export interface CompiledTrigger {
  def: Trigger;
  re: RegExp;
}

/** Compile triggers, silently skipping invalid regexes. */
export function compileTriggers(triggers: Trigger[]): CompiledTrigger[] {
  const out: CompiledTrigger[] = [];
  for (const def of triggers) {
    if (!def.enabled || !def.regex) continue;
    try {
      out.push({
        def,
        re: new RegExp(def.regex, def.caseSensitive ? "" : "i"),
      });
    } catch {
      // invalid regex — skip rather than break the terminal
    }
  }
  return out;
}

export interface TriggerHit {
  def: Trigger;
}

/** All triggers whose regex matches the (already ANSI-stripped) line. */
export function matchTriggers(line: string, compiled: CompiledTrigger[]): TriggerHit[] {
  const hits: TriggerHit[] = [];
  for (const t of compiled) {
    if (t.re.test(line)) hits.push({ def: t.def });
  }
  return hits;
}

/** First enabled auto-answer whose pattern matches, or null. */
export function matchAutoAnswer(line: string, answers: AutoAnswer[]): AutoAnswer | null {
  for (const a of answers) {
    if (!a.enabled || !a.pattern) continue;
    try {
      if (new RegExp(a.pattern, "i").test(line)) return a;
    } catch {
      // skip invalid patterns
    }
  }
  return null;
}

/** Strip ANSI CSI/OSC/other escape sequences from raw PTY text. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "") // OSC … ST/BEL
    .replace(/\x1b[P^_][^\x1b]*\x1b\\/g, "") // DCS/PM/APC … ST
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[@-_][0-9;<=>?]*[@-~]/g, "") // CSI/other short escapes
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ""); // remaining control chars
}

/** Split a text chunk into complete lines, keeping the trailing partial. */
export function feedLines(buffer: string, chunk: string): { lines: string[]; rest: string } {
  const combined = buffer + chunk;
  const normalized = combined.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = normalized.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}
