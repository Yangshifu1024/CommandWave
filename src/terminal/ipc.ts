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
  /** enable starship prompt auto-init for this pane */
  useStarship: boolean | null;
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

export function ptyWrite(ptyId: number, data: string): void {
  if (isTauri) {
    invoke("pty_write", { ptyId, data }).catch(() => {});
  } else {
    mockWrite(ptyId, data);
  }
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

export interface SshHost {
  host: string;
  hostname: string | null;
  user: string | null;
}

export function sshHosts(): Promise<SshHost[]> {
  if (!isTauri) return Promise.resolve([]);
  return invoke<SshHost[]>("ssh_hosts").catch(() => []);
}

export function starshipDetect(): Promise<string | null> {
  if (!isTauri) return Promise.resolve(null);
  return invoke<string | null>("starship_detect").catch(() => null);
}

export function starshipPresets(): Promise<string[]> {
  if (!isTauri) return Promise.resolve([]);
  return invoke<string[]>("starship_presets").catch(() => []);
}

export function starshipApplyPreset(name: string): Promise<string | null> {
  if (!isTauri) return Promise.resolve(null);
  return invoke<string | null>("starship_apply_preset", { name }).catch(() => null);
}

export function starshipReadConfig(): Promise<string | null> {
  if (!isTauri) return Promise.resolve(null);
  return invoke<string | null>("starship_read_config").catch(() => null);
}

export function starshipWriteConfig(text: string): Promise<string | null> {
  if (!isTauri) return Promise.resolve(null);
  return invoke<string | null>("starship_write_config", { text }).catch(() => null);
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
