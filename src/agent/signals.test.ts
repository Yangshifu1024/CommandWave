import { describe, expect, it } from "vitest";

import {
  classifyIdle,
  classifyTitle,
  hasBraille,
  lastLine,
  looksLikePrompt,
  matchesErrorPattern,
  stateRank,
} from "./signals";

describe("classifyTitle", () => {
  it("reads Claude's ready marker as idle", () => {
    expect(classifyTitle("✳ project — claude")).toBe("idle");
  });

  it("reads a braille spinner as working", () => {
    expect(classifyTitle("⠋ fixing the tests")).toBe("working");
  });

  it("reads Gemini's markers", () => {
    expect(classifyTitle("✋ Action Required")).toBe("needs-you");
    expect(classifyTitle("✦ Working")).toBe("working");
    expect(classifyTitle("◇ Ready")).toBe("idle");
  });

  it("ignores titles without a state marker", () => {
    expect(classifyTitle("vim README.md")).toBeNull();
    expect(classifyTitle("")).toBeNull();
  });

  it("detects braille frames", () => {
    expect(hasBraille("⠐")).toBe(true);
    expect(hasBraille("plain")).toBe(false);
  });
});

describe("matchesErrorPattern", () => {
  const patterns = ["(?i)rate limit", "(?i)api error"];
  it("matches case-insensitively", () => {
    expect(matchesErrorPattern("Rate Limit exceeded", patterns)).toBe(true);
    expect(matchesErrorPattern("API ERROR: 500", patterns)).toBe(true);
  });
  it("ignores unrelated text and invalid patterns", () => {
    expect(matchesErrorPattern("all good", patterns)).toBe(false);
    expect(matchesErrorPattern("all good", ["("])).toBe(false);
  });
});

describe("looksLikePrompt", () => {
  it("recognises confirmation prompts", () => {
    expect(looksLikePrompt("Do you want to proceed? (y/n)")).toBe(true);
    expect(looksLikePrompt("Press enter to continue")).toBe(true);
    expect(looksLikePrompt("Overwrite file?")).toBe(true);
  });
  it("rejects ordinary output", () => {
    expect(looksLikePrompt("Compiling 42 modules")).toBe(false);
  });
});

describe("classifyIdle", () => {
  const patterns = ["(?i)rate limit"];
  it("prefers an error", () => {
    expect(classifyIdle("rate limit reached", patterns)).toBe("error");
  });
  it("detects a waiting prompt", () => {
    expect(classifyIdle("Apply changes? (y/n)", patterns)).toBe("needs-you");
  });
  it("otherwise reports the turn finished", () => {
    expect(classifyIdle("Done. 3 files changed.", patterns)).toBe("done");
  });
});

describe("lastLine", () => {
  it("returns the last non-empty line", () => {
    expect(lastLine("a\n\nb\n")).toBe("b");
    expect(lastLine("")).toBe("");
  });
});

describe("stateRank", () => {
  it("orders needs-you above error above working", () => {
    expect(stateRank("needs-you")).toBeLessThan(stateRank("error"));
    expect(stateRank("error")).toBeLessThan(stateRank("working"));
    expect(stateRank("working")).toBeLessThan(stateRank("done"));
    expect(stateRank("done")).toBeLessThan(stateRank("idle"));
  });
});
