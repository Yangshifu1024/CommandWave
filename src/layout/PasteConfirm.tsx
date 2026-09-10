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
  const cancel = () => useAppStore.setState({ pasteConfirm: null });
  const accept = () => {
    useAppStore.setState({ pasteConfirm: null });
    terminalManager.get(confirm.paneId)?.term.paste(confirm.text);
  };
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
