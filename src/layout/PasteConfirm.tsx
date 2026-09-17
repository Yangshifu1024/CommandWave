import { useAppStore } from "../store/appStore";
import { terminalManager } from "../terminal/manager";
import { pastePreview } from "../terminal/pasteGuard";

/**
 * Confirmation dialog for risky pastes (multi-line, large, destructive).
 * Nothing is written to the PTY until the user accepts.
 */
export function PasteConfirm() {
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
        aria-label="Confirm paste"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>Paste multiple lines?</h2>
        <p className="dialog-text">
          The clipboard contains more than one line (or a very large /
          potentially destructive command). Pasting it will run the lines
          immediately.
        </p>
        <pre className="paste-preview">{pastePreview(confirm.text)}</pre>
        <div className="dialog-actions">
          <button type="button" onClick={cancel}>
            Cancel
          </button>
          <button type="button" className="primary" autoFocus onClick={accept}>
            Paste
          </button>
        </div>
      </div>
    </div>
  );
}
