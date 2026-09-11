import { describe, expect, it } from "vitest";

import { defaultPromptSettings, type PromptSettings } from "../../store/settingsStore";
import type { EnvInfo } from "../ipc";
import {
  abbrevHome,
  editorVisible,
  historyDown,
  historyText,
  historyUp,
  resolveSegments,
  wantedEnvSegments,
} from "./promptModel";

const prompt = (patch: Partial<PromptSettings> = {}): PromptSettings => ({
  ...defaultPromptSettings,
  ...patch,
});

const env = (over: Partial<EnvInfo> = {}): EnvInfo => ({
  git: { branch: "main", dirtyCount: 3 },
  languages: [{ id: "node", version: "24.19.0" }],
  ...over,
});

const ctx = (over: Partial<Parameters<typeof resolveSegments>[1]> = {}) => ({
  cwd: "/Users/me/Works",
  home: "/Users/me",
  env: env(),
  durationMs: 2400,
  lastExitCode: 1,
  ...over,
});

describe("abbrevHome", () => {
  it("renders home itself and subdirectories with ~", () => {
    expect(abbrevHome("/Users/me", "/Users/me")).toBe("~");
    expect(abbrevHome("/Users/me/Works", "/Users/me")).toBe("~/Works");
  });
  it("leaves unrelated paths and handles trailing slashes", () => {
    expect(abbrevHome("/usr/local", "/Users/me")).toBe("/usr/local");
    expect(abbrevHome("/Users/me/", "/Users/me")).toBe("~");
  });
});

describe("resolveSegments", () => {
  it("renders the default layout", () => {
    const { left, right } = resolveSegments(prompt(), ctx());
    expect(left.map((s) => s.text)).toEqual(["~/Works", "main *3"]);
    expect(right.map((s) => s.text)).toEqual(["2.4s", "✕ 1"]);
  });

  it("hides git/languages without env data and exit on success", () => {
    const { left, right } = resolveSegments(
      prompt(),
      ctx({ env: null, lastExitCode: 0 }),
    );
    expect(left.map((s) => s.id)).toEqual(["cwd"]);
    expect(right.map((s) => s.text)).toEqual(["2.4s"]);
  });

  it("hides duration when unknown (-1) and renders text segments", () => {
    const { right } = resolveSegments(
      prompt({ right: ["duration", "text:🚀"] }),
      ctx({ durationMs: -1 }),
    );
    expect(right.map((s) => s.text)).toEqual(["🚀"]);
  });

  it("renders language segments with glyphs", () => {
    const { left } = resolveSegments(
      prompt({ left: ["node", "go"] }),
      ctx({ env: { git: null, languages: [{ id: "node", version: "24.19.0" }] } }),
    );
    expect(left.map((s) => s.text)).toEqual(["⬢ 24.19.0"]);
  });

  it("applies per-segment color overrides", () => {
    const { left } = resolveSegments(
      prompt({ colors: { git: "orange" } }),
      ctx(),
    );
    expect(left.find((s) => s.id === "git")?.color).toBe("orange");
  });

  it("skips unknown segment ids", () => {
    const { left } = resolveSegments(prompt({ left: ["nope"] }), ctx());
    expect(left).toEqual([]);
  });
});

describe("wantedEnvSegments", () => {
  it("collects git and language ids, deduplicated", () => {
    expect(
      wantedEnvSegments(prompt({ left: ["cwd", "git", "node"], right: ["exit", "node", "go"] })),
    ).toEqual(["git", "node", "go"]);
    expect(wantedEnvSegments(prompt({ left: ["cwd"], right: ["duration"] }))).toEqual([]);
  });
});

describe("editorVisible", () => {
  const base = {
    mode: "blocks",
    paneActive: true,
    running: false,
    altScreen: false,
    copyMode: false,
    broadcast: false,
    tmuxPane: false,
    exited: false,
  };
  it("shows in blocks mode when idle and focused", () => {
    expect(editorVisible(base)).toBe(true);
  });
  it("hides when anything owns the keyboard or the pane is background", () => {
    expect(editorVisible({ ...base, mode: "off" })).toBe(false);
    expect(editorVisible({ ...base, paneActive: false })).toBe(false);
    expect(editorVisible({ ...base, running: true })).toBe(false);
    expect(editorVisible({ ...base, altScreen: true })).toBe(false);
    expect(editorVisible({ ...base, copyMode: true })).toBe(false);
    expect(editorVisible({ ...base, broadcast: true })).toBe(false);
    expect(editorVisible({ ...base, tmuxPane: true })).toBe(false);
    expect(editorVisible({ ...base, exited: true })).toBe(false);
  });
});

describe("history navigation", () => {
  const history = ["cargo test", "ls -la"];
  it("walks up and clamps at the oldest entry", () => {
    let st = { index: -1, draft: "gi" };
    st = historyUp(st, history);
    expect(historyText(st, history)).toBe("cargo test");
    st = historyUp(st, history);
    expect(historyText(st, history)).toBe("ls -la");
    st = historyUp(st, history);
    expect(historyText(st, history)).toBe("ls -la");
  });
  it("returns to the draft at the bottom and clamps below it", () => {
    let st = { index: 1, draft: "gi" };
    st = historyDown(st);
    expect(historyText(st, history)).toBe("cargo test");
    st = historyDown(st);
    expect(historyText(st, history)).toBe("gi");
    st = historyDown(st);
    expect(st.index).toBe(-1);
  });
  it("keeps the draft across navigation", () => {
    let st = { index: -1, draft: "gi" };
    st = historyUp(st, history);
    st = historyDown(st);
    expect(historyText(st, history)).toBe("gi");
  });
});
