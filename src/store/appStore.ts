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
import { navigatePane } from "../layout/paneNav";
import { remapSnapshot } from "../layout/snapshot";
import { pickProfileForHost } from "../terminal/profileSwitch";
import { encodeDetachParam } from "../terminal/detachedWindow";

export interface Tab {
  id: string;
  title: string;
  root: PaneNode;
  activePaneId: string;
  /** Per-pane title inputs; tabs render the active pane's chain. */
  paneMeta: Record<string, PaneTitleMeta>;
  /** user-set title override (⌘I rename) */
  customTitle: string | null;
  /** locked tabs refuse to close */
  locked: boolean;
  /** tmux control mode: window id (@N) this tab mirrors, else null */
  tmuxWindowId?: string | null;
}

/** A pending right-click menu: screen position plus what was clicked. */
export interface ContextMenuState {
  x: number;
  y: number;
  paneId?: string;
  tabId?: string;
  hasSelection: boolean;
}

let seq = 0;
function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${++seq}`;
}

/** Panes being moved to their own window: their PTY must survive unmount. */
const detaching = new Set<string>();

function makeTab(profileId?: string | null): Tab {
  const { meta } = makePaneMeta(profileId ?? null);
  const paneId = genId("pane");
  return {
    id: genId("tab"),
    title: computeTabTitle(meta),
    root: paneLeaf(paneId),
    activePaneId: paneId,
    paneMeta: { [paneId]: meta },
    customTitle: null,
    locked: false,
  };
}

function makePaneMeta(profileId: string | null = null) {
  const settings = useSettingsStore.getState().settings;
  const profile =
    settings.profiles.find((p) => p.id === profileId) ??
    settings.profiles.find((p) => p.id === settings.defaultProfileId) ??
    settings.profiles[0];
  return {
    meta: { spawnCwd: profile?.cwd ?? null, cwd: null, oscTitle: null, profileId: profile?.id ?? null },
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

/** A paste waiting for user confirmation (multi-line/large/destructive). */
export interface PasteConfirmState {
  text: string;
  paneId: string;
}

interface AppStore {
  tabs: Tab[];
  activeTabId: string;
  tabBarPosition: "top" | "left";
  sidebarWidth: number;
  settingsOpen: boolean;
  searchOpen: boolean;
  /** Current search-bar query, shared so ⌘G can repeat it globally. */
  searchQuery: string;
  contextMenu: ContextMenuState | null;
  /** Pane currently in Copy Mode (line-oriented keyboard navigation). */
  copyModePane: string | null;
  pasteConfirm: PasteConfirmState | null;
  /** pane temporarily filling its tab (⌘⇧Enter) */
  maximizedPaneId: string | null;
  /** broadcast input to every pane */
  broadcast: boolean;
  /** Exposé overlay listing all panes */
  exposeOpen: boolean;
  /** Recent Commands palette (⌘;) */
  historyOpen: boolean;
  /** Instant Replay overlay (buffer snapshots) */
  replayOpen: boolean;
  /** opened via semantic search (⌥⌘;) — include output by default */
  historySemantic: boolean;
  /** tab being renamed inline (TabStrip) */
  renamingTabId: string | null;

  newTab: (profileId?: string) => void;
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
  setSearchQuery: (query: string) => void;
  openContextMenu: (menu: ContextMenuState) => void;
  closeContextMenu: () => void;

  splitPane: (paneId: string, dir: SplitDir) => void;
  closePane: (tabId: string, paneId: string) => void;
  selectPane: (tabId: string, paneId: string) => void;
  cyclePane: (offset: 1 | -1) => void;
  /** ⌘⌥+arrow: focus the geometrically nearest pane in a direction */
  navigatePaneDirection: (dir: "left" | "right" | "up" | "down") => void;
  /** ⌘⇧Enter: temporarily fill the tab with the active pane */
  toggleMaximizePane: () => void;
  toggleBroadcast: () => void;
  toggleExpose: () => void;
  setExposeOpen: (open: boolean) => void;
  renameTab: (tabId: string, title: string | null) => void;
  toggleTabLock: (tabId: string) => void;
  /** Replace all tabs with a remapped snapshot (session restore). */
  restoreSession: (snapshot: import("../layout/snapshot").SessionSnapshot) => void;
  /** Move a pane into its own window (PTY session is handed over). */
  detachPaneToWindow: (paneId: string) => void;
  /** True while the pane's unmount must not kill its PTY. */
  isDetaching: (paneId: string) => boolean;
  /** tmux control mode: create/update a tab mirroring a tmux window. */
  upsertTmuxWindow: (windowId: string, root: PaneNode) => void;
  closeTmuxWindow: (tabId: string) => void;
  removeTmuxTabs: () => void;
  setSplitSizes: (tabId: string, path: number[], sizes: number[]) => void;
  onPaneTitle: (paneId: string, title: string) => void;
  onPaneCwd: (paneId: string, cwd: string) => void;
  /** OSC 7 host → profile auto-switch rules. */
  onPaneHost: (paneId: string, host: string) => void;
  setInitialSpawnCwd: (spawnCwd: string | null) => void;
  refreshTitles: () => void;
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
  searchQuery: "",
  contextMenu: null,
  copyModePane: null,
  pasteConfirm: null,
  maximizedPaneId: null,
  broadcast: false,
  exposeOpen: false,
  historyOpen: false,
  historySemantic: false,
  replayOpen: false,
  renamingTabId: null,

  newTab: (profileId?: string) => {
    const tab = makeTab(profileId ?? null);
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const index = tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return;
    // Locked tabs refuse to close (iTerm2-style tab lock).
    if (tabs[index].locked) return;
    // tmux-mirrored tabs kill the server-side window as well.
    if (tabs[index].tmuxWindowId) {
      const winId = tabs[index].tmuxWindowId;
      void import("../terminal/tmuxController").then((m) =>
        m.tmuxController.killWindow(winId!),
      );
    }
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
  setSearchQuery: (query) => set({ searchQuery: query }),
  openContextMenu: (menu) => set({ contextMenu: menu }),
  closeContextMenu: () => set({ contextMenu: null }),

  splitPane: (paneId, dir) => {
    set((s) => ({
      tabs: s.tabs.map((tab) => {
        if (!containsPane(tab.root, paneId)) return tab;
        const newPaneId = genId("pane");
        // The new pane inherits the split pane's profile.
        const profileId = tab.paneMeta[paneId]?.profileId ?? null;
        const { meta } = makePaneMeta(profileId);
        return {
          ...tab,
          root: splitPaneNode(tab.root, paneId, dir, newPaneId),
          activePaneId: newPaneId,
          title: computeTabTitle(meta),
          paneMeta: { ...tab.paneMeta, [newPaneId]: meta },
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

  navigatePaneDirection: (dir) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    const target = navigatePane(tab.root, tab.activePaneId, dir);
    if (target) get().selectPane(tab.id, target);
  },

  toggleMaximizePane: () => {
    const { tabs, activeTabId, maximizedPaneId } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    set({
      maximizedPaneId:
        maximizedPaneId === tab.activePaneId ? null : tab.activePaneId,
    });
  },

  toggleBroadcast: () => set((s) => ({ broadcast: !s.broadcast })),
  toggleExpose: () => set((s) => ({ exposeOpen: !s.exposeOpen })),
  setExposeOpen: (open) => set({ exposeOpen: open }),

  renameTab: (tabId, title) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, customTitle: title && title.trim() ? title.trim() : null, title: title && title.trim() ? title.trim() : t.title }
          : t,
      ),
    }));
  },

  toggleTabLock: (tabId) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, locked: !t.locked } : t)),
    }));
  },

  restoreSession: (snapshot) => {
    const remapped = remapSnapshot(snapshot, () => genId("pane"));
    const tabs: Tab[] = remapped.tabs.map((tabSnap) => ({
      id: genId("tab"),
      title: tabSnap.customTitle ?? computeTabTitle(tabSnap.paneMeta[tabSnap.activePaneId]),
      root: tabSnap.root,
      activePaneId: tabSnap.activePaneId,
      paneMeta: tabSnap.paneMeta,
      customTitle: tabSnap.customTitle,
      locked: tabSnap.locked,
    }));
    if (tabs.length === 0) return;
    set({ tabs, activeTabId: tabs[0].id, maximizedPaneId: null });
  },

  detachPaneToWindow: (paneId) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => containsPane(t.root, paneId));
    const entry = terminalManager.get(paneId);
    if (!tab || !entry || entry.ptyId === null) return;
    // Moving the last pane of the last tab would close this window — refuse.
    const isOnlyPane = tab.root.type === "pane" && tab.root.id === paneId;
    if (isOnlyPane && tabs.length <= 1) return;

    detaching.add(paneId);
    // Open the child window hosting the pane (same frontend, ?detach= param).
    const info = {
      paneId,
      ptyId: entry.ptyId,
      cwd: tab.paneMeta[paneId]?.cwd ?? tab.paneMeta[paneId]?.spawnCwd ?? null,
      shell: null,
      profileId: tab.paneMeta[paneId]?.profileId ?? null,
    };
    void import("@tauri-apps/api/webviewWindow").then(({ WebviewWindow }) => {
      const label = `detach-${paneId}`;
      if (!document.querySelector(`[data-window="${label}"]`)) {
        const win = new WebviewWindow(label, {
          url: `/?detach=${encodeDetachParam(info)}`,
          title: computeTabTitle(tab.paneMeta[paneId]) || "CommandWave",
          width: 800,
          height: 480,
          transparent: true,
        });
        win.once("tauri://error", () => detaching.delete(paneId));
      }
    });
    // The pane unmounts shortly; release the guard once it has.
    setTimeout(() => detaching.delete(paneId), 2000);

    // Remove the pane from this window's tree without killing the PTY.
    set((s) => {
      if (isOnlyPane) {
        const remaining = s.tabs.filter((t) => t.id !== tab.id);
        const nextActive =
          activeTabId === tab.id ? remaining[Math.min(s.tabs.indexOf(tab), remaining.length - 1)].id : activeTabId;
        return { tabs: remaining, activeTabId: nextActive, maximizedPaneId: null };
      }
      const res = removePaneNode(tab.root, paneId);
      if (!res.node) return {};
      const newActive = res.focusPaneId ?? collectPaneIds(res.node)[0];
      return {
        tabs: s.tabs.map((t) => {
          if (t.id !== tab.id) return t;
          const paneMeta = { ...t.paneMeta };
          delete paneMeta[paneId];
          return { ...t, root: res.node!, activePaneId: newActive, paneMeta };
        }),
        maximizedPaneId: null,
      };
    });
  },

  isDetaching: (paneId) => detaching.has(paneId),

  upsertTmuxWindow: (windowId, root) => {
    const existing = get().tabs.find((t) => t.tmuxWindowId === windowId);
    if (existing) {
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.tmuxWindowId !== windowId) return t;
          const paneMeta = { ...t.paneMeta };
          for (const paneId of collectPaneIds(root)) {
            paneMeta[paneId] ??= { spawnCwd: null, cwd: null, oscTitle: "tmux", profileId: null };
          }
          return { ...t, root, paneMeta, activePaneId: collectPaneIds(root)[0] };
        }),
      }));
      return;
    }
    const paneIds = collectPaneIds(root);
    const paneMeta: Tab["paneMeta"] = {};
    for (const paneId of paneIds) {
      paneMeta[paneId] = { spawnCwd: null, cwd: null, oscTitle: "tmux", profileId: null };
    }
    const tab: Tab = {
      id: genId("tab"),
      title: "tmux",
      root,
      activePaneId: paneIds[0],
      paneMeta,
      customTitle: null,
      locked: false,
      tmuxWindowId: windowId,
    };
    void import("../terminal/tmuxController").then((m) =>
      m.tmuxController.registerWindow(windowId, tab.id),
    );
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
  },

  closeTmuxWindow: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (tab?.tmuxWindowId) {
      void import("../terminal/tmuxController").then((m) =>
        m.tmuxController.killWindow(tab.tmuxWindowId!),
      );
    }
    get().closeTab(tabId);
  },

  removeTmuxTabs: () => {
    set((s) => {
      const remaining = s.tabs.filter((t) => !t.tmuxWindowId);
      const activeGone = !remaining.some((t) => t.id === s.activeTabId);
      return {
        tabs: remaining,
        activeTabId: activeGone ? remaining[0]?.id ?? "" : s.activeTabId,
      };
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

  onPaneHost: (paneId, host) => {
    set((s) => ({
      tabs: s.tabs.map((tab) => {
        if (!(paneId in tab.paneMeta)) return tab;
        // Profile auto-switch: a matching host rule re-themes the pane.
        const rule = pickProfileForHost(
          host,
          useSettingsStore.getState().settings.autoSwitchRules,
        );
        if (!rule) return tab;
        const meta = tab.paneMeta[paneId];
        if (meta.profileId === rule.profileId) return tab;
        const paneMeta = { ...tab.paneMeta, [paneId]: { ...meta, profileId: rule.profileId } };
        return { ...tab, paneMeta };
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

  // Recompute every tab's title from its active pane (used after async
  // inputs like the home directory arrive, which titles render as "~").
  refreshTitles: () => {
    set((s) => ({
      tabs: s.tabs.map((tab) => ({
        ...tab,
        title: computeTabTitle(tab.paneMeta[tab.activePaneId]),
      })),
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
