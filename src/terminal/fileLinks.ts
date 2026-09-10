/**
 * ⌘/Ctrl-click file links: recognize file paths (optionally with :line or
 * :line:col) in terminal output and resolve them to {path, line} for the
 * configured editor command.
 */

export interface FileLink {
  path: string;
  line: number | null;
}

/**
 * Parse a matched link text like "src/main.rs", "C:\\proj\\a.ts:42",
 * "/usr/bin/env:3:5". Returns null when the text doesn't look like a path.
 */
export function parseFileLink(text: string): FileLink | null {
  let t = text.trim().replace(/[.,;:)'"]+$/, "");
  let line: number | null = null;
  // Strip up to two trailing ":number" segments (:line and :line:col).
  // The drive colon in "C:\…" is never numeric, so it is never stripped.
  for (let i = 0; i < 2; i++) {
    const m = /^(.*):(\d+)$/.exec(t);
    if (!m || !m[1]) break;
    t = m[1];
    line = Number.parseInt(m[2], 10);
  }
  if (!t) return null;
  // Require at least one path separator, or a leading ./ ../ / ~/ or drive.
  const hasStructure =
    /[/\\]/.test(t) || /^\.{1,2}\//.test(t) || /^[A-Za-z]:/.test(t) || t.startsWith("~");
  if (!hasStructure) return null;
  // Reject things that are clearly URLs (handled by the web-links addon).
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return null;
  return { path: t, line };
}
