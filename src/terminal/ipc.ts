import { Channel, invoke } from "@tauri-apps/api/core";

import { normalizeChunk } from "./manager";

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface PtySpawnOptions {
  rows: number;
  cols: number;
  cwd: string | null;
  shell: string | null;
  args?: string[] | null;
  /** extra environment variables ("KEY=VALUE") */
  env: string[] | null;
}

interface PtyCreated {
  ptyId: number;
}

interface PtyHandle {
  ptyId: number;
}

export type OutputSink = (data: Uint8Array | string) => void;

/**
 * Single IPC boundary between the UI and the PTY backend. Outside the Tauri
 * webview (plain browser dev) a tiny echo shell is mocked so the whole UI
 * stays usable for layout work.
 */
export async function spawnPty(
  options: PtySpawnOptions,
  onOutput: OutputSink,
): Promise<PtyHandle> {
  if (isTauri) {
    const channel = new Channel<unknown>((raw) => onOutput(normalizeChunk(raw)));
    return invoke<PtyCreated>("pty_create", { options, onOutput: channel });
  }
  return mockSpawn(onOutput);
}

// Per-PTY write serialization with coalescing: concurrent invoke()s are
// processed out of order by the host, which scrambles fast typing. Keep a
// single in-flight write per session and buffer everything that arrives
// while it's pending — the next flush sends the buffer as one ordered blob.
interface WriteState {
  inFlight: boolean;
  buf: string;
}
const writeStates = new Map<number, WriteState>();

export function ptyWrite(ptyId: number, data: string): void {
  if (isTauri) {
    let st = writeStates.get(ptyId);
    if (!st) {
      st = { inFlight: false, buf: "" };
      writeStates.set(ptyId, st);
    }
    st.buf += data;
    flushWrite(ptyId, st);
  } else {
    mockWrite(ptyId, data);
  }
}

function flushWrite(ptyId: number, st: WriteState): void {
  if (st.inFlight || !st.buf) return;
  const data = st.buf;
  st.buf = "";
  st.inFlight = true;
  invoke("pty_write", { ptyId, data })
    .catch(() => {})
    .finally(() => {
      st.inFlight = false;
      if (st.buf) flushWrite(ptyId, st);
    });
}

export function ptyResize(ptyId: number, rows: number, cols: number): void {
  if (isTauri) {
    invoke("pty_resize", { ptyId, rows, cols }).catch(() => {});
  }
}

export function ptyClose(ptyId: number): void {
  if (isTauri) {
    invoke("pty_close", { ptyId }).catch(() => {});
  } else {
    mockSessions.delete(ptyId);
  }
}

/**
 * Take over an existing PTY session's output stream (detached pane window).
 * The session is not respawned; the previous window stops receiving output.
 */
export function ptyAttach(ptyId: number, onOutput: OutputSink): void {
  if (!isTauri) return;
  const channel = new Channel<unknown>((raw) => onOutput(normalizeChunk(raw)));
  invoke("pty_attach", { ptyId, onOutput: channel }).catch(() => {});
}

/** Subscribes to backend PTY exit events; noop outside Tauri. */
export async function onPtyExit(
  handler: (ptyId: number, exitCode: number) => void,
): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<{ ptyId: number; exitCode: number }>(
    "pty-exit",
    ({ payload }) => handler(payload.ptyId, payload.exitCode),
  );
  return unlisten;
}

/** Open a URL with the system handler (opener plugin in Tauri). */
export async function openExternal(url: string): Promise<void> {
  if (!isTauri) {
    window.open(url, "_blank", "noopener");
    return;
  }
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    // ignore malformed URLs
  }
}

/** Native menu bar commands (settings, splits, tabs…). */
export async function onMenuAction(
  handler: (action: string) => void,
): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<string>("cw-menu", ({ payload }) =>
    handler(payload),
  );
  return unlisten;
}

/** Rebuild the native macOS menu with updated accelerators. */
export async function rebuildNativeMenu(
  keybindings: Record<string, string>,
): Promise<void> {
  if (!isTauri) return;
  await invoke("rebuild_menu", { keybindings });
}

