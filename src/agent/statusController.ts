/**
 * Agent status controller: state transitions, notification rules and tray
 * synchronisation. `TerminalPane` reports raw observations (activity, title
 * changes, OSC/BEL signals, hooks); this module owns the policy.
 */

import { invoke } from "@tauri-apps/api/core";

import { containsPane } from "../layout/paneTree";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { terminalManager } from "../terminal/manager";
import { currentWindowLabel, requestAttention, sendNotification } from "../notifications/backend";
import type { AgentDef } from "./recognition";
import {
  classifyIdle,
  classifyTitle,
  matchesErrorPattern,
  type AgentState,
} from "./signals";
import {
  attentionCount,
  isAttentionState,
  paneStatus,
  panesInState,
  useAgentStore,
} from "./statusStore";

/** Stable 31-bit id for a pane (notification replacement key). */
export function paneNotificationId(paneId: string): number {
  let hash = 0;
  for (let i = 0; i < paneId.length; i++) {
    hash = (hash * 31 + paneId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2_000_000_000;
}

/** True when the pane is the focused pane of the focused window. */
export function paneIsVisible(paneId: string): boolean {
  if (typeof document !== "undefined" && !document.hasFocus()) return false;
  const { tabs, activeTabId } = useAppStore.getState();
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return false;
  return tab.activePaneId === paneId && containsPane(tab.root, paneId);
}

function tabForPane(paneId: string) {
  return useAppStore.getState().tabs.find((t) => containsPane(t.root, paneId));
}

function shouldNotify(state: AgentState): boolean {
  const events = useSettingsStore.getState().settings.notifications.events;
  switch (state) {
    case "needs-you":
      return events.needsConfirmation;
    case "done":
      return events.finished;
    case "error":
      return events.error;
    default:
      return false;
  }
}

function notificationText(paneId: string, state: AgentState): { title: string; body: string } | null {
  const pane = paneStatus(paneId);
  if (!pane) return null;
  const tab = tabForPane(paneId);
  const context = tab?.paneMeta[paneId];
  const where = context?.cwd ?? tab?.title ?? "CommandWave";
  const title =
    state === "needs-you"
      ? `${pane.label} needs you`
      : state === "error"
        ? `${pane.label} errored`
        : `${pane.label} finished`;
  const tail = pane.tail.trim().split("\n").filter(Boolean).pop() ?? "";
  const body = [where, tail].filter(Boolean).join("\n");
  return { title, body };
}

/** Core transition: update state, then notify + refresh the tray if needed. */
export function transition(paneId: string, next: AgentState): void {
  const before = paneStatus(paneId);
  if (!before || before.state === next) return;
  const wasAttention = isAttentionState(before.state);
  useAgentStore.getState().setState(paneId, next);

  if (isAttentionState(next) && !wasAttention && !paneIsVisible(paneId) && shouldNotify(next)) {
    const text = notificationText(paneId, next);
    if (text) {
      const tab = tabForPane(paneId);
      void sendNotification({
        id: paneNotificationId(paneId),
        title: text.title,
        body: text.body,
        extra: {
          paneId,
          tabId: tab?.id ?? "",
          windowLabel: currentWindowLabel(),
        },
      });
      // Taskbar / Dock flash is reserved for the blocking event.
      if (next === "needs-you" && useSettingsStore.getState().settings.notifications.taskbarAttention) {
        void requestAttention();
      }
    }
  }
  syncAttention();
}

/** A known agent was recognised in this pane. */
export function reportAgentDetected(paneId: string, agent: AgentDef): void {
  useAgentStore.getState().upsert(paneId, agent.id, agent.label);
  syncAttention();
}

/** Output arrived from the pane. */
export function reportActivity(paneId: string, chunk: string): void {
  const pane = paneStatus(paneId);
  if (!pane) return;
  useAgentStore.getState().noteActivity(paneId, chunk);
  // New output means work resumed; a waiting pane becomes busy again.
  if (pane.state !== "working") transition(paneId, "working");
}

/** Title changed (OSC 0/2): infer busy/idle/needs-input. */
export function reportTitle(paneId: string, title: string): void {
  if (!useSettingsStore.getState().settings.notifications.titleDetection) return;
  if (!paneStatus(paneId)) return;
  const state = classifyTitle(title);
  if (!state) return;
  if (state === "idle") {
    // Returning to the ready marker means the turn finished.
    const current = paneStatus(paneId)?.state;
    transition(paneId, current === "working" ? "done" : "idle");
  } else {
    transition(paneId, state);
  }
}

/** Explicit Tier-3 hook event (authoritative for this pane). */
export function reportHookEvent(paneId: string, event: string): void {
  const map: Record<string, AgentState> = {
    working: "working",
    "needs-confirmation": "needs-you",
    finished: "done",
    error: "error",
    idle: "idle",
  };
  const state = map[event];
  if (state) transition(paneId, state);
}

/** A plain OSC/BEL attention signal with no state detail. */
export function reportAttentionSignal(paneId: string, detail?: string): void {
  const pane = paneStatus(paneId);
  if (!pane) return;
  if (detail && matchesErrorPattern(detail, useSettingsStore.getState().settings.notifications.errorPatterns)) {
    transition(paneId, "error");
  } else {
    transition(paneId, "needs-you");
  }
}

/**
 * Periodic idle sweep: a busy agent that has gone quiet has either finished
 * or is waiting on the user; the tail decides.
 */
export function runIdleSweep(): void {
  const threshold = useSettingsStore.getState().settings.notifications.idleThresholdMs;
  const patterns = useSettingsStore.getState().settings.notifications.errorPatterns;
  const now = Date.now();
  for (const pane of Object.values(useAgentStore.getState().panes)) {
    if (pane.state !== "working") continue;
    if (now - pane.lastActivity < threshold) continue;
    if (pane.lastActivity === 0) continue;
    transition(pane.paneId, classifyIdle(pane.tail, patterns));
  }
}

/** Mark a pane as seen: clears its attention state back to idle. */
export function markPaneViewed(paneId: string): void {
  const pane = paneStatus(paneId);
  if (!pane) return;
  if (pane.state === "done" || pane.state === "error") {
    transition(paneId, "idle");
  }
}

/** Focus a pane (notification click / tray selection), across windows. */
export function focusPane(paneId: string): void {
  const tab = tabForPane(paneId);
  if (tab) {
    // Detached panes live outside the tab tree; ignore those here.
    useAppStore.getState().selectTab(tab.id);
    useAppStore.getState().selectPane(tab.id, paneId);
  }
  terminalManager.get(paneId)?.term.focus();
  markPaneViewed(paneId);
}

/** Push the attention set to the tray + macOS Dock badge. */
export function syncAttention(): void {
  const panes = useAgentStore.getState().panes;
  const items = panesInState(panes, ["needs-you", "error"]).map((pane) => ({
    paneId: pane.paneId,
    label: tabForPane(pane.paneId)?.title ?? pane.label,
    state: pane.state,
  }));
  const count = attentionCount(panes);
  invoke("agent_attention_update", { items, count }).catch(() => {});
}

/** Forget a pane (closed / PTY gone). */
export function forgetPane(paneId: string): void {
  useAgentStore.getState().remove(paneId);
  syncAttention();
}
