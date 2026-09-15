import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";
import { isTauri, systemStats, type SystemStats } from "../terminal/ipc";
import { collectPaneIds } from "./paneTree";
import { tabAttentionState, useAgentStore } from "../agent/statusStore";

/** Poll CPU/RAM for the sidebar status line. */
function useSystemStats(): SystemStats | null {
  const [stats, setStats] = useState<SystemStats | null>(null);
  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const s = await systemStats();
      if (!cancelled) {
        setStats(s);
        timer = setTimeout(poll, 3000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return stats;
}

interface TabStripProps {
  side: "top" | "left";
}

/**
 * Tab bar in either orientation. `side="top"` renders the familiar horizontal
 * strip; `side="left"` renders a vertical sidebar (iTerm2-style vertical
 * tabs) whose width is draggable.
 */
export function TabStrip({ side }: TabStripProps) {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const newTab = useAppStore((s) => s.newTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const selectTab = useAppStore((s) => s.selectTab);
  const moveTab = useAppStore((s) => s.moveTab);
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);
  const toggleTabBar = useAppStore((s) => s.toggleTabBar);
  const openSettings = useAppStore((s) => s.openSettings);

  const dragIndex = useRef<number | null>(null);
  const vertical = side === "left";
  const renamingTabId = useAppStore((s) => s.renamingTabId);
  // Agent attention: highest-urgency state among each tab's panes.
  const agentPanes = useAgentStore((s) => s.panes);
  const attentionByTab = new Map(
    tabs.map((tab) => [tab.id, tabAttentionState(tab.root, agentPanes, collectPaneIds)]),
  );

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      setSidebarWidth(startWidth + (ev.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className={`tabstrip ${vertical ? "tabstrip-v" : "tabstrip-h"}`}
      style={vertical ? { width: sidebarWidth } : undefined}
    >
      <div className="tabs" role="tablist">
        {tabs.map((tab, i) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTabId}
            className={`tab${tab.id === activeTabId ? " active" : ""}`}
            title={tab.title}
            draggable
            onClick={() => selectTab(tab.id)}
            onAuxClick={(e) => {
              if (e.button === 1) closeTab(tab.id);
            }}
            onDragStart={() => {
              dragIndex.current = i;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex.current !== null) moveTab(dragIndex.current, i);
              dragIndex.current = null;
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              useAppStore.getState().openContextMenu({
                x: e.clientX,
                y: e.clientY,
                tabId: tab.id,
                hasSelection: false,
              });
            }}
          >
            {renamingTabId === tab.id ? (
              <input
                className="tab-rename"
                autoFocus
                defaultValue={tab.customTitle ?? ""}
                placeholder={tab.title}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  useAppStore.getState().renameTab(tab.id, e.target.value);
                  useAppStore.setState({ renamingTabId: null });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    useAppStore.getState().renameTab(tab.id, e.currentTarget.value);
                    useAppStore.setState({ renamingTabId: null });
                  } else if (e.key === "Escape") {
                    useAppStore.setState({ renamingTabId: null });
                  }
                  e.stopPropagation();
                }}
              />
            ) : (
              <span className="tab-title">
                {(() => {
                  const attention = attentionByTab.get(tab.id);
                  return attention ? (
                    <span
                      className={`tab-dot tab-dot-${attention}`}
                      title={`Agent ${attention}`}
                      aria-label={`Agent ${attention}`}
                    />
                  ) : null;
                })()}
                {tab.locked && <span className="tab-lock" title="Locked">🔒</span>}
                {tab.customTitle ?? tab.title}
              </span>
            )}
            <button
              className="tab-close"
              aria-label="Close tab"
              hidden={tab.locked}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="tab-new"
          aria-label="New tab"
          title="New tab"
          onClick={() => newTab()}
        >
          +
        </button>
      </div>
      <div className="tabstrip-actions">
        {vertical && <SystemStatsView />}
        <button
          className="tab-icon-btn"
          aria-label="Toggle vertical tabs"
          title="Toggle vertical tabs (⌘⇧B / Ctrl+⇧B)"
          onClick={toggleTabBar}
        >
          <svg viewBox="0 0 24 24" className="tab-icon">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
          </svg>
        </button>
        <button
          className="tab-icon-btn"
          aria-label="Settings"
          title="Settings (⌘, / Ctrl+,)"
          onClick={openSettings}
        >
          <svg viewBox="0 0 24 24" className="tab-icon">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
      {vertical && <div className="tabstrip-resizer" onMouseDown={startResize} />}
    </div>
  );
}

function SystemStatsView() {
  const stats = useSystemStats();
  if (!stats) return null;
  const mem = stats.totalMemMb > 0 ? Math.round((stats.usedMemMb / stats.totalMemMb) * 100) : 0;
  return (
    <div className="sys-stats" title="CPU / memory usage">
      CPU {Math.round(stats.cpuPercent)}% · RAM {mem}%
    </div>
  );
}
