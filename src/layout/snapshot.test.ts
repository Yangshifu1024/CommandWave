import { describe, expect, it } from "vitest";

import {
  parseSnapshot,
  remapSnapshot,
  serializeSession,
} from "./snapshot";
import type { Tab } from "../store/appStore";

function fakeTab(): Tab {
  return {
    id: "tab-1",
    title: "proj",
    root: {
      type: "split",
      dir: "h",
      sizes: [1, 2],
      children: [
        { type: "pane", id: "pane-a" },
        { type: "pane", id: "pane-b" },
      ],
    },
    activePaneId: "pane-b",
    customTitle: "My Work",
    locked: true,
    paneMeta: {
      "pane-a": { spawnCwd: "/tmp", cwd: null, oscTitle: null },
      "pane-b": { spawnCwd: null, cwd: null, oscTitle: "vim" },
    },
  };
}

describe("serializeSession", () => {
  it("captures layout, meta and tab flags", () => {
    const snap = serializeSession([fakeTab()], "tab-1");
    expect(snap.tabs).toHaveLength(1);
    expect(snap.tabs[0].customTitle).toBe("My Work");
    expect(snap.tabs[0].locked).toBe(true);
    expect(snap.tabs[0].paneMeta["pane-a"].spawnCwd).toBe("/tmp");
    expect(snap.tabs[0].paneMeta["pane-b"].cwd).toBeNull();
  });
});

describe("remapSnapshot", () => {
  it("rewrites all pane ids consistently", () => {
    const snap = serializeSession([fakeTab()], "tab-1");
    const map = new Map([
      ["pane-a", "pane-x"],
      ["pane-b", "pane-y"],
    ]);
    const remapped = remapSnapshot(snap, (old) => map.get(old) ?? old);
    const tab = remapped.tabs[0];
    expect(tab.root).toEqual({
      type: "split",
      dir: "h",
      sizes: [1, 2],
      children: [
        { type: "pane", id: "pane-x" },
        { type: "pane", id: "pane-y" },
      ],
    });
    expect(tab.activePaneId).toBe("pane-y");
    expect(tab.paneMeta["pane-x"].spawnCwd).toBe("/tmp");
    expect(tab.paneMeta["pane-a"]).toBeUndefined();
  });
});

describe("parseSnapshot", () => {
  it("round-trips through JSON", () => {
    const snap = serializeSession([fakeTab()], "tab-1");
    const back = parseSnapshot(JSON.stringify(snap));
    expect(back).not.toBeNull();
    expect(back!.tabs[0].root).toEqual(snap.tabs[0].root);
  });

  it("rejects malformed snapshots", () => {
    expect(parseSnapshot("not json")).toBeNull();
    expect(parseSnapshot("{}")).toBeNull();
    expect(parseSnapshot('{"tabs":[]}')).toBeNull();
    expect(parseSnapshot('{"tabs":[{"root":5,"paneMeta":{}}]}')).toBeNull();
  });
});
