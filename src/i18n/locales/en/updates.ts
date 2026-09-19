/**
 * Region: `updates` — the update dialog and the settings tab for updates.
 *
 * Rules for whoever owns this region:
 * - English pack is the reference: every key added here must exist in `zh-CN` too.
 * - Dynamic values use i18next interpolation (`{{version}}`), never string concat.
 * - Counted strings use i18next plural suffixes (`_one` / `_other`). Both forms are
 *   listed in both packs, so the two languages stay key-for-key identical even
 *   where a language needs only one of them (Chinese only reads `_other`).
 * - Version numbers, dates and package file names (.dmg / .msi / .AppImage) are
 *   never translated.
 */
export const updates = {
  /** Buttons shared by the update dialog and the Settings ▸ Updates tab. */
  actions: {
    checkForUpdates: "Check for Updates",
    downloadAndInstall: "Download and Install",
    skipVersion: "Skip This Version",
    restartNow: "Restart Now",
    later: "Later",
    continue: "Continue",
  },
  /** The in-app dialog shown for an available / downloading / installed update. */
  dialog: {
    ariaLabel: "Software update",
    available: {
      title: "CommandWave {{version}} is available",
      running: "You are running {{version}}",
      /** Same line plus the release date, used when the manifest carries one. */
      runningWithDate: "You are running {{version}} · released {{date}}",
    },
    installed: {
      title: "Update installed",
      body: "CommandWave {{version}} has been installed. Restart to start using it.",
    },
    confirm: {
      title: "Update to {{version}}?",
      /** Installing ends the running sessions; how many is interpolated. */
      body_one: "Updating will close {{count}} running session. Continue?",
      body_other: "Updating will close {{count}} running sessions. Continue?",
    },
    noNotes: "No release notes were provided.",
    progressAria: "Download progress",
    downloading: "Downloading…",
    percent: "{{percent}}%",
  },
  /** Settings ▸ Updates. */
  settings: {
    version: {
      title: "Version",
      current: "Current version",
    },
    /** The tab's main group: where updates come from and what a restart costs. */
    main: {
      title: "Updates",
      hint: "Updates are downloaded from GitHub releases and applied by restarting CommandWave. Running sessions end when you restart.",
    },
    checking: "Checking…",
    downloading: "Downloading…",
    downloadingWithPercent: "Downloading… {{percent}}%",
    available: "Version {{version}} is available.",
    released: "released {{date}}",
    starting: "Starting…",
    installed: "Update installed — restart to finish.",
    restarting: "Restarting…",
    upToDate: "You're up to date. Last checked {{when}}.",
    /** Relative "last checked" time shown under the check button. */
    checked: {
      justNow: "just now",
      /** Always plural in English: only reached from 10 seconds upwards. */
      seconds: "{{count}} seconds ago",
      minutes_one: "{{count}} minute ago",
      minutes_other: "{{count}} minutes ago",
    },
    auto: {
      title: "Automatic checks",
      label: "Check for updates automatically",
      hint: "Runs once shortly after launch. Failures stay silent — only a newer release that you have not skipped is announced.",
    },
    skipped: {
      title: "Skipped versions",
      empty: "No versions are skipped.",
      stopAria: "Stop skipping {{version}}",
      clearAll: "Clear all",
    },
  },
  /** Failures the updater reports; both the dialog and the tab show them. */
  errors: {
    check: "Could not check for updates.",
    unavailable: "Update checks are not available in this environment.",
    install: "The update could not be installed.",
  },
} as const;
