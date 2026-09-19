//! Translations for the surfaces the operating system draws itself.
//!
//! The webview has its own translation layer (i18next, `src/i18n`); this module
//! covers only what Rust renders: the macOS menu bar, and the tray icon's menu
//! and tooltip. Strings the system localises for us (Undo/Redo/Cut/Copy/Paste,
//! Minimize/Quit…) are deliberately absent — they come from `PredefinedMenuItem`
//! and follow the OS language, not the in-app one.
//!
//! The table is a plain array of literals rather than a macro or a build step,
//! so it can be enumerated by tests: uniqueness, missing translations and
//! missing keys are all checkable (`mod tests` below).

/// The locales this build ships. `resolve_locale` returns nothing else, so
/// every translation site can compare against these tags directly.
pub const EN: &str = "en";
pub const ZH_CN: &str = "zh-CN";

/// `(key, English, Simplified Chinese)`.
///
/// English is the reference: the values are byte-identical to the labels the
/// app showed before it could be translated, so an English UI is unchanged by
/// this table. Keys are dotted, grouped by the surface that renders them.
const STRINGS: &[(&str, &str, &str)] = &[
    // macOS application menu.
    ("menu.app.about", "About CommandWave", "关于 CommandWave"),
    (
        "menu.app.checkForUpdates",
        "Check for Updates…",
        "检查更新…",
    ),
    ("menu.app.settings", "Settings…", "设置…"),
    // Edit menu (the predefined items around ours stay with the OS).
    ("menu.edit", "Edit", "编辑"),
    (
        "menu.edit.copyLastOutput",
        "Copy Last Output",
        "复制上一条输出",
    ),
    ("menu.edit.clearBuffer", "Clear Buffer", "清空缓冲"),
    // Shell menu. "Shell" is a proper noun here (the program family), so the
    // Chinese value is deliberately the same word.
    ("menu.shell", "Shell", "Shell"),
    ("menu.shell.newTab", "New Tab", "新建标签页"),
    ("menu.shell.closePane", "Close Pane", "关闭窗格"),
    ("menu.shell.closeTab", "Close Tab", "关闭标签页"),
    ("menu.shell.splitRight", "Split Pane Right", "向右分屏"),
    ("menu.shell.splitDown", "Split Pane Down", "向下分屏"),
    ("menu.shell.prevPane", "Previous Pane", "上一个窗格"),
    ("menu.shell.nextPane", "Next Pane", "下一个窗格"),
    // View menu.
    ("menu.view", "View", "显示"),
    (
        "menu.view.toggleVerticalTabs",
        "Toggle Vertical Tabs",
        "切换标签页方向",
    ),
    ("menu.view.search", "Search…", "搜索…"),
    ("menu.view.prevPrompt", "Previous Prompt", "上一个提示符"),
    ("menu.view.nextPrompt", "Next Prompt", "下一个提示符"),
    // Window menu (its items are the OS' minimize/maximize).
    ("menu.window", "Window", "窗口"),
    // Tray menu.
    ("tray.idle", "No agents need you", "没有智能体在等你"),
    ("tray.state.needsYou", "needs you", "需要你"),
    ("tray.state.error", "error", "出错"),
    ("tray.state.working", "working", "运行中"),
    ("tray.state.done", "done", "已完成"),
    ("tray.state.waiting", "waiting", "等待中"),
    ("tray.show", "Show CommandWave", "显示 CommandWave"),
    ("tray.quit", "Quit CommandWave", "退出 CommandWave"),
    // Tray tooltip. The count is dynamic (`set_tooltip` takes the same sentence
    // with the number in it), and `format!` needs a literal template, so the
    // table carries a `{count}` placeholder that the caller substitutes.
    ("tray.tooltip.idle", "CommandWave", "CommandWave"),
    (
        "tray.tooltip.needsYou",
        "CommandWave — {count} agent(s) need you",
        "CommandWave — {count} 个智能体等你处理",
    ),
];

/// The locale to render: a shipped tag passes through, everything else follows
/// the operating system.
///
/// `None` is the settings' "no choice made" (the field is optional), and
/// `"system"` is the explicit choice of the same behaviour. A value this build
/// does not know — a hand-edited typo, a locale written by a newer build — is
/// treated the same way rather than failing: the worst case is a UI in the
/// system language.
pub fn resolve_locale(setting: Option<&str>) -> &'static str {
    match setting {
        Some(EN) => EN,
        Some(ZH_CN) => ZH_CN,
        _ => system_locale(),
    }
}

