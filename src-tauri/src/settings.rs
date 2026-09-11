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

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct NotificationSettings {
    pub command_completion: bool,
    /// Confirm before pasting multi-line / large / destructive text.
    pub paste_warning: bool,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            command_completion: true,
            paste_warning: true,
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
pub struct AutoLogSettings {
    pub enabled: bool,
    pub directory: Option<String>,
}

impl Default for AutoLogSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            directory: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PromptSettings {
    /// "blocks" = built-in input card with the shell's own prompt hidden;
    /// "off" = leave the shell's prompt configuration untouched.
    pub mode: String,
    /// Segment ids for the prompt header's left/right areas: cwd | git |
    /// duration | exit | node | bun | deno | python | go | rust | java |
    /// ruby | php | dotnet | text:<literal>.
    pub left: Vec<String>,
    pub right: Vec<String>,
    /// Symbol shown before the input line.
    pub input_symbol: String,
    /// Per-segment color overrides (segment id → color).
    pub colors: std::collections::HashMap<String, String>,
}

impl Default for PromptSettings {
    fn default() -> Self {
        Self {
            mode: "blocks".to_string(),
            left: vec!["cwd".to_string(), "git".to_string()],
            right: vec!["duration".to_string(), "exit".to_string()],
            input_symbol: "\u{276f}".to_string(),
            colors: std::collections::HashMap::new(),
        }
    }
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
    /// Prompt rendering for the built-in block model.
    pub prompt: PromptSettings,
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
            prompt: PromptSettings::default(),
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
    let mut value: serde_json::Value =
        serde_json::from_str(&text).unwrap_or(serde_json::json!({}));
    if migrate_legacy_profiles(&mut value) {
        let settings: Settings = serde_json::from_value(value).unwrap_or_default();
        // Persist the migrated shape so the legacy fields don't linger.
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
        assert_eq!(back.auto_log.enabled, false);
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
        assert_eq!(back.auto_log.enabled, false);
    }

    #[test]
    fn settings_parse_uses_camel_case_keys() {
        let back: Settings =
            serde_json::from_str(r#"{"shell":"fish","ui":{"tabBarPosition":"left","sidebarWidth":300}}"#)
                .unwrap();
        assert_eq!(back.shell.as_deref(), Some("fish"));
        assert_eq!(back.ui.sidebar_width, 300);
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
}
