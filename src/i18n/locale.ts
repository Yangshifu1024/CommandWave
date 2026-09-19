/**
 * Locale rules, kept as pure functions so they can be unit-tested without a
 * DOM (see `locale.test.ts`).
 *
 * Two concepts are separated on purpose:
 * - `LanguageSetting` is what the settings file stores: "system" | "en" | "zh-CN".
 * - `Locale` is what the UI actually renders: "en" | "zh-CN".
 */

export const LOCALES = ["en", "zh-CN"] as const;
export type Locale = (typeof LOCALES)[number];

export const LANGUAGE_SETTINGS = ["system", "en", "zh-CN"] as const;
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

/** Every shipped locale must carry the reference pack's keys; `en` is it. */
export const REFERENCE_LOCALE: Locale = "en";
export const FALLBACK_LOCALE: Locale = "en";

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return typeof value === "string" && (LANGUAGE_SETTINGS as readonly string[]).includes(value);
}

/**
 * Anything unusable in the settings file (missing key, an older value, a typo)
 * means "follow the system", which is also the default for new installs.
 */
export function normalizeLanguageSetting(value: unknown): LanguageSetting {
  return isLanguageSetting(value) ? value : "system";
}

/**
 * Map a system language tag onto a shipped locale. Every Chinese variant
 * (`zh`, `zh-Hans`, `zh-TW`, `zh-HK`) resolves to the simplified pack — it is
 * the only Chinese pack we ship — and everything else resolves to English.
 */
export function normalizeLocale(tag: string | null | undefined): Locale {
  if (typeof tag !== "string") return FALLBACK_LOCALE;
  return tag.toLowerCase().startsWith("zh") ? "zh-CN" : FALLBACK_LOCALE;
}

/** The system language reported by the runtime, or "" when unavailable. */
export function systemLanguageTag(): string {
  if (typeof navigator === "undefined") return "";
  const nav = navigator as Navigator & { languages?: readonly string[] };
  return nav.language ?? nav.languages?.[0] ?? "";
}

/** Turn the stored setting into the locale to render. */
export function resolveLocale(setting: unknown, systemTag?: string): Locale {
  const normalized = normalizeLanguageSetting(setting);
  if (normalized === "system") {
    return normalizeLocale(systemTag ?? systemLanguageTag());
  }
  return normalized;
}
