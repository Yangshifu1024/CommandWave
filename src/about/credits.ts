/**
 * Static third-party credit list rendered by the About dialog.
 *
 * This list is maintained by hand on purpose: the About window has to work
 * offline, and the license of every entry is recorded here after being read
 * from the package itself — never guessed at build time.
 *
 * **When a dependency is added or removed, update this file too:**
 * - a new entry in `dependencies` of `package.json`   → add it to the
 *   "Frontend" block below;
 * - a new entry in `[dependencies]` / `[build-dependencies]` of
 *   `src-tauri/Cargo.toml`                            → add it to the "Rust"
 *   block below;
 * - a new built-in color scheme                        → add its upstream
 *   project to the "Color schemes" block and to `THIRD-PARTY-NOTICES.md`.
 *
 * Conventions used here:
 * - Versions of the JavaScript packages are the versions actually resolved in
 *   `node_modules` (the ranges they satisfy live in `package.json`); the Rust
 *   versions are copied from `src-tauri/Cargo.toml`.
 * - Dual-licensed packages are spelled `MIT OR Apache-2.0` in both directions,
 *   so the column reads consistently in the dialog.
 * - Color-scheme upstreams are not versioned; they carry `—` as their version.
 * - `url` is the canonical upstream home, kept for later verification. The
 *   dialog itself only shows name + version + license.
 */

/** One row of the About dialog's third-party list. */
export interface CreditEntry {
  /** Package / project name, shown untranslated. */
  name: string;
  /** Version it is bundled at, or `—` when the upstream is not versioned. */
  version: string;
  /** License identifier(s) as declared by the upstream. */
  license: string;
  /** Canonical upstream home (not shown in the dialog). */
  url?: string;
}

