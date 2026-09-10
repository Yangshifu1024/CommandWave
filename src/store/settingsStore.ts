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

interface SettingsStore {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  /** Mutate a structuredClone of the settings, then persist. */
  update: (mutate: (draft: Settings) => void) => void;
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
}));
