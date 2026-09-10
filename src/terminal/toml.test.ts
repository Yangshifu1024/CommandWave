import { describe, expect, it } from "vitest";

import { tomlGetBool, tomlGetValue, tomlSetValue } from "./toml";

const SAMPLE = `# starship config
add_newline = true
command_timeout = 1500

[character]
success_symbol = "[➜](bold green)"
`;

describe("tomlGetValue", () => {
  it("reads strings", () => {
    expect(tomlGetValue(SAMPLE, "command_timeout")).toBe("1500");
    expect(tomlGetValue(SAMPLE, "missing")).toBeNull();
  });
});

describe("tomlGetBool", () => {
  it("reads booleans", () => {
    expect(tomlGetBool(SAMPLE, "add_newline")).toBe(true);
    expect(tomlGetBool(SAMPLE, "command_timeout")).toBeNull();
  });
});

describe("tomlSetValue", () => {
  it("replaces existing keys", () => {
    const out = tomlSetValue(SAMPLE, "command_timeout", "2000");
    expect(out).toContain("command_timeout = 2000");
    expect(out).not.toContain("1500");
    expect(out).toContain("[character]");
  });

  it("inserts before the first section", () => {
    const out = tomlSetValue(SAMPLE, "scan_timeout", "50");
    const idx = out.indexOf("scan_timeout = 50");
    expect(idx).toBeGreaterThan(-1);
    expect(idx).toBeLessThan(out.indexOf("[character]"));
  });

  it("appends when no sections exist", () => {
    const out = tomlSetValue("# empty\n", "add_newline", "false");
    expect(out.trimEnd().endsWith("add_newline = false")).toBe(true);
  });
});
