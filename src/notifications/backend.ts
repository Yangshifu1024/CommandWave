/**
 * Notification backend abstraction.
 *
 * All OS-notification calls funnel through this module so the underlying
 * plugin (currently `@choochmeque/tauri-plugin-notifications-api`, chosen for
 * desktop click callbacks) is isolated in one place. Everything degrades to a
 * no-op outside Tauri, when the plugin is missing, or when permission is
 * denied.
 */

import { isTauri } from "../terminal/ipc";

export interface AgentNotification {
  /** Stable notification id (pane hash) so the same pane replaces its toast. */
  id?: number;
  title: string;
  body: string;
  /** Payload echoed back on click, used to focus the originating pane. */
  extra?: Record<string, unknown>;
}

type PluginModule = typeof import("@choochmeque/tauri-plugin-notifications-api");

async function loadPlugin(): Promise<PluginModule | null> {
  if (!isTauri) return null;
  try {
    return await import("@choochmeque/tauri-plugin-notifications-api");
  } catch {
    return null;
  }
}

/** Request permission on first use; resolves whether notifications may fire. */
export async function ensurePermission(): Promise<boolean> {
  const mod = await loadPlugin();
  if (!mod) return false;
  try {
    if (await mod.isPermissionGranted()) return true;
    return (await mod.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Send one notification (no-op when unavailable). */
export async function sendNotification(payload: AgentNotification): Promise<void> {
  const mod = await loadPlugin();
  if (!mod) return;
  try {
    if (!(await ensurePermission())) return;
    await mod.sendNotification({
      id: payload.id,
      title: payload.title,
      body: payload.body,
      extra: payload.extra,
      autoCancel: true,
    });
  } catch {
    // plugin unavailable — silently skip
  }
}

/** Flash the taskbar / Dock for the current window. */
export async function requestAttention(): Promise<void> {
  if (!isTauri) return;
  try {
    const { getCurrentWindow, UserAttentionType } = await import("@tauri-apps/api/window");
    await getCurrentWindow().requestUserAttention(UserAttentionType.Critical);
  } catch {
    // attention API unavailable
  }
}

/** Focus the window that hosts a pane (main or a detached window). */
export async function focusWindowForPane(windowLabel: string | undefined): Promise<void> {
  if (!isTauri) return;
  try {
    const { getAllWindows } = await import("@tauri-apps/api/window");
    const windows = await getAllWindows();
    const target =
      (windowLabel && windows.find((w) => w.label === windowLabel)) ??
      windows.find((w) => w.label === "main");
    if (!target) return;
    await target.show();
    await target.setFocus();
  } catch {
    // window API unavailable
  }
}

/**
 * Register the desktop notification click listener. The callback receives the
 * `extra` payload that was attached when the notification was sent.
 */
export async function onNotificationClick(
  handler: (extra: Record<string, unknown>) => void,
): Promise<() => void> {
  const mod = await loadPlugin();
  if (!mod) return () => {};
  try {
    const listener = await mod.onNotificationClicked((data) => {
      handler(data.data ?? {});
    });
    return () => {
      void listener.unregister().catch(() => {});
    };
  } catch {
    return () => {};
  }
}

/** The window label this webview runs in ("main" or "detach-<paneId>"). */
export function currentWindowLabel(): string {
  if (typeof window === "undefined") return "main";
  const detach = new URLSearchParams(window.location.search).get("detach");
  if (detach) {
    try {
      const params = JSON.parse(decodeURIComponent(detach)) as { paneId?: string };
      if (params.paneId) return `detach-${params.paneId}`;
    } catch {
      // ignore malformed detach param
    }
  }
  return "main";
}
