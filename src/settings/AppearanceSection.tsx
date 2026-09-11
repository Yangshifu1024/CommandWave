import {
  appearanceDefaults,
  useSettingsStore,
  type Settings,
} from "../store/settingsStore";
import { themes, getTheme, COLOR_KEYS } from "../terminal/themes";
import { parseItermColors } from "../terminal/itermColors";
import { clampFloat, clampInt } from "./clamp";

/**
 * Settings tab for appearance: theme, font, cursor metrics, background and
 * per-slot custom colors. Changes apply immediately and persist.
 */
export function AppearanceSection() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  const set = (patch: Partial<Settings>) => {
    update((draft) => {
      Object.assign(draft, patch);
    });
  };

  return (
    <section className="settings-section">
      <h3>Theme</h3>
      <div className="theme-grid">
        {themes.map((t) => {
          const active = (settings.themeName ?? appearanceDefaults.themeName) === t.name;
          return (
            <button
              key={t.name}
              className={`theme-swatch${active ? " active" : ""}`}
              onClick={() => set({ themeName: t.name })}
              title={t.name}
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

      <div className="field-row">
        <label className="field">
          <span>Font</span>
          <input
            type="text"
            value={settings.fontFamily ?? appearanceDefaults.fontFamily}
            onChange={(e) => set({ fontFamily: e.target.value })}
            spellCheck={false}
          />
        </label>
        <label className="field field-narrow">
          <span>Size</span>
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
        <span className="field-label">Tab bar</span>
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
              {pos === "top" ? "Horizontal" : "Vertical"}
            </button>
          ))}
        </div>
      </div>

      <div className="field-row">
        <label className="field field-narrow">
          <span>Cursor</span>
          <select
            value={settings.cursorStyle ?? "block"}
            onChange={(e) => set({ cursorStyle: e.target.value as Settings["cursorStyle"] })}
          >
            <option value="block">Block</option>
            <option value="bar">Bar</option>
            <option value="underline">Underline</option>
          </select>
        </label>
        <label className="field field-narrow">
          <span>Cursor blink</span>
          <select
            value={String(settings.cursorBlink ?? true)}
            onChange={(e) => set({ cursorBlink: e.target.value === "true" })}
          >
            <option value="true">Blink</option>
            <option value="false">Steady</option>
          </select>
        </label>
        <label className="field field-narrow">
          <span>Line height</span>
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
          <span>Letter spacing</span>
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

      <h3>Background</h3>
      <div className="field-row">
        <label className="field field-narrow">
          <span>Opacity</span>
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
          <span>Image opacity</span>
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
          <span>Background image (URL or absolute path; empty = none)</span>
          <input
            type="text"
            placeholder="/path/to/wallpaper.png"
            value={settings.backgroundImage ?? ""}
            spellCheck={false}
            onChange={(e) => set({ backgroundImage: e.target.value.trim() || null })}
          />
        </label>
      </div>

      <CustomColorsEditor
        overrides={settings.customColors}
        themeName={settings.themeName ?? appearanceDefaults.themeName}
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
        <span className="field-label">Custom colors</span>
        <label className="settings-add-btn import-label">
          Import .itermcolors…
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
            Reset colors
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