/// Map the OS language tag onto a shipped locale. Every Chinese variant
/// (`zh`, `zh-Hans`, `zh-TW`, `zh-HK`) resolves to the simplified pack — it is
/// the only Chinese pack we ship — and everything else, including "the OS did
/// not tell us", resolves to English.
fn system_locale() -> &'static str {
    match sys_locale::get_locale() {
        Some(tag) if tag.to_lowercase().starts_with("zh") => ZH_CN,
        _ => EN,
    }
}

/// Translate `key` into `locale`.
///
/// Two fallbacks, both silent by design: an unshipped locale (`"fr"`, `""`)
/// gets the English reference value, and a key that is not in the table gets
/// the key itself. The latter is a programming error, but a visible
/// `menu.view.search` beats a panic in a menu build.
///
/// `key` is `&'static str` because the fallback returns it unchanged: a
/// borrowed key of an unknown lifetime cannot be widened into the returned
/// `&'static str`. Every call site passes a literal, so this costs nothing.
pub fn t(locale: &str, key: &'static str) -> &'static str {
    for &(k, en, zh) in STRINGS {
        if k == key {
            return if locale == ZH_CN { zh } else { en };
        }
    }
    key
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A shipped tag is used as-is; anything else means "ask the OS", and the
    /// OS answer is one of the two tags (`sys_locale` reads the real machine,
    /// so the test asserts the set, not a particular language).
    #[test]
    fn resolve_locale_passes_shipped_tags_through() {
        assert_eq!(resolve_locale(Some("en")), EN);
        assert_eq!(resolve_locale(Some("zh-CN")), ZH_CN);
    }

    #[test]
    fn resolve_locale_falls_back_to_the_system() {
        for setting in [None, Some("system"), Some("ja"), Some(""), Some("EN")] {
            let resolved = resolve_locale(setting);
            assert!(
                resolved == EN || resolved == ZH_CN,
                "{setting:?} resolved to {resolved}, not a shipped locale"
            );
        }
    }

    #[test]
    fn t_translates_the_shipped_locales() {
        assert_eq!(t(EN, "menu.edit"), "Edit");
        assert_eq!(t(ZH_CN, "menu.edit"), "编辑");
        assert_eq!(t(ZH_CN, "menu.view.search"), "搜索…");
        // "Shell" is the one menu title that stays untranslated.
        assert_eq!(t(ZH_CN, "menu.shell"), "Shell");
    }

    #[test]
    fn t_falls_back_to_english_for_an_unshipped_locale() {
        assert_eq!(t("fr", "menu.window"), "Window");
        assert_eq!(t("", "tray.state.done"), "done");
    }

    #[test]
    fn t_returns_the_key_for_an_unknown_key() {
        assert_eq!(t(EN, "no.such.key"), "no.such.key");
        assert_eq!(t(ZH_CN, "no.such.key"), "no.such.key");
    }

    #[test]
    fn string_table_keys_are_unique() {
        let mut keys: Vec<&str> = STRINGS.iter().map(|(key, _, _)| *key).collect();
        let total = keys.len();
        keys.sort_unstable();
        keys.dedup();
        assert_eq!(keys.len(), total, "the table has a duplicate key");
    }

    #[test]
    fn string_table_has_no_empty_values() {
        for (key, en, zh) in STRINGS {
            assert!(!en.is_empty(), "{key} has no English value");
            assert!(!zh.is_empty(), "{key} has no Chinese value");
            assert!(!key.is_empty(), "the table has an empty key");
        }
    }

    /// The menu and tray builders address this table by key, so a typo there
    /// would surface as a raw key in the UI. Spelling the required keys out
    /// keeps that from being silent.
    #[test]
    fn string_table_carries_the_keys_the_menus_use() {
        for key in [
            "menu.app.about",
            "menu.app.checkForUpdates",
            "menu.app.settings",
            "menu.edit",
            "menu.edit.copyLastOutput",
            "menu.edit.clearBuffer",
            "menu.shell",
            "menu.shell.newTab",
            "menu.shell.closePane",
            "menu.shell.closeTab",
            "menu.shell.splitRight",
            "menu.shell.splitDown",
            "menu.shell.prevPane",
            "menu.shell.nextPane",
            "menu.view",
            "menu.view.toggleVerticalTabs",
            "menu.view.search",
            "menu.view.prevPrompt",
            "menu.view.nextPrompt",
            "menu.window",
            "tray.idle",
            "tray.state.needsYou",
            "tray.state.error",
            "tray.state.working",
            "tray.state.done",
            "tray.state.waiting",
            "tray.show",
            "tray.quit",
            "tray.tooltip.idle",
            "tray.tooltip.needsYou",
        ] {
            assert_ne!(t(EN, key), key, "{key} is missing from the table");
            assert_ne!(t(ZH_CN, key), key, "{key} is missing from the table");
        }
    }
}
