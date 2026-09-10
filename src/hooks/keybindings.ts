/**
 * Keybinding model: actions are bound to Tauri-style accelerators
 * ("CmdOrCtrl+Shift+B"), persisted in settings, and rendered into both the
 * webview shortcut handler and the native macOS menu.
 */

const isMacPlatform =
  typeof navigator !== "undefined" &&
  /Mac/i.test(navigator.platform ?? navigator.userAgent ?? "");

/** All customizable actions with their default accelerators and labels. */
export const KEYBINDING_ACTIONS: {
  action: string;
  label: string;
  default: string;
}[] = [
  { action: "new-tab", label: "New Tab", default: "CmdOrCtrl+T" },
  { action: "close-pane", label: "Close Pane", default: "CmdOrCtrl+W" },
  { action: "close-tab", label: "Close Tab", default: "Shift+CmdOrCtrl+W" },
  { action: "split-right", label: "Split Pane Right", default: "CmdOrCtrl+D" },
  { action: "split-down", label: "Split Pane Down", default: "Shift+CmdOrCtrl+D" },
  { action: "prev-pane", label: "Previous Pane", default: "CmdOrCtrl+[" },
  { action: "next-pane", label: "Next Pane", default: "CmdOrCtrl+]" },
  { action: "pane-left", label: "Select Pane Left", default: "CmdOrCtrl+Alt+Left" },
  { action: "pane-right", label: "Select Pane Right", default: "CmdOrCtrl+Alt+Right" },
  { action: "pane-up", label: "Select Pane Up", default: "CmdOrCtrl+Alt+Up" },
  { action: "pane-down", label: "Select Pane Down", default: "CmdOrCtrl+Alt+Down" },
  { action: "toggle-maximize-pane", label: "Maximize Pane", default: "Shift+CmdOrCtrl+Enter" },
  { action: "toggle-broadcast", label: "Broadcast Input", default: "" },
  { action: "toggle-expose", label: "Exposé All Panes", default: "Shift+CmdOrCtrl+E" },
  { action: "rename-tab", label: "Rename Tab", default: "CmdOrCtrl+I" },
  { action: "toggle-tab-lock", label: "Lock / Unlock Tab", default: "" },
  { action: "recent-commands", label: "Recent Commands", default: "CmdOrCtrl+;" },
  { action: "semantic-history", label: "Semantic History Search", default: "CmdOrCtrl+Alt+;" },
  { action: "cycle-tab-prev", label: "Previous Tab", default: "Shift+CmdOrCtrl+[" },
  { action: "cycle-tab-next", label: "Next Tab", default: "Shift+CmdOrCtrl+]" },
  { action: "toggle-vertical-tabs", label: "Toggle Vertical Tabs", default: "Shift+CmdOrCtrl+B" },
  { action: "open-search", label: "Search", default: "CmdOrCtrl+F" },
  { action: "open-settings", label: "Settings", default: "CmdOrCtrl+," },
  { action: "prev-mark", label: "Previous Prompt", default: "CmdOrCtrl+Up" },
  { action: "next-mark", label: "Next Prompt", default: "CmdOrCtrl+Down" },
  { action: "copy-last-output", label: "Copy Last Output", default: "" },
  { action: "clear-buffer", label: "Clear Buffer", default: "" },
  { action: "copy-mode", label: "Copy Mode", default: "Shift+CmdOrCtrl+C" },
  { action: "search-again", label: "Search Next Match", default: "CmdOrCtrl+G" },
  { action: "zoom-in", label: "Bigger Text", default: "CmdOrCtrl+=" },
  { action: "zoom-out", label: "Smaller Text", default: "CmdOrCtrl+-" },
  { action: "zoom-reset", label: "Reset Text Size", default: "CmdOrCtrl+0" },
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
