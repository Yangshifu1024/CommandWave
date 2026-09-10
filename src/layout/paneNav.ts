/**
 * Directional pane navigation (iTerm2 ⌘⌥+arrow). Pane rectangles are
 * approximated from the layout tree using each split's size ratios, which
 * mirrors how SplitTree lays cells out with flexGrow.
 */

import { collectPaneIds, type PaneNode } from "./paneTree";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Compute normalized (0–1) rectangles for every pane leaf. */
export function paneRects(node: PaneNode): Map<string, Rect> {
  const out = new Map<string, Rect>();
  const walk = (n: PaneNode, r: Rect) => {
    if (n.type === "pane") {
      out.set(n.id, r);
      return;
    }
    const total = n.sizes.reduce((s, v) => s + v, 0) || n.children.length;
    let offset = 0;
    n.children.forEach((child, i) => {
      const frac = (n.sizes[i] ?? 1) / total;
      const childRect: Rect =
        n.dir === "h"
          ? { ...r, x: r.x + offset, w: r.w * frac }
          : { ...r, y: r.y + offset, h: r.h * frac };
      walk(child, childRect);
      offset += (n.dir === "h" ? r.w : r.h) * frac;
    });
  };
  walk(node, { x: 0, y: 0, w: 1, h: 1 });
  return out;
}

export type Direction = "left" | "right" | "up" | "down";

/**
 * The best pane to move focus to from `fromId` in `direction`: candidates
 * must lie (mostly) on that side; nearest by center distance wins.
 */
export function nearestPane(
  rects: Map<string, Rect>,
  fromId: string,
  direction: Direction,
): string | null {
  const from = rects.get(fromId);
  if (!from) return null;
  const eps = 0.01;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const [id, r] of rects) {
    if (id === fromId) continue;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const fx = from.x + from.w / 2;
    const fy = from.y + from.h / 2;
    const inDirection =
      direction === "right"
        ? r.x >= from.x + from.w - eps
        : direction === "left"
          ? r.x + r.w <= from.x + eps
          : direction === "down"
            ? r.y >= from.y + from.h - eps
            : r.y + r.h <= from.y + eps;
    if (!inDirection) continue;
    const dist =
      direction === "left" || direction === "right"
        ? Math.abs(cx - fx) + Math.abs(cy - fy) * 2
        : Math.abs(cy - fy) + Math.abs(cx - fx) * 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return best;
}

/** Convenience: direction lookup over a tree. */
export function navigatePane(
  node: PaneNode,
  fromId: string,
  direction: Direction,
): string | null {
  return nearestPane(paneRects(node), fromId, direction);
}

/** All pane ids in order (re-export for symmetry). */
export { collectPaneIds };
