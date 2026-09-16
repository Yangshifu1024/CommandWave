//! System tray / menu-bar icon for agent attention.
//!
//! The icon is always present and shows the app icon's `>_` mark. On macOS it is
//! a template image, so the system recolours it for a light or dark menu bar;
//! elsewhere the glyph is inked for the panel it sits on (white on a dark
//! taskbar). When an agent needs the user, macOS adds the count as menu-bar text
//! (`set_title`); on Windows/Linux the count becomes a badge dot on the glyph
//! plus the tooltip (Linux shows neither, so the menu is the surface). The menu
//! lists the panes currently waiting on the user and focuses one on click.

use std::sync::Mutex;

use serde::Deserialize;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Theme, WindowEvent, Wry};

pub const TRAY_ID: &str = "commandwave-tray";

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AttentionItem {
    pub pane_id: String,
    pub label: String,
    pub state: String,
}

// ---------------------------------------------------------------------------
// Brand glyph
// ---------------------------------------------------------------------------
//
// The tray mark is the `>_` prompt of the app icon, so its geometry is not
// authored here: it mirrors the signed-distance primitives of
// `scripts/gen_icon.py`, the single source of truth for the brand mark.
// `gen_icon_geometry_is_mirrored` fails if either side drifts, which is what
// keeps the menu-bar icon and the Dock icon the same shape.

// Chevron `>`: two capsule strokes joined at the apex.
const CHEVRON_X0: f64 = 430.0;
const CHEVRON_Y0: f64 = 450.0;
const CHEVRON_X1: f64 = 810.0;
const CHEVRON_Y1: f64 = 1024.0;
const CHEVRON_Y2: f64 = 1598.0;
/// Capsule half-width, i.e. half the stroke thickness.
const STROKE_HALF_W: f64 = 95.0;

// Underscore `_`: a rounded bar below and right of the apex.
const UNDERSCORE_X: f64 = 1265.0;
const UNDERSCORE_Y: f64 = 1480.0;
const UNDERSCORE_HX: f64 = 300.0;
const UNDERSCORE_HY: f64 = 80.0;
const UNDERSCORE_R: f64 = 80.0;

/// Rendered size in pixels. macOS draws the menu-bar icon at 18pt, so 36px is
/// the native Retina resolution (the previous 32px source was resampled).
const ICON_PX: u32 = 36;
/// Supersampling factor. The glyph used to be drawn with alpha of either 0 or
/// 255, so its edges were stair-stepped next to the system's smooth icons.
const SUPERSAMPLE: u32 = 4;
/// The canvas `scripts/gen_icon.py` draws in: `SIZE * SS` (1024 x 2). Every
/// constant above lives in this space.
const CANVAS: f64 = 2048.0;
/// The app icon's rounded-square tile, from its background primitive
/// `sd_rounded_box(fx, fy, CANVAS / 2, CANVAS / 2, CANVAS / 2 - 90,
/// CANVAS / 2 - 90, 400)`. The tray glyph is composed against this same tile,
/// so it ends up the size and place it has on the app icon, rather than being
/// stretched to fill the menu-bar box.
const TILE_CENTER: f64 = CANVAS / 2.0;
const TILE_HALF: f64 = CANVAS / 2.0 - 90.0;

// Attention badge (non-macOS only), as fractions of the icon.
const BADGE_CX: f64 = 0.78;
const BADGE_CY: f64 = 0.22;
const BADGE_R: f64 = 0.20;
const BADGE_GAP: f64 = 1.5;

/// What the tray is showing, so repainting can be skipped when nothing changed
/// and a theme flip can repaint from the state that is already up.
static SHOWN: Mutex<Option<(u32, [u8; 3])>> = Mutex::new(None);

/// Clamp to 0..1; mirrors `clamp` in `scripts/gen_icon.py`.
fn clamp01(v: f64) -> f64 {
    v.clamp(0.0, 1.0)
}

