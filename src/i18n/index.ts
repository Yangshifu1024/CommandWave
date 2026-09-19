/**
 * i18n entry point: wires i18next up once, resolves the language, and keeps
 * the native menu bar / tray in sync (the backend cannot read the settings
 * file before the webview loads, so it is told explicitly).
 *
 * Keys are typed through `i18next.d.ts`, so a typo fails `pnpm build`.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { resources } from "./locales";
import {
  FALLBACK_LOCALE,
  type LanguageSetting,
  type Locale,
  resolveLocale,
} from "./locale";

export {
  FALLBACK_LOCALE,
  LANGUAGE_SETTINGS,
  LOCALES,
  REFERENCE_LOCALE,
  isLanguageSetting,
  normalizeLanguageSetting,
  normalizeLocale,
  resolveLocale,
  systemLanguageTag,
} from "./locale";
export type { LanguageSetting, Locale } from "./locale";

let initialized = false;

/**
 * Must run before the first render: React components call `useTranslation()`
 * and the first paint should already be in the right language (no English
 * flash before the stored setting is read).
 */
export function initI18n(): void {
  if (initialized) return;
  initialized = true;
  const locale = resolveLocale("system");
  void i18n.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: FALLBACK_LOCALE,
    // React escapes output already; double-escaping would print "&amp;".
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  applyDocumentLanguage(locale);
}

/**
 * Switch the UI language. Safe to call with any stored value: unknown values
 * mean "follow the system". Also tells the backend to rebuild the macOS menu
 * bar and the tray menu.
 */
export async function applyLocale(setting: LanguageSetting | string | null | undefined): Promise<void> {
  const locale = resolveLocale(setting);
  if (i18n.language !== locale) {
    await i18n.changeLanguage(locale);
  }
  applyDocumentLanguage(locale);
  await syncBackendLocale(locale);
}

/** The language currently rendered. */
export function currentLocale(): Locale {
  return i18n.language === "zh-CN" ? "zh-CN" : FALLBACK_LOCALE;
}

function applyDocumentLanguage(locale: Locale): void {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

/**
 * Dynamic import keeps the terminal modules out of the i18n module graph
 * (and out of the pure locale tests).
 */
async function syncBackendLocale(locale: Locale): Promise<void> {
  try {
    const { setUiLocale } = await import("../terminal/ipc");
    await setUiLocale(locale);
  } catch {
    // Browser dev build, or a backend without the command yet: nothing to do.
  }
}

export default i18n;
