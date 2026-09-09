import { useEffect } from "react";

import { SplitTree } from "./layout/SplitTree";
import { TabStrip } from "./layout/TabStrip";
import { SearchBar } from "./search/SearchBar";
import { SettingsDialog } from "./settings/SettingsDialog";
import { useAppStore } from "./store/appStore";
import { appearanceDefaults, useSettingsStore } from "./store/settingsStore";
import { useShortcuts } from "./hooks/useShortcuts";
import { terminalManager } from "./terminal/manager";
import { getTheme, isDarkTheme } from "./terminal/themes";
import { onMenuAction, onPtyExit } from "./terminal/ipc";

export default function App() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const tabBarPosition = useAppStore((s) => s.tabBarPosition);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  useShortcuts();

  // Load persisted settings once, then mirror UI prefs into the app store.
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const uiTabBarPosition = useSettingsStore((s) => s.settings.ui.tabBarPosition);
  useEffect(() => {
    useSettingsStore.getState().load();
  }, []);
  useEffect(() => {
    if (!settingsLoaded) return;
    const ui = useSettingsStore.getState().settings.ui;
    useAppStore.setState({ tabBarPosition: ui.tabBarPosition, sidebarWidth: ui.sidebarWidth });
  }, [settingsLoaded]);
  useEffect(() => {
    if (!settingsLoaded) return;
    useAppStore.setState({ tabBarPosition: uiTabBarPosition });
  }, [settingsLoaded, uiTabBarPosition]);

  // Theme drives the UI chrome colors as well; text adapts to light themes.
  const profile = useSettingsStore(
    (s) =>
      s.settings.profiles.find((p) => p.id === s.settings.defaultProfileId) ??
      s.settings.profiles[0],
  );
  const themeName = profile?.themeName ?? appearanceDefaults.themeName;
  useEffect(() => {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--bg", getTheme(themeName).background ?? "#1a1d23");
    if (isDarkTheme(themeName)) {
      rootStyle.setProperty("--fg", "#e8eaed");
      rootStyle.setProperty("--fg-dim", "#9aa0a8");
    } else {
      rootStyle.setProperty("--fg", "#1f2328");
      rootStyle.setProperty("--fg-dim", "#5c6370");
    }
  }, [themeName]);

  useEffect(() => {
    const promise = onPtyExit((ptyId, exitCode) => {
      useAppStore.getState().closePaneByPtyId(ptyId, exitCode);
    });
    return () => {
      promise.then((unlisten) => unlisten());
    };
  }, []);

  // Native menu bar commands.
  useEffect(() => {
    const promise = onMenuAction((action) => {
      const s = useAppStore.getState();
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      switch (action) {
        case "open-settings":
          s.openSettings();
          break;
        case "toggle-vertical-tabs":
          s.toggleTabBar();
          break;
        case "new-tab":
          s.newTab();
          break;
        case "close-pane":
          if (tab) s.closePane(tab.id, tab.activePaneId);
          break;
        case "close-tab":
          if (tab) s.closeTab(tab.id);
          break;
        case "split-right":
          if (tab) s.splitPane(tab.activePaneId, "h");
          break;
        case "split-down":
          if (tab) s.splitPane(tab.activePaneId, "v");
          break;
        case "prev-pane":
          s.cyclePane(-1);
          break;
        case "next-pane":
          s.cyclePane(1);
          break;
        case "open-search":
          s.openSearch();
          break;
      }
    });
    return () => {
      promise.then((unlisten) => unlisten());
    };
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Focus the active terminal on tab/pane switches and reflect the tab title.
  const activePaneId = activeTab?.activePaneId;
  useEffect(() => {
    if (activePaneId) terminalManager.get(activePaneId)?.term.focus();
  }, [activeTabId, activePaneId]);
  useEffect(() => {
    document.title = activeTab ? `${activeTab.title} — CommandWave` : "CommandWave";
  }, [activeTab?.title]);

  return (
    <div className="app">
      {tabBarPosition === "left" && <TabStrip side="left" />}
      <div className="main">
        {tabBarPosition === "top" && <TabStrip side="top" />}
        <div className="content">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab-layer${tab.id === activeTabId ? " tab-layer-active" : ""}`}
            >
              <SplitTree tab={tab} active={tab.id === activeTabId} />
            </div>
          ))}
          <SearchBar />
        </div>
      </div>
      {settingsOpen && <SettingsDialog />}
    </div>
  );
}