/// Signed distance to a capsule; mirrors `sd_segment` in `scripts/gen_icon.py`.
fn sd_segment(px: f64, py: f64, ax: f64, ay: f64, bx: f64, by: f64, half_w: f64) -> f64 {
    let (vx, vy) = (bx - ax, by - ay);
    let (wx, wy) = (px - ax, py - ay);
    let t = clamp01((wx * vx + wy * vy) / (vx * vx + vy * vy));
    let (dx, dy) = (px - (ax + t * vx), py - (ay + t * vy));
    (dx * dx + dy * dy).sqrt() - half_w
}

/// Signed distance to a rounded box; mirrors `sd_rounded_box`.
fn sd_rounded_box(px: f64, py: f64, cx: f64, cy: f64, hx: f64, hy: f64, r: f64) -> f64 {
    let qx = (px - cx).abs() - hx + r;
    let qy = (py - cy).abs() - hy + r;
    let outside = (qx.max(0.0) * qx.max(0.0) + qy.max(0.0) * qy.max(0.0)).sqrt();
    qx.max(qy).min(0.0) + outside - r
}

/// Bounding box of the glyph primitives in canvas units, `(x0, y0, x1, y1)`,
/// derived from the constants above so it cannot drift from them.
fn glyph_box() -> (f64, f64, f64, f64) {
    (
        CHEVRON_X0.min(CHEVRON_X1) - STROKE_HALF_W,
        CHEVRON_Y0 - STROKE_HALF_W,
        CHEVRON_X1.max(UNDERSCORE_X + UNDERSCORE_HX),
        CHEVRON_Y2.max(UNDERSCORE_Y + UNDERSCORE_HY) + STROKE_HALF_W,
    )
}

/// Coverage (0..1) of the brand glyph at a point given in icon pixels.
fn glyph_coverage(x: f64, y: f64, n: f64) -> f64 {
    let (gx0, gy0, gx1, gy1) = glyph_box();
    debug_assert!(
        gx0 >= TILE_CENTER - TILE_HALF
            && gy0 >= TILE_CENTER - TILE_HALF
            && gx1 <= TILE_CENTER + TILE_HALF
            && gy1 <= TILE_CENTER + TILE_HALF,
        "the glyph must sit inside the tile, as it does on the app icon"
    );
    // Map the icon box onto the app icon's tile; `k` scales canvas units to
    // pixels, so dividing the sampled point by it lands us back in canvas space.
    let k = n / (TILE_HALF * 2.0);
    let (cx, cy) = (
        (x - n / 2.0) / k + TILE_CENTER,
        (y - n / 2.0) / k + TILE_CENTER,
    );
    let d = sd_segment(
        cx,
        cy,
        CHEVRON_X0,
        CHEVRON_Y0,
        CHEVRON_X1,
        CHEVRON_Y1,
        STROKE_HALF_W,
    )
    .min(sd_segment(
        cx,
        cy,
        CHEVRON_X1,
        CHEVRON_Y1,
        CHEVRON_X0,
        CHEVRON_Y2,
        STROKE_HALF_W,
    ))
    .min(sd_rounded_box(
        cx,
        cy,
        UNDERSCORE_X,
        UNDERSCORE_Y,
        UNDERSCORE_HX,
        UNDERSCORE_HY,
        UNDERSCORE_R,
    ));
    clamp01(0.5 - d * k)
}

/// Ink for a glyph on a panel with this theme.
///
/// Deliberately platform-independent, so the mapping (including the fallback) is
/// compiled *and* exercised wherever the tests run -- platform variance would
/// otherwise hide it behind `#[cfg]` on any single developer's machine.
fn ink_for_theme(theme: Option<Theme>) -> [u8; 3] {
    match theme {
        Some(Theme::Dark) => [255, 255, 255],
        Some(Theme::Light) => [0, 0, 0],
        // No theme reported -- Linux returns none through this API -- or a
        // polarity we cannot judge (the enum is `#[non_exhaustive]`): mid grey
        // stays legible on a light and a dark panel alike.
        _ => [128, 128, 128],
    }
}

/// The ink the tray glyph is drawn with.
fn ink_for(theme: Option<Theme>) -> [u8; 3] {
    if cfg!(target_os = "macos") {
        // macOS reads only the alpha of a template image and colours it to match
        // the menu bar. Keep the bitmap black so the glyph still reads if the
        // template flag is ever lost. (`cfg!` rather than `#[cfg]`, so the other
        // branch is still type-checked here.)
        [0, 0, 0]
    } else {
        ink_for_theme(theme)
    }
}

