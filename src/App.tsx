import { useEffect } from "react";

import { SplitTree } from "./layout/SplitTree";
import { TabStrip } from "./layout/TabStrip";
import { TitleBar, dispatchMenuAction } from "./layout/TitleBar";
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
    // The initial tab predates the async settings load; backfill its spawn
    // cwd so the title shows the profile directory instead of "Shell".
    const prof =
      useSettingsStore.getState().settings.profiles.find(
        (p) => p.id === useSettingsStore.getState().settings.defaultProfileId,
      ) ?? useSettingsStore.getState().settings.profiles[0];
    useAppStore.getState().setInitialSpawnCwd(prof?.cwd ?? null);
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
    const theme = getTheme(themeName);
    rootStyle.setProperty("--bg", theme.background ?? "#1a1d23");
    // Foreground follows the theme so light terminals get light chrome;
    // --fg-dim is derived in CSS (color-mix) from these two.
    rootStyle.setProperty(
      "--fg",
      theme.foreground ?? (isDarkTheme(themeName) ? "#e8eaed" : "#1f2328"),
    );
  }, [themeName]);

  useEffect(() => {
    const promise = onPtyExit((ptyId, exitCode) => {
      useAppStore.getState().closePaneByPtyId(ptyId, exitCode);
    });
    return () => {
      promise.then((unlisten) => unlisten());
    };
  }, []);

  // Native menu bar commands (macOS) — the custom title bar menu calls
  // dispatchMenuAction directly, so both paths share one dispatcher.
  useEffect(() => {
    const promise = onMenuAction((action) => dispatchMenuAction(action));
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
  }, [activeTab?.id, activeTab?.title]);

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
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
      </div>
      {settingsOpen && <SettingsDialog />}
    </div>
  );
}
