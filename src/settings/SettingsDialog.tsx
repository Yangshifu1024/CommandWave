import { useState } from "react";

import { useAppStore } from "../store/appStore";
import {
  appearanceDefaults,
  useSettingsStore,
  type Profile,
} from "../store/settingsStore";
import { themes, getTheme, COLOR_KEYS } from "../terminal/themes";
import { KEYBINDING_ACTIONS } from "../hooks/keybindings";
import { parseItermColors } from "../terminal/itermColors";
import { KeyboardSection } from "./KeyboardSection";
import { AutomationSection } from "./AutomationSection";
import { SessionSection } from "./SessionSection";
import { IntegrationsSection } from "./IntegrationsSection";

/**
 * Settings dialog with a profile manager: list on the left, editor on the
 * right. Changes apply immediately and persist.
 */
export function SettingsDialog() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const addProfile = useSettingsStore((s) => s.addProfile);
  const duplicateProfile = useSettingsStore((s) => s.duplicateProfile);
  const deleteProfile = useSettingsStore((s) => s.deleteProfile);
  const setDefaultProfile = useSettingsStore((s) => s.setDefaultProfile);
  const renameProfile = useSettingsStore((s) => s.renameProfile);
  const close = useAppStore((s) => s.closeSettings);

  // Selected profile for editing; tracks the default until the user picks
  // another. Falls back if the selected profile disappears.
  const [selectedId, setSelectedId] = useState(settings.defaultProfileId);
  const selected =
    settings.profiles.find((p) => p.id === selectedId) ??
    settings.profiles.find((p) => p.id === settings.defaultProfileId) ??
    settings.profiles[0];
  const isDefault = selected?.id === settings.defaultProfileId;
  const canDelete = settings.profiles.length > 1;

  const setProfile = (patch: Partial<Profile>) => {
    if (!selected) return;
    update((draft) => {
      const p = draft.profiles.find((x) => x.id === selected.id);
      if (p) Object.assign(p, patch);
    });
  };

  return (
    <div className="settings-overlay" onMouseDown={close}>
      <div
        className="settings-dialog settings-dialog-wide"
        role="dialog"
        aria-label="Settings"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" aria-label="Close settings" onClick={close}>
            ×
          </button>
        </header>

        <div className="settings-body settings-body-split">
          <aside className="profile-list">
            {settings.profiles.map((profile) => (
              <div
                key={profile.id}
                className={`profile-item${profile.id === selected?.id ? " active" : ""}`}
                onClick={() => setSelectedId(profile.id)}
              >
                <span className="profile-name">{profile.name}</span>
                {profile.id === settings.defaultProfileId && (
                  <span className="profile-badge">Default</span>
                )}
              </div>
            ))}
            <div className="profile-list-actions">
              <button
                className="profile-mini-btn"
                title="New profile"
                aria-label="New profile"
                onClick={() => setSelectedId(addProfile())}
              >
                +
              </button>
              <button
                className="profile-mini-btn"
                title="Duplicate selected profile"
                aria-label="Duplicate profile"
                onClick={() => selected && setSelectedId(duplicateProfile(selected.id))}
              >
                ⧉
              </button>
              <button
                className="profile-mini-btn"
                title={canDelete ? "Delete selected profile" : "Cannot delete the last profile"}
                aria-label="Delete profile"
                disabled={!canDelete || !selected}
                onClick={() => {
                  if (selected && deleteProfile(selected.id)) {
                    setSelectedId(useSettingsStore.getState().settings.defaultProfileId);
                  }
                }}
              >
                −
              </button>
            </div>
          </aside>

          <div className="settings-editor">
            <section className="settings-section">
              <h3>Profile</h3>
              <div className="field-row">
                <label className="field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={selected?.name ?? ""}
                    onChange={(e) => selected && renameProfile(selected.id, e.target.value)}
                    spellCheck={false}
                  />
                </label>
                {!isDefault && (
                  <button
                    className="profile-set-default"
                    onClick={() => selected && setDefaultProfile(selected.id)}
                  >
                    Set Default
                  </button>
                )}
              </div>
              <div className="field-row">
                <label className="field">
                  <span>Shell command</span>
                  <input
                    type="text"
                    placeholder="system default"
                    value={selected?.shell ?? ""}
                    onChange={(e) => setProfile({ shell: e.target.value || null })}
                    spellCheck={false}
                  />
                </label>
              </div>
              <div className="field-row">
                <label className="field">
                  <span>Working directory</span>
                  <input
                    type="text"
                    placeholder="home"
                    value={selected?.cwd ?? ""}
                    onChange={(e) => setProfile({ cwd: e.target.value || null })}
                    spellCheck={false}
                  />
                </label>
              </div>
            </section>

            <section className="settings-section">
              <h3>Appearance</h3>
              <div className="theme-grid">
                {themes.map((t) => {
                  const active =
                    (selected?.themeName ?? appearanceDefaults.themeName) === t.name;
                  return (
                    <button
                      key={t.name}
                      className={`theme-swatch${active ? " active" : ""}`}
                      onClick={() => setProfile({ themeName: t.name })}
                      title={t.name}
                    >
                      <span
                        className="theme-preview"
                        style={{ background: t.theme.background }}
                      >
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
                    value={selected?.fontFamily ?? appearanceDefaults.fontFamily}
                    onChange={(e) => setProfile({ fontFamily: e.target.value })}
                    spellCheck={false}
                  />
                </label>
                <label className="field field-narrow">
                  <span>Size</span>
                  <input
                    type="number"
                    min={8}
                    max={32}
                    value={selected?.fontSize ?? appearanceDefaults.fontSize}
                    onChange={(e) =>
                      setProfile({ fontSize: clampInt(e.target.value, 8, 32, 13) })
                    }
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
                    value={selected?.cursorStyle ?? "block"}
                    onChange={(e) =>
                      setProfile({ cursorStyle: e.target.value as Profile["cursorStyle"] })
                    }
                  >
                    <option value="block">Block</option>
                    <option value="bar">Bar</option>
                    <option value="underline">Underline</option>
                  </select>
                </label>
                <label className="field field-narrow">
                  <span>Cursor blink</span>
                  <select
                    value={String(selected?.cursorBlink ?? true)}
                    onChange={(e) => setProfile({ cursorBlink: e.target.value === "true" })}
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
                    value={selected?.lineHeight ?? 1}
                    onChange={(e) =>
                      setProfile({ lineHeight: clampFloat(e.target.value, 1, 2, 1) })
                    }
                  />
                </label>
                <label className="field field-narrow">
                  <span>Letter spacing</span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={selected?.letterSpacing ?? 0}
                    onChange={(e) =>
                      setProfile({ letterSpacing: clampFloat(e.target.value, 0, 10, 0) })
                    }
                  />
                </label>
              </div>

              <div className="field-row">
                <label className="field field-narrow">
                  <span>Scrollback (lines)</span>
                  <input
                    type="number"
                    min={100}
                    max={1000000}
                    step={100}
                    placeholder="10000"
                    value={selected?.scrollback ?? ""}
                    onChange={(e) =>
                      setProfile({ scrollback: e.target.value ? clampInt(e.target.value, 100, 1000000, 10000) : null })
                    }
                  />
                </label>
                <label className="field field-narrow">
                  <span>Background opacity</span>
                  <input
                    type="number"
                    min={0.1}
                    max={1}
                    step={0.05}
                    placeholder="1"
                    value={selected?.backgroundOpacity ?? ""}
                    onChange={(e) =>
                      setProfile({
                        backgroundOpacity: e.target.value ? clampFloat(e.target.value, 0.1, 1, 1) : null,
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
                    value={selected?.backgroundImage ?? ""}
                    spellCheck={false}
                    onChange={(e) => setProfile({ backgroundImage: e.target.value.trim() || null })}
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
                    value={selected?.backgroundImageOpacity ?? ""}
                    onChange={(e) =>
                      setProfile({
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
                  <span>Badge ({"{cwd}"} / {"{profile}"} placeholders)</span>                  <input
                    type="text"
                    placeholder="e.g. {cwd}"
                    value={selected?.badge ?? ""}
                    spellCheck={false}
                    onChange={(e) => setProfile({ badge: e.target.value || null })}
                  />
                </label>
              </div>

              <div className="field-row">
                <label className="field">
                  <span>Environment (one KEY=VALUE per line)</span>
                  <textarea
                    rows={2}
                    className="env-textarea"
                    spellCheck={false}
                    placeholder="EDITOR=vim"
                    value={(selected?.env ?? []).join("\n")}
                    onChange={(e) =>
                      setProfile({
                        env: e.target.value
                          ? e.target.value.split("\n").map((l) => l.trim()).filter(Boolean)
                          : null,
                      })
                    }
                  />
                </label>
              </div>

              <label className="check-row">
                <input
                  type="checkbox"
                  checked={selected?.useStarship ?? false}
                  onChange={(e) => setProfile({ useStarship: e.target.value === "true" ? true : e.target.checked })}
                />
                <span>Starship prompt — auto-init starship for zsh panes of this profile</span>
              </label>

              <ProfileKeyOverrides
                overrides={selected?.keybindings ?? null}
                global={settings.keybindings}
                onChange={(keybindings) => setProfile({ keybindings })}
              />

              <CustomColorsEditor
                overrides={selected?.customColors ?? null}
                themeName={selected?.themeName ?? appearanceDefaults.themeName}
                onChange={(customColors) => setProfile({ customColors })}
              />
            </section>

            <section className="settings-section">
              <h3>Notifications</h3>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={settings.notifications.commandCompletion}
                  onChange={(e) =>
                    update((draft) => {
                      draft.notifications.commandCompletion = e.target.checked;
                    })
                  }
                />
                <span>
                  Command finished — notify when a command that ran ≥ 2s
                  finishes while the window is not focused
                </span>
              </label>
            </section>

            <AutomationSection />
            <SessionSection />
            <IntegrationsSection />
            <KeyboardSection />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Per-profile keybinding overrides: replaced actions win over the global
 * map while panes of this profile are focused.
 */
function ProfileKeyOverrides({
  overrides,
  global,
  onChange,
}: {
  overrides: Record<string, string> | null;
  global: Record<string, string>;
  onChange: (next: Record<string, string> | null) => void;
}) {
  const [action, setAction] = useState(KEYBINDING_ACTIONS[0].action);
  const [accel, setAccel] = useState("");
  const entries = Object.entries(overrides ?? {});
  return (
    <div>
      <div className="field-row">
        <span className="field-label">Key overrides ({entries.length})</span>
      </div>
      <div className="trigger-row">
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          {KEYBINDING_ACTIONS.map((a) => (
            <option key={a.action} value={a.action}>
              {a.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder={`global: ${global[action] || "—"}`}
          value={accel}
          spellCheck={false}
          onChange={(e) => setAccel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && accel.trim()) {
              onChange({ ...(overrides ?? {}), [action]: accel.trim() });
              setAccel("");
            }
          }}
        />
        <button
          type="button"
          className="settings-add-btn"
          onClick={() => {
            if (!accel.trim()) return;
            onChange({ ...(overrides ?? {}), [action]: accel.trim() });
            setAccel("");
          }}
        >
          Override
        </button>
      </div>
      {entries.map(([act, acc]) => (
        <div key={act} className="trigger-row">
          <span className="arrangement-name">
            {KEYBINDING_ACTIONS.find((a) => a.action === act)?.label ?? act} → {acc}
          </span>
          <button
            type="button"
            className="profile-mini-btn"
            aria-label="Remove override"
            onClick={() => {
              const next = { ...(overrides ?? {}) };
              delete next[act];
              onChange(Object.keys(next).length > 0 ? next : null);
            }}
          >
            −
          </button>
        </div>
      ))}
    </div>
  );
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampFloat(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
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
          <button className="profile-mini-btn" onClick={() => onChange(null)}>
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
