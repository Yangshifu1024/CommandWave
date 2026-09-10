import { describe, expect, it } from "vitest";

import {
  applyCopyModeInput,
  copyModeHighlight,
  copyModeKey,
  copyModeRange,
  enterCopyMode,
  type CopyModeTerminal,
} from "./copyMode";

function fakeTerm(
  length: number,
  viewportY: number,
  viewportHeight = 10,
): CopyModeTerminal {
  return {
    buffer: { active: { length, viewportY, viewportHeight } },
    scrollToLine: () => {},
  };
}

describe("copyModeKey", () => {
  it("maps vim and arrow keys", () => {
    expect(copyModeKey({ key: "k", ctrlKey: false, metaKey: false })).toEqual({ t: "move", delta: -1 });
    expect(copyModeKey({ key: "ArrowDown", ctrlKey: false, metaKey: false })).toEqual({ t: "move", delta: 1 });
    expect(copyModeKey({ key: "f", ctrlKey: false, metaKey: false })).toEqual({ t: "page", delta: 1 });
    expect(copyModeKey({ key: "G", ctrlKey: false, metaKey: false })).toEqual({ t: "goto-bottom" });
    expect(copyModeKey({ key: "q", ctrlKey: false, metaKey: false })).toEqual({ t: "exit" });
  });

  it("maps modifier copy", () => {
    expect(copyModeKey({ key: "c", ctrlKey: true, metaKey: false }, false)).toEqual({ t: "copy" });
    expect(copyModeKey({ key: "c", ctrlKey: false, metaKey: true }, true)).toEqual({ t: "copy" });
    expect(copyModeKey({ key: "c", ctrlKey: false, metaKey: false })).toBeNull();
  });

  it("ignores horizontal keys", () => {
    expect(copyModeKey({ key: "h", ctrlKey: false, metaKey: false })).toBeNull();
  });
});

describe("applyCopyModeInput", () => {
  it("moves and clamps", () => {
    const term = fakeTerm(100, 50);
    let s = enterCopyMode(term);
    expect(s.cursor).toBe(50);
    s = applyCopyModeInput(s, { t: "move", delta: -1 }, term)!;
    expect(s.cursor).toBe(49);
    s = applyCopyModeInput(s, { t: "goto-top" }, term)!;
    expect(s.cursor).toBe(0);
    s = applyCopyModeInput(s, { t: "move", delta: -1 }, term)!;
    expect(s.cursor).toBe(0);
  });

  it("pages by viewport height", () => {
    const term = fakeTerm(100, 0);
    const s = applyCopyModeInput(enterCopyMode(term), { t: "page", delta: 1 }, term)!;
    expect(s.cursor).toBe(10);
  });

  it("exit and copy return null", () => {
    const term = fakeTerm(100, 0);
    expect(applyCopyModeInput(enterCopyMode(term), { t: "exit" }, term)).toBeNull();
    expect(applyCopyModeInput(enterCopyMode(term), { t: "copy" }, term)).toBeNull();
  });
});

describe("selection", () => {
  const term = fakeTerm(100, 0);

  it("has no range until anchored", () => {
    expect(copyModeRange(enterCopyMode(term))).toBeNull();
  });

  it("produces an inclusive-anchored range", () => {
    let s = enterCopyMode(term);
    s = applyCopyModeInput(s, { t: "toggle-anchor" }, term)!;
    s = applyCopyModeInput(s, { t: "move", delta: 1 }, term)!;
    s = applyCopyModeInput(s, { t: "move", delta: 1 }, term)!;
    expect(copyModeRange(s)).toEqual({ from: 0, to: 3 });
    expect(copyModeHighlight(s)).toEqual({ from: 0, to: 3 });
    s = applyCopyModeInput(s, { t: "toggle-anchor" }, term)!;
    expect(s.anchor).toBeNull();
  });

  it("range normalizes upward drags", () => {
    let s = applyCopyModeInput(enterCopyMode(term), { t: "goto-bottom" }, term)!;
    s = applyCopyModeInput(s, { t: "toggle-anchor" }, term)!;
    s = applyCopyModeInput(s, { t: "goto-top" }, term)!;
    expect(copyModeRange(s)).toEqual({ from: 0, to: 100 });
  });
});
