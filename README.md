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
- **Themes & profiles** — 16 built-in color schemes (8 dark + 8 light:
  Dracula, Catppuccin Latte, Solarized, Nord, Gruvbox, Ayu, …), live
  font/size/theme switching with UI chrome that adapts to light themes,
  persisted settings
- **In-terminal search** — <kbd>Cmd/Ctrl+F</kbd> with case sensitivity and
  regex modes, match highlights + overview ruler markers
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
<http://localhost:1420>) with a mock PTY, which is handy for layout work.

## Keyboard shortcuts

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

## Packaging

```bash
pnpm tauri build
```

Artifacts:

- macOS: `src-tauri/target/release/bundle/dmg/*.dmg` (ad-hoc signed; add a
  Developer ID certificate for distribution)
- Windows: `.../bundle/msi/*.msi` and `.../bundle/nsis/*-setup.exe`
- Linux: `.../bundle/deb/*.deb` and `.../bundle/appimage/*.AppImage`

App icons are generated from `scripts/app-icon.png` via `pnpm tauri icon`.

## Known limitations

- macOS builds are ad-hoc signed; Gatekeeper warns on other machines.
- Windows and Linux packages are configured but only buildable on their
  target platforms (see CI or the packaging section above).
