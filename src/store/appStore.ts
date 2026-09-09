import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { create } from "zustand";

import { terminalManager } from "../terminal/manager";
import { computeTabTitle, type PaneTitleMeta } from "../terminal/paneTitle";
import { useSettingsStore } from "./settingsStore";
import {
  collectPaneIds,
  containsPane,
  nextPaneId,
  paneLeaf,
  removePaneNode,
  splitPaneNode,
  type PaneNode,
  type SplitDir,
} from "../layout/paneTree";

export interface Tab {
  id: string;
  title: string;
  root: PaneNode;
  activePaneId: string;
  /** Per-pane title inputs; tabs render the active pane's chain. */
  paneMeta: Record<string, PaneTitleMeta>;
}

let seq = 0;
function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${++seq}`;
}

function makeTab(spawnCwd: string | null = null): Tab {
  const paneId = genId("pane");
  return {
    id: genId("tab"),
    title: computeTabTitle({ spawnCwd, cwd: null, oscTitle: null }),
    root: paneLeaf(paneId),
    activePaneId: paneId,
    paneMeta: { [paneId]: { spawnCwd, cwd: null, oscTitle: null } },
  };
}

/** Replace the node at `path` (indexes into nested splits). */
function updateAt(node: PaneNode, path: number[], fn: (n: PaneNode) => PaneNode): PaneNode {
  if (path.length === 0) return fn(node);
  if (node.type !== "split") return node;
  const [head, ...rest] = path;
  return {
    ...node,
    children: node.children.map((c, i) => (i === head ? updateAt(c, rest, fn) : c)),
  };
}

interface AppStore {
  tabs: Tab[];
  activeTabId: string;
  tabBarPosition: "top" | "left";
  sidebarWidth: number;
  settingsOpen: boolean;
  searchOpen: boolean;

  newTab: () => void;
  closeTab: (tabId: string) => void;
  selectTab: (tabId: string) => void;
  selectTabIndex: (index: number) => void;
  cycleTab: (offset: 1 | -1) => void;
  moveTab: (from: number, to: number) => void;
  toggleTabBar: () => void;
  setSidebarWidth: (width: number) => void;
  openSettings: () => void;
  closeSettings: () => void;
  openSearch: () => void;
  closeSearch: () => void;

  splitPane: (paneId: string, dir: SplitDir) => void;
  closePane: (tabId: string, paneId: string) => void;
  selectPane: (tabId: string, paneId: string) => void;
  cyclePane: (offset: 1 | -1) => void;
  setSplitSizes: (tabId: string, path: number[], sizes: number[]) => void;
  onPaneTitle: (paneId: string, title: string) => void;
  onPaneCwd: (paneId: string, cwd: string) => void;
  setInitialSpawnCwd: (spawnCwd: string | null) => void;
  closePaneByPtyId: (ptyId: number, exitCode: number) => void;
}

const initialTab = makeTab();

let sidebarPersistTimer: ReturnType<typeof setTimeout> | undefined;

export const useAppStore = create<AppStore>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.id,
  tabBarPosition: "top",
  sidebarWidth: 180,
  settingsOpen: false,
  searchOpen: false,

  newTab: () => {
    const profile = useSettingsStore.getState().settings.profiles.find(
      (p) => p.id === useSettingsStore.getState().settings.defaultProfileId,
    );
    const tab = makeTab(profile?.cwd ?? null);
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const index = tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return;
    const remaining = tabs.filter((t) => t.id !== tabId);
    if (remaining.length === 0) {
      // Last tab: close the window (PTY cleanup happens via pane unmounts,
      // but this tab is being removed from state first, so release here).
      const tab = tabs[index];
      for (const paneId of collectPaneIds(tab.root)) {
        const entry = terminalManager.get(paneId);
        if (entry?.ptyId != null) invoke("pty_close", { ptyId: entry.ptyId }).catch(() => {});
      }
      getCurrentWindow().close();
      return;
    }
    const nextActive =
      activeTabId === tabId ? remaining[Math.min(index, remaining.length - 1)].id : activeTabId;
    set({ tabs: remaining, activeTabId: nextActive });
  },

  selectTab: (tabId) => {
    if (get().tabs.some((t) => t.id === tabId)) set({ activeTabId: tabId });
  },

  selectTabIndex: (index) => {
    const { tabs } = get();
    if (index >= 0 && index < tabs.length) set({ activeTabId: tabs[index].id });
  },

  cycleTab: (offset) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const next = (idx + offset + tabs.length) % tabs.length;
    set({ activeTabId: tabs[next].id });
  },

  moveTab: (from, to) => {
    if (from === to) return;
    set((s) => {
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(from, 1);
      if (!moved) return {};
      tabs.splice(to, 0, moved);
      return { tabs };
    });
  },

  toggleTabBar: () => {
    const pos = get().tabBarPosition === "top" ? "left" : "top";
    set({ tabBarPosition: pos });
    useSettingsStore.getState().update((draft) => {
      draft.ui.tabBarPosition = pos;
    });
  },

  setSidebarWidth: (width) => {
    const clamped = Math.min(480, Math.max(140, width));
    set({ sidebarWidth: clamped });
    // Debounce persistence: this fires on every mousemove while dragging.
    clearTimeout(sidebarPersistTimer);
    sidebarPersistTimer = setTimeout(() => {
      useSettingsStore.getState().update((draft) => {
        draft.ui.sidebarWidth = clamped;
      });
    }, 250);
  },

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),

  splitPane: (paneId, dir) => {
    set((s) => ({
      tabs: s.tabs.map((tab) => {
        if (!containsPane(tab.root, paneId)) return tab;
        const newPaneId = genId("pane");
        const profile = useSettingsStore.getState().settings.profiles.find(
          (p) => p.id === useSettingsStore.getState().settings.defaultProfileId,
        );
        return {
          ...tab,
          root: splitPaneNode(tab.root, paneId, dir, newPaneId),
          activePaneId: newPaneId,
          title: computeTabTitle(tab.paneMeta[newPaneId]),
          paneMeta: {
            ...tab.paneMeta,
            [newPaneId]: {
              spawnCwd: profile?.cwd ?? null,
              cwd: null,
              oscTitle: null,
            },
          },
        };
      }),
    }));
  },

  closePane: (tabId, paneId) => {
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || !containsPane(tab.root, paneId)) return;
    if (tab.root.type === "pane" && tab.root.id === paneId) {
      get().closeTab(tabId);
      return;
    }
    const res = removePaneNode(tab.root, paneId);
    if (!res.node) return;
    const newActive = res.focusPaneId ?? collectPaneIds(res.node)[0];
    set({
      tabs: tabs.map((t) => {
        if (t.id !== tabId) return t;
        // Drop the closed pane's title metadata (paneMeta pruning).
        const paneMeta = { ...t.paneMeta };
        delete paneMeta[paneId];
        return {
          ...t,
          root: res.node!,
          activePaneId: newActive,
          title: computeTabTitle(paneMeta[newActive]),
          paneMeta,
        };
      }),
    });
  },

  selectPane: (tabId, paneId) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId || !containsPane(t.root, paneId)) return t;
        return { ...t, activePaneId: paneId, title: computeTabTitle(t.paneMeta[paneId]) };
      }),
    }));
  },

  cyclePane: (offset) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    const paneId = nextPaneId(tab.root, tab.activePaneId, offset);
    set({
      tabs: tabs.map((t) =>
        t.id === tab.id
          ? { ...t, activePaneId: paneId, title: computeTabTitle(t.paneMeta[paneId]) }
          : t,
      ),
    });
  },

  setSplitSizes: (tabId, path, sizes) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, root: updateAt(t.root, path, (n) => ({ ...n, sizes })) }
          : t,
      ),
    }));
  },

  onPaneTitle: (paneId, title) => {
    if (!title) return;
    set((s) => ({
      tabs: s.tabs.map((tab) => {
        if (!(paneId in tab.paneMeta)) return tab;
        const paneMeta = { ...tab.paneMeta, [paneId]: { ...tab.paneMeta[paneId], oscTitle: title } };
        return {
          ...tab,
          paneMeta,
          title: tab.activePaneId === paneId ? computeTabTitle(paneMeta[paneId]) : tab.title,
        };
      }),
    }));
  },

  onPaneCwd: (paneId, cwd) => {
    if (!cwd) return;
    set((s) => ({
      tabs: s.tabs.map((tab) => {
        if (!(paneId in tab.paneMeta)) return tab;
        const paneMeta = { ...tab.paneMeta, [paneId]: { ...tab.paneMeta[paneId], cwd } };
        return {
          ...tab,
          paneMeta,
          title: tab.activePaneId === paneId ? computeTabTitle(paneMeta[paneId]) : tab.title,
        };
      }),
    }));
  },

  // Settings load is async; the pre-existing initial tab needs its spawn cwd
  // (and title) backfilled once the profile is known.
  setInitialSpawnCwd: (spawnCwd) => {
    set((s) => ({
      tabs: s.tabs.map((tab) => {
        const paneId = tab.activePaneId;
        const meta = tab.paneMeta[paneId];
        if (!meta || meta.spawnCwd !== null) return tab;
        const paneMeta = { ...tab.paneMeta, [paneId]: { ...meta, spawnCwd } };
        return { ...tab, title: computeTabTitle(paneMeta[paneId]), paneMeta };
      }),
    }));
  },

  closePaneByPtyId: (ptyId, exitCode) => {
    const entry = terminalManager.findByPty(ptyId);
    if (!entry) return;
    const { tabs } = get();
    const tab = tabs.find((t) => containsPane(t.root, entry.paneId));
    if (!tab) return;
    // Clean exits close their pane automatically; failures stay visible.
    if (exitCode === 0) get().closePane(tab.id, entry.paneId);
  },
}));
