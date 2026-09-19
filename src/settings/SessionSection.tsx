import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { parseSnapshot, serializeSession } from "../layout/snapshot";

/**
 * Settings section for Arrangements (named window layouts) and session
 * restore-on-launch.
 */
export function SessionSection() {
  const { t } = useTranslation();
  const arrangements = useSettingsStore((s) => s.settings.arrangements);
  const restoreOnStart = useSettingsStore((s) => s.settings.ui.restoreSessionOnStart);
  const update = useSettingsStore((s) => s.update);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const saveCurrent = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("settings.session.enterNameFirst"));
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
      <h3>{t("settings.session.arrangements")}</h3>
      <p className="section-hint">{t("settings.session.arrangementsHint")}</p>
      <div className="trigger-row">
        <input
          type="text"
          placeholder={t("settings.session.namePlaceholder")}
          value={name}
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveCurrent()}
        />
        <button type="button" className="settings-add-btn" onClick={saveCurrent}>
          {t("settings.session.saveCurrent")}
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
            {t("settings.session.restore")}
          </button>
          <button
            type="button"
            className="settings-mini-btn"
            aria-label={t("settings.session.deleteAria")}
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

      <h3>{t("settings.session.sessionRestore")}</h3>
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
        <span>{t("settings.session.restoreOnStart")}</span>
      </label>
    </section>
  );
}
