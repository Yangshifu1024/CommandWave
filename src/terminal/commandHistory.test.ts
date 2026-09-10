import { describe, expect, it } from "vitest";

import {
  formatDuration,
  queryCommands,
  recordCommand,
  suggestCommands,
  type CommandRecord,
} from "./commandHistory";

function rec(patch: Partial<CommandRecord> = {}): CommandRecord {
  return {
    paneId: "p",
    command: "echo hi",
    durationMs: 100,
    exitCode: 0,
    cwd: "/tmp",
    output: "hi",
    at: 1,
    ...patch,
  };
}

describe("queryCommands", () => {
  const source = [
    rec({ command: "npm test", output: "all pass", at: 1 }),
    rec({ command: "cargo build", output: "error[E0432]", at: 2, exitCode: 101 }),
    rec({ command: "git status", output: "clean", at: 3 }),
  ];

  it("empty filter returns all, newest first", () => {
    expect(queryCommands({ filter: "", includeOutput: false }, source).map((r) => r.command))
      .toEqual(["git status", "cargo build", "npm test"]);
  });

  it("filters by command substring", () => {
    expect(queryCommands({ filter: "NPM", includeOutput: false }, source).map((r) => r.command))
      .toEqual(["npm test"]);
  });

  it("semantic search includes output when enabled", () => {
    const hits = queryCommands({ filter: "E0432", includeOutput: true }, source);
    expect(hits).toHaveLength(1);
    expect(hits[0].command).toBe("cargo build");
    expect(queryCommands({ filter: "E0432", includeOutput: false }, source)).toHaveLength(0);
  });
});

describe("suggestCommands", () => {
  const source = [
    rec({ command: "git status", at: 1 }),
    rec({ command: "git push", at: 2 }),
    rec({ command: "git status", at: 3 }),
    rec({ command: "npm test", at: 4 }),
  ];

  it("suggests distinct history commands by prefix, frequency first", () => {
    expect(suggestCommands("git", 5, source)).toEqual(["git status", "git push"]);
    expect(suggestCommands("x", 5, source)).toEqual([]);
  });

  it("excludes the exact current input", () => {
    expect(suggestCommands("git status", 5, source)).toEqual([]);
  });

  it("empty prefix yields nothing", () => {
    expect(suggestCommands("", 5, source)).toEqual([]);
  });
});

describe("recordCommand", () => {
  it("caps stored records and output length", () => {
    for (let i = 0; i < 600; i++) {
      recordCommand(rec({ command: `cmd${i}`, output: "x".repeat(9999), at: i }));
    }
    // Import the module-level store through a fresh query.
    const all = queryCommands({ filter: "", includeOutput: false });
    expect(all.length).toBeLessThanOrEqual(500);
    expect(all[0].output.length).toBeLessThanOrEqual(4000);
  });
});

describe("formatDuration", () => {
  it("formats ms, seconds and minutes", () => {
    expect(formatDuration(-1)).toBe("—");
    expect(formatDuration(120)).toBe("120ms");
    expect(formatDuration(2500)).toBe("2.5s");
    expect(formatDuration(125_000)).toBe("2m5s");
  });
});