/** Everything third-party that ships inside CommandWave. */
export const credits: readonly CreditEntry[] = [
  // ---- Frontend direct dependencies (package.json → dependencies) ----
  {
    name: "@choochmeque/tauri-plugin-notifications-api",
    version: "0.5.0-rc.13",
    license: "MIT",
    url: "https://www.npmjs.com/package/@choochmeque/tauri-plugin-notifications-api",
  },
  {
    name: "@tauri-apps/api",
    version: "2.11.1",
    license: "MIT OR Apache-2.0",
    url: "https://www.npmjs.com/package/@tauri-apps/api",
  },
  {
    name: "@tauri-apps/plugin-clipboard-manager",
    version: "2.3.3",
    license: "MIT OR Apache-2.0",
    url: "https://www.npmjs.com/package/@tauri-apps/plugin-clipboard-manager",
  },
  {
    name: "@tauri-apps/plugin-opener",
    version: "2.5.5",
    license: "MIT OR Apache-2.0",
    url: "https://www.npmjs.com/package/@tauri-apps/plugin-opener",
  },
  {
    name: "@tauri-apps/plugin-updater",
    version: "2.11.0",
    license: "MIT OR Apache-2.0",
    url: "https://www.npmjs.com/package/@tauri-apps/plugin-updater",
  },
  {
    name: "@xterm/addon-fit",
    version: "0.11.0",
    license: "MIT",
    url: "https://www.npmjs.com/package/@xterm/addon-fit",
  },
  {
    name: "@xterm/addon-search",
    version: "0.16.0",
    license: "MIT",
    url: "https://www.npmjs.com/package/@xterm/addon-search",
  },
  {
    name: "@xterm/addon-web-links",
    version: "0.12.0",
    license: "MIT",
    url: "https://www.npmjs.com/package/@xterm/addon-web-links",
  },
  {
    name: "@xterm/addon-webgl",
    version: "0.19.0",
    license: "MIT",
    url: "https://www.npmjs.com/package/@xterm/addon-webgl",
  },
  {
    name: "@xterm/xterm",
    version: "6.0.0",
    license: "MIT",
    url: "https://www.npmjs.com/package/@xterm/xterm",
  },
  {
    name: "i18next",
    version: "26.4.2",
    license: "MIT",
    url: "https://www.npmjs.com/package/i18next",
  },
  {
    name: "react",
    version: "19.3.0",
    license: "MIT",
    url: "https://www.npmjs.com/package/react",
  },
  {
    name: "react-dom",
    version: "19.3.0",
    license: "MIT",
    url: "https://www.npmjs.com/package/react-dom",
  },
  {
    name: "react-i18next",
    version: "17.0.14",
    license: "MIT",
    url: "https://www.npmjs.com/package/react-i18next",
  },
  {
    name: "zustand",
    version: "5.0.15",
    license: "MIT",
    url: "https://www.npmjs.com/package/zustand",
  },

  // ---- Rust direct dependencies (src-tauri/Cargo.toml) ----
  {
    name: "anyhow",
    version: "1",
    license: "MIT OR Apache-2.0",
    url: "https://crates.io/crates/anyhow",
  },
  {
    name: "portable-pty",
    version: "0.9",
    license: "MIT",
    url: "https://crates.io/crates/portable-pty",
  },
  {
    name: "serde",
    version: "1",
    license: "MIT OR Apache-2.0",
    url: "https://crates.io/crates/serde",
  },
  {
    name: "serde_json",
    version: "1",
    license: "MIT OR Apache-2.0",
    url: "https://crates.io/crates/serde_json",
  },
  {
    name: "sys-locale",
    version: "0.3",
    license: "MIT OR Apache-2.0",
    url: "https://crates.io/crates/sys-locale",
  },
  {
    name: "tauri",
    version: "2",
    license: "MIT OR Apache-2.0",
    url: "https://crates.io/crates/tauri",
  },
  {
    name: "tauri-build",
    version: "2",
    license: "MIT OR Apache-2.0",
    url: "https://crates.io/crates/tauri-build",
  },
  {
    name: "tauri-plugin-clipboard-manager",
    version: "2",
    license: "MIT OR Apache-2.0",
    url: "https://crates.io/crates/tauri-plugin-clipboard-manager",
  },
  {
    name: "tauri-plugin-notifications",
    version: "0.5.0-rc.13",
    license: "MIT",
    url: "https://crates.io/crates/tauri-plugin-notifications",
  },
  {
    name: "tauri-plugin-opener",
    version: "2",
    license: "MIT OR Apache-2.0",
    url: "https://crates.io/crates/tauri-plugin-opener",
  },
  {
    name: "tauri-plugin-updater",
    version: "2",
    license: "MIT OR Apache-2.0",
    url: "https://crates.io/crates/tauri-plugin-updater",
  },
  {
    name: "toml_edit",
    version: "0.25",
    license: "MIT OR Apache-2.0",
    url: "https://crates.io/crates/toml_edit",
  },

  // ---- Upstream projects behind the built-in color schemes ----
  // Summarized per upstream project (not per theme): the full theme-by-theme
  // provenance table lives in THIRD-PARTY-NOTICES.md.
  {
    name: "iTerm2-Color-Schemes",
    version: "0b55a9e",
    license: "MIT",
    url: "https://github.com/mbadolato/iTerm2-Color-Schemes",
  },
  {
    name: "Dracula Theme",
    version: "—",
    license: "MIT",
    url: "https://github.com/dracula/dracula-theme",
  },
  {
    name: "Solarized",
    version: "—",
    license: "MIT",
    url: "https://github.com/altercation/solarized",
  },
  {
    name: "Snazzy",
    version: "—",
    license: "MIT",
    url: "https://github.com/sindresorhus/iterm2-snazzy",
  },
  {
    name: "Gruvbox",
    version: "—",
    license: "MIT",
    url: "https://github.com/morhetz/gruvbox",
  },
  {
    name: "Gruvbox Material",
    version: "—",
    license: "MIT",
    url: "https://github.com/sainnhe/gruvbox-material",
  },
  {
    name: "GitHub VS Code Theme",
    version: "—",
    license: "MIT",
    url: "https://github.com/primer/github-vscode-theme",
  },
  {
    name: "Atom One Light",
    version: "—",
    license: "MIT",
    url: "https://github.com/atom/one-light-syntax",
  },
  {
    name: "Atom One Dark",
    version: "—",
    license: "MIT",
    url: "https://github.com/atom/one-dark-syntax",
  },
  {
    name: "Catppuccin",
    version: "—",
    license: "MIT",
    url: "https://github.com/catppuccin/catppuccin",
  },
  {
    name: "Ayu",
    version: "—",
    license: "MIT",
    url: "https://github.com/ayu-theme/ayu-colors",
  },
  {
    name: "Tokyo Night",
    version: "—",
    license: "Apache-2.0",
    url: "https://github.com/folke/tokyonight.nvim",
  },
  {
    name: "Rosé Pine",
    version: "—",
    license: "MIT",
    url: "https://github.com/rose-pine/rose-pine-theme",
  },
  {
    name: "Kanagawa",
    version: "—",
    license: "MIT",
    url: "https://github.com/rebelot/kanagawa.nvim",
  },
  {
    name: "Night Owl",
    version: "—",
    license: "MIT",
    url: "https://github.com/sdras/night-owl-vscode-theme",
  },
  {
    name: "Iceberg",
    version: "—",
    license: "MIT",
    url: "https://github.com/cocopon/iceberg.vim",
  },
  {
    name: "Nightfox",
    version: "—",
    license: "MIT",
    url: "https://github.com/EdenEast/nightfox.nvim",
  },
  {
    name: "Sonokai",
    version: "—",
    license: "MIT",
    url: "https://github.com/sainnhe/sonokai",
  },
  {
    name: "Tomorrow Theme",
    version: "—",
    license: "MIT",
    url: "https://github.com/chriskempson/tomorrow-theme",
  },
  {
    name: "Doom Emacs Themes",
    version: "—",
    license: "MIT",
    url: "https://github.com/doomemacs/themes",
  },
  {
    name: "One Half",
    version: "—",
    license: "MIT",
    url: "https://github.com/sonph/onehalf",
  },
  {
    name: "Selenized",
    version: "—",
    license: "MIT",
    url: "https://github.com/jan-warchol/selenized",
  },
];
