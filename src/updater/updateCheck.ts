/**
 * Pure helpers behind the in-app updater: version precedence, skip rules and
 * the dialog state machine.
 *
 * Everything in this module is side-effect free and takes its inputs from the
 * caller, so it can be unit-tested without a Tauri runtime or a React tree.
 * The I/O lives in `backend.ts`, the state lives in `UpdateProvider.tsx`.
 */

import type { UpdaterState } from "./index";

/** Events that drive `nextState`. */
export type UpdaterEvent =
  | "check-start"
  | "found"
  | "none"
  | "install-start"
  | "install-done"
  | "fail"
  | "dismiss";

interface ParsedVersion {
  /** Numeric core segments: "1.2.3" -> [1, 2, 3]. */
  segments: number[];
  /** Pre-release identifiers; empty for a plain release. */
  pre: string[];
}

const NUMERIC = /^\d+$/;

/**
 * Splits a version string into its comparable parts. Tolerates a leading "v",
 * build metadata ("+20240101", ignored by precedence) and a missing patch
 * segment ("1.2" behaves like "1.2.0").
 */
function parseVersion(value: string): ParsedVersion {
  const raw = (value ?? "").trim().replace(/^v/i, "");
  const withoutBuild = raw.split("+")[0];
  const dash = withoutBuild.indexOf("-");
  const core = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
  const preRaw = dash === -1 ? "" : withoutBuild.slice(dash + 1);

  const segments = core.split(".").map((part) => (NUMERIC.test(part) ? Number(part) : 0));
  const pre = preRaw.split(".").filter((part) => part.length > 0);

  return { segments, pre };
}

/**
 * Compares two pre-release identifier lists. A release (no identifiers) ranks
 * above any pre-release, missing identifiers rank below extra ones, numeric
 * identifiers outrank alphanumeric ones and alphanumerics compare by code
 * point — as spelled out by the updater spec this module implements.
 */
function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;

    const leftIsNumber = NUMERIC.test(left);
    const rightIsNumber = NUMERIC.test(right);
    if (leftIsNumber && rightIsNumber) {
      const difference = Number(left) - Number(right);
      if (difference !== 0) return difference > 0 ? 1 : -1;
      continue;
    }
    if (leftIsNumber !== rightIsNumber) return leftIsNumber ? 1 : -1;

    const order = left < right ? -1 : left > right ? 1 : 0;
    if (order !== 0) return order;
  }
  return 0;
}

/**
 * Semantic version comparison. Returns -1, 0 or 1.
 *
 * - "v1.2.3" === "1.2.3"
 * - "1.2" === "1.2.0" (missing segments count as zero)
 * - "1.0.0-beta.1" < "1.0.0" (a pre-release ranks below its release)
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);

  const length = Math.max(left.segments.length, right.segments.length);
  for (let i = 0; i < length; i += 1) {
    const difference = (left.segments[i] ?? 0) - (right.segments[i] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return comparePrerelease(left.pre, right.pre);
}

/** Whether `candidate` is strictly newer than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  if (!candidate || !current) return false;
  return compareVersions(candidate, current) > 0;
}

/**
 * Whether the user already skipped this exact version. Comparison is
 * version-aware, so "v1.2.0" and "1.2.0" are the same skip.
 */
export function isSkipped(version: string, skipped: string[]): boolean {
  if (!version || !Array.isArray(skipped)) return false;
  return skipped.some(
    (entry) => typeof entry === "string" && entry.length > 0 && compareVersions(entry, version) === 0,
  );
}

/** Whether a silently discovered update is worth interrupting the user for. */
export function shouldAutoNotify(opts: {
  availableVersion: string;
  currentVersion: string;
  autoCheck: boolean;
  skippedVersions: string[];
}): boolean {
  const { availableVersion, currentVersion, autoCheck, skippedVersions } = opts;
  if (!autoCheck) return false;
  if (isSkipped(availableVersion, skippedVersions)) return false;
  return isNewer(availableVersion, currentVersion);
}

/**
 * Dialog state table. Only the transitions that make sense are listed; an
 * event that has no entry (e.g. "dismiss" while downloading) leaves the state
 * untouched, which is what the callers rely on.
 */
const STATE_TABLE: Record<UpdaterEvent, Partial<Record<UpdaterState, UpdaterState>>> = {
  // A check may restart from any resting state; an in-flight download wins.
  "check-start": {
    idle: "checking",
    checking: "checking",
    available: "checking",
    ready: "checking",
    error: "checking",
  },
  found: { checking: "available" },
  none: { checking: "idle", available: "idle", error: "idle" },
  // An install can be started from any state that still holds a pending update.
  "install-start": { idle: "downloading", available: "downloading", error: "downloading", ready: "downloading" },
  "install-done": { downloading: "ready" },
  fail: { checking: "error", downloading: "error", available: "error" },
  dismiss: { available: "idle", error: "idle" },
};

/** Applies one dialog event to a state. Unlisted transitions are no-ops. */
export function nextState(state: UpdaterState, event: UpdaterEvent): UpdaterState {
  return STATE_TABLE[event]?.[state] ?? state;
}

/**
 * Download progress as a 0..1 ratio, or `null` when the server did not send a
 * usable `contentLength` (the dialog then shows an indeterminate bar).
 */
export function computeProgress(received: number, total: number | null | undefined): number | null {
  if (!Number.isFinite(received) || received < 0) return null;
  if (total === null || total === undefined || !Number.isFinite(total) || total <= 0) return null;
  return Math.min(1, Math.max(0, received / total));
}

/** Human-readable message for anything that was thrown or rejected. */
export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (typeof error === "string" && error.trim().length > 0) return error;
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}
