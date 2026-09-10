import { describe, expect, it } from "vitest";

import { resolveBackdrop, toCssImage } from "./backdrop";

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
