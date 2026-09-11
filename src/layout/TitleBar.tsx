import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { terminalManager } from "../terminal/manager";
import { isTauri } from "../terminal/ipc";
import { acceleratorToDisplay } from "../hooks/keybindings";
import { linesBetween, nextPromptLine } from "../terminal/paneMarks";
import { inspectPaste } from "../terminal/pasteGuard";
import { enterCopyModeForActivePane, exitCopyMode } from "../terminal/copyModeController";

export const isMac = /Mac/.test(navigator.platform);

/** The main window API, or null outside Tauri (plain browser dev). */
function mainWindow() {
  return isTauri ? getCurrentWindow() : null;
}

function activePaneTerminal() {
  const s = useAppStore.getState();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  return tab ? terminalManager.get(tab.activePaneId) : undefined;
}

/** Scroll to the previous/next shell prompt (OSC 133 marks). */
function jumpToPromptMark(direction: -1 | 1): void {
  const entry = activePaneTerminal();
  if (!entry) return;
  const top = entry.term.buffer.active.viewportY;
  const target = nextPromptLine(terminalManager.promptLines(entry.paneId), top, direction);
  if (target !== null) entry.term.scrollToLine(target);
}

/** Copy the output of the last completed command to the clipboard. */
async function copyLastCommandOutput(): Promise<void> {
  const entry = activePaneTerminal();
  if (!entry) return;
  const prompts = terminalManager.promptLines(entry.paneId).filter((l) => l >= 0);
  if (prompts.length < 2) return;
  const lastPrompt = prompts[prompts.length - 1];
  const outputs = entry.marks.filter(
    (m) =>
      m.kind === "output" &&
      m.marker.line >= 0 &&
      m.marker.line < lastPrompt,
  );
  if (outputs.length === 0) return;
  const from = outputs[outputs.length - 1].marker.line + 1;
  const text = linesBetween(entry.term.buffer.active, from, lastPrompt);
  if (!text) return;
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    document.execCommand("copy");
  }
}

function copySelection(): void {
  const selection = activePaneTerminal()?.term.getSelection() ?? "";
  if (selection) {
    void navigator.clipboard?.writeText(selection).catch(() => {
      document.execCommand("copy");
    });
    return;
  }
  // Fall back to native copy for regular inputs (settings dialog, search…).
  document.execCommand("copy");
}

async function pasteIntoTerminal(): Promise<void> {
  // Focused editable element (settings dialog, search bar): paste there.
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    document.execCommand("paste");
    return;
  }
  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return; // clipboard unavailable — nothing sensible to paste
  }
  if (!text) return;
  const entry = activePaneTerminal();
  if (!entry) return;
  const warn = useSettingsStore.getState().settings.notifications.pasteWarning;
  const warning = warn ? inspectPaste(text) : null;
  if (warning) {
    // Queue for the confirmation dialog; nothing reaches the shell yet.
    useAppStore.setState({ pasteConfirm: { text, paneId: entry.paneId } });
    return;
  }
  entry.term.paste(text);
}

/** ⌘+/- zoom: nudge the global font size delta, clamped to a sane range. */
function adjustFontZoom(delta: number): void {
  useSettingsStore.getState().update((draft) => {
    draft.ui.fontSizeDelta = Math.min(10, Math.max(-6, draft.ui.fontSizeDelta + delta));
  });
}

function selectAll(): void {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.select();
    return;
  }
  activePaneTerminal()?.term.selectAll();
}

/**
 * Central dispatcher for every menu command. Shared by the custom title bar
 * menu (Windows/Linux) and the native macOS menu (`cw-menu` events).
 */
