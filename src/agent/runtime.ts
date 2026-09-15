/**
 * Global agent-notification runtime: wires Tauri events (Tier-3 hook reports,
 * tray selections, notification clicks) into the status controller, and runs
 * the periodic idle sweep. Mounted once from `App`.
 */

import { isTauri } from "../terminal/ipc";
import { onNotificationClick } from "../notifications/backend";
import { useAppStore } from "../store/appStore";
import { agentById } from "./recognition";
import {
  focusPane,
  markPaneViewed,
  reportAgentDetected,
  reportHookEvent,
  runIdleSweep,
  syncAttention,
} from "./statusController";
import { paneStatus, useAgentStore } from "./statusStore";

interface HookPayload {
  paneId?: string;
  event?: string;
  agent?: string;
}

/** Normalise an event name from a hook (accepts snake/kebab/colon variants). */
export function normalizeEvent(raw: string | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/[_\s]+/g, "-");
  const map: Record<string, string> = {
    "needs-confirmation": "needs-confirmation",
    "needsyou": "needs-confirmation",
    "permission-request": "needs-confirmation",
    "permissionrequest": "needs-confirmation",
    needs: "needs-confirmation",
    finished: "finished",
    stop: "finished",
    done: "finished",
    complete: "finished",
    error: "error",
    failure: "error",
    stopfailure: "error",
    working: "working",
    busy: "working",
    start: "working",
    idle: "idle",
  };
  return map[key] ?? null;
}

export function initAgentRuntime(): () => void {
  if (!isTauri) return () => {};
  const disposers: Array<() => void> = [];

  // Tier-3 hook events arrive on the `agent-event` Tauri event.
  void import("@tauri-apps/api/event").then(({ listen }) =>
    listen<HookPayload>("agent-event", ({ payload }) => {
      const paneId = payload.paneId ?? "";
      if (!paneId) return;
      if (!paneStatus(paneId)) {
        const agent = agentById(payload.agent) ?? { id: payload.agent || "agent", label: payload.agent || "Agent", binaries: [] };
        reportAgentDetected(paneId, agent);
      }
      const event = normalizeEvent(payload.event);
      if (event) reportHookEvent(paneId, event);
    }),
  ).then((unlisten) => disposers.push(unlisten));

  // Notification click → focus the originating window/pane.
  void onNotificationClick((extra) => {
    const paneId = typeof extra.paneId === "string" ? extra.paneId : "";
    if (paneId) focusPane(paneId);
  }).then((dispose) => disposers.push(dispose));

  // Tray menu selection.
  void import("@tauri-apps/api/event").then(({ listen }) =>
    listen<string>("cw-attention-focus", ({ payload }) => {
      if (payload) focusPane(payload);
    }),
  ).then((unlisten) => disposers.push(unlisten));

  // Idle sweep: busy agents that went quiet.
  const sweep = setInterval(() => runIdleSweep(), 1000);
  disposers.push(() => clearInterval(sweep));

  // Viewing a pane clears its attention.
  let lastActive = "";
  const unsubscribe = useAppStore.subscribe((state) => {
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    const paneId = tab?.activePaneId ?? "";
    if (paneId && paneId !== lastActive) {
      const previous = lastActive;
      lastActive = paneId;
      if (previous) markPaneViewed(previous);
      markPaneViewed(paneId);
    }
  });
  disposers.push(unsubscribe);

  // Keep the tray in sync as panes open/close.
  disposers.push(useAgentStore.subscribe(() => syncAttention()));
  syncAttention();

  return () => {
    for (const dispose of disposers) dispose();
  };
}
