import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettingsStore } from "../store/settingsStore";
import { useUpdater } from "../updater";

/** "just now" / "5 minutes ago" / a local timestamp for anything older. */
function formatCheckedAt(at: number, t: TFunction): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 10) return t("updates.settings.checked.justNow");
  if (seconds < 60) return t("updates.settings.checked.seconds", { count: seconds });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t("updates.settings.checked.minutes", { count: minutes });
  return new Date(at).toLocaleString();
}

/** Local release date, or null when the manifest date is missing or invalid. */
function releasedAt(date: string | null): string | null {
  if (!date) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString();
}

/**
 * Settings tab for in-app updates: current version, a manual check with its
 * result (download / restart / up to date), the automatic-check switch and the
 * list of versions the user asked to skip.
 */
export function UpdatesSection() {
  const { t } = useTranslation();
  const {
    currentVersion,
    state,
    update: available,
    progress,
    error,
    lastCheckedAt,
    checkNow,
    install,
    restart,
    skip,
  } = useUpdater();
  const autoCheck = useSettingsStore((s) => s.settings.updates.autoCheck);
  const skippedVersions = useSettingsStore((s) => s.settings.updates.skippedVersions);
  const updateSettings = useSettingsStore((s) => s.update);
  const [busy, setBusy] = useState<"check" | "install" | "restart" | null>(null);

  const onCheck = async () => {
    setBusy("check");
    try {
      await checkNow();
    } finally {
      setBusy(null);
    }
  };

  const onInstall = async () => {
    setBusy("install");
    try {
      await install();
    } finally {
      setBusy(null);
    }
  };

  const onRestart = async () => {
    setBusy("restart");
    try {
      await restart();
    } finally {
      setBusy(null);
    }
  };

  const removeSkipped = (version: string) => {
    updateSettings((draft) => {
      draft.updates.skippedVersions = draft.updates.skippedVersions.filter(
        (entry) => entry !== version,
      );
    });
  };

  const checking = busy === "check" || state === "checking";
  const released = available ? releasedAt(available.date) : null;

  return (
    <>
      <section className="settings-section">
        <h3>{t("updates.settings.version.title")}</h3>
        <div className="field-row">
          <label className="field">
            <span>{t("updates.settings.version.current")}</span>
            <input type="text" readOnly value={currentVersion} spellCheck={false} />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("updates.settings.main.title")}</h3>
        <p className="settings-hint">{t("updates.settings.main.hint")}</p>
        <div className="field-row">
          <button
            className="settings-button"
            disabled={checking || busy !== null}
            onClick={() => void onCheck()}
          >
            {checking ? t("updates.settings.checking") : t("updates.actions.checkForUpdates")}
          </button>
        </div>

        {error && <div className="settings-error">{error}</div>}

        {!error && state === "downloading" && (
          <p className="settings-hint">
            {progress === null
              ? t("updates.settings.downloading")
              : t("updates.settings.downloadingWithPercent", {
                  percent: Math.round(progress * 100),
                })}
          </p>
        )}

        {!error && state === "available" && available && (
          <div className="agent-row">
            <div className="agent-row-main">
              <span className="agent-row-label">
                {t("updates.settings.available", { version: available.version })}
              </span>
              {released && (
                <span className="agent-row-meta">
                  {t("updates.settings.released", { date: released })}
                </span>
              )}
            </div>
            <button
              className="settings-button"
              disabled={busy !== null}
              onClick={() => void onInstall()}
            >
              {busy === "install"
                ? t("updates.settings.starting")
                : t("updates.actions.downloadAndInstall")}
            </button>
            <button
              className="settings-button"
              disabled={busy !== null}
              onClick={skip}
            >
              {t("updates.actions.skipVersion")}
            </button>
          </div>
        )}

        {!error && state === "ready" && (
          <div className="agent-row">
            <div className="agent-row-main">
              <span className="agent-row-label">
                {t("updates.settings.installed")}
              </span>
            </div>
            <button
              className="settings-button"
              disabled={busy !== null}
              onClick={() => void onRestart()}
            >
              {busy === "restart"
                ? t("updates.settings.restarting")
                : t("updates.actions.restartNow")}
            </button>
          </div>
        )}

        {!error && state === "idle" && lastCheckedAt !== null && (
          <p className="settings-hint">
            {t("updates.settings.upToDate", { when: formatCheckedAt(lastCheckedAt, t) })}
          </p>
        )}
      </section>

      <section className="settings-section">
        <h3>{t("updates.settings.auto.title")}</h3>
        <label className="check-row">
          <input
            type="checkbox"
            checked={autoCheck}
            onChange={(e) =>
              updateSettings((draft) => {
                draft.updates.autoCheck = e.target.checked;
              })
            }
          />
          <span>{t("updates.settings.auto.label")}</span>
        </label>
        <p className="settings-hint">{t("updates.settings.auto.hint")}</p>
      </section>

      <section className="settings-section">
        <h3>{t("updates.settings.skipped.title")}</h3>
        {skippedVersions.length === 0 ? (
          <p className="settings-hint">{t("updates.settings.skipped.empty")}</p>
        ) : (
          <>
            <div className="agent-list">
              {skippedVersions.map((version) => (
                <div key={version} className="agent-row">
                  <div className="agent-row-main">
                    <span className="agent-row-label">{version}</span>
                  </div>
                  <button
                    className="settings-button"
                    aria-label={t("updates.settings.skipped.stopAria", { version })}
                    onClick={() => removeSkipped(version)}
                  >
                    {t("common.remove")}
                  </button>
                </div>
              ))}
            </div>
            <div className="field-row">
              <button
                className="settings-button"
                onClick={() =>
                  updateSettings((draft) => {
                    draft.updates.skippedVersions = [];
                  })
                }
              >
                {t("updates.settings.skipped.clearAll")}
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
