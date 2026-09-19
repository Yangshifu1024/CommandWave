/**
 * In-app modal shown for an available / downloading / installed update.
 *
 * Reuses the shared `.dialog-backdrop` + `.dialog` primitives from
 * `styles/global.css` (same look as the paste-confirm dialog) and only adds
 * the update-specific pieces.
 */

import { useEffect } from "react";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
        aria-label={t("updates.dialog.ariaLabel")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {ready ? (
          <>
            <h2>{t("updates.dialog.installed.title")}</h2>
            <p className="dialog-text">
              {t("updates.dialog.installed.body", { version: update.version })}
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={dismiss}>
                {t("updates.actions.later")}
              </button>
              <button type="button" className="primary" autoFocus onClick={() => void restart()}>
                {t("updates.actions.restartNow")}
              </button>
            </div>
          </>
        ) : confirming ? (
          <>
            <h2>{t("updates.dialog.confirm.title", { version: update.version })}</h2>
            <p className="dialog-text">
              {t("updates.dialog.confirm.body", { count: confirmSessions })}
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={onCancelSessions}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="primary"
                autoFocus
                onClick={onConfirmSessions}
              >
                {t("updates.actions.continue")}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>{t("updates.dialog.available.title", { version: update.version })}</h2>
            <p className="dialog-text">
              {released
                ? t("updates.dialog.available.runningWithDate", {
                    version: currentVersion,
                    date: released,
                  })
                : t("updates.dialog.available.running", { version: currentVersion })}
            </p>
            <pre className="paste-preview update-notes">{notes ?? t("updates.dialog.noNotes")}</pre>

            {downloading && (
              <div className="update-progress">
                <div
                  className="update-progress-track"
                  role="progressbar"
                  aria-label={t("updates.dialog.progressAria")}
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
                  {percent === null
                    ? t("updates.dialog.downloading")
                    : t("updates.dialog.percent", { percent })}
                </span>
              </div>
            )}

            {error && <p className="update-error">{error}</p>}

            <div className="dialog-actions">
              <button type="button" disabled={downloading} onClick={skip}>
                {t("updates.actions.skipVersion")}
              </button>
              <button type="button" disabled={downloading} onClick={dismiss}>
                {t("updates.actions.later")}
              </button>
              <button
                type="button"
                className="primary"
                autoFocus
                disabled={downloading}
                onClick={() => void install()}
              >
                {downloading
                  ? t("updates.dialog.downloading")
                  : t("updates.actions.downloadAndInstall")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
