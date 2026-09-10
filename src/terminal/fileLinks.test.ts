import { describe, expect, it } from "vitest";

import { parseFileLink } from "./fileLinks";

describe("parseFileLink", () => {
  it("parses plain relative paths", () => {
    expect(parseFileLink("src/main.rs")).toEqual({ path: "src/main.rs", line: null });
  });

  it("parses line and column suffixes", () => {
    expect(parseFileLink("src/app.tsx:42")).toEqual({ path: "src/app.tsx", line: 42 });
    expect(parseFileLink("src/app.tsx:42:7")).toEqual({ path: "src/app.tsx", line: 42 });
  });

  it("keeps windows drive paths", () => {
    expect(parseFileLink("C:\\proj\\a.ts:10")).toEqual({ path: "C:\\proj\\a.ts", line: 10 });
  });

  it("accepts absolute and home paths", () => {
    expect(parseFileLink("/usr/bin/env")).toEqual({ path: "/usr/bin/env", line: null });
    expect(parseFileLink("~/.zshrc")).toEqual({ path: "~/.zshrc", line: null });
  });

  it("rejects bare words and urls", () => {
    expect(parseFileLink("README")).toBeNull();
    expect(parseFileLink("https://example.com/x")).toBeNull();
    expect(parseFileLink("")).toBeNull();
  });
});
