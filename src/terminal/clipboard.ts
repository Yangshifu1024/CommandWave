/**
 * Clipboard plumbing shared by the terminal panes and the Edit menu: copy the
 * active selection and route pasted text through the paste guard, so risky
 * pastes (multi-line / large / destructive) confirm before reaching the shell.
 *
 * Inside Tauri the clipboard-manager plugin talks to the OS directly, so
 * read/write never trigger the webview permission prompt — which would
 * otherwise steal keyboard focus from the terminal. The browser Clipboard API
 * is the fallback for plain `vite dev` sessions.
 */

import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { isTauri } from "./ipc";
import type { TerminalEntry } from "./manager";
import { inspectPaste } from "./pasteGuard";

/** Read the system clipboard as text ("" when empty or unavailable). */
export async function readClipboardText(): Promise<string> {
  if (isTauri) {
    const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
    return (await readText()) ?? "";
  }
  return (await navigator.clipboard.readText()) ?? "";
}

/** Write text to the system clipboard. */
export async function writeClipboardText(text: string): Promise<void> {
  if (isTauri) {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}

/**
 * Write a pane's xterm selection to the system clipboard. Returns false when
 * nothing is selected, so callers can keep Ctrl+C as the interrupt signal.
 */
export function copySelectionToClipboard(entry: TerminalEntry): boolean {
  const selection = entry.term.getSelection();
  if (!selection) return false;
  void writeClipboardText(selection).catch(() => {
    // Clipboard denied — fall back to the copy-event path.
    document.execCommand("copy");
  });
  return true;
}

/** Paste text into a pane, confirming first when the paste guard flags it. */
export function pasteTextIntoPane(entry: TerminalEntry, text: string): void {
  const warn = useSettingsStore.getState().settings.notifications.pasteWarning;
  const warning = warn ? inspectPaste(text) : null;
  if (warning) {
    useAppStore.setState({ pasteConfirm: { text, paneId: entry.paneId } });
    return;
  }
  entry.term.paste(text);
  // Keep the caret in the terminal so typing continues without a click.
  entry.term.focus();
}

/** Read the system clipboard and paste it into a pane (no-op when denied). */
export async function pasteClipboardIntoPane(entry: TerminalEntry): Promise<void> {
  let text = "";
  try {
    text = await readClipboardText();
  } catch {
    return; // clipboard unavailable — nothing sensible to paste
  }
  if (text) pasteTextIntoPane(entry, text);
}
