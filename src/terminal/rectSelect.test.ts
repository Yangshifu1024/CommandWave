import { describe, expect, it } from "vitest";

import { normalizeRect, pixelToCell, rectText, type RectBuffer } from "./rectSelect";

function fakeBuffer(lines: string[]): RectBuffer {
  return {
    getLine: (y: number) => {
      const text = lines[y];
      if (text === undefined) return undefined;
      return {
        translateToString: (_trim?: boolean, start = 0, end = text.length) =>
          text.slice(start, end),
      };
    },
  };
}

describe("rectText", () => {
  const buf = fakeBuffer(["abcdef", "ghijkl", "mnopqr"]);

  it("extracts a column block", () => {
    expect(rectText(buf, { x1: 1, x2: 3, y1: 0, y2: 2 })).toBe("bcd\nhij\nnop");
  });

  it("normalizes reversed drags", () => {
    expect(rectText(buf, { x1: 3, x2: 1, y1: 2, y2: 0 })).toBe("bcd\nhij\nnop");
  });

  it("handles single cell", () => {
    expect(rectText(buf, { x1: 2, x2: 2, y1: 1, y2: 1 })).toBe("i");
  });

  it("trims trailing blank lines", () => {
    expect(rectText(buf, { x1: 0, x2: 0, y1: 0, y2: 3 })).toBe("a\ng\nm");
  });
});

describe("normalizeRect", () => {
  it("sorts corners", () => {
    expect(normalizeRect({ x1: 5, x2: 2, y1: 9, y2: 3 })).toEqual({
      x1: 2,
      x2: 5,
      y1: 3,
      y2: 9,
    });
  });
});

describe("pixelToCell", () => {
  const metrics = { cellWidth: 10, cellHeight: 20, cols: 80, rows: 24, baseY: 100 };

  it("maps pixels to cells", () => {
    expect(pixelToCell(15, 25, metrics)).toEqual({ x: 1, y: 101 });
  });

  it("clamps out-of-grid positions", () => {
    expect(pixelToCell(-5, -5, metrics)).toEqual({ x: 0, y: 100 });
    expect(pixelToCell(99999, 99999, metrics)).toEqual({ x: 79, y: 123 });
  });
});
