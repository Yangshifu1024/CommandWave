import { describe, expect, it } from "vitest";

import {
  normalizeLanguageSetting,
  normalizeLocale,
  resolveLocale,
  systemLanguageTag,
} from "./locale";

describe("normalizeLocale", () => {
  it("maps every Chinese variant to the simplified pack", () => {
    expect(normalizeLocale("zh")).toBe("zh-CN");
    expect(normalizeLocale("zh-CN")).toBe("zh-CN");
    expect(normalizeLocale("zh-Hans-CN")).toBe("zh-CN");
    expect(normalizeLocale("zh-TW")).toBe("zh-CN");
    expect(normalizeLocale("ZH-hk")).toBe("zh-CN");
  });

  it("falls back to English for every other language", () => {
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("de-DE")).toBe("en");
    expect(normalizeLocale("ja")).toBe("en");
    expect(normalizeLocale("")).toBe("en");
    expect(normalizeLocale(null)).toBe("en");
    expect(normalizeLocale(undefined)).toBe("en");
  });
});

describe("resolveLocale", () => {
  it("honours an explicit setting over the system language", () => {
    expect(resolveLocale("en", "zh-CN")).toBe("en");
    expect(resolveLocale("zh-CN", "en-US")).toBe("zh-CN");
  });

  it("follows the system language when the setting is \"system\"", () => {
    expect(resolveLocale("system", "zh-CN")).toBe("zh-CN");
    expect(resolveLocale("system", "zh-TW")).toBe("zh-CN");
    expect(resolveLocale("system", "fr-FR")).toBe("en");
  });

  it("treats missing or unknown stored values as \"system\"", () => {
    expect(resolveLocale(undefined, "zh-CN")).toBe("zh-CN");
    expect(resolveLocale(null, "zh-CN")).toBe("zh-CN");
    expect(resolveLocale("klingon", "zh-CN")).toBe("zh-CN");
    expect(resolveLocale(42, "en-GB")).toBe("en");
  });

  it("reads the runtime system language when none is given", () => {
    // Whatever the test machine reports, the result must be a shipped locale.
    expect(["en", "zh-CN"]).toContain(resolveLocale("system"));
    expect(typeof systemLanguageTag()).toBe("string");
  });
});

describe("normalizeLanguageSetting", () => {
  it("keeps the three supported values", () => {
    expect(normalizeLanguageSetting("system")).toBe("system");
    expect(normalizeLanguageSetting("en")).toBe("en");
    expect(normalizeLanguageSetting("zh-CN")).toBe("zh-CN");
  });

  it("replaces anything else with the default", () => {
    expect(normalizeLanguageSetting("zh")).toBe("system");
    expect(normalizeLanguageSetting("")).toBe("system");
    expect(normalizeLanguageSetting(undefined)).toBe("system");
    expect(normalizeLanguageSetting({ language: "en" })).toBe("system");
  });
});
