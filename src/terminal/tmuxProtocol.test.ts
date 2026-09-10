import { describe, expect, it } from "vitest";

import {
  buildSendKeysCmd,
  mapInputToKeys,
  parseNotification,
  parseTmuxLayout,
} from "./tmuxProtocol";

describe("parseNotification", () => {
  it("parses %output", () => {
    const n = parseNotification("%output %3 hello world");
    expect(n).toEqual({ kind: "output", paneId: "%3", data: "hello world" });
  });

  it("parses %layout-change with active pane", () => {
    // Trailing ",<activePane>" after the group is optional.
    const n = parseNotification("%layout-change @1 4f7d,80x24,0,0{80x12,0,0,0,80x11,0,13,1}");
    expect(n).toMatchObject({ kind: "layout-change", windowId: "@1", layout: "4f7d,80x24,0,0{80x12,0,0,0,80x11,0,13,1}" });
    const n2 = parseNotification("%layout-change @1 cafe,80x24,0,0{80x12,0,0,0,80x11,0,13,1},4");
    expect(n2).toMatchObject({ kind: "layout-change", activePaneId: "%4" });
  });

  it("parses window lifecycle and session notifications", () => {
    expect(parseNotification("%window-add @2")).toEqual({ kind: "window-add", windowId: "@2" });
    expect(parseNotification("%window-close @2")).toEqual({ kind: "window-close", windowId: "@2" });
    expect(parseNotification("%window-renamed @2 my win")).toEqual({
      kind: "window-renamed",
      windowId: "@2",
      name: "my win",
    });
    expect(parseNotification("%session-changed $4 main")).toEqual({
      kind: "session-changed",
      sessionId: "$4",
      name: "main",
    });
    expect(parseNotification("%pane-mode-changed %5")).toEqual({
      kind: "pane-mode-changed",
      paneId: "%5",
    });
    expect(parseNotification("%exit")).toEqual({ kind: "exit", reason: null });
  });

  it("passes through non-notification lines", () => {
    expect(parseNotification("plain text").kind).toBe("unknown");
  });
});

describe("parseTmuxLayout", () => {
  it("parses a single-pane window", () => {
    const { root, activePaneId } = parseTmuxLayout("cafe,80x24,0,0,0");
    expect(root).toEqual({ w: 80, h: 24, x: 0, y: 0, paneId: "%0" });
    expect(activePaneId).toBe("%0");
  });

  it("parses a vertical split", () => {
    const { root, activePaneId } = parseTmuxLayout(
      "4f7d,100x30,0,0{100x15,0,0,0,100x14,0,16,1},1",
    );
    expect(root.w).toBe(100);
    expect(root.h).toBe(30);
    expect(root.children).toHaveLength(2);
    expect(root.children![0]).toMatchObject({ w: 100, h: 15, x: 0, y: 0, paneId: "%0" });
    expect(root.children![1]).toMatchObject({ w: 100, h: 14, x: 0, y: 16, paneId: "%1" });
    expect(activePaneId).toBe("%1");
  });

  it("parses nested splits", () => {
    const { root } = parseTmuxLayout(
      "abcd,120x30,0,0{60x30,0,0,0,60x30,60,0{60x15,60,0,1,60x14,60,16,2}}",
    );
    expect(root.children).toHaveLength(2);
    const right = root.children![1];
    expect(right.paneId).toBeUndefined();
    expect(right.children).toHaveLength(2);
    expect(right.children![1]).toMatchObject({ x: 60, y: 16, paneId: "%2" });
  });

  it("is resilient to garbage", () => {
    expect(parseTmuxLayout("nope").root.w).toBe(0);
  });
});

describe("mapInputToKeys / buildSendKeysCmd", () => {
  it("maps plain typing to a literal chunk", () => {
    expect(mapInputToKeys("ls -la")).toEqual([{ literal: "ls -la", keys: [] }]);
  });

  it("maps enter, backspace and arrows to key names", () => {
    expect(mapInputToKeys("ls\r")).toEqual([
      { literal: "ls", keys: [] },
      { literal: "", keys: ["Enter"] },
    ]);
    expect(mapInputToKeys("\x7f")).toEqual([{ literal: "", keys: ["BSpace"] }]);
    expect(mapInputToKeys("\x1b[D")).toEqual([{ literal: "", keys: ["Left"] }]);
  });

  it("escapes single quotes in commands", () => {
    const cmds = buildSendKeysCmd("%1", "it's");
    expect(cmds).toEqual([`send-keys -t %1 -l 'it'\\''s'`]);
  });

  it("emits one command per key", () => {
    expect(buildSendKeysCmd("%2", "\x1b[B")).toEqual(["send-keys -t %2 Down"]);
  });
});
