import { afterEach, describe, expect, it } from "vitest";

import {
  computeTabTitle,
  parseOscCwd,
  pathLastSegment,
  setHomeDir,
  titleFromPath,
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

describe("home directory abbreviation", () => {
  afterEach(() => setHomeDir(null));

  it("renders the home directory itself as ~", () => {
    setHomeDir("/Users/me");
    expect(titleFromPath("/Users/me")).toBe("~");
    expect(titleFromPath("/Users/me/")).toBe("~");
  });

  it("keeps last-segment titles for paths under home and outside it", () => {
    setHomeDir("/Users/me");
    expect(titleFromPath("/Users/me/dev/app")).toBe("app");
    expect(titleFromPath("/var/log")).toBe("log");
    expect(titleFromPath("/Users/meteor/dev")).toBe("dev"); // prefix but not home
  });

  it("normalizes separators and trailing slashes when matching home", () => {
    setHomeDir("C:\\Users\\me");
    expect(titleFromPath("C:/Users/me")).toBe("~");
    expect(titleFromPath("C:\\Users\\me\\")).toBe("~");
  });

  it("falls back to last segment when home is unknown", () => {
    setHomeDir(null);
    expect(titleFromPath("/Users/me")).toBe("me");
  });

  it("uses ~ for cwd and spawn cwd in the title chain", () => {
    setHomeDir("/Users/me");
    expect(computeTabTitle({ spawnCwd: null, cwd: "/Users/me", oscTitle: null })).toBe("~");
    expect(computeTabTitle({ spawnCwd: "/Users/me", cwd: null, oscTitle: null })).toBe("~");
  });
});
