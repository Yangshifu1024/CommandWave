/**
 * Guard rails for the built-in color schemes: unique names, well-formed colors,
 * polarity consistency, a license credit for every theme, the dark/light split,
 * readability of the theme-driven chrome, and the migration of names that were
 * dropped in the licensing audit. Provenance: THIRD-PARTY-NOTICES.md.
 */
import { describe, expect, it } from "vitest";
import type { ITheme } from "@xterm/xterm";

import {
  COLOR_KEYS,
  LICENSE_WHITELIST,
  getTheme,
  isDarkTheme,
  migrateThemeName,
  removedThemeAliases,
  themes,
  themesByPolarity,
} from "./themes";

const HEX = /^#[0-9a-f]{6}$/;

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** ITheme colors are optional; the lookup keeps the assertions readable. */
const slot = (theme: ITheme, key: string): string =>
  (theme as unknown as Record<string, string>)[key];

describe("built-in themes", () => {
  it("has unique names", () => {
    expect(new Set(themes.map((t) => t.name)).size).toBe(themes.length);
  });

  it("defines every slot as a hex color", () => {
    for (const t of themes) {
      for (const key of COLOR_KEYS) {
        expect(slot(t.theme, key), `${t.name}.${key}`).toMatch(HEX);
      }
    }
  });

  it("marks polarity consistently with the background", () => {
    for (const t of themes) {
      const dark = luminance(slot(t.theme, "background")) < 0.5;
      expect(dark, `${t.name} polarity`).toBe(t.dark);
    }
  });

  it("credits every theme with a whitelisted license", () => {
    for (const t of themes) {
      expect(t.credit.source, `${t.name} source`).toBeTruthy();
      expect(LICENSE_WHITELIST as readonly string[], `${t.name} license`).toContain(
        t.credit.license,
      );
    }
  });

  it("splits into two non-empty groups", () => {
    const dark = themesByPolarity(true);
    const light = themesByPolarity(false);
    expect(dark.length).toBeGreaterThan(0);
    expect(light.length).toBeGreaterThan(0);
    expect(dark.length + light.length).toBe(themes.length);
    expect(dark.every((t) => t.dark)).toBe(true);
    expect(light.every((t) => !t.dark)).toBe(true);
  });

  it("keeps the theme-driven chrome readable", () => {
    // The whole chrome (title bar, sidebar, settings) follows the theme, so body
    // text has to stay legible. Themes added in the audit must clear WCAG AA;
    // the legacy ones predate it and only need the secondary-text floor.
    const failures: string[] = [];
    for (const t of themes) {
      const ratio = contrast(slot(t.theme, "background"), slot(t.theme, "foreground"));
      const floor = t.group === "added" ? 4.5 : 3;
      if (ratio < floor) failures.push(`${t.name} (${t.group}): ${ratio.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });

  it("falls back to the first theme for an unknown name", () => {
    expect(getTheme("No Such Theme")).toEqual(themes[0].theme);
    expect(isDarkTheme("No Such Theme")).toBe(themes[0].dark);
    expect(isDarkTheme("Gruvbox Light")).toBe(false);
  });

  it("never ships a name dropped in the licensing audit", () => {
    for (const name of Object.keys(removedThemeAliases)) {
      expect(themes.some((t) => t.name === name), name).toBe(false);
    }
  });

  it("migrates dropped names to a built-in replacement", () => {
    expect(Object.keys(removedThemeAliases).sort()).toEqual([
      "Dark Pastel",
      "Light Background",
      "Nord",
      "Tango Light",
    ]);
    expect(migrateThemeName("Nord")).toBe("Nordfox");
    expect(migrateThemeName("Dark Pastel")).toBe(themes[0].name);
    for (const [from, to] of Object.entries(removedThemeAliases)) {
      if (to) expect(themes.some((t) => t.name === to), `${from} -> ${to}`).toBe(true);
    }
  });

  it("leaves live names and empty values alone", () => {
    expect(migrateThemeName("CommandWave Dark")).toBeNull();
    expect(migrateThemeName("Gruvbox Light")).toBeNull();
    expect(migrateThemeName(null)).toBeNull();
    expect(migrateThemeName(undefined)).toBeNull();
    expect(migrateThemeName("")).toBeNull();
  });
});
