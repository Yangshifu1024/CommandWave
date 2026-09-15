import { describe, expect, it } from "vitest";

import {
  activeSessionCount,
  appVersion,
  checkForUpdate,
  FALLBACK_APP_VERSION,
  restartApp,
} from "./backend";

/**
 * The suite runs in a plain node environment, i.e. exactly the degraded case:
 * no `__TAURI_INTERNALS__`, so every backend call must resolve to a safe
 * default instead of throwing.
 */
describe("updater backend outside Tauri", () => {
  it("reports the fallback app version", async () => {
    expect(await appVersion()).toBe(FALLBACK_APP_VERSION);
  });

  it("reports a check as unavailable instead of throwing", async () => {
    expect(await checkForUpdate()).toEqual({ status: "unavailable" });
  });

  it("reports zero active sessions", async () => {
    expect(await activeSessionCount()).toBe(0);
  });

  it("makes restart a no-op", async () => {
    await expect(restartApp()).resolves.toBeUndefined();
  });
});
