import { useState } from "react";

import { useAppStore } from "../store/appStore";
import {
  appearanceDefaults,
  useSettingsStore,
  type Profile,
} from "../store/settingsStore";
import { themes } from "../terminal/themes";

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
          </div>
        </div>
      </div>
    </div>
  );
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
