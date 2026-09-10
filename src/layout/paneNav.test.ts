import { describe, expect, it } from "vitest";

import { navigatePane, nearestPane, paneRects } from "./paneNav";
import { collectPaneIds, type PaneNode } from "./paneTree";

function threeWay(): PaneNode {
  // a | (b / c)
  return {
    type: "split",
    dir: "h",
    sizes: [1, 1],
    children: [
      { type: "pane", id: "a" },
      {
        type: "split",
        dir: "v",
        sizes: [1, 1],
        children: [
          { type: "pane", id: "b" },
          { type: "pane", id: "c" },
        ],
      },
    ],
  };
}

describe("paneRects", () => {
  it("splits normalized space by ratios", () => {
    const rects = paneRects(threeWay());
    expect(rects.get("a")).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(rects.get("b")).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
    expect(rects.get("c")).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });

  it("respects custom sizes", () => {
    const tree: PaneNode = {
      type: "split",
      dir: "h",
      sizes: [3, 1],
      children: [
        { type: "pane", id: "wide" },
        { type: "pane", id: "narrow" },
      ],
    };
    const rects = paneRects(tree);
    expect(rects.get("wide")!.w).toBeCloseTo(0.75);
    expect(rects.get("narrow")!.w).toBeCloseTo(0.25);
  });
});

describe("nearestPane / navigatePane", () => {
  it("moves right from the left pane", () => {
    expect(navigatePane(threeWay(), "a", "right")).toBe("b");
  });

  it("moves vertically within the right column", () => {
    expect(navigatePane(threeWay(), "b", "down")).toBe("c");
    expect(navigatePane(threeWay(), "c", "up")).toBe("b");
  });

  it("returns null at edges", () => {
    expect(navigatePane(threeWay(), "a", "left")).toBeNull();
    expect(navigatePane(threeWay(), "c", "down")).toBeNull();
  });

  it("handles missing pane", () => {
    const rects = paneRects(threeWay());
    expect(nearestPane(rects, "zz", "right")).toBeNull();
  });

  it("works on a single pane", () => {
    expect(navigatePane({ type: "pane", id: "only" }, "only", "right")).toBeNull();
    expect(collectPaneIds({ type: "pane", id: "only" })).toEqual(["only"]);
  });
});
