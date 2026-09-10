import { describe, expect, it } from "vitest";

import { completionSuffix, extractInput, filterSuggestions } from "./autocomplete";

describe("extractInput", () => {
  it("strips common prompt styles", () => {
    expect(extractInput("user@host:~/proj$ git st")).toBe("git st");
    expect(extractInput("PS C:\\Users> npm ")?.trim()).toBe("npm");
    // Directory names in starship prompts can't be split heuristically.
    expect(extractInput("➜  proj git st")).toBe("proj git st");
    expect(extractInput("root# docker ps")).toBe("docker ps");
  });

  it("returns null for empty or prompt-less lines", () => {
    expect(extractInput("")).toBeNull();
    expect(extractInput("   ")).toBeNull();
    expect(extractInput("plain output line")).toBeNull();
  });
});

describe("completionSuffix", () => {
  it("returns the remainder to type", () => {
    expect(completionSuffix("git st", "git status")).toBe("atus");
  });

  it("rejects non-extensions", () => {
    expect(completionSuffix("git st", "cargo build")).toBeNull();
    expect(completionSuffix("vim", "vim")).toBeNull();
  });
});

describe("filterSuggestions", () => {
  it("keeps only completable suggestions", () => {
    expect(filterSuggestions("git st", ["git status", "git stash", "npm test"]))
      .toEqual(["git status", "git stash"]);
  });

  it("empty input shows nothing", () => {
    expect(filterSuggestions("", ["git status"])).toEqual([]);
  });
});
