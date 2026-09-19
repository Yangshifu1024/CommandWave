/**
 * Language packs, grouped into regions so each work package owns exactly one
 * region (both languages of it) and never touches another package's file.
 *
 * `en` is the reference pack: `keys.test.ts` fails when a key exists in one
 * language but not the other, and i18next falls back to English at runtime for
 * anything a pack is missing.
 */

import { about as aboutEn } from "./en/about";
import { common as commonEn } from "./en/common";
import { dialogs as dialogsEn } from "./en/dialogs";
import { menu as menuEn } from "./en/menu";
import { settings as settingsEn } from "./en/settings";
import { terminal as terminalEn } from "./en/terminal";
import { updates as updatesEn } from "./en/updates";

import { about as aboutZh } from "./zh-CN/about";
import { common as commonZh } from "./zh-CN/common";
import { dialogs as dialogsZh } from "./zh-CN/dialogs";
import { menu as menuZh } from "./zh-CN/menu";
import { settings as settingsZh } from "./zh-CN/settings";
import { terminal as terminalZh } from "./zh-CN/terminal";
import { updates as updatesZh } from "./zh-CN/updates";

export const resources = {
  en: {
    translation: {
      about: aboutEn,
      common: commonEn,
      dialogs: dialogsEn,
      menu: menuEn,
      settings: settingsEn,
      terminal: terminalEn,
      updates: updatesEn,
    },
  },
  "zh-CN": {
    translation: {
      about: aboutZh,
      common: commonZh,
      dialogs: dialogsZh,
      menu: menuZh,
      settings: settingsZh,
      terminal: terminalZh,
      updates: updatesZh,
    },
  },
} as const;
