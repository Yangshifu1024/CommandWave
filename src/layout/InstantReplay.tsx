import { useEffect, useState } from "react";

import { useAppStore } from "../store/appStore";
import { replaySnapshots, snapshotForAge } from "../terminal/instantReplay";

/**
 * Instant Replay overlay: a time slider over the active pane's periodic
 * buffer snapshots, shown read-only.
 */
export function InstantReplay() {
  const open = useAppStore((s) => s.replayOpen);
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const paneId = tabs.find((t) => t.id === activeTabId)?.activePaneId;
  const [ageSec, setAgeSec] = useState(0);
  const snaps = paneId ? replaySnapshots(paneId) : [];

  useEffect(() => setAgeSec(0), [open, paneId]);
  if (!open) return null;

  const maxAge = snaps.length > 0 ? Math.max(1, Math.round((Date.now() - snaps[0].at) / 1000)) : 1;
  const snap = snapshotForAge(snaps, Math.min(ageSec, maxAge) * 1000);
  const close = () => useAppStore.setState({ replayOpen: false });

  return (
    <div className="dialog-backdrop" onMouseDown={close}>
      <div
        className="dialog replay-dialog"
        role="dialog"
        aria-label="Instant replay"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>Instant Replay</h2>
        {snap ? (
          <>
            <div className="replay-controls">
              <span>now</span>
              <input
                type="range"
                min={0}
                max={maxAge}
                value={Math.min(ageSec, maxAge)}
                onChange={(e) => setAgeSec(Number(e.target.value))}
              />
              <span>-{Math.min(ageSec, maxAge)}s</span>
              <span className="replay-time">
                {new Date(snap.at).toLocaleTimeString()}
              </span>
            </div>
            <pre className="replay-text">{snap.text}</pre>
          </>
        ) : (
          <p className="dialog-text">No snapshots yet for this pane (captured every 10s).</p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
