import { useRef } from "react";
import { useAppStore } from "../store/appStore";

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
          >
            <span className="tab-title">{tab.title}</span>
            <button
              className="tab-close"
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button className="tab-new" aria-label="New tab" onClick={newTab}>
          +
        </button>
      </div>
      <div className="tabstrip-actions">
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
