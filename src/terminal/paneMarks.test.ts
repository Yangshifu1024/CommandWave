import { describe, expect, it } from "vitest";

import { linesBetween, nextPromptLine, parseOsc133 } from "./paneMarks";

describe("parseOsc133", () => {
  it("parses prompt, output and bare finish marks", () => {
    expect(parseOsc133("A")).toEqual({ kind: "prompt" });
    expect(parseOsc133("C")).toEqual({ kind: "output" });
    expect(parseOsc133("D")).toEqual({ kind: "finish", exitCode: 0 });
  });

  it("parses finish marks with exit codes", () => {
    expect(parseOsc133("D;0")).toEqual({ kind: "finish", exitCode: 0 });
    expect(parseOsc133("D;127")).toEqual({ kind: "finish", exitCode: 127 });
  });

  it("normalizes negative exit codes (shell reports -1 for signal 255)", () => {
    expect(parseOsc133("D;-1")).toEqual({ kind: "finish", exitCode: 255 });
  });

  it("rejects malformed payloads", () => {
    expect(parseOsc133("")).toBeNull();
    expect(parseOsc133("B")).toBeNull();
    expect(parseOsc133("D;x")).toBeNull();
    expect(parseOsc133("D;")).toBeNull();
  });
});

describe("linesBetween", () => {
  const buffer = {
    length: 5,
    getLine: (line: number) => ({
      translateToString: (trim = false) => {
        const lines = ["one  ", "two", "three", "four", "five"];
        const text = lines[line] ?? "";
        return trim ? text.trimEnd() : text;
      },
    }),
  };

  it("joins a half-open line range with trimmed right edges", () => {
    expect(linesBetween(buffer, 1, 4)).toBe("two\nthree\nfour");
  });

  it("clamps out-of-range ranges to the buffer", () => {
    expect(linesBetween(buffer, 3, 99)).toBe("four\nfive");
    expect(linesBetween(buffer, -5, 1)).toBe("one");
  });

  it("returns empty string for empty ranges", () => {
    expect(linesBetween(buffer, 2, 2)).toBe("");
  });
});

describe("nextPromptLine", () => {
  const prompts = [4, 12, 30];

  it("finds the closest prompt strictly above the viewport", () => {
    expect(nextPromptLine(prompts, 20, -1)).toBe(12);
    expect(nextPromptLine(prompts, 5, -1)).toBe(4);
  });

  it("finds the closest prompt strictly below the viewport", () => {
    expect(nextPromptLine(prompts, 2, 1)).toBe(4);
    expect(nextPromptLine(prompts, 13, 1)).toBe(30);
  });

  it("returns null at the ends and ignores disposed markers", () => {
    expect(nextPromptLine(prompts, 4, -1)).toBeNull();
    expect(nextPromptLine(prompts, 30, 1)).toBeNull();
    expect(nextPromptLine([-1, 8], 2, -1)).toBeNull();
    expect(nextPromptLine([-1, 8], 2, 1)).toBe(8);
  });
});