/// Theme of the panel the tray sits on, when the platform reports one.
fn panel_theme(app: &AppHandle) -> Option<Theme> {
    app.get_webview_window("main")
        .and_then(|window| window.theme().ok())
}

/// Whether this platform paints the attention count onto the glyph itself.
/// macOS carries it as menu-bar text (`set_title`) and a Dock badge instead,
/// and a painted dot would collide with the mark.
fn badge_on_glyph(count: u32) -> bool {
    !cfg!(target_os = "macos") && count > 0
}

/// Draw the brand glyph into an RGBA buffer sized for the menu bar.
///
/// A template image is what macOS needs: the system recolours it for a light or
/// dark menu bar, so `ink` is ignored there (only alpha is read). Elsewhere the
/// bitmap is drawn as-is, so `ink` is what keeps the glyph visible.
fn draw_icon(count: u32, ink: [u8; 3]) -> Image<'static> {
    let hi_px = ICON_PX * SUPERSAMPLE;
    let n = f64::from(hi_px);
    let ss = f64::from(SUPERSAMPLE);
    // Supersampled coverage, one byte per sample.
    let mut hi = vec![0u8; (hi_px * hi_px) as usize];
    for py in 0..hi_px {
        for px in 0..hi_px {
            let x = f64::from(px) + 0.5;
            let y = f64::from(py) + 0.5;
            let mut cov = glyph_coverage(x, y, n);
            if badge_on_glyph(count) {
                let (bcx, bcy, br) = (n * BADGE_CX, n * BADGE_CY, n * BADGE_R);
                let d = ((x - bcx) * (x - bcx) + (y - bcy) * (y - bcy)).sqrt();
                let disc = clamp01(br + 0.5 - d);
                // Carve a ring out of the glyph so the dot stays legible.
                let ring = clamp01(d - br - BADGE_GAP * ss + 0.5);
                cov = (cov * ring).max(disc);
            }
            hi[(py * hi_px + px) as usize] = (cov * 255.0).round() as u8;
        }
    }
    // Box-downsample the supersampled coverage into the icon.
    let mut rgba = vec![0u8; (ICON_PX * ICON_PX * 4) as usize];
    for y in 0..ICON_PX {
        for x in 0..ICON_PX {
            let mut acc = 0u32;
            for sy in 0..SUPERSAMPLE {
                for sx in 0..SUPERSAMPLE {
                    let s = ((y * SUPERSAMPLE + sy) * hi_px + (x * SUPERSAMPLE + sx)) as usize;
                    acc += u32::from(hi[s]);
                }
            }
            let i = ((y * ICON_PX + x) * 4) as usize;
            rgba[i..i + 3].copy_from_slice(&ink);
            rgba[i + 3] = (acc / (SUPERSAMPLE * SUPERSAMPLE)) as u8;
        }
    }
    Image::new_owned(rgba, ICON_PX, ICON_PX)
}
fn build_menu(app: &AppHandle, items: &[AttentionItem]) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    if items.is_empty() {
        let idle = MenuItem::with_id(app, "idle", "No agents need you", false, None::<&str>)?;
        menu.append(&idle)?;
    } else {
        for item in items {
            let label = format!("{}  ·  {}", item.label, state_word(&item.state));
            let mi = MenuItem::with_id(
                app,
                format!("pane:{}", item.pane_id),
                label,
                true,
                None::<&str>,
            )?;
            menu.append(&mi)?;
        }
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let show = MenuItem::with_id(app, "show", "Show CommandWave", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit CommandWave", true, None::<&str>)?;
    menu.append(&show)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&quit)?;
    Ok(menu)
}

fn state_word(state: &str) -> &'static str {
    match state {
        "needs-you" => "needs you",
        "error" => "error",
        "working" => "working",
        "done" => "done",
        _ => "waiting",
    }
}

