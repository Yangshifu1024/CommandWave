/**
 * In-app modal shown for an available / downloading / installed update.
 *
 * Reuses the shared `.dialog-backdrop` + `.dialog` primitives from
 * `styles/global.css` (same look as the paste-confirm dialog) and only adds
 * the update-specific pieces.
 */

import { useEffect } from "react";
import type { JSX } from "react";

import { useUpdater } from "./UpdateProvider";
import "./UpdateDialog.css";

export interface UpdateDialogProps {
  /** Forced visibility; when omitted the dialog follows the updater state. */
  open?: boolean;
  /** > 0 switches to the "this closes N sessions" confirmation. */
  confirmSessions?: number;
  onConfirmSessions?: () => void;
  onCancelSessions?: () => void;
}

/** Localized-looking date for the release notes header ("Jun 4, 2025"). */
function releaseDate(date: string | null): string | null {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function UpdateDialog({
  open,
  confirmSessions = 0,
  onConfirmSessions,
  onCancelSessions,
}: UpdateDialogProps = {}): JSX.Element | null {
  const { currentVersion, state, update, progress, error, install, restart, dismiss, skip } =
    useUpdater();

  const visible =
    open ?? (update !== null && state !== "idle" && state !== "checking");

  // Escape closes the dialog (= "Later"); capture phase so the terminal does
  // not also see the key while the dialog is modal.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [visible, dismiss]);

  if (!visible || !update) return null;

  const downloading = state === "downloading";
  const ready = state === "ready";
  const confirming = confirmSessions > 0;
  const notes = update.notes && update.notes.trim().length > 0 ? update.notes : null;
  const released = releaseDate(update.date);
  const percent = progress === null ? null : Math.round(progress * 100);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={dismiss}>
      <div
        className="dialog update-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Software update"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {ready ? (
          <>
            <h2>Update installed</h2>
            <p className="dialog-text">
              CommandWave {update.version} has been installed. Restart to start using it.
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={dismiss}>
                Later
              </button>
              <button type="button" className="primary" autoFocus onClick={() => void restart()}>
                Restart Now
              </button>
            </div>
          </>
        ) : confirming ? (
          <>
            <h2>Update to {update.version}?</h2>
            <p className="dialog-text">
              Updating will close {confirmSessions} running session
              {confirmSessions === 1 ? "" : "s"}. Continue?
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={onCancelSessions}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                autoFocus
                onClick={onConfirmSessions}
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>CommandWave {update.version} is available</h2>
            <p className="dialog-text">
              You are running {currentVersion}
              {released ? ` · released ${released}` : ""}
            </p>
            <pre className="paste-preview update-notes">{notes ?? "No release notes were provided."}</pre>

            {downloading && (
              <div className="update-progress">
                <div
                  className="update-progress-track"
                  role="progressbar"
                  aria-label="Download progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent ?? undefined}
                >
                  <div
                    className={`update-progress-fill${percent === null ? " indeterminate" : ""}`}
                    style={percent === null ? undefined : { width: `${percent}%` }}
                  />
                </div>
                <span className="update-progress-label">
                  {percent === null ? "Downloading…" : `${percent}%`}
                </span>
              </div>
            )}

            {error && <p className="update-error">{error}</p>}

            <div className="dialog-actions">
              <button type="button" disabled={downloading} onClick={skip}>
                Skip This Version
              </button>
              <button type="button" disabled={downloading} onClick={dismiss}>
                Later
              </button>
              <button
                type="button"
                className="primary"
                autoFocus
                disabled={downloading}
                onClick={() => void install()}
              >
                {downloading ? "Downloading…" : "Download and Install"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