export function dispatchMenuAction(action: string): void {
  const s = useAppStore.getState();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  switch (action) {
    case "open-settings":
      s.openSettings();
      break;
    case "cycle-tab-prev":
      s.cycleTab(-1);
      break;
    case "cycle-tab-next":
      s.cycleTab(1);
      break;
    case "toggle-vertical-tabs":
      s.toggleTabBar();
      break;
    case "new-tab":
      s.newTab();
      break;
    case "close-pane":
      if (tab) s.closePane(tab.id, tab.activePaneId);
      break;
    case "close-tab":
      if (tab) s.closeTab(tab.id);
      break;
    case "split-right":
      if (tab) s.splitPane(tab.activePaneId, "h");
      break;
    case "split-down":
      if (tab) s.splitPane(tab.activePaneId, "v");
      break;
    case "prev-pane":
      s.cyclePane(-1);
      break;
    case "next-pane":
      s.cyclePane(1);
      break;
    case "pane-left":
      s.navigatePaneDirection("left");
      break;
    case "pane-right":
      s.navigatePaneDirection("right");
      break;
    case "pane-up":
      s.navigatePaneDirection("up");
      break;
    case "pane-down":
      s.navigatePaneDirection("down");
      break;
    case "toggle-maximize-pane":
      s.toggleMaximizePane();
      break;
    case "tmux-attach":
      void import("../terminal/tmuxController").then((m) =>
        m.tmuxController.attached ? m.tmuxController.detach() : m.tmuxController.attach(),
      );
      break;
    case "detach-pane":
      if (tab) s.detachPaneToWindow(tab.activePaneId);
      break;
    case "toggle-broadcast":
      s.toggleBroadcast();
      break;
    case "toggle-expose":
      s.toggleExpose();
      break;
    case "rename-tab":
      if (tab) useAppStore.setState({ renamingTabId: tab.id });
      break;
    case "toggle-tab-lock":
      if (tab) s.toggleTabLock(tab.id);
      break;
    case "prev-mark":
      jumpToPromptMark(-1);
      break;
    case "next-mark":
      jumpToPromptMark(1);
      break;
    case "copy-last-output":
      void copyLastCommandOutput();
      break;
    case "clear-buffer":
      activePaneTerminal()?.term.clear();
      break;
    case "instant-replay":
      useAppStore.setState((s) => ({ replayOpen: !s.replayOpen }));
      break;
    case "recent-commands":
      useAppStore.setState({ historyOpen: true, historySemantic: false });
      break;
    case "semantic-history":
      useAppStore.setState({ historyOpen: true, historySemantic: true });
      break;
    case "open-search":
      s.openSearch();
      break;
    case "search-again": {
      const entry = activePaneTerminal();
      if (entry?.search && s.searchQuery) {
        entry.search.findNext(s.searchQuery, {
          decorations: {
            matchOverviewRuler: "#4f9cf9",
            activeMatchColorOverviewRuler: "#ff5555",
          },
        });
        if (!s.searchOpen) s.openSearch();
      }
      break;
    }
    case "copy-mode":
      if (s.copyModePane) exitCopyMode();
      else enterCopyModeForActivePane();
      break;
    case "zoom-in":
      adjustFontZoom(1);
      break;
    case "zoom-out":
      adjustFontZoom(-1);
      break;
    case "zoom-reset":
      useSettingsStore.getState().update((draft) => {
        draft.ui.fontSizeDelta = 0;
      });
      break;
    case "window-minimize":
      mainWindow()?.minimize().catch((err) => console.error("minimize failed", err));
      break;
    case "window-toggle-maximize":
      mainWindow()?.toggleMaximize().catch((err) => console.error("toggleMaximize failed", err));
      break;
    case "edit-undo":
      document.execCommand("undo");
      break;
    case "edit-redo":
      document.execCommand("redo");
      break;
    case "edit-cut":
      document.execCommand("cut");
      break;
    case "edit-copy":
      copySelection();
      break;
    case "edit-paste":
      void pasteIntoTerminal();
      break;
    case "edit-select-all":
      selectAll();
      break;
  }
}

interface MenuEntry {
  label?: string;
  action?: string;
  sep?: boolean;
}

/** Menu structure (labels + action ids); shortcut strings come from the
 * keybindings map at render time. */
const MENUS: { label: string; items: MenuEntry[] }[] = [
  {
    label: "Shell",
    items: [
      { label: "New Tab", action: "new-tab" },
      { sep: true },
      { label: "Close Pane", action: "close-pane" },
      { label: "Close Tab", action: "close-tab" },
      { sep: true },
      { label: "Split Pane Right", action: "split-right" },
      { label: "Split Pane Down", action: "split-down" },
      { sep: true },
      { label: "Previous Pane", action: "prev-pane" },
      { label: "Next Pane", action: "next-pane" },
      { sep: true },
      { label: "Select Pane Left", action: "pane-left" },
      { label: "Select Pane Right", action: "pane-right" },
      { label: "Select Pane Up", action: "pane-up" },
      { label: "Select Pane Down", action: "pane-down" },
      { label: "Maximize Pane", action: "toggle-maximize-pane" },
      { label: "Move Pane to New Window", action: "detach-pane" },
      { sep: true },
      { label: "Broadcast Input to All Panes", action: "toggle-broadcast" },
      { sep: true },
      { label: "Attach tmux Session…", action: "tmux-attach" },
    ],
  },
  {
    label: "Edit",
    items: [
      { label: "Undo", action: "edit-undo" },
      { label: "Redo", action: "edit-redo" },
      { sep: true },
      { label: "Cut", action: "edit-cut" },
      { label: "Copy", action: "edit-copy" },
      { label: "Paste", action: "edit-paste" },
      { label: "Copy Last Output", action: "copy-last-output" },
      { sep: true },
      { label: "Select All", action: "edit-select-all" },
      { label: "Clear Buffer", action: "clear-buffer" },
    ],
  },
  {
    label: "View",
    items: [
      { label: "Toggle Vertical Tabs", action: "toggle-vertical-tabs" },
      { sep: true },
      { label: "Bigger Text", action: "zoom-in" },
      { label: "Smaller Text", action: "zoom-out" },
      { label: "Reset Text Size", action: "zoom-reset" },
      { sep: true },
      { label: "Copy Mode", action: "copy-mode" },
      { label: "Exposé All Panes", action: "toggle-expose" },
      { sep: true },
      { label: "Rename Tab…", action: "rename-tab" },
      { label: "Lock / Unlock Tab", action: "toggle-tab-lock" },
      { label: "Search…", action: "open-search" },
      { label: "Search Next Match", action: "search-again" },
      { label: "Recent Commands…", action: "recent-commands" },
      { label: "Semantic History Search…", action: "semantic-history" },
      { label: "Instant Replay…", action: "instant-replay" },
      { sep: true },
      { label: "Previous Prompt", action: "prev-mark" },
      { label: "Next Prompt", action: "next-mark" },
    ],
  },
  {
    label: "Window",
    items: [
      { label: "Minimize", action: "window-minimize" },
      { label: "Maximize", action: "window-toggle-maximize" },
    ],
  },
];

