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
}

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            tab_bar_position: "top".to_string(),
            sidebar_width: 180,
            font_size_delta: 0,
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

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u8,
    pub profiles: Vec<Profile>,
    pub default_profile_id: String,
    pub ui: UiSettings,
    pub notifications: NotificationSettings,
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
