/**
 * Session snapshots (Arrangements + session restore): serialize the tab /
 * pane structure to plain JSON and remap pane ids when restoring, so old
 * sessions never collide with live panes. Pure functions, unit tested.
 */

import type { Tab } from "../store/appStore";
import type { PaneNode } from "./paneTree";

export interface PaneMetaSnapshot {
  spawnCwd: string | null;
  cwd: string | null;
  oscTitle: string | null;
}

export interface TabSnapshot {
  root: PaneNode;
  activePaneId: string;
  paneMeta: Record<string, PaneMetaSnapshot>;
  customTitle: string | null;
  locked: boolean;
}

export interface SessionSnapshot {
  tabs: TabSnapshot[];
  activeTabId: string;
}

/** Strip runtime ids and volatile state; keep layout + spawn metadata. */
export function serializeSession(
  tabs: Tab[],
  activeTabId: string,
): SessionSnapshot {
  return {
    activeTabId,
    tabs: tabs.map((tab) => ({
      root: tab.root,
      activePaneId: tab.activePaneId,
      paneMeta: Object.fromEntries(
        Object.entries(tab.paneMeta).map(([paneId, meta]) => [
          paneId,
          {
            spawnCwd: meta.spawnCwd,
            cwd: null, // stale after restore; titles refetch via OSC 7
            oscTitle: meta.oscTitle,
          },
        ]),
      ),
      customTitle: tab.customTitle ?? null,
      locked: tab.locked ?? false,
    })),
  };
}

/** Replace every pane id in a tree/meta with fresh ids. */
export function remapSnapshot(
  snapshot: SessionSnapshot,
  newId: (old: string) => string,
): SessionSnapshot {
  const remapNode = (node: PaneNode): PaneNode =>
    node.type === "pane"
      ? { type: "pane", id: newId(node.id) }
      : {
          type: "split",
          dir: node.dir,
          sizes: node.sizes,
          children: node.children.map(remapNode),
        };
  return {
    activeTabId: "",
    tabs: snapshot.tabs.map((tab) => {
      const paneMeta: Record<string, PaneMetaSnapshot> = {};
      for (const [paneId, meta] of Object.entries(tab.paneMeta)) {
        paneMeta[newId(paneId)] = meta;
      }
      return {
        root: remapNode(tab.root),
        activePaneId: newId(tab.activePaneId),
        paneMeta,
        customTitle: tab.customTitle,
        locked: tab.locked,
      };
    }),
  };
}

export function parseSnapshot(json: string): SessionSnapshot | null {
  try {
    const parsed = JSON.parse(json) as SessionSnapshot;
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return null;
    for (const tab of parsed.tabs) {
      if (!tab.root || typeof tab.root !== "object") return null;
      if (!tab.paneMeta || typeof tab.paneMeta !== "object") return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
