/**
 * Pane layout tree. A tab's content is either a single pane or a nested
 * split; pure functions here make all tree operations unit-testable.
 *
 * `dir: "h"` lays children out side by side (columns),
 * `dir: "v"` stacks them (rows).
 */
export type SplitDir = "h" | "v";

export type PaneNode =
  | { type: "pane"; id: string }
  | { type: "split"; dir: SplitDir; children: PaneNode[]; sizes: number[] };

export function paneLeaf(id: string): PaneNode {
  return { type: "pane", id };
}

export function collectPaneIds(node: PaneNode, out: string[] = []): string[] {
  if (node.type === "pane") {
    out.push(node.id);
  } else {
    for (const child of node.children) collectPaneIds(child, out);
  }
  return out;
}

export function containsPane(node: PaneNode, paneId: string): boolean {
  if (node.type === "pane") return node.id === paneId;
  return node.children.some((c) => containsPane(c, paneId));
}

/** Replace `paneId` with a split holding it and a fresh pane. */
export function splitPaneNode(
  node: PaneNode,
  paneId: string,
  dir: SplitDir,
  newPaneId: string,
): PaneNode {
  if (node.type === "pane") {
    if (node.id !== paneId) return node;
    return {
      type: "split",
      dir,
      children: [paneLeaf(paneId), paneLeaf(newPaneId)],
      sizes: [1, 1],
    };
  }
  return {
    ...node,
    children: node.children.map((c) => splitPaneNode(c, paneId, dir, newPaneId)),
  };
}

export interface RemoveResult {
  /** null when the tree becomes empty (last pane removed) */
  node: PaneNode | null;
  /** neighbor pane to focus after the removal, if any */
  focusPaneId: string | null;
}

/** Remove a pane, collapsing singleton splits along the way. */
export function removePaneNode(node: PaneNode, paneId: string): RemoveResult {
  if (node.type === "pane") {
    return node.id === paneId
      ? { node: null, focusPaneId: null }
      : { node, focusPaneId: null };
  }

  let focusPaneId: string | null = null;
  const children: PaneNode[] = [];
  const sizes: number[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (!containsPane(child, paneId)) {
      children.push(child);
      sizes.push(node.sizes[i]);
      continue;
    }
    const neighbor = node.children[i - 1] ?? node.children[i + 1];
    const res = removePaneNode(child, paneId);
    if (res.node) {
      children.push(res.node);
      sizes.push(node.sizes[i]);
    }
    // Prefer the focus reported by the collapsing subtree (e.g. the pane it
    // collapsed into); fall back to the adjacent sibling.
    if (res.focusPaneId) {
      focusPaneId = res.focusPaneId;
    } else if (neighbor && neighbor !== child) {
      focusPaneId = collectPaneIds(neighbor)[0];
    }
  }

  if (children.length === 0) return { node: null, focusPaneId };
  if (children.length === 1) return { node: children[0], focusPaneId };
  return { node: { type: "split", dir: node.dir, children, sizes }, focusPaneId };
}

/** Cycle pane focus within a tab. offset is +1 (next) or -1 (previous). */
export function nextPaneId(node: PaneNode, activePaneId: string, offset: 1 | -1): string {
  const ids = collectPaneIds(node);
  if (ids.length <= 1) return activePaneId;
  const idx = ids.indexOf(activePaneId);
  const next = (idx + offset + ids.length) % ids.length;
  return ids[next];
}
