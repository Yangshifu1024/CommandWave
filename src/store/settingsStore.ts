import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { isTauri } from "../terminal/ipc";
import { defaultKeybindings } from "../hooks/keybindings";

export interface Profile {
  id: string;
  name: string;
  shell: string | null;
  args: string[] | null;
  cwd: string | null;
  fontFamily: string | null;
  fontSize: number | null;
  themeName: string | null;
  /** cursor style: block | bar | underline */
  cursorStyle: "block" | "bar" | "underline" | null;
  cursorBlink: boolean | null;
  /** 1.0 = default; multiplies the font's cell height */
  lineHeight: number | null;
  letterSpacing: number | null;
  /** per-profile scrollback override (lines) */
  scrollback: number | null;
  /** overlay text, supports {cwd} and {profile} placeholders */
  badge: string | null;
  /** per-slot color overrides layered onto the theme */
  customColors: Record<string, string> | null;
  /** 0–1; <1 makes the terminal background translucent */
  backgroundOpacity: number | null;
  /** extra environment variables ("KEY=VALUE") */
  env: string[] | null;
}

export interface UiSettings {
  tabBarPosition: "top" | "left";
  sidebarWidth: number;
  /** Font size delta from the profile's size (⌘+/- zoom, reset with ⌘0). */
  fontSizeDelta: number;
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
  profiles: Profile[];
  defaultProfileId: string;
  ui: UiSettings;
  notifications: NotificationSettings;
  triggers: Trigger[];
  autoAnswers: AutoAnswer[];
  autoLog: AutoLogSettings;
  /** actionId -> Tauri accelerator ("" = no binding). */
  keybindings: Record<string, string>;
}

export const defaultSettings: Settings = {
  version: 1,
  profiles: [
    {
      id: "default",
      name: "Default",
      shell: null,
      args: null,
      cwd: null,
      fontFamily: null,
      fontSize: null,
      themeName: null,
      cursorStyle: null,
      cursorBlink: null,
      lineHeight: null,
      letterSpacing: null,
      scrollback: null,
      badge: null,
      customColors: null,
      backgroundOpacity: null,
      env: null,
    },
  ],
  defaultProfileId: "default",
  ui: { tabBarPosition: "top", sidebarWidth: 180, fontSizeDelta: 0 },
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
  keybindings: defaultKeybindings,
};

export interface Appearance {
  fontFamily: string;
  fontSize: number;
  themeName: string;
}

export const appearanceDefaults: Appearance = {
  fontFamily:
    '"SF Mono", Menlo, Monaco, "Cascadia Code", Consolas, "Liberation Mono", monospace',
  fontSize: 13,
  themeName: "CommandWave Dark",
};

export const scrollbackLines = 10000;

let profileSeq = 0;
function genProfileId(): string {
  return `profile-${Date.now().toString(36)}-${++profileSeq}`;
}

function blankProfile(base: Profile, name: string): Profile {
  return {
    id: genProfileId(),
    name,
    shell: base.shell,
    args: base.args ? [...base.args] : null,
    cwd: base.cwd,
    fontFamily: base.fontFamily,
    fontSize: base.fontSize,
    themeName: base.themeName,
    cursorStyle: base.cursorStyle,
    cursorBlink: base.cursorBlink,
    lineHeight: base.lineHeight,
    letterSpacing: base.letterSpacing,
    scrollback: base.scrollback,
    badge: base.badge,
    customColors: base.customColors ? { ...base.customColors } : null,
    backgroundOpacity: base.backgroundOpacity,
    env: base.env ? [...base.env] : null,
  };
}

interface SettingsStore {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  /** Mutate a structuredClone of the settings, then persist. */
  update: (mutate: (draft: Settings) => void) => void;
  addProfile: () => string;
  duplicateProfile: (profileId: string) => string;
  /** Returns false when refused (last profile, or unknown id). */
  deleteProfile: (profileId: string) => boolean;
  setDefaultProfile: (profileId: string) => void;
  renameProfile: (profileId: string, name: string) => void;
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

  addProfile: () => {
    let id = "";
    get().update((draft) => {
      const profile = blankProfile(
        draft.profiles.find((p) => p.id === draft.defaultProfileId) ?? draft.profiles[0],
        `Profile ${draft.profiles.length + 1}`,
      );
      id = profile.id;
      draft.profiles.push(profile);
    });
    return id;
  },

  duplicateProfile: (profileId) => {
    let id = "";
    get().update((draft) => {
      const source = draft.profiles.find((p) => p.id === profileId) ?? draft.profiles[0];
      const copy = blankProfile(source, `${source.name} copy`);
      id = copy.id;
      draft.profiles.push(copy);
    });
    return id;
  },

  deleteProfile: (profileId) => {
    const { settings } = get();
    if (settings.profiles.length <= 1) return false;
    if (!settings.profiles.some((p) => p.id === profileId)) return false;
    get().update((draft) => {
      draft.profiles = draft.profiles.filter((p) => p.id !== profileId);
      if (draft.defaultProfileId === profileId) {
        draft.defaultProfileId = draft.profiles[0].id;
      }
    });
    return true;
  },

  setDefaultProfile: (profileId) => {
    get().update((draft) => {
      if (draft.profiles.some((p) => p.id === profileId)) {
        draft.defaultProfileId = profileId;
      }
    });
  },

  renameProfile: (profileId, name) => {
    if (!name.trim()) return;
    get().update((draft) => {
      const profile = draft.profiles.find((p) => p.id === profileId);
      if (profile) profile.name = name.trim();
    });
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
