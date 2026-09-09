import { describe, expect, it } from "vitest";
import {
  collectPaneIds,
  containsPane,
  nextPaneId,
  paneLeaf,
  removePaneNode,
  splitPaneNode,
  type PaneNode,
} from "./paneTree";

const a = "a";
const b = "b";
const c = "c";
const d = "d";

function h(children: PaneNode[], sizes = children.map(() => 1)): PaneNode {
  return { type: "split", dir: "h", children, sizes };
}
function v(children: PaneNode[], sizes = children.map(() => 1)): PaneNode {
  return { type: "split", dir: "v", children, sizes };
}

describe("splitPaneNode", () => {
  it("splits a lone pane into two", () => {
    const tree = splitPaneNode(paneLeaf(a), a, "h", b);
    expect(tree).toEqual(h([paneLeaf(a), paneLeaf(b)]));
  });

  it("splits a nested pane and keeps siblings", () => {
    const tree = splitPaneNode(h([paneLeaf(a), paneLeaf(b)]), a, "v", c);
    expect(tree).toEqual(h([v([paneLeaf(a), paneLeaf(c)]), paneLeaf(b)]));
  });
});

describe("removePaneNode", () => {
  it("collapses the tree when the last pane is removed", () => {
    expect(removePaneNode(paneLeaf(a), a)).toEqual({ node: null, focusPaneId: null });
  });

  it("collapses a singleton split back to a pane", () => {
    const tree = h([paneLeaf(a), paneLeaf(b)]);
    const res = removePaneNode(tree, b);
    expect(res.node).toEqual(paneLeaf(a));
    // focus falls back to the surviving neighbor
    expect(res.focusPaneId).toBe(a);
  });

  it("focuses the previous neighbor when closing a middle pane", () => {
    const tree = h([paneLeaf(a), paneLeaf(b), paneLeaf(c)]);
    const res = removePaneNode(tree, b);
    expect(collectPaneIds(res.node!)).toEqual([a, c]);
    expect(res.focusPaneId).toBe(a);
  });

  it("focuses the next neighbor when closing the first pane", () => {
    const tree = h([paneLeaf(a), paneLeaf(b)]);
    const res = removePaneNode(tree, a);
    expect(res.focusPaneId).toBe(b);
  });

  it("collapses nested singletons recursively", () => {
    const tree = h([v([paneLeaf(a), paneLeaf(b)]), paneLeaf(c)]);
    const res = removePaneNode(tree, b);
    // v([a]) collapses to a; h([a, c]) remains
    expect(res.node).toEqual(h([paneLeaf(a), paneLeaf(c)]));
    expect(res.focusPaneId).toBe(a);
  });
});

describe("nextPaneId", () => {
  it("cycles forward and backward in visual order", () => {
    const tree = h([paneLeaf(a), v([paneLeaf(b), paneLeaf(c)])]);
    expect(nextPaneId(tree, a, 1)).toBe(b);
    expect(nextPaneId(tree, c, 1)).toBe(a);
    expect(nextPaneId(tree, a, -1)).toBe(c);
  });

  it("returns the same pane when there is only one", () => {
    expect(nextPaneId(paneLeaf(a), a, 1)).toBe(a);
  });
});

describe("containsPane", () => {
  it("finds nested panes", () => {
    const tree = h([paneLeaf(a), v([paneLeaf(b), paneLeaf(c)])]);
    expect(containsPane(tree, c)).toBe(true);
    expect(containsPane(tree, d)).toBe(false);
  });
});
