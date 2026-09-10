import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { isTauri } from "../terminal/ipc";

export interface Profile {
  id: string;
  name: string;
  shell: string | null;
  args: string[] | null;
  cwd: string | null;
  fontFamily: string | null;
  fontSize: number | null;
  themeName: string | null;
}

export interface UiSettings {
  tabBarPosition: "top" | "left";
  sidebarWidth: number;
}

export interface NotificationSettings {
  /** OS notification when a long command finishes while unfocused. */
  commandCompletion: boolean;
}

export interface Settings {
  version: number;
  profiles: Profile[];
  defaultProfileId: string;
  ui: UiSettings;
  notifications: NotificationSettings;
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
    },
  ],
  defaultProfileId: "default",
  ui: { tabBarPosition: "top", sidebarWidth: 180 },
  notifications: { commandCompletion: true },
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
}));