fn focus_pane(app: &AppHandle, pane_id: &str) {
    // The window hosting the pane focuses it; fall back to a global emit so
    // the main window can route by pane id.
    let mut delivered = false;
    for (_, webview) in app.webview_windows() {
        let _ = webview.emit("cw-attention-focus", pane_id.to_string());
        delivered = true;
    }
    if !delivered {
        let _ = app.emit("cw-attention-focus", pane_id.to_string());
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Paint the glyph for the current attention count and panel theme, skipping the
/// work when the tray already shows exactly that.
fn paint(app: &AppHandle, count: u32) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    let key = (count, ink_for(panel_theme(app)));
    let mut shown = SHOWN.lock().expect("tray state mutex");
    if *shown == Some(key) {
        return Ok(());
    }
    // The template flag is set atomically: plain `set_icon` *clears* it on
    // macOS, which silently turned the icon into a fixed black bitmap that no
    // longer followed the menu-bar appearance.
    tray.set_icon_with_as_template(Some(draw_icon(count, key.1)), true)?;
    *shown = Some(key);
    Ok(())
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app, &[])?;
    let ink = ink_for(panel_theme(app));
    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(draw_icon(0, ink))
        .icon_as_template(true)
        .tooltip("CommandWave")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if let Some(pane_id) = id.strip_prefix("pane:") {
                focus_pane(app, pane_id);
            } else if id == "show" {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            } else if id == "quit" {
                app.exit(0);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;
    *SHOWN.lock().expect("tray state mutex") = Some((0, ink));
    // Repaint when the system flips the panel theme. macOS ignores the ink (its
    // template image follows the menu bar by itself) and Linux reports no theme
    // changes, so Windows is the platform this is really for.
    if let Some(window) = app.get_webview_window("main") {
        let handle = app.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::ThemeChanged(_) = event {
                let count = SHOWN
                    .lock()
                    .expect("tray state mutex")
                    .map(|(count, _)| count)
                    .unwrap_or(0);
                if let Err(e) = paint(&handle, count) {
                    eprintln!("tray repaint failed: {e}");
                }
            }
        });
    }
    let _ = tray;
    Ok(())
}

