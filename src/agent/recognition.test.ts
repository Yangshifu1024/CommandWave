import { describe, expect, it } from "vitest";

import { agentById, binaryBasename, matchAgent } from "./recognition";

describe("binaryBasename", () => {
  it("strips directories, quotes and Windows extensions", () => {
    expect(binaryBasename("/usr/local/bin/claude")).toBe("claude");
    expect(binaryBasename("C:\\tools\\codex.exe")).toBe("codex");
    expect(binaryBasename('"cursor-agent"')).toBe("cursor-agent");
  });
});

describe("matchAgent", () => {
  it("matches a plain command", () => {
    expect(matchAgent("claude")?.id).toBe("claude");
  });

  it("matches behind a shell prompt and wrappers", () => {
    expect(matchAgent("user@host ~ % sudo claude --resume")?.id).toBe("claude");
    expect(matchAgent("env FOO=1 /opt/bin/codex")?.id).toBe("codex");
  });

  it("matches the agent alias for Cursor", () => {
    expect(matchAgent("agent chat")?.id).toBe("cursor");
    expect(matchAgent("cursor-agent chat")?.id).toBe("cursor");
  });

  it("does not match unrelated commands or arguments", () => {
    expect(matchAgent("ls -la")).toBeNull();
    expect(matchAgent("git commit -m 'review codex output'")).toBeNull();
  });

  it("tolerates empty input", () => {
    expect(matchAgent("")).toBeNull();
    expect(matchAgent("   ")).toBeNull();
  });
});

describe("agentById", () => {
  it("resolves known ids", () => {
    expect(agentById("gemini")?.label).toBe("Gemini CLI");
  });

  it("returns null for unknown ids", () => {
    expect(agentById("nope")).toBeNull();
    expect(agentById(null)).toBeNull();
  });
});
