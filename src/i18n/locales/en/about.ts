/**
 * Region: `about` — the About dialog.
 *
 * Rules for whoever owns this region:
 * - English pack is the reference: every key added here must exist in `zh-CN` too.
 * - Component, license and theme names (MIT, xterm.js, Tauri) stay untranslated.
 * - Dynamic values use i18next interpolation, never string concat.
 */
export const about = {
  version: "Version",
  buildTime: "Build time",
  license: "License",
  licenseNote:
    "CommandWave is released under the MIT license. The full text is in the LICENSE file at the root of the repository.",
  componentsHeading: "Third-party components",
  componentsHint: "Libraries and color schemes bundled with CommandWave.",
  repository: "Repository",
  issues: "Report an issue",
  checkUpdates: "Check for Updates",
  checking: "Checking…",
} as const;
