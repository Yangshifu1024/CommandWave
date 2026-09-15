import { describe, expect, it } from "vitest";

import {
  compareVersions,
  computeProgress,
  errorMessage,
  isNewer,
  isSkipped,
  nextState,
  shouldAutoNotify,
  type UpdaterEvent,
} from "./updateCheck";
import type { UpdaterState } from "./index";

describe("compareVersions", () => {
  it("orders plain releases", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
  });

  it("ignores an optional v prefix and build metadata", () => {
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("V1.2.3", "v1.2.4")).toBe(-1);
    expect(compareVersions("1.2.3+build.9", "1.2.3")).toBe(0);
  });

  it("treats missing segments as zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.0", "1.2")).toBe(0);
    expect(compareVersions("1.2", "1.2.1")).toBe(-1);
    expect(compareVersions("1", "1.0.0")).toBe(0);
  });

  it("ranks a pre-release below its release", () => {
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBe(1);
    expect(compareVersions("1.0.0-beta.1", "1.0.0-beta.2")).toBe(-1);
    expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compareVersions("1.0.1-beta", "1.0.0")).toBe(1);
  });

  it("ranks numeric identifiers above alphanumeric ones", () => {
    expect(compareVersions("1.0.0-2", "1.0.0-alpha")).toBe(1);
    expect(compareVersions("1.0.0-alpha", "1.0.0-2")).toBe(-1);
    expect(compareVersions("1.0.0-1", "1.0.0-2")).toBe(-1);
    expect(compareVersions("1.0.0-a", "1.0.0-b")).toBe(-1);
  });
});

describe("isNewer", () => {
  it("is strict about newer versions", () => {
    expect(isNewer("1.2.4", "1.2.3")).toBe(true);
    expect(isNewer("1.2.3", "1.2.3")).toBe(false);
    expect(isNewer("1.2.2", "1.2.3")).toBe(false);
    expect(isNewer("v2.0.0", "1.99.99")).toBe(true);
    expect(isNewer("1.0.0-beta.2", "1.0.0-beta.1")).toBe(true);
    expect(isNewer("1.0.0", "1.0.0-beta.1")).toBe(true);
  });

  it("returns false for empty input", () => {
    expect(isNewer("", "1.0.0")).toBe(false);
    expect(isNewer("1.0.0", "")).toBe(false);
  });
});

describe("isSkipped", () => {
  it("matches the same version regardless of its v prefix", () => {
    expect(isSkipped("1.2.0", ["1.2.0"])).toBe(true);
    expect(isSkipped("1.2.0", ["v1.2.0"])).toBe(true);
    expect(isSkipped("v1.2.0", ["1.2"])).toBe(true);
    expect(isSkipped("1.2.1", ["1.2.0"])).toBe(false);
    expect(isSkipped("1.2.0", [])).toBe(false);
  });

  it("tolerates missing input", () => {
    expect(isSkipped("", ["1.2.0"])).toBe(false);
    expect(isSkipped("1.2.0", undefined as unknown as string[])).toBe(false);
  });
});

describe("shouldAutoNotify", () => {
  const base = {
    availableVersion: "1.3.0",
    currentVersion: "1.2.0",
    autoCheck: true,
    skippedVersions: [] as string[],
  };

  it("notifies when auto check is on, the version is new and not skipped", () => {
    expect(shouldAutoNotify(base)).toBe(true);
  });

  it("stays quiet when auto check is disabled", () => {
    expect(shouldAutoNotify({ ...base, autoCheck: false })).toBe(false);
  });

  it("stays quiet for a skipped version", () => {
    expect(shouldAutoNotify({ ...base, skippedVersions: ["1.3.0"] })).toBe(false);
  });

  it("stays quiet when the remote version is not newer", () => {
    expect(shouldAutoNotify({ ...base, availableVersion: "1.2.0" })).toBe(false);
    expect(shouldAutoNotify({ ...base, availableVersion: "1.1.0" })).toBe(false);
    expect(
      shouldAutoNotify({ ...base, availableVersion: "1.3.0-beta.1", currentVersion: "1.3.0" }),
    ).toBe(false);
  });
});

describe("nextState", () => {
  const cases: Array<[UpdaterState, UpdaterEvent, UpdaterState]> = [
    ["idle", "check-start", "checking"],
    ["checking", "found", "available"],
    ["checking", "none", "idle"],
    ["available", "check-start", "checking"],
    ["error", "check-start", "checking"],
    ["available", "install-start", "downloading"],
    ["downloading", "install-done", "ready"],
    ["downloading", "fail", "error"],
    ["checking", "fail", "error"],
    ["available", "dismiss", "idle"],
    ["error", "dismiss", "idle"],
  ];

  it.each(cases)("moves %s + %s -> %s", (from, event, expected) => {
    expect(nextState(from, event)).toBe(expected);
  });

  it("leaves states that have no transition for the event alone", () => {
    expect(nextState("downloading", "dismiss")).toBe("downloading");
    expect(nextState("downloading", "check-start")).toBe("downloading");
    expect(nextState("idle", "found")).toBe("idle");
    expect(nextState("ready", "install-done")).toBe("ready");
    expect(nextState("ready", "dismiss")).toBe("ready");
    expect(nextState("ready", "check-start")).toBe("checking");
  });
});

describe("computeProgress", () => {
  it("returns a 0..1 ratio when the total is known", () => {
    expect(computeProgress(0, 1000)).toBe(0);
    expect(computeProgress(250, 1000)).toBe(0.25);
    expect(computeProgress(1000, 1000)).toBe(1);
  });

  it("clamps overshoot and rejects unusable input", () => {
    expect(computeProgress(1200, 1000)).toBe(1);
    expect(computeProgress(10, undefined)).toBeNull();
    expect(computeProgress(10, null)).toBeNull();
    expect(computeProgress(10, 0)).toBeNull();
    expect(computeProgress(Number.NaN, 100)).toBeNull();
    expect(computeProgress(-1, 100)).toBeNull();
    expect(computeProgress(10, Number.NaN)).toBeNull();
  });
});

describe("errorMessage", () => {
  it("unwraps strings, errors and falls back", () => {
    expect(errorMessage("boom")).toBe("boom");
    expect(errorMessage(new Error("kaboom"))).toBe("kaboom");
    expect(errorMessage(undefined, "fallback text")).toBe("fallback text");
    expect(errorMessage({ nope: true })).toBe("Something went wrong.");
  });
});