function entryLabel(entry: MenuEntry, isMaximized: boolean): string {
  if (entry.action === "window-toggle-maximize" && isMaximized) return "Restore";
  return entry.label ?? "";
}

/**
 * Custom window title bar. Windows/Linux: owns dragging, the app menu and the
 * window controls (the window is frameless). macOS: only a drag strip that
 * leaves room for the system traffic lights (menu lives in the system bar).
 */
export function TitleBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const keybindings = useSettingsStore((s) => s.settings.keybindings);
  const shortcutFor = (action: string) =>
    acceleratorToDisplay(keybindings[action] ?? "");

  // Track maximize state so the Window menu and the control icon stay true.
  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let disposed = false;
    const update = () => {
      win
        .isMaximized()
        .then((max) => {
          if (!disposed) setIsMaximized(max);
        })
        .catch(() => {});
    };
    update();
    win
      .onResized(() => update())
      .then((u) => {
        if (disposed) u();
        else unlisten = u;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Close the dropdown on any click outside the title bar.
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [openMenu]);

  return (
    <div
      ref={barRef}
      className={`titlebar${isMac ? " titlebar-mac" : ""}`}
      data-tauri-drag-region
    >
      {isMac ? (
        <div className="titlebar-traffic-space" data-tauri-drag-region />
      ) : (
        <div className="titlebar-menus" role="menubar">
          {MENUS.map((menu) => (
            <div key={menu.label} className="titlebar-menu">
              <button
                type="button"
                className={`titlebar-menu-label${openMenu === menu.label ? " open" : ""}`}
                onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
                onMouseEnter={() => openMenu && setOpenMenu(menu.label)}
              >
                {menu.label}
              </button>
              {openMenu === menu.label && (
                <div className="titlebar-dropdown" role="menu">
                  {menu.items.map((entry, i) =>
                    entry.sep ? (
                      <div key={i} className="titlebar-menu-sep" />
                    ) : (
                      <button
                        key={i}
                        type="button"
                        role="menuitem"
                        className="titlebar-menu-item"
                        onClick={() => {
                          setOpenMenu(null);
                          if (entry.action) dispatchMenuAction(entry.action);
                        }}
                      >
                        <span className="titlebar-menu-item-label">
                          {entryLabel(entry, isMaximized)}
                        </span>
                        {entry.action && shortcutFor(entry.action) && (
                          <span className="titlebar-menu-item-key">
                            {shortcutFor(entry.action)}
                          </span>
                        )}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="titlebar-drag" data-tauri-drag-region />
      {!isMac && (
        <div className="titlebar-controls">
          <button
            type="button"
            className="titlebar-btn"
            aria-label="Minimize"
            title="Minimize"
            onClick={() => dispatchMenuAction("window-minimize")}
          >
            <svg viewBox="0 0 10 10">
              <path d="M0 5.5h10" />
            </svg>
          </button>
          <button
            type="button"
            className="titlebar-btn"
            aria-label={isMaximized ? "Restore" : "Maximize"}
            title={isMaximized ? "Restore" : "Maximize"}
            onClick={() => dispatchMenuAction("window-toggle-maximize")}
          >
            {isMaximized ? (
              <svg viewBox="0 0 10 10">
                <path d="M2.5 2.5v-2h7v7h-2" />
                <rect x="0.5" y="2.5" width="7" height="7" />
              </svg>
            ) : (
              <svg viewBox="0 0 10 10">
                <rect x="0.5" y="0.5" width="9" height="9" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="titlebar-btn titlebar-close"
            aria-label="Close"
            title="Close"
            onClick={() => mainWindow()?.close().catch((err) => console.error("close failed", err))}
          >
            <svg viewBox="0 0 10 10">
              <path d="M0 0l10 10M10 0L0 10" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
