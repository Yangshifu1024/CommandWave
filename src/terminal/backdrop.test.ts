import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isWindowTransparent, resolveBackdrop, setWindowTransparency, toCssImage } from "./backdrop";

describe("toCssImage", () => {
  it("passes URLs through", () => {
    expect(toCssImage("https://example.com/bg.png")).toBe("https://example.com/bg.png");
    expect(toCssImage("data:image/png;base64,xxx")).toBe("data:image/png;base64,xxx");
  });

  it("converts absolute paths to file URLs", () => {
    expect(toCssImage("/usr/share/bg.png")).toBe("file:///usr/share/bg.png");
    expect(toCssImage("C:\\Users\\me\\bg dark.png")).toBe(
      "file:///C:/Users/me/bg%20dark.png",
    );
  });

  it("rejects empty and relative refs", () => {
    expect(toCssImage("")).toBeNull();
    expect(toCssImage("   ")).toBeNull();
    expect(toCssImage("images/bg.png")).toBeNull();
  });
});

describe("resolveBackdrop", () => {
  // These tests assume an OS-transparent window unless stated otherwise.
  beforeEach(() => setWindowTransparency(true));
  afterEach(() => setWindowTransparency(false));

  it("opaque by default", () => {
    expect(resolveBackdrop(null)).toEqual({
      translucent: false,
      bgAlpha: 1,
      imageUrl: null,
      imageOpacity: 1,
    });
    expect(resolveBackdrop({ backgroundOpacity: null, backgroundImage: null, backgroundImageOpacity: null }).translucent).toBe(false);
  });

  it("plain translucency from backgroundOpacity", () => {
    const b = resolveBackdrop({ backgroundOpacity: 0.5, backgroundImage: null, backgroundImageOpacity: null });
    expect(b).toEqual({ translucent: true, bgAlpha: 0.5, imageUrl: null, imageOpacity: 0.35 });
  });

  it("background image implies mild translucency", () => {
    const b = resolveBackdrop({
      backgroundOpacity: null,
      backgroundImage: "https://x/y.png",
      backgroundImageOpacity: null,
    });
    expect(b.translucent).toBe(true);
    expect(b.bgAlpha).toBe(0.6);
    expect(b.imageUrl).toBe("https://x/y.png");
    expect(b.imageOpacity).toBe(0.35);
  });

  it("degrades pure translucency to opaque when the window cannot be transparent", () => {
    setWindowTransparency(false);
    expect(isWindowTransparent()).toBe(false);
    // No image + opacity < 1 → forced opaque (no white alpha gap).
    const plain = resolveBackdrop({ backgroundOpacity: 0.4, backgroundImage: null, backgroundImageOpacity: null });
    expect(plain.translucent).toBe(false);
    expect(plain.bgAlpha).toBe(0.4); // alpha kept, but not applied
    // Background images still work without OS transparency.
    const img = resolveBackdrop({ backgroundOpacity: null, backgroundImage: "/w.png", backgroundImageOpacity: null });
    expect(img.translucent).toBe(true);
    setWindowTransparency(true);
    const plain2 = resolveBackdrop({ backgroundOpacity: 0.4, backgroundImage: null, backgroundImageOpacity: null });
    expect(plain2.translucent).toBe(true);
    setWindowTransparency(false);
  });

  it("clamps alpha and honors explicit values", () => {
    const b = resolveBackdrop({
      backgroundOpacity: 2,
      backgroundImage: "/too/weird.png",
      backgroundImageOpacity: 0.9,
    });
    expect(b.bgAlpha).toBe(1);
    expect(b.imageOpacity).toBe(0.9);
    expect(b.imageUrl).toBe("file:///too/weird.png");
  });
});
