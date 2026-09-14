/**
 * Per-pane agent status (the persistent state machine).
 *
 * States: `working` → `needs-you` | `error` | `done` → `idle`. A pane only
 * appears here once a known agent is recognised in it; ordinary shells never
 * track status. Tab dots, the tray, the Dock badge and OS notifications are
 * all derived from this store (see `statusController.ts`).
 */

import { create } from "zustand";

import type { PaneNode } from "../layout/paneTree";
import type { AgentState } from "./signals";
import { stateRank } from "./signals";

export interface PaneAgentStatus {
  paneId: string;
  agentId: string;
  label: string;
  state: AgentState;
  /** wall-clock ms of the last state change. */
  since: number;
  /** wall-clock ms of the last output activity. */
  lastActivity: number;
  /** recent stripped output, used by the idle classifier. */
  tail: string;
}

interface AgentStore {
  panes: Record<string, PaneAgentStatus>;
  /** Register / refresh the agent running in a pane. */
  upsert: (paneId: string, agentId: string, label: string) => void;
  /** Transition a pane's state (no side effects here). */
  setState: (paneId: string, state: AgentState) => void;
  /** Record output activity (keeps a bounded tail for idle classification). */
  noteActivity: (paneId: string, tail: string) => void;
  remove: (paneId: string) => void;
  reset: () => void;
}

const TAIL_LIMIT = 2000;

export const useAgentStore = create<AgentStore>((set) => ({
  panes: {},

  upsert: (paneId, agentId, label) =>
    set((s) => {
      const existing = s.panes[paneId];
      if (existing && existing.agentId === agentId) return s;
      return {
        panes: {
          ...s.panes,
          [paneId]: {
            paneId,
            agentId,
            label,
            state: existing?.state ?? "idle",
            since: existing?.since ?? Date.now(),
            lastActivity: Date.now(),
            tail: existing?.tail ?? "",
          },
        },
      };
    }),

  setState: (paneId, state) =>
    set((s) => {
      const pane = s.panes[paneId];
      if (!pane || pane.state === state) return s;
      return {
        panes: { ...s.panes, [paneId]: { ...pane, state, since: Date.now() } },
      };
    }),

  noteActivity: (paneId, tail) =>
    set((s) => {
      const pane = s.panes[paneId];
      if (!pane) return s;
      const merged = (pane.tail + tail).slice(-TAIL_LIMIT);
      return {
        panes: {
          ...s.panes,
          [paneId]: { ...pane, lastActivity: Date.now(), tail: merged },
        },
      };
    }),

  remove: (paneId) =>
    set((s) => {
      if (!(paneId in s.panes)) return s;
      const next = { ...s.panes };
      delete next[paneId];
      return { panes: next };
    }),

  reset: () => set({ panes: {} }),
}));

export function paneStatus(paneId: string): PaneAgentStatus | undefined {
  return useAgentStore.getState().panes[paneId];
}

/** Highest-urgency state among a tab's panes, or null when none are agents. */
export function tabAttentionState(
  root: PaneNode,
  panes: Record<string, PaneAgentStatus>,
  collectPaneIds: (root: PaneNode) => string[],
): AgentState | null {
  let best: AgentState | null = null;
  for (const paneId of collectPaneIds(root)) {
    const pane = panes[paneId];
    if (!pane) continue;
    if (best === null || stateRank(pane.state) < stateRank(best)) best = pane.state;
  }
  return best;
}

/** Panes that should light a tab dot / count toward the badge. */
export function isAttentionState(state: AgentState): boolean {
  return state === "needs-you" || state === "error" || state === "done";
}

/** Total panes waiting on the user (tray + Dock badge count). */
export function attentionCount(panes: Record<string, PaneAgentStatus>): number {
  return Object.values(panes).filter(
    (p) => p.state === "needs-you" || p.state === "error",
  ).length;
}

/** Panes in a given state, most recent first (tray menu). */
export function panesInState(
  panes: Record<string, PaneAgentStatus>,
  states: AgentState[],
): PaneAgentStatus[] {
  return Object.values(panes)
    .filter((p) => states.includes(p.state))
    .sort((a, b) => b.since - a.since);
}
