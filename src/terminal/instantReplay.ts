/**
 * Instant Replay: periodic tail snapshots of each pane's buffer so the user
 * can look at the terminal's state in the recent past (⇧⌘B overlay).
 */

import { linesBetween, type MarkBuffer } from "./paneMarks";

export interface ReplaySnapshot {
  /** capture wall-clock ms */
  at: number;
  text: string;
}

const MAX_SNAPSHOTS = 60; // 10s cadence → last 10 minutes
const SNAPSHOT_LINES = 400;

const snapshots = new Map<string, ReplaySnapshot[]>();

type ReplayBuffer = MarkBuffer & { length: number };

/** Capture the current tail of a pane's buffer. */
export function captureReplay(paneId: string, buffer: ReplayBuffer): void {
  const from = Math.max(0, buffer.length - SNAPSHOT_LINES);
  const text = linesBetween(buffer, from, buffer.length);
  const list = snapshots.get(paneId) ?? [];
  list.push({ at: Date.now(), text });
  if (list.length > MAX_SNAPSHOTS) list.splice(0, list.length - MAX_SNAPSHOTS);
  snapshots.set(paneId, list);
}

export function replaySnapshots(paneId: string): ReplaySnapshot[] {
  return snapshots.get(paneId) ?? [];
}

export function clearReplay(paneId: string): void {
  snapshots.delete(paneId);
}

/**
 * Pick the snapshot closest to (but not after) `ageMs` behind now.
 * Returns the newest snapshot when all are older than the requested age.
 */
export function snapshotForAge(
  list: ReplaySnapshot[],
  ageMs: number,
  now = Date.now(),
): ReplaySnapshot | null {
  if (list.length === 0) return null;
  const cutoff = now - ageMs;
  let best: ReplaySnapshot | null = null;
  for (const snap of list) {
    if (snap.at <= cutoff && (best === null || snap.at > best.at)) best = snap;
  }
  return best ?? list[0];
}
