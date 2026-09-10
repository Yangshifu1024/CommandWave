import { describe, expect, it } from "vitest";

import { resolveSecretRefs, secretRefs } from "./secrets";

describe("secretRefs", () => {
  it("finds references", () => {
    expect(secretRefs("user {secret:api-key} and {secret:db pass}")).toEqual([
      "api-key",
      "db pass",
    ]);
    expect(secretRefs("no refs")).toEqual([]);
  });
});

describe("resolveSecretRefs", () => {
  it("substitutes known secrets", async () => {
    const out = await resolveSecretRefs("pass={secret:pw} end", async (n) =>
      n === "pw" ? "s3cret" : null,
    );
    expect(out).toBe("pass=s3cret end");
  });

  it("leaves unknown secrets untouched", async () => {
    const out = await resolveSecretRefs("{secret:x}", async () => null);
    expect(out).toBe("{secret:x}");
  });

  it("handles multiple occurrences", async () => {
    const out = await resolveSecretRefs("{secret:a}/{secret:a}", async () => "v");
    expect(out).toBe("v/v");
  });
});
