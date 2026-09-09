import { useEffect } from "react";

import { useAppStore } from "../store/appStore";

const isMac = /Mac/.test(navigator.platform);

/**
 * Global keyboard shortcuts, registered with capture so they win over xterm
 * key handling. macOS uses Cmd; other platforms use Ctrl.
 */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const s = useAppStore.getState();
        if (s.settingsOpen) {
          s.closeSettings();
          e.preventDefault();
          return;
        }
        if (
          s.searchOpen &&
          (e.target as HTMLElement | null)?.closest?.(".search-bar")
        ) {
          s.closeSearch();
          e.preventDefault();
          return;
        }
      }
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (e.altKey || !mod) {
        // Ctrl+Tab cycles tabs on Windows/Linux (Ctrl+Tab is not text input).
        if (e.ctrlKey && !e.altKey && e.key === "Tab") {
          useAppStore.getState().cycleTab(e.shiftKey ? -1 : 1);
          e.preventDefault();
        }
        return;
      }

      const s = useAppStore.getState();
      const activeTab = s.tabs.find((t) => t.id === s.activeTabId);
      const key = e.key.toLowerCase();

      // Tab cycling: Cmd/Ctrl+Shift+[ and Cmd/Ctrl+Shift+]
      if (e.shiftKey && key === "[") {
        s.cycleTab(-1);
        e.preventDefault();
        return;
      }
      if (e.shiftKey && key === "]") {
        s.cycleTab(1);
        e.preventDefault();
        return;
      }

      switch (key) {
        case "t":
          if (e.shiftKey) return; // reserved: reopen closed tab later
          s.newTab();
          e.preventDefault();
          return;
        case "w":
          if (e.shiftKey) {
            if (activeTab) s.closeTab(activeTab.id);
          } else if (activeTab) {
            s.closePane(activeTab.id, activeTab.activePaneId);
          }
          e.preventDefault();
          return;
        case "d": {
          if (!activeTab) return;
          // iTerm2 muscle memory: Cmd+D splits vertically (side by side),
          // Cmd+Shift+D splits horizontally (stacked).
          s.splitPane(activeTab.activePaneId, e.shiftKey ? "v" : "h");
          e.preventDefault();
          return;
        }
        case "[":
          s.cyclePane(-1);
          e.preventDefault();
          return;
        case "]":
          s.cyclePane(1);
          e.preventDefault();
          return;
        case "b":
          if (e.shiftKey) {
            s.toggleTabBar();
            e.preventDefault();
          }
          return;
        case ",":
          s.openSettings();
          e.preventDefault();
          return;
        case "f":
          s.openSearch();
          e.preventDefault();
          return;
        default:
          if (/^[1-9]$/.test(key)) {
            s.selectTabIndex(Number(key) - 1);
            e.preventDefault();
          }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
