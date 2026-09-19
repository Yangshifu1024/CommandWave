/**
 * Region: `menu` — title bar menu / native macOS menu labels and the action
 * names shown in Settings → Keyboard.
 *
 * Rules for whoever owns this region:
 * - English pack is the reference: every key added here must exist in `zh-CN` too.
 * - Component names (tmux, xterm.js) and key names (⌘, Enter) stay untranslated.
 * - The Chinese wording below matches the native (Rust) menu bar word for word,
 *   so both menus read the same.
 */
export const menu = {
  /** Menu bar group names (Shell / Edit / View / Window / Help). */
  groups: {
    shell: "Shell",
    edit: "Edit",
    view: "View",
    window: "Window",
    help: "Help",
  },
  /** Items of the Shell menu. */
  shell: {
    newTab: "New Tab",
    closePane: "Close Pane",
    closeTab: "Close Tab",
    splitRight: "Split Pane Right",
    splitDown: "Split Pane Down",
    prevPane: "Previous Pane",
    nextPane: "Next Pane",
    paneLeft: "Select Pane Left",
    paneRight: "Select Pane Right",
    paneUp: "Select Pane Up",
    paneDown: "Select Pane Down",
    maximizePane: "Maximize Pane",
    detachPane: "Move Pane to New Window",
    broadcast: "Broadcast Input to All Panes",
    tmuxAttach: "Attach tmux Session…",
  },
  /** Items of the Edit menu. */
  edit: {
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    copyLastOutput: "Copy Last Output",
    selectAll: "Select All",
    clearBuffer: "Clear Buffer",
  },
  /** Items of the View menu. */
  view: {
    toggleVerticalTabs: "Toggle Vertical Tabs",
    biggerText: "Bigger Text",
    smallerText: "Smaller Text",
    resetTextSize: "Reset Text Size",
    copyMode: "Copy Mode",
    expose: "Exposé All Panes",
    renameTab: "Rename Tab…",
    toggleTabLock: "Lock / Unlock Tab",
    search: "Search…",
    searchAgain: "Search Next Match",
    recentCommands: "Recent Commands…",
    semanticHistory: "Semantic History Search…",
    instantReplay: "Instant Replay…",
    prevPrompt: "Previous Prompt",
    nextPrompt: "Next Prompt",
  },
  /** Items of the Window menu (also the window control buttons). */
  window: {
    minimize: "Minimize",
    maximize: "Maximize",
    restore: "Restore",
  },
  /** Items of the Help menu. */
  help: {
    checkForUpdates: "Check for Updates…",
    about: "About CommandWave",
  },
  /** Action names listed in Settings → Keyboard. */
  actions: {
    newTab: "New Tab",
    closePane: "Close Pane",
    closeTab: "Close Tab",
    splitRight: "Split Pane Right",
    splitDown: "Split Pane Down",
    prevPane: "Previous Pane",
    nextPane: "Next Pane",
    paneLeft: "Select Pane Left",
    paneRight: "Select Pane Right",
    paneUp: "Select Pane Up",
    paneDown: "Select Pane Down",
    maximizePane: "Maximize Pane",
    broadcastInput: "Broadcast Input",
    exposePanes: "Exposé All Panes",
    renameTab: "Rename Tab",
    toggleTabLock: "Lock / Unlock Tab",
    recentCommands: "Recent Commands",
    semanticHistory: "Semantic History Search",
    instantReplay: "Instant Replay",
    tmuxAttach: "Attach tmux Session",
    prevTab: "Previous Tab",
    nextTab: "Next Tab",
    toggleVerticalTabs: "Toggle Vertical Tabs",
    search: "Search",
    settings: "Settings",
    prevPrompt: "Previous Prompt",
    nextPrompt: "Next Prompt",
    copyLastOutput: "Copy Last Output",
    clearBuffer: "Clear Buffer",
    copyMode: "Copy Mode",
    searchNext: "Search Next Match",
    biggerText: "Bigger Text",
    smallerText: "Smaller Text",
    resetTextSize: "Reset Text Size",
  },
} as const;
