/**
 * Makes translation keys type-checked: `t("menu.help.about")` compiles,
 * `t("menu.help.aboot")` does not.
 *
 * The English pack is the reference, so its keys are the allowed ones.
 */

import type { resources } from "./locales";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: (typeof resources)["en"];
  }
}
