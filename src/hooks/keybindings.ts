/**
 * Keybinding model: actions are bound to Tauri-style accelerators
 * ("CmdOrCtrl+Shift+B"), persisted in settings, and rendered into both the
 * webview shortcut handler and the native macOS menu.
 */

import type { menu } from "../i18n/locales/en/menu";

const isMacPlatform =
  typeof navigator !== "undefined" &&
  /Mac/i.test(navigator.platform ?? navigator.userAgent ?? "");

/**
 * Translation key of an action name, taken from the `en` pack so a renamed or
 * misspelled key fails the type check instead of showing a raw key.
 */
export type KeybindingLabelKey = `menu.actions.${keyof typeof menu.actions}`;

/**
 * All customizable actions with their default accelerators and the translation
 * key of their display name (resolved with `t(labelKey)` where it is shown).
 */
export const KEYBINDING_ACTIONS: {
  action: string;
  labelKey: KeybindingLabelKey;
  default: string;
}[] = [
  { action: "new-tab", labelKey: "menu.actions.newTab", default: "CmdOrCtrl+T" },
  { action: "close-pane", labelKey: "menu.actions.closePane", default: "CmdOrCtrl+W" },
  { action: "close-tab", labelKey: "menu.actions.closeTab", default: "Shift+CmdOrCtrl+W" },
  { action: "split-right", labelKey: "menu.actions.splitRight", default: "CmdOrCtrl+D" },
  { action: "split-down", labelKey: "menu.actions.splitDown", default: "Shift+CmdOrCtrl+D" },
  { action: "prev-pane", labelKey: "menu.actions.prevPane", default: "CmdOrCtrl+[" },
  { action: "next-pane", labelKey: "menu.actions.nextPane", default: "CmdOrCtrl+]" },
  { action: "pane-left", labelKey: "menu.actions.paneLeft", default: "CmdOrCtrl+Alt+Left" },
  { action: "pane-right", labelKey: "menu.actions.paneRight", default: "CmdOrCtrl+Alt+Right" },
  { action: "pane-up", labelKey: "menu.actions.paneUp", default: "CmdOrCtrl+Alt+Up" },
  { action: "pane-down", labelKey: "menu.actions.paneDown", default: "CmdOrCtrl+Alt+Down" },
  { action: "toggle-maximize-pane", labelKey: "menu.actions.maximizePane", default: "Shift+CmdOrCtrl+Enter" },
  { action: "toggle-broadcast", labelKey: "menu.actions.broadcastInput", default: "" },
  { action: "toggle-expose", labelKey: "menu.actions.exposePanes", default: "Shift+CmdOrCtrl+E" },
  { action: "rename-tab", labelKey: "menu.actions.renameTab", default: "CmdOrCtrl+I" },
  { action: "toggle-tab-lock", labelKey: "menu.actions.toggleTabLock", default: "" },
  { action: "recent-commands", labelKey: "menu.actions.recentCommands", default: "CmdOrCtrl+;" },
  { action: "semantic-history", labelKey: "menu.actions.semanticHistory", default: "CmdOrCtrl+Alt+;" },
  { action: "instant-replay", labelKey: "menu.actions.instantReplay", default: "CmdOrCtrl+Alt+B" },
  { action: "tmux-attach", labelKey: "menu.actions.tmuxAttach", default: "" },
  { action: "cycle-tab-prev", labelKey: "menu.actions.prevTab", default: "Shift+CmdOrCtrl+[" },
  { action: "cycle-tab-next", labelKey: "menu.actions.nextTab", default: "Shift+CmdOrCtrl+]" },
  { action: "toggle-vertical-tabs", labelKey: "menu.actions.toggleVerticalTabs", default: "Shift+CmdOrCtrl+B" },
  { action: "open-search", labelKey: "menu.actions.search", default: "CmdOrCtrl+F" },
  { action: "open-settings", labelKey: "menu.actions.settings", default: "CmdOrCtrl+," },
  { action: "prev-mark", labelKey: "menu.actions.prevPrompt", default: "CmdOrCtrl+Up" },
  { action: "next-mark", labelKey: "menu.actions.nextPrompt", default: "CmdOrCtrl+Down" },
  { action: "copy-last-output", labelKey: "menu.actions.copyLastOutput", default: "" },
  { action: "clear-buffer", labelKey: "menu.actions.clearBuffer", default: "" },
  { action: "copy-mode", labelKey: "menu.actions.copyMode", default: "Shift+CmdOrCtrl+C" },
  { action: "search-again", labelKey: "menu.actions.searchNext", default: "CmdOrCtrl+G" },
  { action: "zoom-in", labelKey: "menu.actions.biggerText", default: "CmdOrCtrl+=" },
  { action: "zoom-out", labelKey: "menu.actions.smallerText", default: "CmdOrCtrl+-" },
  { action: "zoom-reset", labelKey: "menu.actions.resetTextSize", default: "CmdOrCtrl+0" },
];

