/**
 * Public surface of the in-app updater.
 *
 * `UpdateProvider` owns the state (see `UpdateProvider.tsx`), `UpdateDialog`
 * renders it, `updateCheck.ts` holds the pure rules and `backend.ts` wraps the
 * Tauri plugin / Rust commands. Consumers only need this module.
 */

export type UpdaterState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error";

export interface AvailableUpdate {
  version: string;
  notes: string | null; // release notes (possibly null/empty)
  date: string | null; // RFC3339 or null
}

export interface UpdaterContextValue {
  currentVersion: string; // current app version, falls back to "0.0.0"
  state: UpdaterState;
  update: AvailableUpdate | null;
  progress: number | null; // download progress 0..1, null outside a download
  error: string | null; // only set by a failed *manual* check / install
  lastCheckedAt: number | null; // Date.now() when the last check finished
  activeSessions: number; // live PTY sessions (refreshed before dialog/install)
  checkNow(): Promise<void>; // manual check: failures surface in `error`
  install(): Promise<void>; // download + install; then state = "ready"
  restart(): Promise<void>; // relaunch through the Rust restart_app command
  dismiss(): void; // "Later": no more prompts for this session (memory only)
  skip(): void; // "Skip This Version": written to settings.updates.skippedVersions
}

export { UpdateProvider, requestUpdateCheck, useUpdater } from "./UpdateProvider";
export { UpdateDialog } from "./UpdateDialog";
