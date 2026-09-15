use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct UiSettings {
    pub tab_bar_position: String, // "top" | "left"
    pub sidebar_width: u16,
    /// Font size delta applied on top of the configured size (⌘+/- zoom).
    pub font_size_delta: i32,
    /// Restore the tab/pane layout from the previous run on launch.
    pub restore_session_on_start: bool,
    /// Inline autocomplete popup over the prompt.
    pub autocomplete: bool,
}

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            tab_bar_position: "top".to_string(),
            sidebar_width: 180,
            font_size_delta: 0,
            restore_session_on_start: true,
            autocomplete: true,
        }
    }
}

/// Per-event toggles for the three agent lifecycle events.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct EventNotificationSettings {
    /// Agent is waiting for the user to confirm / answer.
    pub needs_confirmation: bool,
    /// Agent finished a turn, or its command exited cleanly.
    pub finished: bool,
    /// Agent (or the command it ran) failed.
    pub error: bool,
}

impl Default for EventNotificationSettings {
    fn default() -> Self {
        Self {
            needs_confirmation: true,
            finished: true,
            error: true,
        }
    }
}

/// Install state for one Tier-3 agent integration (hooks / notify / plugin).
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct IntegrationState {
    pub enabled: bool,
    pub installed: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct NotificationSettings {
    /// Confirm before pasting multi-line / large / destructive text.
    pub paste_warning: bool,
    /// Agent event notification toggles (migrated from `commandCompletion`).
    pub events: EventNotificationSettings,
    /// Flash the taskbar / Dock when an agent needs the user.
    pub taskbar_attention: bool,
    /// Parse OSC 0/2 window titles to infer agent state (Tier 1).
    pub title_detection: bool,
    /// Output-idle threshold (ms) for the tier-0 heuristic.
    pub idle_threshold_ms: u64,
    /// Extra regexes treated as agent errors (Tier 1).
    pub error_patterns: Vec<String>,
    /// agent id -> Tier-3 install state.
    pub integrations: std::collections::HashMap<String, IntegrationState>,
}

/// Built-in Tier-1 error patterns. Plain substrings: the frontend compiles
/// them case-insensitively (JS regex has no inline `(?i)` flag).
pub const DEFAULT_ERROR_PATTERNS: &[&str] = &[
    "rate limit",
    "overloaded",
    "api error",
    "authentication failed",
    "context length",
    "quota exceeded",
    "connection error",
];

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            paste_warning: true,
            events: EventNotificationSettings::default(),
            taskbar_attention: true,
            title_detection: true,
            idle_threshold_ms: 5000,
            error_patterns: DEFAULT_ERROR_PATTERNS
                .iter()
                .map(|s| s.to_string())
                .collect(),
            integrations: std::collections::HashMap::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Trigger {
    pub id: String,
    pub regex: String,
    pub case_sensitive: bool,
    /// highlight | notify | sound | send-text
    pub action: String,
    pub param: Option<String>,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AutoAnswer {
    pub pattern: String,
    pub reply: String,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateSettings {
    /// Silently check for a new release a few seconds after launch.
    pub auto_check: bool,
    /// Versions the user explicitly skipped; they never prompt again.
    pub skipped_versions: Vec<String>,
}

impl Default for UpdateSettings {
    fn default() -> Self {
        Self {
            auto_check: true,
            skipped_versions: Vec::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AutoLogSettings {
    pub enabled: bool,
    pub directory: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u8,
    // Shell / session (None = built-in default).
    pub shell: Option<String>,
    pub args: Option<Vec<String>>,
    /// Working directory for new terminals.
    pub cwd: Option<String>,
    /// Scrollback buffer (lines).
    pub scrollback: Option<u32>,
    /// Overlay text, supports {cwd} and {duration} placeholders.
    pub badge: Option<String>,
    /// extra environment variables ("KEY=VALUE")
    pub env: Option<Vec<String>>,
    // Appearance (None = built-in default).
    pub font_family: Option<String>,
    pub font_size: Option<u16>,
    pub theme_name: Option<String>,
    pub cursor_style: Option<String>,
    pub cursor_blink: Option<bool>,
    pub line_height: Option<f64>,
    pub letter_spacing: Option<f64>,
    pub custom_colors: Option<std::collections::HashMap<String, String>>,
    pub background_opacity: Option<f64>,
    pub background_image: Option<String>,
    pub background_image_opacity: Option<f64>,
    pub ui: UiSettings,
    pub notifications: NotificationSettings,
    pub updates: UpdateSettings,
    pub triggers: Vec<Trigger>,
    pub auto_answers: Vec<AutoAnswer>,
    pub auto_log: AutoLogSettings,
    /// Saved window arrangements: name → serialized session snapshot JSON.
    pub arrangements: std::collections::HashMap<String, String>,
    /// Last session snapshot, autosaved for restore-on-launch.
    pub session: Option<String>,
    /// Editor command for ⌘/Ctrl-click file links, e.g. "code {file}".
    pub editor_command: Option<String>,
    /// actionId -> accelerator overrides; missing entries use menu defaults.
    pub keybindings: std::collections::HashMap<String, String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: 1,
            shell: None,
            args: None,
            cwd: None,
            scrollback: None,
            badge: None,
            env: None,
            font_family: None,
            font_size: None,
            theme_name: None,
            cursor_style: None,
            cursor_blink: None,
            line_height: None,
            letter_spacing: None,
            custom_colors: None,
            background_opacity: None,
            background_image: None,
            background_image_opacity: None,
            ui: UiSettings::default(),
            notifications: NotificationSettings::default(),
            updates: UpdateSettings::default(),
            triggers: vec![Trigger {
                id: "trigger-password".to_string(),
                regex: "(password|passphrase)\\s*[:：]\\s*$".to_string(),
                case_sensitive: false,
                action: "notify".to_string(),
                param: Some("Password prompt detected".to_string()),
                enabled: true,
            }],
            auto_answers: vec![],
            auto_log: AutoLogSettings::default(),
            arrangements: std::collections::HashMap::new(),
            session: None,
            editor_command: None,
            keybindings: std::collections::HashMap::new(),
        }
    }
}

/// Legacy per-profile keys hoisted to the top level by `migrate_legacy_profiles`.
const LEGACY_PROFILE_FIELDS: &[&str] = &[
    "shell",
    "args",
    "cwd",
    "fontFamily",
    "fontSize",
    "themeName",
    "cursorStyle",
    "cursorBlink",
    "lineHeight",
    "letterSpacing",
    "scrollback",
    "badge",
    "customColors",
    "backgroundOpacity",
    "backgroundImage",
    "backgroundImageOpacity",
    "env",
];

/// Older builds stored per-profile settings under `profiles` (with
/// `defaultProfileId` picking the active one). Hoist the default profile's
/// non-null values to the flat top-level shape and drop the profile
/// machinery. Returns true when the document was migrated.
fn migrate_legacy_profiles(value: &mut serde_json::Value) -> bool {
    let Some(obj) = value.as_object_mut() else {
        return false;
    };
    let default_id = obj
        .get("defaultProfileId")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let profiles = obj.remove("profiles");
    obj.remove("defaultProfileId");
    obj.remove("autoSwitchRules");
    let Some(profiles) = profiles.as_ref().and_then(|p| p.as_array()) else {
        return false;
    };
    let base = profiles
        .iter()
        .find(|p| {
            default_id
                .as_deref()
                .is_some_and(|id| p.get("id").and_then(|v| v.as_str()) == Some(id))
        })
        .or_else(|| profiles.first());
    if let (Some(base), Some(obj)) = (base, value.as_object_mut()) {
        for key in LEGACY_PROFILE_FIELDS {
            if obj.contains_key(*key) {
                continue;
            }
            if let Some(v) = base.get(*key) {
                if !v.is_null() {
                    obj.insert(key.to_string(), v.clone());
                }
            }
        }
    }
    true
}

/// Older builds stored a single `notifications.commandCompletion` toggle.
/// Fold it into `notifications.events.finished` (keeping its value) and drop
/// the legacy key. Returns true when the document was migrated.
fn migrate_notifications(value: &mut serde_json::Value) -> bool {
    let Some(notifications) = value
        .get_mut("notifications")
        .and_then(|v| v.as_object_mut())
    else {
        return false;
    };
    let Some(legacy) = notifications.remove("commandCompletion") else {
        return false;
    };
    let finished = legacy.as_bool().unwrap_or(true);
    let events = notifications
        .entry("events")
        .or_insert_with(|| serde_json::json!({}));
    if let Some(events) = events.as_object_mut() {
        if !events.contains_key("finished") {
            events.insert("finished".to_string(), serde_json::Value::Bool(finished));
        }
    }
    true
}

fn settings_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .context("no app config directory")?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Result<Settings> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let text = fs::read_to_string(&path).context("reading settings.json")?;
    // A corrupt file falls back to defaults rather than failing the app.
    let mut value: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::json!({}));
    let migrated = migrate_legacy_profiles(&mut value);
    // Fold the legacy command-completion toggle into the per-event group.
    let notifications_migrated = migrate_notifications(&mut value);
    // The Warp-style "blocks" prompt model was removed; purge any persisted
    // prompt section so old settings files don't keep dead keys around.
    let purged = value
        .as_object_mut()
        .map(|obj| obj.remove("prompt").is_some())
        .unwrap_or(false);
    if migrated || notifications_migrated || purged {
        let settings: Settings = serde_json::from_value(value).unwrap_or_default();
        // Persist the migrated/purged shape so the removed fields don't linger.
        save(app, &settings)?;
        Ok(settings)
    } else {
        Ok(serde_json::from_value(value).unwrap_or_default())
    }
}

pub fn save(app: &AppHandle, settings: &Settings) -> Result<()> {
    let path = settings_path(app)?;
    let text = serde_json::to_string_pretty(settings)?;
    fs::write(path, text)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_roundtrip_preserves_fields() {
        let settings = Settings {
            ui: UiSettings {
                tab_bar_position: "left".to_string(),
                sidebar_width: 220,
                font_size_delta: 2,
                restore_session_on_start: false,
                autocomplete: true,
            },
            ..Default::default()
        };
        let json = serde_json::to_string(&settings).unwrap();
        let back: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.ui.tab_bar_position, "left");
        assert_eq!(back.ui.sidebar_width, 220);
        assert_eq!(back.shell, None);
    }

    #[test]
    fn settings_parse_tolerates_missing_fields() {
        let back: Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(back.ui.tab_bar_position, "top");
        assert_eq!(back.shell, None);
        assert_eq!(back.ui.font_size_delta, 0);
        assert!(!back.auto_log.enabled);
    }

    #[test]
    fn settings_roundtrip_triggers_and_answers() {
        let settings = Settings {
            triggers: vec![Trigger {
                id: "t".into(),
                regex: "error".into(),
                case_sensitive: true,
                action: "highlight".into(),
                param: Some("#f00".into()),
                enabled: true,
            }],
            auto_answers: vec![AutoAnswer {
                pattern: r"sure\?".into(),
                reply: "y".into(),
                enabled: true,
            }],
            ..Default::default()
        };
        let json = serde_json::to_string(&settings).unwrap();
        let back: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.triggers[0].regex, "error");
        assert!(back.triggers[0].case_sensitive);
        assert_eq!(back.auto_answers[0].reply, "y");
        assert!(!back.auto_log.enabled);
    }

    #[test]
    fn settings_parse_uses_camel_case_keys() {
        let back: Settings = serde_json::from_str(
            r#"{"shell":"fish","ui":{"tabBarPosition":"left","sidebarWidth":300}}"#,
        )
        .unwrap();
        assert_eq!(back.shell.as_deref(), Some("fish"));
        assert_eq!(back.ui.sidebar_width, 300);
    }

    #[test]
    fn settings_ignores_persisted_prompt_section() {
        // The removed "blocks" prompt model must not break older settings files.
        let back: Settings = serde_json::from_str(
            r#"{"prompt":{"mode":"blocks","left":["cwd"],"right":[],"inputSymbol":"❯","colors":{}},"shell":"fish"}"#,
        )
        .unwrap();
        assert_eq!(back.shell.as_deref(), Some("fish"));
    }

    #[test]
    fn legacy_profiles_are_hoisted_and_dropped() {
        let legacy = r#"{
            "version": 1,
            "defaultProfileId": "p2",
            "profiles": [
                {"id": "p1", "name": "One", "shell": "zsh", "fontSize": 15},
                {"id": "p2", "name": "Two", "shell": "fish", "cwd": "/tmp",
                 "themeName": "Light", "env": ["FOO=1"], "scrollback": null}
            ],
            "autoSwitchRules": [{"hostPattern": "prod-*", "profileId": "p2"}],
            "editorCommand": "code {file}"
        }"#;
        let mut value: serde_json::Value = serde_json::from_str(legacy).unwrap();
        assert!(migrate_legacy_profiles(&mut value));
        let back: Settings = serde_json::from_value(value).unwrap();
        // The default profile (p2) wins over the first one.
        assert_eq!(back.shell.as_deref(), Some("fish"));
        assert_eq!(back.cwd.as_deref(), Some("/tmp"));
        assert_eq!(back.theme_name.as_deref(), Some("Light"));
        assert_eq!(back.env, Some(vec!["FOO=1".to_string()]));
        // Null profile values stay None.
        assert_eq!(back.scrollback, None);
        // Non-profile settings are untouched.
        assert_eq!(back.editor_command.as_deref(), Some("code {file}"));
    }

    #[test]
    fn migration_is_a_noop_for_current_documents() {
        let mut value: serde_json::Value =
            serde_json::from_str(r#"{"shell":"fish","ui":{"sidebarWidth":300}}"#).unwrap();
        assert!(!migrate_legacy_profiles(&mut value));
    }

    #[test]
    fn legacy_command_completion_folds_into_finished() {
        let mut value: serde_json::Value = serde_json::from_str(
            r#"{"notifications":{"commandCompletion":false,"pasteWarning":true}}"#,
        )
        .unwrap();
        assert!(migrate_notifications(&mut value));
        let back: Settings = serde_json::from_value(value).unwrap();
        assert!(!back.notifications.events.finished);
        // Other events keep their defaults.
        assert!(back.notifications.events.needs_confirmation);
        assert!(back.notifications.events.error);
        assert!(back.notifications.paste_warning);
    }

    #[test]
    fn notification_defaults_backfill_missing_keys() {
        let back: Settings =
            serde_json::from_str(r#"{"notifications":{"pasteWarning":true}}"#).unwrap();
        assert!(back.notifications.title_detection);
        assert!(back.notifications.taskbar_attention);
        assert_eq!(back.notifications.idle_threshold_ms, 5000);
        assert!(!back.notifications.error_patterns.is_empty());
    }

    #[test]
    fn update_settings_default_to_auto_check_enabled() {
        // 0.2.2 settings files predate the `updates` group entirely.
        let back: Settings = serde_json::from_str(r#"{"shell":"fish"}"#).unwrap();
        assert!(back.updates.auto_check);
        assert!(back.updates.skipped_versions.is_empty());
    }

    #[test]
    fn update_settings_parse_camel_case_keys() {
        let back: Settings = serde_json::from_str(
            r#"{"updates":{"autoCheck":false,"skippedVersions":["0.3.0","0.3.1"]}}"#,
        )
        .unwrap();
        assert!(!back.updates.auto_check);
        assert_eq!(back.updates.skipped_versions, vec!["0.3.0", "0.3.1"]);
    }

    #[test]
    fn update_settings_roundtrip() {
        let settings = Settings {
            updates: UpdateSettings {
                auto_check: false,
                skipped_versions: vec!["0.4.0".to_string()],
            },
            ..Default::default()
        };
        let json = serde_json::to_string(&settings).unwrap();
        assert!(json.contains("\"autoCheck\":false"));
        assert!(json.contains("\"skippedVersions\":[\"0.4.0\"]"));
        let back: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.updates.auto_check, settings.updates.auto_check);
        assert_eq!(
            back.updates.skipped_versions,
            settings.updates.skipped_versions
        );
    }

    #[test]
    fn update_settings_partial_group_backfills_missing_keys() {
        // An `updates` group written by an older build may miss one of the keys.
        let back: Settings =
            serde_json::from_str(r#"{"updates":{"skippedVersions":["1.0.0"]}}"#).unwrap();
        assert!(back.updates.auto_check);
        assert_eq!(back.updates.skipped_versions, vec!["1.0.0"]);
    }

    #[test]
    fn notification_migration_is_a_noop_without_legacy_key() {
        let mut value: serde_json::Value =
            serde_json::from_str(r#"{"notifications":{"events":{"finished":false}}}"#).unwrap();
        assert!(!migrate_notifications(&mut value));
    }
}
