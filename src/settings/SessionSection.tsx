import { useState } from "react";

import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { parseSnapshot, serializeSession } from "../layout/snapshot";

/**
 * Settings section for Arrangements (named window layouts) and session
 * restore-on-launch.
 */
export function SessionSection() {
  const arrangements = useSettingsStore((s) => s.settings.arrangements);
  const restoreOnStart = useSettingsStore((s) => s.settings.ui.restoreSessionOnStart);
  const update = useSettingsStore((s) => s.update);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const saveCurrent = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name first");
      return;
    }
    const { tabs, activeTabId } = useAppStore.getState();
    update((draft) => {
      draft.arrangements[trimmed] = JSON.stringify(serializeSession(tabs, activeTabId));
    });
    setName("");
    setError(null);
  };

  const restore = (json: string) => {
    const snapshot = parseSnapshot(json);
    if (snapshot) useAppStore.getState().restoreSession(snapshot);
  };

  const names = Object.keys(arrangements);

  return (
    <section className="settings-section">
      <h3>Arrangements</h3>
      <p className="section-hint">
        Save the current window layout (tabs, splits, profiles) and restore
        it later.
      </p>
      <div className="trigger-row">
        <input
          type="text"
          placeholder="arrangement name"
          value={name}
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveCurrent()}
        />
        <button type="button" className="settings-add-btn" onClick={saveCurrent}>
          Save current layout
        </button>
      </div>
      {error && <p className="section-hint error">{error}</p>}
      {names.map((n) => (
        <div key={n} className="trigger-row">
          <span className="arrangement-name">{n}</span>
          <button
            type="button"
            className="settings-add-btn"
            onClick={() => restore(arrangements[n])}
          >
            Restore
          </button>
          <button
            type="button"
            className="profile-mini-btn"
            aria-label="Delete arrangement"
            onClick={() =>
              update((draft) => {
                delete draft.arrangements[n];
              })
            }
          >
            −
          </button>
        </div>
      ))}

      <h3>Session Restore</h3>
      <label className="check-row">
        <input
          type="checkbox"
          checked={restoreOnStart}
          onChange={(e) =>
            update((draft) => {
              draft.ui.restoreSessionOnStart = e.target.checked;
            })
          }
        />
        <span>Restore the previous session's tabs and splits on launch</span>
      </label>
    </section>
  );
}