export const defaultKeybindings: Record<string, string> = Object.fromEntries(
  KEYBINDING_ACTIONS.filter((a) => a.default).map((a) => [a.action, a.default]),
);

/** Minimal event surface needed for binding (DOM KeyboardEvent satisfies it). */
export interface BindableKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Normalize a keyboard event into an accelerator string, or null when the
 * key is not a bindable combo (bare modifier / plain typing). The platform
 * parameter selects Cmd (mac) vs Ctrl; tests pass it explicitly. */
export function eventToAccelerator(e: BindableKeyEvent, mac = isMacPlatform): string | null {
  const key = e.key;
  // Normalize the main modifier: Cmd on macOS, Ctrl elsewhere.
  const primary = mac ? e.metaKey : e.ctrlKey;
  if (!primary && !e.altKey) return null;
  const parts: string[] = [];
  if (primary) parts.push("CmdOrCtrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let main: string;
    if (key === "ArrowUp") main = "Up";
    else if (key === "ArrowDown") main = "Down";
    else if (key === "ArrowLeft") main = "Left";
    else if (key === "ArrowRight") main = "Right";
    else if (key === "Enter") main = "Enter";
    else if (key === ",") main = ",";
  else if (key.length === 1) main = key.toUpperCase();
  else if (/^F\d{1,2}$/.test(key)) main = key;
  else return null; // modifier-only or unsupported key
  parts.push(main);
  // Canonical order regardless of physical press order.
  const order = ["CmdOrCtrl", "Alt", "Shift"];
  parts.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  // Main key always last.
  return [...parts.filter((p) => p !== main), main].join("+");
}

/** Human display: CmdOrCtrl+Shift+B -> "⌘⇧B" on macOS, "Ctrl+Shift+B" else. */
export function acceleratorToDisplay(accelerator: string, mac = isMacPlatform): string {
  if (!accelerator) return "—";
  if (!mac) return accelerator.replaceAll("CmdOrCtrl", "Ctrl");
  return accelerator
    .split("+")
    .map((part) => {
      switch (part) {
        case "CmdOrCtrl":
          return "⌘";
        case "Alt":
          return "⌥";
        case "Shift":
          return "⇧";
        case "Up":
          return "↑";
        case "Down":
          return "↓";
        case "Left":
          return "←";
        case "Right":
          return "→";
        default:
          return part;
      }
    })
    .join("");
}

/** Map of accelerator -> actions holding it (entries with 2+ = conflict). */
export function findConflicts(
  keybindings: Record<string, string>,
): Map<string, string[]> {
  const byAcc = new Map<string, string[]>();
  for (const [action, acc] of Object.entries(keybindings)) {
    if (!acc) continue;
    const list = byAcc.get(acc) ?? [];
    list.push(action);
    byAcc.set(acc, list);
  }
  for (const [acc, actions] of byAcc) {
    if (actions.length === 1) byAcc.delete(acc);
  }
  return byAcc;
}

/** Reverse map for the shortcut handler: accelerator -> action. */
export function bindingLookup(
  keybindings: Record<string, string>,
): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [action, acc] of Object.entries(keybindings)) {
    if (acc) lookup.set(acc, action);
  }
  return lookup;
}
