import { describe, expect, it } from "vitest";

import { snapshotForAge, type ReplaySnapshot } from "./instantReplay";

const NOW = 1_000_000;
const snaps: ReplaySnapshot[] = [
  { at: NOW - 30_000, text: "t-30s" },
  { at: NOW - 20_000, text: "t-20s" },
  { at: NOW - 10_000, text: "t-10s" },
];

describe("snapshotForAge", () => {
  it("picks the newest snapshot at or before the requested age", () => {
    // state 15s ago = last capture older than 15s = the 20s-old snapshot
    expect(snapshotForAge(snaps, 15_000, NOW)?.text).toBe("t-20s");
    expect(snapshotForAge(snaps, 5_000, NOW)?.text).toBe("t-10s");
    // within the newest gap → newest snapshot
    expect(snapshotForAge(snaps, 1_000, NOW)?.text).toBe("t-10s");
  });

  it("falls back to the oldest when the age exceeds history", () => {
    expect(snapshotForAge(snaps, 120_000, NOW)?.text).toBe("t-30s");
  });

  it("returns null on empty history", () => {
    expect(snapshotForAge([], 1000, NOW)).toBeNull();
  });
});
