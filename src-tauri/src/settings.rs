use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub shell: Option<String>,
    pub args: Option<Vec<String>>,
    pub cwd: Option<String>,
    pub font_family: Option<String>,
    pub font_size: Option<u16>,
    pub theme_name: Option<String>,
    pub cursor_style: Option<String>,
    pub cursor_blink: Option<bool>,
    pub line_height: Option<f64>,
    pub letter_spacing: Option<f64>,
    pub scrollback: Option<u32>,
    pub badge: Option<String>,
    pub custom_colors: Option<std::collections::HashMap<String, String>>,
    pub background_opacity: Option<f64>,
    /// extra environment variables ("KEY=VALUE")
    pub env: Option<Vec<String>>,
    /// auto-init the starship prompt (zsh via ZDOTDIR chain)
    pub use_starship: Option<bool>,
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            id: "default".to_string(),
            name: "Default".to_string(),
            shell: None,
            args: None,
            cwd: None,
            font_family: None,
            font_size: None,
            theme_name: None,
            cursor_style: None,
            cursor_blink: None,
            line_height: None,
            letter_spacing: None,
            scrollback: None,
            badge: None,
            custom_colors: None,
            background_opacity: None,
            env: None,
            use_starship: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct UiSettings {
    pub tab_bar_position: String, // "top" | "left"
    pub sidebar_width: u16,
    /// Font size delta from the profile's size (⌘+/- zoom).
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

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u8,
    pub profiles: Vec<Profile>,
    pub default_profile_id: String,
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
            profiles: vec![Profile::default()],
            default_profile_id: "default".to_string(),
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
    Ok(serde_json::from_str(&text).unwrap_or_default())
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
        assert_eq!(back.profiles.len(), 1);
    }

    #[test]
    fn settings_parse_tolerates_missing_fields() {
        let back: Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(back.ui.tab_bar_position, "top");
        assert_eq!(back.default_profile_id, "default");
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
            serde_json::from_str(r#"{"defaultProfileId":"p2","ui":{"tabBarPosition":"left","sidebarWidth":300}}"#)
                .unwrap();
        assert_eq!(back.default_profile_id, "p2");
        assert_eq!(back.ui.sidebar_width, 300);
    }
}
