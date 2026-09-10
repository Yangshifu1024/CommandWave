/**
 * Paste guard: decide whether a paste needs an explicit confirmation
 * (multi-line, very large, or containing obviously destructive commands)
 * before it reaches the shell. iTerm2-style "warn on paste".
 */

/** Commands that are never pasted without a second look. */
const DANGEROUS = [
  /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/i,
  /\bmkfs(\.\w+)?\b/i,
  /\bdd\s+[^\n]*\bof=\/dev\//i,
  /:\(\)\s*\{\s*:\|:\s*&\s*\};:/, // fork bomb
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bchmod\s+-R\s+777\s+\//i,
  /\bgit\s+push\s+(-\w+\s+)*--force\b/i,
];

/** Pastes above this size always confirm, whatever the content. */
const LARGE_PASTE_BYTES = 8 * 1024;

export interface PasteWarning {
  reason: "multiline" | "large" | "dangerous" | "both";
}

/**
 * Returns a warning reason when the paste should be confirmed first, or
 * null when it is safe to paste silently.
 */
export function inspectPaste(
  text: string,
  options: { multilineWarns: boolean } = { multilineWarns: true },
): PasteWarning | null {
  if (!text) return null;
  const multiline = options.multilineWarns && /[\r\n]/.test(text);
  const large = text.length > LARGE_PASTE_BYTES;
  const dangerous = DANGEROUS.some((re) => re.test(text));
  if (dangerous) return { reason: "both" };
  if (multiline) return { reason: "multiline" };
  if (large) return { reason: "large" };
  return null;
}

/** Short one-line preview for the confirmation dialog. */
export function pastePreview(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
