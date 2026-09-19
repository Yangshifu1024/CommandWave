/**
 * Import iTerm2 color schemes (`.itermcolors` files, XML plists with
 * "Red/Green/Blue Component" float dicts). Produces a ColorOverrides map
 * that layers on top of any built-in theme.
 */

import type { ColorOverrides } from "./themes";

/** Map iTerm2 plist keys → our color slots. */
const KEY_MAP: Record<string, keyof ColorOverrides> = {
  "Background Color": "background",
  "Foreground Color": "foreground",
  "Cursor Color": "cursor",
  "Cursor Text Color": "cursorAccent",
  "Selection Color": "selectionBackground",
  "Ansi 0 Color": "black",
  "Ansi 1 Color": "red",
  "Ansi 2 Color": "green",
  "Ansi 3 Color": "yellow",
  "Ansi 4 Color": "blue",
  "Ansi 5 Color": "magenta",
  "Ansi 6 Color": "cyan",
  "Ansi 7 Color": "white",
  "Ansi 8 Color": "brightBlack",
  "Ansi 9 Color": "brightRed",
  "Ansi 10 Color": "brightGreen",
  "Ansi 11 Color": "brightYellow",
  "Ansi 12 Color": "brightBlue",
  "Ansi 13 Color": "brightMagenta",
  "Ansi 14 Color": "brightCyan",
  "Ansi 15 Color": "brightWhite",
};

interface FlatEntry {
  key: string;
  value: string;
  /** The key is followed by a nested <dict>: a color name, not a component. */
  dict: boolean;
}

/** Extract flat <key> → value pairs in document order. Color names are
 * followed by <dict>, so they are collected as their own tokens and merged
 * by document position with the component values. */
function extractEntries(xml: string): FlatEntry[] {
  const tokens: { pos: number; entry: FlatEntry }[] = [];
  const values = /<key>(.*?)<\/key>\s*<(?:real|integer|string)>(.*?)</g;
  let m: RegExpExecArray | null;
  while ((m = values.exec(xml))) {
    tokens.push({ pos: m.index, entry: { key: m[1], value: m[2], dict: false } });
  }
  const names = /<key>(.*?)<\/key>\s*<dict>/g;
  while ((m = names.exec(xml))) {
    tokens.push({ pos: m.index, entry: { key: m[1], value: "", dict: true } });
  }
  tokens.sort((a, b) => a.pos - b.pos);
  return tokens.map((t) => t.entry);
}

function toHex(rgb: [number, number, number]): string {
  const [r, g, b] = rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * Parse an .itermcolors XML plist into color overrides. The plist nests
 * component dicts under color-name keys; after flattening, a color name is
 * followed by its Red/Green/Blue Component entries. Returns null when no
 * color could be extracted.
 *
 * Real iTerm2 exports put more than the components inside each color dict
 * (`Alpha Component`, `Color Space`) and carry color keys we do not map
 * (`Bold Color`, `Cursor Guide Color`, `Selected Text Color`), so only a
 * nested-dict key ends the color being collected; stray scalars are ignored.
 * Files whose color dicts start with one of those keys used to parse to null
 * (or, when the first key was a component, to a silently gutted two-color
 * result).
 */
export function parseItermColors(xml: string): ColorOverrides | null {
  if (!xml.includes("<dict>")) return null;
  const entries = extractEntries(xml);

  const out: ColorOverrides = {};
  let currentName: string | null = null;
  let rgb: [number, number, number] | null = null;

  const flush = () => {
    if (currentName && rgb) {
      const slot = KEY_MAP[currentName];
      if (slot) out[slot] = toHex(rgb);
    }
    currentName = null;
    rgb = null;
  };

  for (const { key, value, dict } of entries) {
    const comp = /^(Red|Green|Blue) Component$/.exec(key);
    if (comp && !dict) {
      const idx = comp[1] === "Red" ? 0 : comp[1] === "Green" ? 1 : 2;
      rgb ??= [0, 0, 0];
      rgb[idx] = Number.parseFloat(value);
      continue;
    }
    // Only a color dict ends the color we are collecting — an unmapped one
    // (e.g. Bold Color) still delimits it, its components must not leak into
    // the previous color.
    if (!dict) continue;
    flush();
    if (KEY_MAP[key]) currentName = key;
  }
  flush();

  return Object.keys(out).length > 0 ? out : null;
}
