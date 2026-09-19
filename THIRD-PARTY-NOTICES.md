# Third-party notices

CommandWave ships color schemes that originate in other projects. This file
records where each built-in theme comes from and the license it is used under,
so the provenance of the palette stays auditable instead of living in a
review thread.

- Values were read from the collection's **source** files
  (`schemes/*.itermcolors`) with CommandWave's own `parseItermColors`, then
  cross-checked against the collection's generated `windowsterminal/*.json`
  export. Where the two disagree the source file wins (see
  [Source/export divergences](#sourceexport-divergences)).
- Collection: [`mbadolato/iTerm2-Color-Schemes`](https://github.com/mbadolato/iTerm2-Color-Schemes)
  at commit `0b55a9e609daa0727be7d0d4705616dbe8d08fed`, pulled 2026-09-19.
  Its own license is MIT ("Copyright (c) 2011 to Present Mark Badolato") with
  the explicit caveat that *"the copyright/license for each individual theme
  belongs to the author of that theme"* — which is why every scheme below is
  traced to its upstream project rather than to the collection.
- `src/terminal/themes.test.ts` enforces this: every theme must carry a
  `credit`, and its `license` must be in the whitelist below. Adding a scheme
  without tracing it fails CI.

License whitelist: MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, CC0-1.0,
Unlicense, plus `original` for themes authored in this repository.

## Built-in themes

`group` is the `ThemeDef.group` field: `legacy` shipped before this audit,
`added` was introduced by it.

| Theme | Group | Upstream | License | Copyright line |
|---|---|---|---|---|
| CommandWave Dark | legacy | authored in this repository | original | — |
| Dracula | legacy | [dracula/dracula-theme](https://github.com/dracula/dracula-theme) | MIT | Copyright (c) 2023 Dracula Theme |
| Solarized Dark | legacy | [altercation/solarized](https://github.com/altercation/solarized) | MIT | Copyright (c) 2011 Ethan Schoonover |
| Snazzy | legacy | [sindresorhus/iterm2-snazzy](https://github.com/sindresorhus/iterm2-snazzy) | MIT | Copyright (c) Sindre Sorhus |
| Gruvbox Dark | legacy | [morhetz/gruvbox](https://github.com/morhetz/gruvbox) | MIT | Author: morhetz |
| GitHub Dark | legacy | [primer/github-vscode-theme](https://github.com/primer/github-vscode-theme) | MIT | Copyright (c) 2020 Primer |
| Solarized Light | legacy | [altercation/solarized](https://github.com/altercation/solarized) | MIT | Copyright (c) 2011 Ethan Schoonover |
| One Light | legacy | [atom/one-light-syntax](https://github.com/atom/one-light-syntax) | MIT | Copyright (c) 2016 GitHub Inc. |
| GitHub Light | legacy | [primer/github-vscode-theme](https://github.com/primer/github-vscode-theme) | MIT | Copyright (c) 2020 Primer |
| Catppuccin Latte | legacy | [catppuccin/catppuccin](https://github.com/catppuccin/catppuccin) | MIT | Copyright (c) 2021 Catppuccin |
| Ayu Light | legacy | [ayu-theme/ayu-colors](https://github.com/ayu-theme/ayu-colors) | MIT | Copyright (c) Konstantin Pschera |
| Gruvbox Light | legacy | [morhetz/gruvbox](https://github.com/morhetz/gruvbox) | MIT | Author: morhetz |
| Catppuccin Mocha | added | [catppuccin/catppuccin](https://github.com/catppuccin/catppuccin) | MIT | Copyright (c) 2021 Catppuccin |
| Catppuccin Frappe | added | [catppuccin/catppuccin](https://github.com/catppuccin/catppuccin) | MIT | Copyright (c) 2021 Catppuccin |
| Catppuccin Macchiato | added | [catppuccin/catppuccin](https://github.com/catppuccin/catppuccin) | MIT | Copyright (c) 2021 Catppuccin |
| Tokyo Night | added | [folke/tokyonight.nvim](https://github.com/folke/tokyonight.nvim) | Apache-2.0 | upstream LICENSE carries no named copyright holder |
| Rosé Pine | added | [rose-pine/rose-pine-theme](https://github.com/rose-pine/rose-pine-theme) | MIT | Copyright (c) 2023 Rosé Pine |
| Rosé Pine Moon | added | [rose-pine/rose-pine-theme](https://github.com/rose-pine/rose-pine-theme) | MIT | Copyright (c) 2023 Rosé Pine |
| Rosé Pine Dawn | added | [rose-pine/rose-pine-theme](https://github.com/rose-pine/rose-pine-theme) | MIT | Copyright (c) 2023 Rosé Pine |
| Kanagawa Wave | added | [rebelot/kanagawa.nvim](https://github.com/rebelot/kanagawa.nvim) | MIT | Copyright (c) 2021 Tommaso Laurenzi |
| Kanagawa Dragon | added | [rebelot/kanagawa.nvim](https://github.com/rebelot/kanagawa.nvim) | MIT | Copyright (c) 2021 Tommaso Laurenzi |
| Kanagawa Lotus | added | [rebelot/kanagawa.nvim](https://github.com/rebelot/kanagawa.nvim) | MIT | Copyright (c) 2021 Tommaso Laurenzi |
| Night Owl | added | [sdras/night-owl-vscode-theme](https://github.com/sdras/night-owl-vscode-theme) (iTerm port by zasdaym) | MIT | Copyright (c) 2018 Sarah Drasner |
| Light Owl | added | [sdras/night-owl-vscode-theme](https://github.com/sdras/night-owl-vscode-theme) (iTerm port by zasdaym) | MIT | Copyright (c) 2018 Sarah Drasner |
| One Dark | added | [atom/one-dark-syntax](https://github.com/atom/one-dark-syntax) | MIT | Copyright (c) 2016 GitHub Inc. |
| Iceberg Dark | added | [cocopon/iceberg.vim](https://github.com/cocopon/iceberg.vim) | MIT | Copyright (c) 2014 cocopon |
| Iceberg Light | added | [cocopon/iceberg.vim](https://github.com/cocopon/iceberg.vim) | MIT | Copyright (c) 2014 cocopon |
| Nightfox | added | [EdenEast/nightfox.nvim](https://github.com/EdenEast/nightfox.nvim) | MIT | Copyright (c) 2021 James Simpson |
| Nordfox | added | [EdenEast/nightfox.nvim](https://github.com/EdenEast/nightfox.nvim) | MIT | Copyright (c) 2021 James Simpson |
| Duskfox | added | [EdenEast/nightfox.nvim](https://github.com/EdenEast/nightfox.nvim) | MIT | Copyright (c) 2021 James Simpson |
| Terafox | added | [EdenEast/nightfox.nvim](https://github.com/EdenEast/nightfox.nvim) | MIT | Copyright (c) 2021 James Simpson |
| Dayfox | added | [EdenEast/nightfox.nvim](https://github.com/EdenEast/nightfox.nvim) | MIT | Copyright (c) 2021 James Simpson |
| Dawnfox | added | [EdenEast/nightfox.nvim](https://github.com/EdenEast/nightfox.nvim) | MIT | Copyright (c) 2021 James Simpson |
| Sonokai | added | [sainnhe/sonokai](https://github.com/sainnhe/sonokai) | MIT | Copyright (c) 2020 sainnhe |
| Tomorrow | added | [chriskempson/tomorrow-theme](https://github.com/chriskempson/tomorrow-theme) | MIT | Copyright (C) 2011 Chris Kempson |
| Tomorrow Night | added | [chriskempson/tomorrow-theme](https://github.com/chriskempson/tomorrow-theme) | MIT | Copyright (C) 2011 Chris Kempson |
| Doom One | added | [doomemacs/themes](https://github.com/doomemacs/themes) | MIT | Copyright (c) 2016-2026 Henrik Lissner |
| Ayu Mirage | added | [ayu-theme/ayu-colors](https://github.com/ayu-theme/ayu-colors) | MIT | Copyright (c) Konstantin Pschera |
| Gruvbox Material Dark | added | [sainnhe/gruvbox-material](https://github.com/sainnhe/gruvbox-material) | MIT | Copyright (c) 2020 sainnhe |
| Gruvbox Material Light | added | [sainnhe/gruvbox-material](https://github.com/sainnhe/gruvbox-material) | MIT | Copyright (c) 2020 sainnhe |
| One Half Light | added | [sonph/onehalf](https://github.com/sonph/onehalf) | MIT | Copyright (c) 2019 Son A. Pham |
| Selenized Light | added | [jan-warchol/selenized](https://github.com/jan-warchol/selenized) | MIT | Copyright (c) 2021 Jan Warchoł |

Notes on individual entries:

- **Gruvbox Dark / Gruvbox Light** — `morhetz/gruvbox` ships no `LICENSE`
  file; the license is declared in its README (`## License` → `MIT/X11`) and in
  `package.json` (`"license": "MIT"`). Recorded as MIT on that basis.
- **One Dark / One Light** — the collection's file names are `Atom One Dark`
  and `Atom One Light`; both stem from GitHub's Atom syntax themes (MIT).
- **Tokyo Night** — the collection's file is `TokyoNight.itermcolors`. The
  VS Code theme of the same name could not be license-verified, so the scheme
  is credited to the upstream Nightfox author's nvim theme, which is the
  palette the collection's CREDITS.md names for it.
- **Night Owl / Light Owl** — designed by Sarah Drasner (MIT); the iTerm2
  conversions in the collection are credited to `zasdaym`.

## Names dropped in the licensing audit

Four themes that shipped before this audit are gone. Stored settings are
rewritten once on load (`migrateThemeName` in `src/terminal/themes.ts`):

| Dropped name | Why | New value for existing settings |
|---|---|---|
| `Nord` | `nordtheme/nord` is dual-licensed **Apache-2.0 + CC BY-SA 4.0**; the share-alike half is not on the whitelist and the LICENSE does not say which half covers the palette | `Nordfox` (same Nordic blue family) |
| `Dark Pastel` | provenance could not be established: no evidence of this name among iTerm2's built-in presets (`plists/ColorPresets.plist`) and no matching file in the collection; iTerm2 itself is GPL-2.0 (its README says GPLv3) with no separate statement for presets | default theme (`CommandWave Dark`) |
| `Tango Light` | same as above; the Tango palette's original license could not be verified (its home at tango.freedesktop.org is gone) | default theme (`CommandWave Dark`) |
| `Light Background` | same as above | default theme (`CommandWave Dark`) |

## Schemes considered and rejected

Recorded so nobody re-runs this research:

| Scheme | Reason |
|---|---|
| Zenburn | `jnurmine/Zenburn` has no license file and its README declares **GNU GPL** |
| Fairyfloss | `sailorhg/fairyfloss` ships no license file at all |
| Violet Dark / Violet Light | upstream (`ashfinal/vim-colors-violet`) ships no license file at all |
| 3024 Day | upstream could not be located: the collection credits a GitHub account with no repository, and the base16 repositories hosting that palette are gone |
| Nord / Nord Light | see the dropped-names table above (CC BY-SA 4.0) |
| Atelier Sulphurpool | MIT only declared in the upstream README, no `LICENSE` file |
| GitHub Dark Default / GitHub Light Default | MIT (primer) but near-duplicates of the already-shipped GitHub Dark / GitHub Light |
| Everforest (all variants), PaperColor Light | not present in the collection under any spelling, and neither upstream ships a machine-convertible 16-color palette (only vim highlight definitions), so importing them would mean hand-mapping colors |
| Monokai Pro, Dracula Pro, Material Theme (post-2021) | commercial or re-licensed; not eligible |

## Source/export divergences

For eleven slots, the collection's generated Windows Terminal export disagrees
with its own `.itermcolors` source. The source wins here. A spot check against
`chriskempson/tomorrow-theme` confirmed the source side: its upstream
`.itermcolors` has the same `#000000` bright-black that the source file has,
while the generated export normalizes it to `#4c4c4c`.

| Theme | Slot | `schemes/*.itermcolors` (used) | `windowsterminal/*.json` |
|---|---|---|---|
| Nordfox | brightBlack | `#465780` | `#53648d` |
| Duskfox | brightBlack | `#47407d` | `#544d8a` |
| Tomorrow Night | brightBlack | `#000000` | `#4c4c4c` |
| Doom One | brightBlack | `#000000` | `#595959` |
| One Half Light | white | `#fafafa` | `#bababa` |
| One Half Light | brightYellow | `#e5c07b` | `#d8b36e` |
| One Half Light | cursor | `#bfceff` | `#a5b4e5` |
| Light Owl | white | `#f0f0f0` | `#bdbdbd` |
| Dayfox | white | `#f2e9e1` | `#bfb6ae` |
| Dawnfox | white | `#e5e9f0` | `#b2b6bd` |
| Tomorrow | white | `#ffffff` | `#bfbfbf` |

## Re-running the audit

```bash
# 1. Pull the collection and pin the commit recorded above.
git ls-remote https://github.com/mbadolato/iTerm2-Color-Schemes master

# 2. Every built-in theme must still carry a whitelisted credit.
pnpm test -- src/terminal/themes.test.ts

# 3. Compare the two layers for any scheme you touch (source is authoritative).
#    CommandWave's own parser handles both the Alpha Component / Color Space
#    keys real iTerm2 exports contain and the older three-key layout.
```
