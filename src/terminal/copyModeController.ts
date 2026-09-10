/**
 * Copy Mode controller: bridges the pure copyMode state machine (copyMode.ts)
 * to a live terminal entry. Key events arrive from the global shortcut hook
 * while the pane is in Copy Mode; the state lives on the terminal entry so
 * the pane keeps its position across re-renders.
 */

import { useAppStore } from "../store/appStore";
import { terminalManager, type TerminalEntry } from "./manager";
import { linesBetween } from "./paneMarks";
import {
  applyCopyModeInput,
  copyModeHighlight,
  copyModeKey,
  copyModeRange,
  enterCopyMode,
} from "./copyMode";

const isMacPlatform =
  typeof navigator !== "undefined" &&
  /Mac/i.test(navigator.platform ?? navigator.userAgent ?? "");

function activeEntry(): TerminalEntry | undefined {
  const s = useAppStore.getState();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  return tab ? terminalManager.get(tab.activePaneId) : undefined;
}

function clearHighlight(entry: TerminalEntry): void {
  for (const { deco, marker } of entry.copyModeDecos) {
    try {
      deco.dispose();
    } catch {
      // already disposed
    }
    try {
      marker.dispose();
    } catch {
      // already disposed
    }
  }
  entry.copyModeDecos = [];
}

function paint(entry: TerminalEntry): void {
  clearHighlight(entry);
  const state = entry.copyMode;
  if (!state) return;
  const { from, to } = copyModeHighlight(state);
  const buf = entry.term.buffer.active;
  const refLine = buf.baseY + buf.cursorY;
  for (let line = from; line < to; line++) {
    const marker = entry.term.registerMarker(line - refLine);
    if (!marker || marker.line < 0) continue;
    try {
      const deco = entry.term.registerDecoration({
        marker,
        backgroundColor:
          state.anchor === null ? "rgba(79, 156, 249, 0.45)" : "rgba(79, 156, 249, 0.22)",
        layer: "top",
      });
      if (deco) entry.copyModeDecos.push({ deco, marker });
      else marker.dispose();
    } catch {
      marker.dispose();
    }
  }
  // Keep the cursor inside the viewport without scrolling when it already is.
  const viewY = entry.term.buffer.active.viewportY;
  if (state.cursor < viewY || state.cursor >= viewY + entry.term.rows) {
    entry.term.scrollToLine(state.cursor);
  }
}

/** Enter Copy Mode for the active pane (no-op when already in it). */
export function enterCopyModeForActivePane(): void {
  const entry = activeEntry();
  if (!entry || entry.copyMode) return;
  entry.copyMode = enterCopyMode(entry.term);
  useAppStore.setState({ copyModePane: entry.paneId });
  paint(entry);
}

export function exitCopyMode(): void {
  const paneId = useAppStore.getState().copyModePane;
  if (!paneId) return;
  const entry = terminalManager.get(paneId);
  if (entry) {
    entry.copyMode = null;
    clearHighlight(entry);
  }
  useAppStore.setState({ copyModePane: null });
}

async function copyAndExit(entry: TerminalEntry): Promise<void> {
  const state = entry.copyMode;
  if (state) {
    const range = copyModeRange(state);
    if (range) {
      const text = linesBetween(entry.term.buffer.active, range.from, range.to);
      if (text) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // clipboard denied — still leave copy mode
        }
      }
    }
  }
  exitCopyMode();
}

/**
 * Route a keydown event while Copy Mode is active. Returns true when the
 * event was consumed; unhandled plain typing falls through to the shell.
 */
export function handleCopyModeKeyEvent(e: KeyboardEvent): boolean {
  const paneId = useAppStore.getState().copyModePane;
  if (!paneId) return false;
  const entry = terminalManager.get(paneId);
  if (!entry || !entry.copyMode) {
    exitCopyMode();
    return false;
  }
  // Modifier combos (⌘C copy, ⌘+ zoom…) still take the normal path.
  const primary = isMacPlatform ? e.metaKey : e.ctrlKey;
  const input = copyModeKey(e, isMacPlatform);
  if (!input) {
    // Swallow unmodified typing so Copy Mode never leaks keys to the shell.
    if (!primary && !e.altKey && e.key.length === 1) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
    return false;
  }
  if (primary && e.key !== "c") return false;

  if (input.t === "exit") {
    exitCopyMode();
  } else if (input.t === "copy") {
    void copyAndExit(entry);
  } else {
    const next = applyCopyModeInput(entry.copyMode, input, entry.term);
    if (!next) {
      exitCopyMode();
    } else {
      entry.copyMode = next;
      paint(entry);
    }
  }
  e.preventDefault();
  e.stopPropagation();
  return true;
}
