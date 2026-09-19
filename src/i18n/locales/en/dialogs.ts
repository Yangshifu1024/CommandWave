/**
 * Region: `dialogs` — paste confirmation, pane overview, recent commands,
 * instant replay, right-click menu, tab strip, search bar, agent onboarding.
 *
 * Rules for whoever owns this region:
 * - English pack is the reference: every key added here must exist in `zh-CN` too.
 * - Dynamic values use i18next interpolation (`{{count}}`), never string concat.
 */
export const dialogs = {
  paste: {
    label: "Confirm paste",
    title: "Paste multiple lines?",
    description:
      "The clipboard contains more than one line (or a very large / potentially destructive command). Pasting it will run the lines immediately.",
    accept: "Paste",
  },
  expose: {
    label: "Exposé all panes",
    tabLabel: "Tab {{title}}",
  },
  recentCommands: {
    label: "Recent commands",
    search: "Search commands…",
    searchWithOutput: "Search commands and their output…",
    includeOutput: "include command output (semantic search)",
    empty: "No matching commands yet.",
    hint: "↑↓ select · Enter run · Esc close · {{count}} recorded",
  },
  instantReplay: {
    label: "Instant replay",
    title: "Instant Replay",
    now: "now",
    age: "-{{seconds}}s",
    empty: "No snapshots yet for this pane (captured every 10s).",
  },
  contextMenu: {
    newTab: "New Tab",
    renameTab: "Rename Tab…",
    toggleTabLock: "Lock / Unlock Tab",
    closeTab: "Close Tab",
    copyLastOutput: "Copy Last Output",
    paste: "Paste",
    selectAll: "Select All",
    search: "Search…",
    clearBuffer: "Clear Buffer",
    splitRight: "Split Pane Right",
    splitDown: "Split Pane Down",
    maximizePane: "Maximize Pane",
    detachPane: "Move Pane to New Window",
    closePane: "Close Pane",
  },
  tabStrip: {
    agentStatus: "Agent {{status}}",
    agentState: {
      working: "working",
      needsYou: "needs-you",
      error: "error",
      done: "done",
      idle: "idle",
    },
    locked: "Locked",
    closeTab: "Close tab",
    newTab: "New tab",
    toggleVertical: "Toggle vertical tabs",
    toggleVerticalShortcut: "Toggle vertical tabs ({{shortcut}})",
    settings: "Settings",
    settingsShortcut: "Settings ({{shortcut}})",
  },
  search: {
    placeholder: "Find",
    matchCase: "Match case",
    regex: "Regular expression",
    resultCount: "{{index}}/{{count}}",
    previousMatch: "Previous match",
    previousMatchShortcut: "Previous match ({{shortcut}})",
    nextMatch: "Next match",
    nextMatchShortcut: "Next match ({{shortcut}})",
    close: "Close search",
    closeShortcut: "Close ({{shortcut}})",
  },
  onboarding: {
    label: "Enable agent notifications",
    title: "Enable agent notifications?",
    description:
      "CommandWave found coding agents on this machine. It can install a small hook into each so the app knows precisely when one needs you, finishes a turn, or errors. Your configs are backed up first and can be restored any time from Settings ▸ Integrations.",
    installing: "Installing…",
    installSelected: "Install selected",
    notNow: "Not now",
  },
} as const;
