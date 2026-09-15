/**
 * Updater backend: the only module that talks to `@tauri-apps/plugin-updater`
 * and the two Rust commands (`active_session_count`, `restart_app`).
 *
 * Mirrors `src/notifications/backend.ts`: every entry point is wrapped in
 * try/catch and returns a safe default (or an explicit `status: "error"`
 * result) so nothing ever throws into React.
 */

import { invoke } from "@tauri-apps/api/core";

import { isTauri } from "../terminal/ipc";
import type { AvailableUpdate } from "./index";
import { computeProgress } from "./updateCheck";

type UpdaterModule = typeof import("@tauri-apps/plugin-updater");
type UpdateHandle = import("@tauri-apps/plugin-updater").Update;
type DownloadEvent = import("@tauri-apps/plugin-updater").DownloadEvent;

/** Used when the running app version cannot be read. */
export const FALLBACK_APP_VERSION = "0.0.0";

async function loadUpdater(): Promise<UpdaterModule | null> {
  if (!isTauri) return null;
  try {
    return await import("@tauri-apps/plugin-updater");
  } catch {
    return null;
  }
}

function toAvailableUpdate(update: UpdateHandle): AvailableUpdate {
  const body = typeof update.body === "string" ? update.body : "";
  return {
    version: typeof update.version === "string" ? update.version : "",
    notes: body.trim().length > 0 ? body : null,
    date: typeof update.date === "string" && update.date.length > 0 ? update.date : null,
  };
}

/** Result of installing a downloaded package. */
export type InstallOutcome = { ok: true } | { ok: false; error: unknown };

/** A discovered release that can be downloaded and installed on demand. */
export interface PendingUpdate {
  info: AvailableUpdate;
  /** Downloads + installs the package, reporting 0..1 progress. */
  install(report: (progress: number | null) => void): Promise<InstallOutcome>;
}

/** Outcome of a check; "unavailable" covers the browser build and a missing plugin. */
export type CheckOutcome =
  | { status: "available"; pending: PendingUpdate }
  | { status: "none" }
  | { status: "unavailable" }
  | { status: "error"; error: unknown };

/** Current application version (falls back to "0.0.0"). */
export async function appVersion(): Promise<string> {
  if (!isTauri) return FALLBACK_APP_VERSION;
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    const version = await getVersion();
    return typeof version === "string" && version.length > 0 ? version : FALLBACK_APP_VERSION;
  } catch {
    return FALLBACK_APP_VERSION;
  }
}

/** Asks the plugin for a newer release; never throws. */
export async function checkForUpdate(): Promise<CheckOutcome> {
  const updater = await loadUpdater();
  if (!updater) return { status: "unavailable" };
  try {
    const update = await updater.check();
    if (!update) return { status: "none" };
    return {
      status: "available",
      pending: {
        info: toAvailableUpdate(update),
        install: (report) => downloadAndInstall(update, report),
      },
    };
  } catch (error) {
    return { status: "error", error };
  }
}

/**
 * Downloads and installs a release, streaming progress.
 *
 * `restartAfterInstall` is left at its default (`true`) because Windows cannot
 * honour "restart when the user says so": the plugin exits the process to run
 * the installer, and the flag only decides whether that installer brings the app
 * back. Letting it relaunch avoids leaving Windows users staring at a vanished
 * app. macOS and Linux keep the explicit "Restart Now" step, since there the
 * plugin returns normally and the old version keeps running.
 */
async function downloadAndInstall(
  update: UpdateHandle,
  report: (progress: number | null) => void,
): Promise<InstallOutcome> {
  let received = 0;
  let total: number | null = null;

  try {
    await update.downloadAndInstall(
      (event: DownloadEvent) => {
        switch (event.event) {
          case "Started": {
            const length = event.data?.contentLength;
            total = typeof length === "number" && Number.isFinite(length) ? length : null;
            received = 0;
            report(computeProgress(received, total));
            break;
          }
          case "Progress": {
            const chunk = event.data?.chunkLength;
            received += typeof chunk === "number" && Number.isFinite(chunk) && chunk > 0 ? chunk : 0;
            report(computeProgress(received, total));
            break;
          }
          case "Finished":
            report(1);
            break;
        }
      },
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Live PTY session count (0 when unavailable). */
export async function activeSessionCount(): Promise<number> {
  if (!isTauri) return 0;
  try {
    const count = await invoke<number>("active_session_count");
    if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return 0;
    return Math.floor(count);
  } catch {
    return 0;
  }
}

/**
 * Relaunches the app through the Rust `restart_app` command (no
 * `@tauri-apps/plugin-process` dependency). The command diverges on the Rust
 * side, so a resolved promise means the restart did not happen.
 */
export async function restartApp(): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("restart_app");
  } catch {
    // Nothing to recover: the dialog can be reopened and restarted again.
  }
}
