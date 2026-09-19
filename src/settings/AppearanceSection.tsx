import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  appearanceDefaults,
  useSettingsStore,
  type Settings,
} from "../store/settingsStore";
import { themesByPolarity, getTheme, isDarkTheme, COLOR_KEYS } from "../terminal/themes";
import { parseItermColors } from "../terminal/itermColors";
import type { LanguageSetting } from "../i18n";
import { clampFloat, clampInt } from "./clamp";

/**
 * Settings tab for appearance: UI language, theme (picked from the dark/light
 * groups), font, cursor metrics, background and per-slot custom colors.
 * Changes apply immediately and persist.
 */
export function AppearanceSection() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const themeName = settings.themeName ?? appearanceDefaults.themeName;

  // Dark/light groups. The group follows the theme in use when the section
  // mounts — the settings dialog unmounts it on tab switches, so reopening
  // Appearance always lands on the polarity you actually run.
  const [polarity, setPolarity] = useState<"dark" | "light">(() =>
    isDarkTheme(themeName) ? "dark" : "light",
  );
  const shown = themesByPolarity(polarity === "dark");

  const set = (patch: Partial<Settings>) => {
    update((draft) => {
      Object.assign(draft, patch);
    });
  };

  return (
    <section className="settings-section">
      <h3>{t("settings.appearance.language.title")}</h3>
      <p className="section-hint">{t("settings.appearance.language.description")}</p>
      <div className="field-row">
        <select
          aria-label={t("settings.appearance.language.title")}
          value={settings.language}
          onChange={(e) => set({ language: e.target.value as LanguageSetting })}
        >
          <option value="system">{t("settings.appearance.language.system")}</option>
          <option value="zh-CN">{t("settings.appearance.language.zhCN")}</option>
          <option value="en">{t("settings.appearance.language.en")}</option>
        </select>
      </div>
      {settings.language === "system" && (
        <p className="section-hint">{t("settings.appearance.language.systemHint")}</p>
      )}

      <h3>{t("settings.appearance.theme.title")}</h3>
      <div className="field-row">
        <div className="segmented" role="tablist" aria-label={t("settings.appearance.theme.groupAria")}>
          {(["dark", "light"] as const).map((group) => (
            <button
              key={group}
              role="tab"
              aria-selected={polarity === group}
              className={polarity === group ? "active" : ""}
              onClick={() => setPolarity(group)}
            >
              {group === "dark"
                ? t("settings.appearance.theme.dark", {
                    count: themesByPolarity(true).length,
                  })
                : t("settings.appearance.theme.light", {
                    count: themesByPolarity(false).length,
                  })}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="field-label">{t("settings.appearance.theme.empty")}</p>
      ) : (
        <div className="theme-grid">
          {shown.map((t) => {
            const active = themeName === t.name;
            return (
              <button
                key={t.name}
                className={`theme-swatch${active ? " active" : ""}`}
                onClick={() => set({ themeName: t.name })}
                title={`${t.name} — ${t.credit.source} (${t.credit.license})`}
              >
                <span className="theme-preview" style={{ background: t.theme.background }}>
                  <i style={{ background: t.theme.green }} />
                  <i style={{ background: t.theme.yellow }} />
                  <i style={{ background: t.theme.blue }} />
                  <i style={{ background: t.theme.magenta }} />
                </span>
                <span className="theme-name">{t.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="field-row">
        <label className="field">
          <span>{t("settings.appearance.font")}</span>
          <input
            type="text"
            value={settings.fontFamily ?? appearanceDefaults.fontFamily}
            onChange={(e) => set({ fontFamily: e.target.value })}
            spellCheck={false}
          />
        </label>
        <label className="field field-narrow">
          <span>{t("settings.appearance.fontSize")}</span>
          <input
            type="number"
            min={8}
            max={32}
            value={settings.fontSize ?? appearanceDefaults.fontSize}
            onChange={(e) => set({ fontSize: clampInt(e.target.value, 8, 32, 13) })}
          />
        </label>
      </div>

      <div className="field-row">
        <span className="field-label">{t("settings.appearance.tabBar")}</span>
        <div className="segmented">
          {(["top", "left"] as const).map((pos) => (
            <button
              key={pos}
              className={settings.ui.tabBarPosition === pos ? "active" : ""}
              onClick={() =>
                update((draft) => {
                  draft.ui.tabBarPosition = pos;
                })
              }
            >
              {pos === "top"
                ? t("settings.appearance.tabBarHorizontal")
                : t("settings.appearance.tabBarVertical")}
            </button>
          ))}
        </div>
      </div>

      <div className="field-row">
        <label className="field field-narrow">
          <span>{t("settings.appearance.cursor")}</span>
          <select
            value={settings.cursorStyle ?? "block"}
            onChange={(e) => set({ cursorStyle: e.target.value as Settings["cursorStyle"] })}
          >
            <option value="block">{t("settings.appearance.cursorBlock")}</option>
            <option value="bar">{t("settings.appearance.cursorBar")}</option>
            <option value="underline">{t("settings.appearance.cursorUnderline")}</option>
          </select>
        </label>
        <label className="field field-narrow">
          <span>{t("settings.appearance.cursorBlink")}</span>
          <select
            value={String(settings.cursorBlink ?? true)}
            onChange={(e) => set({ cursorBlink: e.target.value === "true" })}
          >
            <option value="true">{t("settings.appearance.cursorBlinkOn")}</option>
            <option value="false">{t("settings.appearance.cursorBlinkOff")}</option>
          </select>
        </label>
        <label className="field field-narrow">
          <span>{t("settings.appearance.lineHeight")}</span>
          <input
            type="number"
            min={1}
            max={2}
            step={0.05}
            value={settings.lineHeight ?? 1}
            onChange={(e) => set({ lineHeight: clampFloat(e.target.value, 1, 2, 1) })}
          />
        </label>
        <label className="field field-narrow">
          <span>{t("settings.appearance.letterSpacing")}</span>
          <input
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={settings.letterSpacing ?? 0}
            onChange={(e) => set({ letterSpacing: clampFloat(e.target.value, 0, 10, 0) })}
          />
        </label>
      </div>

      <h3>{t("settings.appearance.background.title")}</h3>
      <div className="field-row">
        <label className="field field-narrow">
          <span>{t("settings.appearance.background.opacity")}</span>
          <input
            type="number"
            min={0.1}
            max={1}
            step={0.05}
            placeholder="1"
            value={settings.backgroundOpacity ?? ""}
            onChange={(e) =>
              set({
                backgroundOpacity: e.target.value ? clampFloat(e.target.value, 0.1, 1, 1) : null,
              })
            }
          />
        </label>
        <label className="field field-narrow">
          <span>{t("settings.appearance.background.imageOpacity")}</span>
          <input
            type="number"
            min={0.05}
            max={1}
            step={0.05}
            placeholder="0.35"
            value={settings.backgroundImageOpacity ?? ""}
            onChange={(e) =>
              set({
                backgroundImageOpacity: e.target.value
                  ? clampFloat(e.target.value, 0.05, 1, 0.35)
                  : null,
              })
            }
          />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>{t("settings.appearance.background.image")}</span>
          <input
            type="text"
            placeholder={t("settings.appearance.background.imagePlaceholder")}
            value={settings.backgroundImage ?? ""}
            spellCheck={false}
            onChange={(e) => set({ backgroundImage: e.target.value.trim() || null })}
          />
        </label>
      </div>

      <CustomColorsEditor
        overrides={settings.customColors}
        themeName={themeName}
        onChange={(customColors) => set({ customColors })}
      />
    </section>
  );
}

/**
 * Per-slot color overrides layered on the selected theme, plus import of
 * iTerm2 `.itermcolors` files.
 */
function CustomColorsEditor({
  overrides,
  themeName,
  onChange,
}: {
  overrides: Record<string, string> | null;
  themeName: string;
  onChange: (next: Record<string, string> | null) => void;
}) {
  const { t } = useTranslation();
  const base = getTheme(themeName);
  const setSlot = (key: string, value: string) => {
    const next = { ...(overrides ?? {}) };
    if (value && value.toLowerCase() !== (base as Record<string, string>)[key]?.toLowerCase()) {
      next[key] = value;
    } else {
      delete next[key];
    }
    onChange(Object.keys(next).length > 0 ? next : null);
  };
  const importIterm = async (file: File) => {
    const text = await file.text();
    const parsed = parseItermColors(text);
    if (parsed) onChange({ ...(overrides ?? {}), ...parsed });
  };
  return (
    <div>
      <div className="field-row">
        <span className="field-label">{t("settings.appearance.customColors.title")}</span>
        <label className="settings-add-btn import-label">
          {t("settings.appearance.customColors.import")}
          <input
            type="file"
            accept=".itermcolors,.plist,text/xml,application/xml"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importIterm(f);
              e.target.value = "";
            }}
          />
        </label>
        {overrides && (
          <button className="settings-mini-btn" onClick={() => onChange(null)}>
            {t("settings.appearance.customColors.reset")}
          </button>
        )}
      </div>
      <div className="color-grid">
        {COLOR_KEYS.map((key) => (
          <label key={key} className="color-cell" title={key}>
            <input
              type="color"
              value={overrides?.[key] ?? (base as Record<string, string>)[key] ?? "#000000"}
              onChange={(e) => setSlot(key, e.target.value)}
            />
            <span>{key}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
