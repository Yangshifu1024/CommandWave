import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";

import { SplitTree } from "./layout/SplitTree";
import { TabStrip } from "./layout/TabStrip";
import { ContextMenu } from "./layout/ContextMenu";
import { PasteConfirm } from "./layout/PasteConfirm";
import { Expose } from "./layout/Expose";
import { TitleBar, dispatchMenuAction, isMac } from "./layout/TitleBar";
import { SearchBar } from "./search/SearchBar";
import { SettingsDialog } from "./settings/SettingsDialog";
import { useAppStore } from "./store/appStore";
import { appearanceDefaults, useSettingsStore } from "./store/settingsStore";
import { useShortcuts } from "./hooks/useShortcuts";
import { setHomeDir } from "./terminal/paneTitle";
import { exitCopyMode } from "./terminal/copyModeController";
import { parseSnapshot, serializeSession } from "./layout/snapshot";
import { terminalManager } from "./terminal/manager";
import { getTheme, isDarkTheme } from "./terminal/themes";
import { isTauri, onMenuAction, onPtyExit } from "./terminal/ipc";

export default function App() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const tabBarPosition = useAppStore((s) => s.tabBarPosition);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  useShortcuts();

  // macOS: the window is created hidden (visible:false in tauri.conf.json)
  // so the custom title bar can paint before reveal, preventing a flash of
  // the native title. Windows/Linux are shown from Rust setup instead.
  // Reveal via a Rust command: rAF and timers are suspended in a hidden
  // webview, but IPC from the mounted app always gets through.
  useEffect(() => {
    if (!isTauri || !isMac) return;
    invoke("show_main_window").catch(() => {});
  }, []);

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

  // Session restore: rebuild the previous run's tab/pane layout once the
  // persisted snapshot is available. New panes get fresh ids and respawn
  // shells; only the layout + profile/cwd metadata carry over.
  useEffect(() => {
    if (!settingsLoaded) return;
    const settings = useSettingsStore.getState().settings;
    if (!settings.ui.restoreSessionOnStart || !settings.session) return;
    const snapshot = parseSnapshot(settings.session);
    if (snapshot) useAppStore.getState().restoreSession(snapshot);
  }, [settingsLoaded]);

  // Autosave the current session (debounced) so the next launch can restore.
  useEffect(() => {
    if (!settingsLoaded || !isTauri) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      const { tabs, activeTabId } = useAppStore.getState();
      useSettingsStore.getState().update((draft) => {
        draft.session = JSON.stringify(serializeSession(tabs, activeTabId));
      });
    };
    const unsub = useAppStore.subscribe((state, prev) => {
      if (state.tabs === prev.tabs) return;
      clearTimeout(timer);
      timer = setTimeout(save, 800);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [settingsLoaded]);

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

  // Once the home directory is known, tab titles can render it as "~".
  useEffect(() => {
    if (!isTauri) return;
    homeDir()
      .then((home) => {
        setHomeDir(home);
        useAppStore.getState().refreshTitles();
      })
      .catch(() => {});
  }, []);

  // Suppress the webview's native context menu everywhere except editable
  // fields — the app renders its own menus for panes and tabs.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Focus the active terminal on tab/pane switches and reflect the tab title.
  const activePaneId = activeTab?.activePaneId;
  useEffect(() => {
    if (activePaneId) terminalManager.get(activePaneId)?.term.focus();
  }, [activeTabId, activePaneId]);
  // Copy Mode is per-pane; leaving the pane exits it.
  useEffect(() => {
    const copyModePane = useAppStore.getState().copyModePane;
    if (copyModePane && copyModePane !== activePaneId) {
      exitCopyMode();
    }
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
      <ContextMenu />
      <PasteConfirm />
      <Expose />
    </div>
  );
}
