import { useAppStore } from "../store/appStore";
import { computeTabTitle } from "../terminal/paneTitle";

/**
 * Exposé overlay (⌘⇧E): one card per pane across all tabs showing its
 * title/cwd/profile; clicking one activates its tab + pane. Escape closes.
 */
export function Expose() {
  const open = useAppStore((s) => s.exposeOpen);
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const setExposeOpen = useAppStore((s) => s.setExposeOpen);
  if (!open) return null;

  return (
    <div
      className="expose-backdrop"
      role="dialog"
      aria-label="Exposé all panes"
      onClick={() => setExposeOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setExposeOpen(false)}
    >
      <div className="expose-grid" onClick={(e) => e.stopPropagation()}>
        {tabs.flatMap((tab) =>
          Object.entries(tab.paneMeta).map(([paneId, meta]) => {
            const active = tab.id === activeTabId && tab.activePaneId === paneId;
            return (
              <button
                key={`${tab.id}:${paneId}`}
                className={`expose-card${active ? " active" : ""}`}
                onClick={() => {
                  useAppStore.getState().selectTab(tab.id);
                  useAppStore.getState().selectPane(tab.id, paneId);
                  setExposeOpen(false);
                }}
              >
                <span className="expose-title">{computeTabTitle(meta)}</span>
                <span className="expose-detail">{meta.cwd ?? meta.spawnCwd ?? "—"}</span>
                <span className="expose-tab">{tab.customTitle ?? `Tab ${tab.title}`}</span>
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