/**
 * OS notification for a finished command. No-op outside Tauri or when the
 * system denies notification permission.
 */
export async function notifyCommandFinished(
  exitCode: number,
  context: string,
): Promise<void> {
  if (!isTauri) return;
  try {
    const mod = await import("@tauri-apps/plugin-notification");
    let granted = await mod.isPermissionGranted();
    if (!granted) {
      granted = (await mod.requestPermission()) === "granted";
    }
    if (!granted) return;
    mod.sendNotification({
      title:
        exitCode === 0
          ? "Command finished"
          : `Command failed (exit ${exitCode})`,
      body: context,
    });
  } catch {
    // notification plugin unavailable — silently skip
  }
}

/** Generic OS notification (trigger notifications etc.). */
export async function sendNotification(title: string, body: string): Promise<void> {
  if (!isTauri) return;
  try {
    const mod = await import("@tauri-apps/plugin-notification");
    let granted = await mod.isPermissionGranted();
    if (!granted) {
      granted = (await mod.requestPermission()) === "granted";
    }
    if (!granted) return;
    mod.sendNotification({ title, body });
  } catch {
    // notification plugin unavailable — silently skip
  }
}

/** Open a file with the configured editor command ("code {file}"). */
export function openWithEditor(editorCommand: string, file: string): void {
  if (!isTauri) return;
  invoke("open_with_editor", { editorCommand, file }).catch(() => {});
}

/** Show terminal progress (OSC 9;4) on the taskbar. */
export function setProgress(value: number | null): void {
  if (!isTauri) return;
  invoke("set_progress", { value }).catch(() => {});
}

export interface SystemStats {
  cpuPercent: number;
  usedMemMb: number;
  totalMemMb: number;
}

/** CPU / RAM readout (tab-strip status). */
export async function systemStats(): Promise<SystemStats | null> {
  if (!isTauri) return null;
  try {
    return await invoke<SystemStats>("system_stats");
  } catch {
    return null;
  }
}

/** Whether the window was created with OS transparency (tauri.conf). */
export async function windowIsTransparent(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    return await invoke<boolean>("window_is_transparent");
  } catch {
    return false;
  }
}

/** Window-level blur behind translucent panes (acrylic / HUD). */
export function setWindowBlur(enabled: boolean): void {
  if (!isTauri) return;
  invoke("set_window_blur", { enabled }).catch(() => {});
}

// ---------- Secrets vault ----------

export interface SecretBlob {
  name: string;
  salt: string;
  iv: string;
  data: string;
}

export function secretsList(): Promise<SecretBlob[]> {
  if (!isTauri) return Promise.resolve([]);
  return invoke<SecretBlob[]>("secrets_list").catch(() => []);
}

export function secretsUpsert(entry: SecretBlob): Promise<void> {
  if (!isTauri) return Promise.resolve();
  return invoke<void>("secrets_upsert", { entry }).catch(() => {});
}

export function secretsDelete(name: string): Promise<void> {
  if (!isTauri) return Promise.resolve();
  return invoke<void>("secrets_delete", { name }).catch(() => {});
}

// ---------- browser mock ----------

const mockSessions = new Map<number, OutputSink>();
let nextMockId = 1;

function mockSpawn(onOutput: OutputSink): Promise<PtyHandle> {
  const ptyId = nextMockId++;
  mockSessions.set(ptyId, onOutput);
  setTimeout(() => {
    onOutput(
      "\x1b[36mCommandWave mock shell\x1b[0m — backend unavailable in browser dev mode\r\n> ",
    );
  }, 30);
  return Promise.resolve({ ptyId });
}

function mockWrite(ptyId: number, data: string): void {
  const sink = mockSessions.get(ptyId);
  if (!sink) return;
  if (data === "\r") {
    sink("\r\nmock> ");
  } else if (data >= " " || data === "\t") {
    sink(data);
  }
}