/// Push the current attention set into the tray (menu, tooltip, macOS title).
pub fn update(app: &AppHandle, items: &[AttentionItem], count: u32) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    let menu = build_menu(app, items)?;
    tray.set_menu(Some(menu))?;
    // Repaint only when the badge or the panel ink changes, so agent-status
    // churn does not rebuild the bitmap on every event.
    paint(app, count)?;
    let tooltip = if count == 0 {
        "CommandWave".to_string()
    } else {
        format!("CommandWave — {count} agent(s) need you")
    };
    let _ = tray.set_tooltip(Some(&tooltip));
    #[cfg(target_os = "macos")]
    {
        let title = if count == 0 {
            None
        } else {
            Some(count.to_string())
        };
        let _ = tray.set_title(title.as_deref());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Fixed ink, so geometry assertions do not depend on the host's panel theme.
    const INK: [u8; 3] = [0, 0, 0];

    /// Alpha of one icon pixel.
    fn alpha_at(image: &Image<'_>, x: u32, y: u32) -> u8 {
        image.rgba()[((y * ICON_PX + x) * 4 + 3) as usize]
    }

    /// Bounding box of the inked pixels, `(x0, y0, x1, y1)` inclusive.
    fn ink_bbox(image: &Image<'_>) -> (u32, u32, u32, u32) {
        let (mut x0, mut y0, mut x1, mut y1) = (ICON_PX, ICON_PX, 0, 0);
        for y in 0..ICON_PX {
            for x in 0..ICON_PX {
                if alpha_at(image, x, y) > 8 {
                    x0 = x0.min(x);
                    y0 = y0.min(y);
                    x1 = x1.max(x);
                    y1 = y1.max(y);
                }
            }
        }
        (x0, y0, x1, y1)
    }

    /// The glyph is not authored twice: every primitive must still match
    /// `scripts/gen_icon.py`, which owns the brand mark. A change on either
    /// side fails here instead of showing up as a mismatched menu-bar icon.
    #[test]
    fn gen_icon_geometry_is_mirrored() {
        let gen_icon = include_str!("../../scripts/gen_icon.py");
        let chevron_up = format!(
            "sd_segment(fx, fy, {CHEVRON_X0:.0}, {CHEVRON_Y0:.0}, {CHEVRON_X1:.0}, {CHEVRON_Y1:.0}, {STROKE_HALF_W:.0})"
        );
        let chevron_down = format!(
            "sd_segment(fx, fy, {CHEVRON_X1:.0}, {CHEVRON_Y1:.0}, {CHEVRON_X0:.0}, {CHEVRON_Y2:.0}, {STROKE_HALF_W:.0})"
        );
        let underscore = format!(
            "sd_rounded_box(fx, fy, {UNDERSCORE_X:.0}, {UNDERSCORE_Y:.0}, {UNDERSCORE_HX:.0}, {UNDERSCORE_HY:.0}, {UNDERSCORE_R:.0})"
        );
        for (what, fragment) in [
            ("chevron (up stroke)", chevron_up),
            ("chevron (down stroke)", chevron_down),
            ("underscore", underscore),
        ] {
            assert!(
                gen_icon.contains(&fragment),
                "the app icon's {what} no longer matches the tray glyph: \
                 scripts/gen_icon.py does not contain `{fragment}`"
            );
        }
        // The canvas the glyph is composed against, and the tile it sits on.
        assert!(
            gen_icon.contains("SIZE = 1024") && gen_icon.contains("SS = 2"),
            "the app icon canvas changed: expected SIZE = 1024 with SS = 2"
        );
        assert!(
            gen_icon.contains(
                "sd_rounded_box(fx, fy, CANVAS / 2, CANVAS / 2, CANVAS / 2 - 90, CANVAS / 2 - 90, 400)"
            ),
            "the app icon tile changed: expected CANVAS / 2 with CANVAS / 2 - 90 half extents"
        );
        assert_eq!((CANVAS, TILE_HALF), (2048.0, 934.0));
    }

    #[test]
    fn glyph_box_matches_the_app_icon_ink() {
        // Derived, not hand-typed: (430-95, 450-95) .. (1265+300, 1598+95).
        assert_eq!(glyph_box(), (335.0, 355.0, 1565.0, 1693.0));
    }

    #[test]
    fn stroke_weight_matches_the_app_icon() {
        let (_, y0, _, y1) = glyph_box();
        let ratio = (STROKE_HALF_W * 2.0) / (y1 - y0);
        // 190/1338 ink-to-glyph ratio, the same as the 1024px app icon.
        assert!(
            (ratio - 0.1420).abs() < 0.0005,
            "stroke ratio drifted: {ratio}"
        );
    }

    #[test]
    fn icon_is_native_retina_size() {
        let icon = draw_icon(0, INK);
        // 18pt menu-bar height at 2x: a 36px source avoids the upsampling the
        // old 32px one was subject to.
        assert_eq!((icon.width(), icon.height()), (ICON_PX, ICON_PX));
        assert_eq!(icon.rgba().len(), (ICON_PX * ICON_PX * 4) as usize);
    }

    #[test]
    fn glyph_keeps_the_app_icon_composition() {
        let icon = draw_icon(0, INK);
        let (x0, y0, x1, y1) = ink_bbox(&icon);
        // The glyph must land where it sits on the app icon's tile, at the icon's
        // scale: same size, same offset from the centre.
        let k = f64::from(ICON_PX) / (TILE_HALF * 2.0);
        let (gx0, gy0, gx1, gy1) = glyph_box();
        let place = |c: f64| (c - TILE_CENTER) * k + f64::from(ICON_PX) / 2.0;
        for (got, want, edge) in [
            (f64::from(x0), place(gx0), "left"),
            (f64::from(x1), place(gx1), "right"),
            (f64::from(y0), place(gy0), "top"),
            (f64::from(y1), place(gy1), "bottom"),
        ] {
            assert!(
                (got - want).abs() <= 1.5,
                "glyph {edge} edge at {got}, want {want}"
            );
        }
        // ...and it stays clear of the icon's edge.
        assert!(x0 > 0 && y0 > 0 && x1 < ICON_PX - 1 && y1 < ICON_PX - 1);
        // Antialiasing: the old glyph only ever produced alpha of 0 or 255.
        let partial = icon
            .rgba()
            .chunks(4)
            .filter(|p| (1..255).contains(&p[3]))
            .count();
        assert!(
            partial > 20,
            "glyph is not antialiased ({partial} soft pixels)"
        );
    }

    #[test]
    fn attention_badge_is_non_macos_only() {
        let idle = draw_icon(0, INK);
        let attention = draw_icon(1, INK);
        if cfg!(target_os = "macos") {
            // macOS shows the count as menu-bar text and a Dock badge.
            assert_eq!(idle.rgba(), attention.rgba());
            return;
        }
        assert_ne!(idle.rgba(), attention.rgba());
        // The badge is solid ink where the idle glyph has nothing.
        let bx = (f64::from(ICON_PX) * BADGE_CX) as u32;
        let by = (f64::from(ICON_PX) * BADGE_CY) as u32;
        assert_eq!(
            alpha_at(&attention, bx, by),
            255,
            "badge core must be solid"
        );
        assert_eq!(alpha_at(&idle, bx, by), 0, "the idle glyph is empty there");
        // ...and it stays local: it must not redraw the whole glyph.
        let changed = idle
            .rgba()
            .chunks(4)
            .zip(attention.rgba().chunks(4))
            .filter(|(a, b)| a != b)
            .count();
        assert!(
            changed < (ICON_PX * ICON_PX / 3) as usize,
            "badge touched {changed} px"
        );
    }

    #[test]
    fn ink_maps_the_panel_polarity() {
        assert_eq!(ink_for_theme(Some(Theme::Light)), [0, 0, 0]);
        assert_eq!(ink_for_theme(Some(Theme::Dark)), [255, 255, 255]);
        // An unreadable theme must not fall back to ink that vanishes on a dark
        // taskbar -- that is the bug this fix exists for.
        let fallback = ink_for_theme(None);
        assert_ne!(fallback, [0, 0, 0]);
        assert_ne!(fallback, [255, 255, 255]);
    }

    #[test]
    fn ink_is_resolved_per_platform() {
        if cfg!(target_os = "macos") {
            // The system colourises a template image, so the ink is constant
            // there -- which is also why a theme flip costs no repaint.
            assert_eq!(ink_for(Some(Theme::Dark)), [0, 0, 0]);
            assert_eq!(ink_for(Some(Theme::Dark)), ink_for(Some(Theme::Light)));
            assert_eq!(ink_for(None), [0, 0, 0]);
        } else {
            // The bitmap is drawn as-is, so the panel theme decides the ink.
            assert_eq!(ink_for(Some(Theme::Dark)), [255, 255, 255]);
            assert_eq!(ink_for(Some(Theme::Light)), [0, 0, 0]);
            assert_eq!(ink_for(None), ink_for_theme(None));
        }
    }

    #[test]
    fn glyph_is_drawn_in_the_given_ink() {
        let white = draw_icon(0, [255, 255, 255]);
        let black = draw_icon(0, [0, 0, 0]);
        let solid: Vec<_> = white.rgba().chunks(4).filter(|p| p[3] > 200).collect();
        assert!(!solid.is_empty(), "expected solid glyph pixels");
        assert!(
            solid.iter().all(|p| p[..3] == [255, 255, 255]),
            "glyph pixels must carry the requested ink"
        );
        // The ink must not change the shape: alpha is what macOS reads.
        let alphas: Vec<u8> = black.rgba().chunks(4).map(|p| p[3]).collect();
        let white_alphas: Vec<u8> = white.rgba().chunks(4).map(|p| p[3]).collect();
        assert_eq!(alphas, white_alphas, "ink changed the glyph's shape");
    }

    /// `cargo test -- --ignored --nocapture` to eyeball the mark's shape.
    #[test]
    #[ignore = "manual preview"]
    fn print_glyph_preview() {
        for count in [0u32, 1] {
            let icon = draw_icon(count, INK);
            println!("-- count = {count}");
            for y in 0..ICON_PX {
                let row: String = (0..ICON_PX)
                    .map(|x| match alpha_at(&icon, x, y) {
                        0 => '.',
                        a if a > 200 => '#',
                        _ => '+',
                    })
                    .collect();
                println!("{row}");
            }
        }
    }
}
