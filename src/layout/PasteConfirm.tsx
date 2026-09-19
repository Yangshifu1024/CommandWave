import { useTranslation } from "react-i18next";

import { useAppStore } from "../store/appStore";
import { terminalManager } from "../terminal/manager";
import { pastePreview } from "../terminal/pasteGuard";

/**
 * Confirmation dialog for risky pastes (multi-line, large, destructive).
 * Nothing is written to the PTY until the user accepts.
 */
export function PasteConfirm() {
  const { t } = useTranslation();
  const confirm = useAppStore((s) => s.pasteConfirm);
  if (!confirm) return null;
  // Either way the dialog unmounts: hand the keyboard back to the terminal so
  // the user can keep typing without clicking the pane again.
  const close = (paste: boolean) => {
    useAppStore.setState({ pasteConfirm: null });
    const entry = terminalManager.get(confirm.paneId);
    if (paste) entry?.term.paste(confirm.text);
    entry?.term.focus();
  };
  const cancel = () => close(false);
  const accept = () => close(true);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={cancel}>
      <div
        className="dialog modal-sm"
        role="alertdialog"
        aria-modal="true"
        aria-label={t("dialogs.paste.label")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>{t("dialogs.paste.title")}</h2>
        <p className="dialog-text">{t("dialogs.paste.description")}</p>
        <pre className="paste-preview">{pastePreview(confirm.text)}</pre>
        <div className="dialog-actions">
          <button type="button" onClick={cancel}>
            {t("common.cancel")}
          </button>
          <button type="button" className="primary" autoFocus onClick={accept}>
            {t("dialogs.paste.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
