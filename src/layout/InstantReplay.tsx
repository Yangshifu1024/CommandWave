import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAppStore } from "../store/appStore";
import { replaySnapshots, snapshotForAge } from "../terminal/instantReplay";

/**
 * Instant Replay overlay: a time slider over the active pane's periodic
 * buffer snapshots, shown read-only.
 */
export function InstantReplay() {
  const { t } = useTranslation();
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
        aria-label={t("dialogs.instantReplay.label")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>{t("dialogs.instantReplay.title")}</h2>
        {snap ? (
          <>
            <div className="replay-controls">
              <span>{t("dialogs.instantReplay.now")}</span>
              <input
                type="range"
                min={0}
                max={maxAge}
                value={Math.min(ageSec, maxAge)}
                onChange={(e) => setAgeSec(Number(e.target.value))}
              />
              <span>{t("dialogs.instantReplay.age", { seconds: Math.min(ageSec, maxAge) })}</span>
              <span className="replay-time">
                {new Date(snap.at).toLocaleTimeString()}
              </span>
            </div>
            <pre className="replay-text">{snap.text}</pre>
          </>
        ) : (
          <p className="dialog-text">{t("dialogs.instantReplay.empty")}</p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
