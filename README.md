# CommandWave

A cross-platform terminal emulator inspired by iTerm2, built with Tauri 2 +
Rust + xterm.js. Runs on **macOS, Windows, and Linux**.

![platforms](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)

## Features (MVP)

- **Tabs** — horizontal strip or **vertical sidebar** (iTerm2-style, toggle
  with <kbd>Cmd/Ctrl+Shift+B</kbd>, the View menu, or the sidebar button),
  drag to reorder, resizable sidebar
- **Native menu bar** — full command menu (Shell / View / Window) with
  standard macOS accelerators; settings also live at `CommandWave → Settings…`
- **Visible controls** — sidebar-layout toggle and settings gear sit right in
  the tab bar
- **Split panes** — side-by-side or stacked, arbitrarily nested, draggable
  dividers, per-pane focus highlight
- **Themes & appearance** — 16 built-in color schemes (8 dark + 8 light:
  Dracula, Catppuccin Latte, Solarized, Nord, Gruvbox, Ayu, …), live
  font/size/theme switching with UI chrome that adapts to light themes,
  persisted settings, and light/dark reporting (DECSET 2031 + `CSI ? 996/997`)
  so a running TUI (opencode, neovim, …) repaints the moment you flip themes
- **In-terminal search** — <kbd>Cmd/Ctrl+F</kbd> with case sensitivity and
  regex modes, match highlights + overview ruler markers
- **Prompt marks (OSC 133)** — jump between shell prompts with
  <kbd>Cmd/Ctrl+↑/↓</kbd>, failed commands get a red highlight on their
  prompt line, and *Copy Last Output* grabs exactly the previous command's
  output
- **Command notifications** — when a command that ran ≥ 2s finishes while
  the window is unfocused, an OS notification fires (toggleable)
- **Right-click menus** — panes (copy/paste/search/split/close…) and tabs
  (new/close), with the webview's native menu suppressed
- **Tabbed settings** — one tab per area (Terminal, Appearance, Keyboard,
  Session, Automation, Integrations, Secrets); changes apply immediately
- **Customizable shortcuts** — rebinding via click-to-record in Settings
  (with conflict detection); the native macOS menu and the Windows/Linux
  title-bar menu sync automatically
- **GPU rendering** — WebGL renderer with automatic fallback
- **Clickable links** — open with the system browser via the opener plugin
- Shell exit detection with per-pane exit codes (clean exits close panes)

## Architecture

```
┌──────────────────────────── Webview (React 19 + TS) ┐
│  TabStrip (top / left)   SplitTree (pane tree)      │
│  TerminalPane ─ xterm.js 6 (+ WebGL / search /      │
│                            web-links addons)        │
│  appStore (zustand) ─ tabs · panes · UI state       │
└──────────────┬──────────────────▲──────────────────┘
   invoke (input/resize/close)   Channel<Vec<u8>> raw bytes (output)
┌──────────────▼──────────────────┴──────────────────┐
│                Rust core (Tauri 2)                  │
│  pty.rs ─ portable-pty sessions (ConPTY on Windows, │
│           openpty on Unix), 8ms-batched forwarding  │
│  settings.rs ─ settings.json persistence            │
└─────────────────────────────────────────────────────┘
```

Key design points:

- **One PTY per pane**, registered in a global `HashMap` on the Rust side.
  Output is forwarded on a per-session Tauri `Channel<Vec<u8>>` (raw bytes, no
  JSON/base64 overhead) from a dedicated reader thread; an 8 ms ticker flushes
  partial batches so interactive prompts appear instantly while heavy output
  streams efficiently.
- **Persistent xterm instances**: terminals are opened into an offscreen pool
  and re-parented into the visible layout, so tab switches preserve scrollback
  and keep sessions alive.
- **Pane layout is a tree** (`src/layout/paneTree.ts`) of panes and splits;
  all operations are pure functions covered by unit tests.

## Development

Prerequisites:

