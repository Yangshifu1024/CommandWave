/**
 * OSC 133 (FinalTerm-style prompt marks) helpers.
 *
 * The shell emits A (prompt start), C (command executing) and D;exit
 * (command finished) around each command; see shell_integration.rs. These
 * pure helpers parse the payloads and extract text ranges between marks so
 * the UI can jump between prompts and copy the previous command's output.
 */

export type Osc133 =
  | { kind: "prompt" }
  | { kind: "output" }
  | { kind: "finish"; exitCode: number };

/** Parse an OSC 133 payload: "A" | "C" | "D" | "D;0". */
export function parseOsc133(data: string): Osc133 | null {
  const raw = data.trim();
  if (raw === "A") return { kind: "prompt" };
  if (raw === "C") return { kind: "output" };
  if (raw === "D") return { kind: "finish", exitCode: 0 };
  if (raw.startsWith("D;")) {
    const code = Number.parseInt(raw.slice(2), 10);
    if (Number.isNaN(code)) return null;
    return { kind: "finish", exitCode: code < 0 ? 256 + code : code };
  }
  return null;
}

/** Minimal read-only buffer surface needed to extract lines (xterm
 * IBuffer satisfies this; tests inject a fake). */
export interface MarkBuffer {
  readonly length: number;
  getLine(line: number): { translateToString(trimRight?: boolean): string } | undefined;
}

/**
 * Join buffer lines [fromLine, toLineExclusive) into one string, trimming
 * trailing whitespace per line. Out-of-range lines are skipped, so ranges
 * that reach beyond the buffer (or into trimmed scrollback) still produce
 * the visible remainder.
 */
export function linesBetween(
  buffer: MarkBuffer,
  fromLine: number,
  toLineExclusive: number,
): string {
  const parts: string[] = [];
  const upper = Math.min(toLineExclusive, buffer.length);
  for (let i = Math.max(0, fromLine); i < upper; i++) {
    const line = buffer.getLine(i);
    parts.push(line ? line.translateToString(true) : "");
  }
  return parts.join("\n");
}

/** A mark line of -1 means its marker was disposed (trimmed scrollback). */
export function isLiveLine(line: number): boolean {
  return line >= 0;
}

/**
 * Pick the prompt line to jump to relative to the viewport's top line.
 * direction -1 = previous prompt (strictly above), +1 = next prompt
 * (strictly below). Returns null when there is none in that direction.
 */
export function nextPromptLine(
  promptLines: number[],
  viewportTop: number,
  direction: -1 | 1,
): number | null {
  const live = promptLines.filter(isLiveLine);
  if (live.length === 0) return null;
  if (direction === -1) {
    let best: number | null = null;
    for (const line of live) {
      if (line < viewportTop && (best === null || line > best)) best = line;
    }
    return best;
  }
  let best: number | null = null;
  for (const line of live) {
    if (line > viewportTop && (best === null || line < best)) best = line;
  }
  return best;
}
