/**
 * Minimal TOML surgery for the starship config editor: read/update the
 * common top-level settings without a full TOML dependency. Pure and
 * unit-testable.
 */

/** Read a top-level `key = value` line from TOML text (quoted or bare). */
export function tomlGetValue(text: string, key: string): string | null {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*(?:"([^"]*)"|([^\\s#]+))`, "m");
  const m = re.exec(text);
  return m ? (m[1] ?? m[2]) : null;
}

/** Read a top-level `key = true/false`. */
export function tomlGetBool(text: string, key: string): boolean | null {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*(true|false)`, "m");
  const m = re.exec(text);
  return m ? m[1] === "true" : null;
}

/** Set (or insert before the first `[section]`) a top-level key. */
export function tomlSetValue(text: string, key: string, value: string): string {
  const line = `${key} = ${value}`;
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  const sectionIdx = text.search(/^\s*\[/m);
  if (sectionIdx === -1) {
    return text.trimEnd() + (text.trim() ? "\n" : "") + line + "\n";
  }
  return text.slice(0, sectionIdx) + line + "\n" + text.slice(sectionIdx);
}
