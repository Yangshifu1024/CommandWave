import { describe, expect, it } from "vitest";

import { inspectPaste, pastePreview } from "./pasteGuard";

describe("inspectPaste", () => {
  it("lets simple one-line pastes through", () => {
    expect(inspectPaste("echo hello")).toBeNull();
    expect(inspectPaste("")).toBeNull();
  });

  it("warns on multiline pastes", () => {
    expect(inspectPaste("echo a\necho b")).toEqual({ reason: "multiline" });
    expect(inspectPaste("echo a\r\necho b")).toEqual({ reason: "multiline" });
  });

  it("can disable the multiline warning", () => {
    expect(inspectPaste("echo a\necho b", { multilineWarns: false })).toBeNull();
  });

  it("warns on large pastes", () => {
    expect(inspectPaste("x".repeat(9 * 1024))).toEqual({ reason: "large" });
  });

  it("flags destructive commands even single-line", () => {
    expect(inspectPaste("rm -rf /")).toEqual({ reason: "both" });
    expect(inspectPaste("sudo mkfs.ext4 /dev/sda1")).toEqual({ reason: "both" });
    expect(inspectPaste("git push --force origin main")).toEqual({ reason: "both" });
  });
});

describe("pastePreview", () => {
  it("flattens whitespace", () => {
    expect(pastePreview("a\n  b\tc")).toBe("a b c");
  });

  it("truncates long pastes", () => {
    const out = pastePreview("x".repeat(300));
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBe(201);
  });
});
