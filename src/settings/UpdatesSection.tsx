import { useState } from "react";

import { useSettingsStore } from "../store/settingsStore";
import { useUpdater } from "../updater";

/** "just now" / "5 minutes ago" / a local timestamp for anything older. */
function formatCheckedAt(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
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

  return (
    <>
      <section className="settings-section">
        <h3>Version</h3>
        <div className="field-row">
          <label className="field">
            <span>Current version</span>
            <input type="text" readOnly value={currentVersion} spellCheck={false} />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>Updates</h3>
        <p className="settings-hint">
          Updates are downloaded from GitHub releases and applied by restarting
          CommandWave. Running sessions end when you restart.
        </p>
        <div className="field-row">
          <button
            className="settings-button"
            disabled={checking || busy !== null}
            onClick={() => void onCheck()}
          >
            {checking ? "Checking…" : "Check for Updates"}
          </button>
        </div>

        {error && <div className="settings-error">{error}</div>}

        {!error && state === "downloading" && (
          <p className="settings-hint">
            Downloading…
            {progress === null ? "" : ` ${Math.round(progress * 100)}%`}
          </p>
        )}

        {!error && state === "available" && available && (
          <div className="agent-row">
            <div className="agent-row-main">
              <span className="agent-row-label">
                Version {available.version} is available.
              </span>
              {releasedAt(available.date) && (
                <span className="agent-row-meta">
                  released {releasedAt(available.date)}
                </span>
              )}
            </div>
            <button
              className="settings-button"
              disabled={busy !== null}
              onClick={() => void onInstall()}
            >
              {busy === "install" ? "Starting…" : "Download and Install"}
            </button>
            <button
              className="settings-button"
              disabled={busy !== null}
              onClick={skip}
            >
              Skip This Version
            </button>
          </div>
        )}

        {!error && state === "ready" && (
          <div className="agent-row">
            <div className="agent-row-main">
              <span className="agent-row-label">
                Update installed — restart to finish.
              </span>
            </div>
            <button
              className="settings-button"
              disabled={busy !== null}
              onClick={() => void onRestart()}
            >
              {busy === "restart" ? "Restarting…" : "Restart Now"}
            </button>
          </div>
        )}

        {!error && state === "idle" && lastCheckedAt !== null && (
          <p className="settings-hint">
            You&apos;re up to date. Last checked {formatCheckedAt(lastCheckedAt)}.
          </p>
        )}
      </section>

      <section className="settings-section">
        <h3>Automatic checks</h3>
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
          <span>Check for updates automatically</span>
        </label>
        <p className="settings-hint">
          Runs once shortly after launch. Failures stay silent — only a newer
          release that you have not skipped is announced.
        </p>
      </section>

      <section className="settings-section">
        <h3>Skipped versions</h3>
        {skippedVersions.length === 0 ? (
          <p className="settings-hint">No versions are skipped.</p>
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
                    aria-label={`Stop skipping ${version}`}
                    onClick={() => removeSkipped(version)}
                  >
                    Remove
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
                Clear all
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
