import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";

import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { terminalManager } from "../terminal/manager";
import { isTauri } from "../terminal/ipc";
import { acceleratorToDisplay } from "../hooks/keybindings";
import { requestUpdateCheck } from "../updater";
import { linesBetween, nextPromptLine } from "../terminal/paneMarks";
import {
  copySelectionToClipboard,
  pasteClipboardIntoPane,
  writeClipboardText,
} from "../terminal/clipboard";
import { enterCopyModeForActivePane, exitCopyMode } from "../terminal/copyModeController";
import type { menu } from "../i18n/locales/en/menu";

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
    await writeClipboardText(text);
  } catch {
    document.execCommand("copy");
  }
}

function copySelection(): void {
  const entry = activePaneTerminal();
  if (entry && copySelectionToClipboard(entry)) return;
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
  const entry = activePaneTerminal();
  if (!entry) return;
  await pasteClipboardIntoPane(entry);
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
    case "check-for-updates":
      requestUpdateCheck();
      break;
    case "about":
      s.openAbout();
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

/** Menu words live in the locale packs; only keys are stored here. */
type MenuGroupKey = `menu.groups.${keyof typeof menu.groups}`;

type MenuLabelKey =
  | MenuGroupKey
  | `menu.shell.${keyof typeof menu.shell}`
  | `menu.edit.${keyof typeof menu.edit}`
  | `menu.view.${keyof typeof menu.view}`
  | `menu.window.${keyof typeof menu.window}`
  | `menu.help.${keyof typeof menu.help}`
  | "common.close";

/** `t` narrowed to the keys this file uses. */
type Translate = (key: MenuLabelKey) => string;

interface MenuEntry {
  labelKey?: MenuLabelKey;
  action?: string;
  sep?: boolean;
}

/** Menu structure (label keys + action ids); the words come from the locale
 * packs and the shortcut strings from the keybindings map, both at render time
 * (the language may change while the app is running). */
const MENUS: { labelKey: MenuGroupKey; items: MenuEntry[] }[] = [
  {
    labelKey: "menu.groups.shell",
    items: [
      { labelKey: "menu.shell.newTab", action: "new-tab" },
      { sep: true },
      { labelKey: "menu.shell.closePane", action: "close-pane" },
      { labelKey: "menu.shell.closeTab", action: "close-tab" },
      { sep: true },
      { labelKey: "menu.shell.splitRight", action: "split-right" },
      { labelKey: "menu.shell.splitDown", action: "split-down" },
      { sep: true },
      { labelKey: "menu.shell.prevPane", action: "prev-pane" },
      { labelKey: "menu.shell.nextPane", action: "next-pane" },
      { sep: true },
      { labelKey: "menu.shell.paneLeft", action: "pane-left" },
      { labelKey: "menu.shell.paneRight", action: "pane-right" },
      { labelKey: "menu.shell.paneUp", action: "pane-up" },
      { labelKey: "menu.shell.paneDown", action: "pane-down" },
      { labelKey: "menu.shell.maximizePane", action: "toggle-maximize-pane" },
      { labelKey: "menu.shell.detachPane", action: "detach-pane" },
      { sep: true },
      { labelKey: "menu.shell.broadcast", action: "toggle-broadcast" },
      { sep: true },
      { labelKey: "menu.shell.tmuxAttach", action: "tmux-attach" },
    ],
  },
  {
    labelKey: "menu.groups.edit",
    items: [
      { labelKey: "menu.edit.undo", action: "edit-undo" },
      { labelKey: "menu.edit.redo", action: "edit-redo" },
      { sep: true },
      { labelKey: "menu.edit.cut", action: "edit-cut" },
      { labelKey: "menu.edit.copy", action: "edit-copy" },
      { labelKey: "menu.edit.paste", action: "edit-paste" },
      { labelKey: "menu.edit.copyLastOutput", action: "copy-last-output" },
      { sep: true },
      { labelKey: "menu.edit.selectAll", action: "edit-select-all" },
      { labelKey: "menu.edit.clearBuffer", action: "clear-buffer" },
    ],
  },
  {
    labelKey: "menu.groups.view",
    items: [
      { labelKey: "menu.view.toggleVerticalTabs", action: "toggle-vertical-tabs" },
      { sep: true },
      { labelKey: "menu.view.biggerText", action: "zoom-in" },
      { labelKey: "menu.view.smallerText", action: "zoom-out" },
      { labelKey: "menu.view.resetTextSize", action: "zoom-reset" },
      { sep: true },
      { labelKey: "menu.view.copyMode", action: "copy-mode" },
      { labelKey: "menu.view.expose", action: "toggle-expose" },
      { sep: true },
      { labelKey: "menu.view.renameTab", action: "rename-tab" },
      { labelKey: "menu.view.toggleTabLock", action: "toggle-tab-lock" },
      { labelKey: "menu.view.search", action: "open-search" },
      { labelKey: "menu.view.searchAgain", action: "search-again" },
      { labelKey: "menu.view.recentCommands", action: "recent-commands" },
      { labelKey: "menu.view.semanticHistory", action: "semantic-history" },
      { labelKey: "menu.view.instantReplay", action: "instant-replay" },
      { sep: true },
      { labelKey: "menu.view.prevPrompt", action: "prev-mark" },
      { labelKey: "menu.view.nextPrompt", action: "next-mark" },
    ],
  },
  {
    labelKey: "menu.groups.window",
    items: [
      { labelKey: "menu.window.minimize", action: "window-minimize" },
      { labelKey: "menu.window.maximize", action: "window-toggle-maximize" },
    ],
  },
  {
    labelKey: "menu.groups.help",
    items: [
      { labelKey: "menu.help.checkForUpdates", action: "check-for-updates" },
      { labelKey: "menu.help.about", action: "about" },
    ],
  },
];

function entryLabel(entry: MenuEntry, isMaximized: boolean, t: Translate): string {
  if (entry.action === "window-toggle-maximize" && isMaximized) return t("menu.window.restore");
  return entry.labelKey ? t(entry.labelKey) : "";
}

/**
 * Custom window title bar. Windows/Linux: owns dragging, the app menu and the
 * window controls (the window is frameless). macOS: only a drag strip that
 * leaves room for the system traffic lights (menu lives in the system bar).
 */
export function TitleBar() {
  const { t } = useTranslation();
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
          {MENUS.map((group) => (
            <div key={group.labelKey} className="titlebar-menu">
              <button
                type="button"
                className={`titlebar-menu-label${openMenu === group.labelKey ? " open" : ""}`}
                onClick={() =>
                  setOpenMenu(openMenu === group.labelKey ? null : group.labelKey)
                }
                onMouseEnter={() => openMenu && setOpenMenu(group.labelKey)}
              >
                {t(group.labelKey)}
              </button>
              {openMenu === group.labelKey && (
                <div className="titlebar-dropdown" role="menu">
                  {group.items.map((entry, i) =>
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
                          {entryLabel(entry, isMaximized, t)}
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
            aria-label={t("menu.window.minimize")}
            title={t("menu.window.minimize")}
            onClick={() => dispatchMenuAction("window-minimize")}
          >
            <svg viewBox="0 0 10 10">
              <path d="M0 5.5h10" />
            </svg>
          </button>
          <button
            type="button"
            className="titlebar-btn"
            aria-label={t(isMaximized ? "menu.window.restore" : "menu.window.maximize")}
            title={t(isMaximized ? "menu.window.restore" : "menu.window.maximize")}
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
            aria-label={t("common.close")}
            title={t("common.close")}
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
