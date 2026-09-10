/**
 * Inline autocomplete: suggest commands from history as the user types at a
 * prompt. The terminal's cursor line (with prompt) is heuristically split;
 * matching pure helpers are unit tested.
 */

/** Heuristic prompt terminator used to split the cursor line. */
const PROMPT_RE = /[>$#%❯»]\s?/;

/**
 * Extract the current input from a full cursor line ("user@host:~$ git st"
 * → "git st"). Returns null when the line looks like command output rather
 * than an interactive prompt line.
 */
export function extractInput(fullLine: string): string | null {
  if (!fullLine.trim()) return null;
  const idx = lastPromptIndex(fullLine);
  if (idx === -1) return null;
  return fullLine.slice(idx).trimStart();
}

function lastPromptIndex(line: string): number {
  let idx = -1;
  const re = new RegExp(PROMPT_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) idx = m.index + m[0].length;
  return idx;
}

/**
 * The text to send to complete `input` into `suggestion` — null when the
 * suggestion does not extend the input verbatim.
 */
export function completionSuffix(input: string, suggestion: string): string | null {
  if (!suggestion.startsWith(input) || suggestion === input) return null;
  return suggestion.slice(input.length);
}

/** Suggestions worth showing: those the input can be completed into. */
export function filterSuggestions(input: string, suggestions: string[]): string[] {
  if (!input.trim()) return [];
  return suggestions.filter((s) => completionSuffix(input, s) !== null);
}
