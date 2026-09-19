import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { isTauri } from "../terminal/ipc";
import { migrateThemeName, themes } from "../terminal/themes";
import { defaultKeybindings } from "../hooks/keybindings";
import { applyLocale, normalizeLanguageSetting, type LanguageSetting } from "../i18n";

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

/** Per-event toggles for the three agent lifecycle events. */
export interface EventNotificationSettings {
  /** Agent is waiting on the user to confirm / answer. */
  needsConfirmation: boolean;
  /** Agent finished a turn, or its command exited cleanly. */
  finished: boolean;
  /** Agent (or the command it ran) failed. */
  error: boolean;
}

/** Tier-3 install state for one agent integration. */
export interface IntegrationState {
  enabled: boolean;
  installed: boolean;
}

export interface NotificationSettings {
  /** Confirm before pasting multi-line / large / destructive text. */
  pasteWarning: boolean;
  /** Per-event agent / command notification toggles. */
  events: EventNotificationSettings;
  /** Flash the taskbar / Dock when an agent needs the user. */
  taskbarAttention: boolean;
  /** Parse OSC 0/2 window titles to infer agent state (Tier 1). */
  titleDetection: boolean;
  /** Output-idle threshold (ms) for the tier-0 heuristic. */
  idleThresholdMs: number;
  /** Extra regexes treated as agent errors (Tier 1). */
  errorPatterns: string[];
  /** agent id -> Tier-3 install state. */
  integrations: Record<string, IntegrationState>;
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

/** In-app updater preferences (see src/updater). */
export interface UpdateSettings {
  /** Silently check for a new release a few seconds after launch. */
  autoCheck: boolean;
  /** Versions the user explicitly skipped; they never prompt again. */
  skippedVersions: string[];
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
  updates: UpdateSettings;
  /** Saved window arrangements: name → serialized session snapshot JSON. */
  arrangements: Record<string, string>;
  /** Last session snapshot (autosaved) for restore-on-launch. */
  session: string | null;
  /** Editor command for ⌘/Ctrl-click file links, e.g. "code {file}". */
  editorCommand: string | null;
  /** actionId -> Tauri accelerator ("" = no binding). */
  keybindings: Record<string, string>;
  /** UI language: "system" (follow the OS), "en" or "zh-CN". */
  language: LanguageSetting;
}

export const defaultSettings: Settings = {
  version: 1,
  shell: null,
  args: null,
  cwd: null,
  scrollback: null,
  badge: null,
  env: null,
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
  notifications: {
    pasteWarning: true,
    events: { needsConfirmation: true, finished: true, error: true },
    taskbarAttention: true,
    titleDetection: true,
    idleThresholdMs: 5000,
    errorPatterns: [
      "rate limit",
      "overloaded",
      "api error",
      "authentication failed",
      "context length",
      "quota exceeded",
      "connection error",
    ],
    integrations: {},
  },
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
  updates: { autoCheck: true, skippedVersions: [] },
  arrangements: {},
  session: null,
  editorCommand: null,
  keybindings: defaultKeybindings,
  language: "system",
};

export const appearanceDefaults = {
  fontFamily:
    '"SF Mono", Menlo, Monaco, "Cascadia Code", Consolas, "Liberation Mono", monospace',
  fontSize: 13,
  // Derived from the table, not a lookalike literal: `getTheme`, `isDarkTheme`
  // and `migrateThemeName` all fall back to `themes[0]`, so the default has to
  // follow the table when its first entry changes.
  themeName: themes[0].name,
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
      const settings: Settings = {
        ...defaultSettings,
        ...loaded,
        ui: { ...defaultSettings.ui, ...loaded.ui },
        notifications: {
          ...defaultSettings.notifications,
          ...loaded.notifications,
          events: {
            ...defaultSettings.notifications.events,
            ...loaded.notifications?.events,
          },
          integrations: {
            ...defaultSettings.notifications.integrations,
            ...loaded.notifications?.integrations,
          },
        },
        autoLog: { ...defaultSettings.autoLog, ...loaded.autoLog },
        updates: {
          ...defaultSettings.updates,
          ...loaded.updates,
          skippedVersions:
            loaded.updates?.skippedVersions ??
            defaultSettings.updates.skippedVersions,
        },
        triggers: loaded.triggers ?? defaultSettings.triggers,
        autoAnswers: loaded.autoAnswers ?? defaultSettings.autoAnswers,
        keybindings: { ...defaultSettings.keybindings, ...loaded.keybindings },
        // An unknown or missing value means "follow the system".
        language: normalizeLanguageSetting(loaded.language),
      };
      // Themes dropped in the licensing audit: rewrite the stored name once
      // (Nord -> Nordfox; anything else unknown -> the default) so a returning
      // user never silently keeps a theme that no longer exists. The mapping
      // lives next to the theme table; provenance is in THIRD-PARTY-NOTICES.md.
      const migratedTheme = migrateThemeName(settings.themeName);
      if (migratedTheme) {
        settings.themeName = migratedTheme;
        invoke("settings_save", { newSettings: settings }).catch(() => {});
      }
      set({ settings, loaded: true });
      // The stored language may differ from the system one shown at first paint.
      void applyLocale(settings.language);
    } catch {
      set({ loaded: true });
    }
  },

  update: (mutate) => {
    const previousLanguage = get().settings.language;
    const next = structuredClone(get().settings);
    mutate(next);
    set({ settings: next });
    if (isTauri) {
      invoke("settings_save", { newSettings: next }).catch(() => {});
    }
    if (next.language !== previousLanguage) {
      void applyLocale(next.language);
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