- [Rust](https://rustup.rs) (1.77+), Node.js 20+, pnpm
- Linux only: webkitgtk build deps, e.g. on Debian/Ubuntu:
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

```bash
pnpm install
pnpm tauri dev        # runs vite + cargo, opens the app window
pnpm test             # frontend unit tests (pane tree)
cargo test            # Rust tests (PTY core, settings) — run in src-tauri/
```

The frontend also runs in a plain browser (`pnpm dev` →
<http://localhost:8000>) with a mock PTY, which is handy for layout work.

## Keyboard shortcuts

All of these are customizable in **Settings → Keyboard** (defaults below).

| Action                          | macOS        | Windows / Linux |
| ------------------------------- | ------------ | --------------- |
| New tab                         | ⌘T           | Ctrl+T          |
| Close pane / tab                | ⌘W / ⇧⌘W     | Ctrl+W / Ctrl+⇧W |
| Split side-by-side              | ⌘D           | Ctrl+D          |
| Split stacked                   | ⇧⌘D          | Ctrl+⇧D         |
| Cycle panes                     | ⌘[ / ⌘]      | Ctrl+[ / Ctrl+] |
| Cycle tabs                      | ⇧⌘[ / ⇧⌘]    | Ctrl+Tab        |
| Tab by index                    | ⌘1…9         | Ctrl+1…9        |
| Toggle vertical/horizontal tabs | ⇧⌘B          | Ctrl+⇧B         |
| Search                          | ⌘F           | Ctrl+F          |
| Settings                        | ⌘,           | Ctrl+,          |
| Previous / next prompt          | ⌘↑ / ⌘↓      | Ctrl+↑ / Ctrl+↓ |

## Prompt

CommandWave leaves the shell's own prompt untouched: whatever starship,
oh-my-zsh, your `$PROFILE` or `.bashrc` draws is what you see, and your
keystrokes go straight from xterm.js to the shell's readline/zle — a classic
terminal, with no separate input card.

The features that need to know about prompts come from the shell integration
below (OSC 7/133): tab titles track the cwd, <kbd>Cmd/Ctrl+↑/↓</kbd> jump
between prompts, failed commands get a red marker on their prompt line, and
*Copy Last Output* grabs the previous command's output.

## Shell integration (tab titles track your cwd)

Tab titles show the current directory's last segment (`CommandWave`) and
update as you `cd`. This relies on the shell reporting its working directory
via OSC 7 (or ConEmu-style OSC 9;9).

**zsh, bash and PowerShell need no setup**: on spawn, CommandWave injects a
small integration automatically — VS Code-style `ZDOTDIR` chaining for zsh,
`PROMPT_COMMAND` + `PS0` for bash, and a `-NoExit -Command` wrapper around
`Prompt`/`PSConsoleHostReadLine` for PowerShell (no `$PROFILE` edits). The
shell's own prompt is never modified.

Emission is guarded on `TERM_PROGRAM == "CommandWave"`, so other terminals
and nested shells are unaffected, and shells outside the zsh/bash/PowerShell
family are never touched.

Fish needs a manual prompt hook (see the fish docs); if no cwd is reported,
titles fall back to the program-set window title, then the configured
starting directory. Manual equivalents for bash and zsh, for reference:

bash (add to `~/.bashrc`):

```bash
__cw_cwd() { printf '\e]7;file://%s%s\a' "$HOSTNAME" "$PWD"; }
PROMPT_COMMAND="__cw_cwd${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
```

zsh (add to `~/.zshrc`):

```zsh
__cw_cwd() { print -Pn "\e]7;file://%m$(pwd)\a" }
precmd_functions=(__cw_cwd $precmd_functions)
```

## Packaging

```bash
pnpm tauri build
```

Artifacts:

- macOS: `src-tauri/target/release/bundle/dmg/*.dmg`, plus the updater bundle
  `.../bundle/macos/*.app.tar.gz` and its `.sig`
- Windows: `.../bundle/msi/*.msi` and `.../bundle/nsis/*-setup.exe`, each with a
  `.sig` next to it
- Linux: `.../bundle/deb/*.deb` and `.../bundle/appimage/*.AppImage`, each with a
  `.sig` next to it

`bundle.createUpdaterArtifacts` is enabled, so a release build also signs the
updater bundles. Signing needs the private key, and the password variable has to
be *set* even when the key has no password — otherwise the bundler tries to
prompt and fails:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/commandwave-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
pnpm tauri build
```

App icons are generated from `scripts/app-icon.png` via
`pnpm tauri icon scripts/app-icon.png` (the CLI's default input is
`./app-icon.png` at the repo root, so the path has to be explicit).

The menu-bar/tray glyph is the same mark as the app icon: its geometry mirrors the
signed-distance primitives in `scripts/gen_icon.py`, and `cargo test` fails if the
two drift apart. It is drawn as a macOS template image, so the system recolours it
for a light or dark menu bar.

## Auto-update

CommandWave updates itself with the Tauri updater plugin. On launch, and on
demand from **Settings → Updates** or **Check for Updates…**, it fetches

```
https://github.com/Yangshifu1024/CommandWave/releases/latest/download/latest.json
```

and offers to download and install a newer version when the manifest advertises
one. Downloads are verified against the minisign public key in
`src-tauri/tauri.conf.json`, so a build is only installable when its artifacts
were signed with the matching private key (`TAURI_SIGNING_PRIVATE_KEY` — keep a
backup: losing it means existing installs can never be updated again).

`latest.json` is generated once per release by `scripts/updater-manifest.sh`,
after all three platform builds, and checked by the `verify-updater-manifest`
job: it must carry `darwin-aarch64`, `windows-x86_64` and `linux-x86_64` entries
whose inline signatures verify against those bundles.

Worth knowing:

- Releases are created as **drafts**. The updater reads `releases/latest`, so
  updates only reach users once a maintainer publishes the draft — and a release
  marked as a pre-release is skipped by `latest` entirely.
- Windows updates use the NSIS `-setup.exe`; an MSI install does not self-update.
- macOS builds are Apple Silicon only (`darwin-aarch64`).
- Versions below 0.3.0 ship no updater: install 0.3.0 once by hand from the
  releases page and later versions arrive on their own.

## Known limitations

- CI builds macOS with a Developer ID certificate and notarizes them; a local
  `pnpm tauri build` is only ad-hoc signed, so Gatekeeper warns on other
  machines.
- macOS builds are Apple Silicon only.
- Windows and Linux packages are configured but only buildable on their
  target platforms (see CI or the packaging section above).
- Light/dark reports only reach programs that run directly in a pane. A pane
  mirrored from tmux (control mode) leaves them to tmux itself.
- The theme is a persisted choice (`CommandWave Dark` by default), not an
  automatic "follow the system appearance" switch. Programs ask the terminal
  for its polarity, so pick a light theme to make light themes stick.
