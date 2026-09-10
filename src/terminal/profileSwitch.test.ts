import { describe, expect, it } from "vitest";

import { matchHostRule, pickProfileForHost } from "./profileSwitch";

describe("matchHostRule", () => {
  it("substring match, case-insensitive", () => {
    expect(matchHostRule("prod-web-01.internal", "prod-web")).toBe(true);
    expect(matchHostRule("PROD-web-01", "prod")).toBe(true);
    expect(matchHostRule("dev-01", "prod")).toBe(false);
  });

  it("glob match", () => {
    expect(matchHostRule("prod-web-01", "prod-*")).toBe(true);
    expect(matchHostRule("prod-web-01", "prod-db-*")).toBe(false);
    expect(matchHostRule("db.internal", "*.internal")).toBe(true);
  });

  it("rejects empty inputs", () => {
    expect(matchHostRule("", "x")).toBe(false);
    expect(matchHostRule("host", "")).toBe(false);
  });
});

describe("pickProfileForHost", () => {
  const rules = [
    { hostPattern: "prod-*", profileId: "p-prod" },
    { hostPattern: "db.internal", profileId: "p-db" },
  ];
  it("returns the first matching rule", () => {
    expect(pickProfileForHost("prod-web-01", rules)?.profileId).toBe("p-prod");
    expect(pickProfileForHost("db.internal", rules)?.profileId).toBe("p-db");
    expect(pickProfileForHost("laptop", rules)).toBeNull();
  });
});
