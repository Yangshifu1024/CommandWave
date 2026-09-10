import { describe, expect, it } from "vitest";

import { decodeSixel } from "./sixel";

describe("decodeSixel", () => {
  it("decodes a simple 2x6 image", () => {
    // '~' = 126 → value 63 → all six bits set → full column.
    const img = decodeSixel("~~");
    expect(img).not.toBeNull();
    expect(img!.width).toBe(2);
    expect(img!.height).toBe(6);
    // Palette 0 defaults to white opaque.
    expect([...img!.rgba.slice(0, 4)]).toEqual([255, 255, 255, 255]);
  });

  it("applies RGB color definitions", () => {
    const img = decodeSixel("#1;2;100;0;0#1~");
    expect(img).not.toBeNull();
    expect([...img!.rgba.slice(0, 4)]).toEqual([255, 0, 0, 255]);
  });

  it("handles repeat counts and bands", () => {
    // !9~ = 9-pixel-wide column; '-' starts a second 6-row band.
    const img = decodeSixel("#1;2;0;0;100#1!9~-~");
    expect(img!.width).toBe(9);
    expect(img!.height).toBe(12);
    const bottomFirst = [...img!.rgba.slice((9 * 6) * 4, (9 * 6) * 4 + 4)];
    expect(bottomFirst).toEqual([0, 0, 255, 255]);
    // Column 1 of the bottom band is transparent.
    expect(img!.rgba[((9 * 6 + 1) * 4) + 3]).toBe(0);
  });

  it("selects colors and returns null for empty payloads", () => {
    expect(decodeSixel("")).toBeNull();
    expect(decodeSixel('"1;1;0;0')).toBeNull();
  });
});
