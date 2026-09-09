import { useAppStore } from "../store/appStore";
import {
  appearanceDefaults,
  useSettingsStore,
  type Profile,
  type Settings,
} from "../store/settingsStore";
import { themes } from "../terminal/themes";

/** In-window settings dialog. Changes apply immediately and persist. */
export function SettingsDialog() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const close = useAppStore((s) => s.closeSettings);

  const profile = defaultProfile(settings);

  const setProfile = (patch: Partial<Profile>) => {
    update((draft) => {
      const p = draft.profiles.find((x) => x.id === draft.defaultProfileId);
      if (p) Object.assign(p, patch);
    });
  };

  return (
    <div className="settings-overlay" onMouseDown={close}>
      <div
        className="settings-dialog"
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

        <div className="settings-body">
          <section className="settings-section">
            <h3>Appearance</h3>
            <div className="theme-grid">
              {themes.map((t) => {
                const active =
                  (profile?.themeName ?? appearanceDefaults.themeName) === t.name;
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
                  value={profile?.fontFamily ?? appearanceDefaults.fontFamily}
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
                  value={profile?.fontSize ?? appearanceDefaults.fontSize}
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
            <h3>Profile · {profile?.name ?? "Default"}</h3>
            <div className="field-row">
              <label className="field">
                <span>Shell command</span>
                <input
                  type="text"
                  placeholder="system default"
                  value={profile?.shell ?? ""}
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
                  value={profile?.cwd ?? ""}
                  onChange={(e) => setProfile({ cwd: e.target.value || null })}
                  spellCheck={false}
                />
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function defaultProfile(settings: Settings): Profile | undefined {
  return (
    settings.profiles.find((p) => p.id === settings.defaultProfileId) ??
    settings.profiles[0]
  );
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
