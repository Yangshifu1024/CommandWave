import { describe, expect, it } from "vitest";

import { resources } from "./locales";

/** Every leaf path of a language pack, e.g. "menu.help.about". */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

const en = keyPaths(resources.en.translation);
const zh = keyPaths(resources["zh-CN"].translation);

describe("language packs", () => {
  it("carry the same keys in both languages", () => {
    // A key added to the English pack but not to the Chinese one would show
    // English text in a Chinese UI — the whole point of this test.
    expect(zh.filter((key) => !en.includes(key))).toEqual([]);
    expect(en.filter((key) => !zh.includes(key))).toEqual([]);
  });

  it("have no duplicate key paths", () => {
    expect(new Set(en).size).toBe(en.length);
    expect(new Set(zh).size).toBe(zh.length);
  });

  it("have no empty or whitespace-only strings", () => {
    const blank = (keys: string[], pack: unknown, locale: string) =>
      keys.filter((key) => {
        const value = key.split(".").reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)[part],
          pack as Record<string, unknown>,
        );
        return typeof value !== "string" || value.trim() === "";
      }).map((key) => `${locale}:${key}`);

    expect([...blank(en, resources.en.translation, "en"), ...blank(zh, resources["zh-CN"].translation, "zh-CN")]).toEqual(
      [],
    );
  });
});
