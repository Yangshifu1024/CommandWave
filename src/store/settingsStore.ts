import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { isTauri } from "../terminal/ipc";
import { defaultKeybindings } from "../hooks/keybindings";

export interface UiSettings {
  tabBarPosition: "top" | "left";
  sidebarWidth: number;
  /** Font size delta applied on top of the configured size (⌘+/- zoom, reset with ⌘0). */
  fontSizeDelta: number;
  /** Restore the tab/pane layout from the previous run on launch. */
  restoreSessionOnStart: boolean;
  /** Inline autocomplete popup over the prompt. */
  autocomplete: boolean;
}

export interface NotificationSettings {
  /** OS notification when a long command finishes while unfocused. */
  commandCompletion: boolean;
  /** Confirm before pasting multi-line / large / destructive text. */
  pasteWarning: boolean;
}

/** iTerm2-style trigger: regex over printed lines firing an action. */
export interface Trigger {
  id: string;
  regex: string;
  caseSensitive: boolean;
  /** highlight | notify | sound | send-text */
  action: "highlight" | "notify" | "sound" | "send-text";
  /** color (highlight) | message (notify) | text (send-text) */
  param: string | null;
  enabled: boolean;
}

/** Auto answer: regex over printed lines that gets an instant reply. */
export interface AutoAnswer {
  pattern: string;
  reply: string;
  enabled: boolean;
}

export interface AutoLogSettings {
  /** Tee all PTY output of new sessions to log files. */
  enabled: boolean;
  /** Directory for logs; null = app log dir. */
  directory: string | null;
}

export interface Settings {
  version: number;
  // Shell / session (null = built-in default).
  /** Shell command; null = system default. */
  shell: string | null;
  args: string[] | null;
  /** Working directory for new terminals; null = home. */
  cwd: string | null;
  /** Scrollback buffer (lines). */
  scrollback: number | null;
  /** Overlay text, supports {cwd} and {duration} placeholders. */
  badge: string | null;
  /** Extra environment variables ("KEY=VALUE"). */
  env: string[] | null;
  /** Auto-init the starship prompt (zsh). */
  useStarship: boolean | null;
  // Appearance (null = built-in default).
  fontFamily: string | null;
  fontSize: number | null;
  themeName: string | null;
  /** cursor style: block | bar | underline */
  cursorStyle: "block" | "bar" | "underline" | null;
  cursorBlink: boolean | null;
  /** 1.0 = default; multiplies the font's cell height */
  lineHeight: number | null;
  letterSpacing: number | null;
  /** per-slot color overrides layered onto the theme */
  customColors: Record<string, string> | null;
  /** 0–1; <1 makes the terminal background translucent */
  backgroundOpacity: number | null;
  /** image URL/path rendered behind the terminal */
  backgroundImage: string | null;
  /** background image layer opacity (0–1) */
  backgroundImageOpacity: number | null;
  ui: UiSettings;
  notifications: NotificationSettings;
  triggers: Trigger[];
  autoAnswers: AutoAnswer[];
  autoLog: AutoLogSettings;
  /** Saved window arrangements: name → serialized session snapshot JSON. */
  arrangements: Record<string, string>;
  /** Last session snapshot (autosaved) for restore-on-launch. */
  session: string | null;
  /** Editor command for ⌘/Ctrl-click file links, e.g. "code {file}". */
  editorCommand: string | null;
  /** actionId -> Tauri accelerator ("" = no binding). */
  keybindings: Record<string, string>;
}

export const defaultSettings: Settings = {
  version: 1,
  shell: null,
  args: null,
  cwd: null,
  scrollback: null,
  badge: null,
  env: null,
  useStarship: null,
  fontFamily: null,
  fontSize: null,
  themeName: null,
  cursorStyle: null,
  cursorBlink: null,
  lineHeight: null,
  letterSpacing: null,
  customColors: null,
  backgroundOpacity: null,
  backgroundImage: null,
  backgroundImageOpacity: null,
  ui: { tabBarPosition: "top", sidebarWidth: 180, fontSizeDelta: 0, restoreSessionOnStart: true, autocomplete: true },
  notifications: { commandCompletion: true, pasteWarning: true },
  triggers: [
    {
      id: "trigger-password",
      regex: "(password|passphrase)\\s*[:：]\\s*$",
      caseSensitive: false,
      action: "notify",
      param: "Password prompt detected",
      enabled: true,
    },
  ],
  autoAnswers: [],
  autoLog: { enabled: false, directory: null },
  arrangements: {},
  session: null,
  editorCommand: null,
  keybindings: defaultKeybindings,
};

export const appearanceDefaults = {
  fontFamily:
    '"SF Mono", Menlo, Monaco, "Cascadia Code", Consolas, "Liberation Mono", monospace',
  fontSize: 13,
  themeName: "CommandWave Dark",
};

export const scrollbackLines = 10000;

interface SettingsStore {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  /** Mutate a structuredClone of the settings, then persist. */
  update: (mutate: (draft: Settings) => void) => void;
  /** Bind an action to an accelerator ("" unbinds); syncs the native menu. */
  setKeybinding: (action: string, accelerator: string) => void;
  resetKeybindings: () => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: defaultSettings,
  loaded: false,

  load: async () => {
    if (!isTauri) {
      set({ loaded: true });
      return;
    }
    try {
      const loaded = await invoke<Partial<Settings>>("settings_load");
      set({
        settings: {
          ...defaultSettings,
          ...loaded,
          ui: { ...defaultSettings.ui, ...loaded.ui },
          notifications: { ...defaultSettings.notifications, ...loaded.notifications },
          autoLog: { ...defaultSettings.autoLog, ...loaded.autoLog },
          triggers: loaded.triggers ?? defaultSettings.triggers,
          autoAnswers: loaded.autoAnswers ?? defaultSettings.autoAnswers,
          keybindings: { ...defaultSettings.keybindings, ...loaded.keybindings },
        },
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  update: (mutate) => {
    const next = structuredClone(get().settings);
    mutate(next);
    set({ settings: next });
    if (isTauri) {
      invoke("settings_save", { newSettings: next }).catch(() => {});
    }
  },

  setKeybinding: (action, accelerator) => {
    get().update((draft) => {
      draft.keybindings[action] = accelerator;
    });
    syncNativeMenu(get().settings.keybindings);
  },

  resetKeybindings: () => {
    get().update((draft) => {
      draft.keybindings = { ...defaultKeybindings };
    });
    syncNativeMenu(get().settings.keybindings);
  },
}));

import { rebuildNativeMenu } from "../terminal/ipc";

let menuSyncTimer: ReturnType<typeof setTimeout> | undefined;
/** Debounced native-menu rebuild so recording keystrokes doesn't thrash it. */
function syncNativeMenu(keybindings: Record<string, string>): void {
  if (!isTauri) return;
  clearTimeout(menuSyncTimer);
  menuSyncTimer = setTimeout(() => {
    rebuildNativeMenu(keybindings).catch(() => {});
  }, 150);
}
