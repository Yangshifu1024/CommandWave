import { describe, expect, it } from "vitest";

import {
  computeTabTitle,
  parseOscCwd,
  pathLastSegment,
  type PaneTitleMeta,
} from "./paneTitle";

describe("pathLastSegment", () => {
  it("returns the last segment of POSIX and Windows paths", () => {
    expect(pathLastSegment("/home/user/dev/app")).toBe("app");
    expect(pathLastSegment("D:\\Work\\SideProjects\\CommandWave")).toBe("CommandWave");
    expect(pathLastSegment("D:/Work/demo/")).toBe("demo");
  });

  it("returns null for roots and empty input", () => {
    expect(pathLastSegment("/")).toBeNull();
    expect(pathLastSegment("C:\\")).toBeNull();
    expect(pathLastSegment("")).toBeNull();
    expect(pathLastSegment(null)).toBeNull();
    expect(pathLastSegment(undefined)).toBeNull();
  });
});

describe("parseOscCwd", () => {
  it("parses file URLs, including Windows drive form and encoding", () => {
    expect(parseOscCwd("file:///home/user/dev/app")).toBe("/home/user/dev/app");
    expect(parseOscCwd("file://localhost/home/user")).toBe("/home/user");
    expect(parseOscCwd("file:///C:/Users/me/My%20Project")).toBe("C:/Users/me/My Project");
  });

  it("accepts plain absolute paths", () => {
    expect(parseOscCwd("/home/user/dev")).toBe("/home/user/dev");
    expect(parseOscCwd("D:\\Work\\demo")).toBe("D:\\Work\\demo");
  });

  it("accepts any host (local shells report their own hostname)", () => {
    expect(parseOscCwd("file://devbox/home/user")).toBe("/home/user");
    expect(parseOscCwd("file://mypc/C:/Users/me")).toBe("C:/Users/me");
  });

  it("rejects junk that is not a path", () => {
    expect(parseOscCwd("not a path")).toBeNull();
    expect(parseOscCwd("")).toBeNull();
  });

  it("accepts the filesystem root; the title chain falls back from it", () => {
    expect(parseOscCwd("file:///")).toBe("/");
    expect(pathLastSegment("/")).toBeNull();
  });
});

describe("computeTabTitle", () => {
  const meta = (overrides: Partial<PaneTitleMeta>): PaneTitleMeta => ({
    spawnCwd: null,
    cwd: null,
    oscTitle: null,
    ...overrides,
  });

  it("prefers the reported cwd last segment", () => {
    expect(
      computeTabTitle(meta({ spawnCwd: "D:\\Work", cwd: "/home/user/dev/app", oscTitle: "vim" })),
    ).toBe("app");
  });

  it("falls back to OSC title, then spawn cwd, then Shell", () => {
    expect(computeTabTitle(meta({ oscTitle: "vim", spawnCwd: "D:\\Work\\demo" }))).toBe("vim");
    expect(computeTabTitle(meta({ spawnCwd: "D:\\Work\\demo" }))).toBe("demo");
    expect(computeTabTitle(meta({}))).toBe("Shell");
    expect(computeTabTitle(undefined)).toBe("Shell");
  });

  it("ignores whitespace-only OSC titles", () => {
    expect(computeTabTitle(meta({ oscTitle: "   " }))).toBe("Shell");
  });
});
