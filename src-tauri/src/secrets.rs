//! Secrets vault persistence: stores client-encrypted blobs (AES-GCM
//! ciphertext produced by the webview); Rust never handles plaintext or
//! master passwords.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SecretBlob {
    pub name: String,
    pub salt: String,
    pub iv: String,
    pub data: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SecretsFile {
    pub entries: Vec<SecretBlob>,
}

fn secrets_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .context("no app config directory")?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("secrets.json"))
}

pub fn load(app: &AppHandle) -> SecretsFile {
    let Ok(path) = secrets_path(app) else {
        return SecretsFile::default();
    };
    std::fs::read_to_string(path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn save(app: &AppHandle, file: &SecretsFile) -> Result<()> {
    std::fs::write(secrets_path(app)?, serde_json::to_string_pretty(file)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secrets_file_parses_empty_and_entries() {
        let f: SecretsFile = serde_json::from_str("{}").unwrap();
        assert!(f.entries.is_empty());
        let f: SecretsFile = serde_json::from_str(
            r#"{"entries":[{"name":"pw","salt":"s","iv":"i","data":"d"}]}"#,
        )
        .unwrap();
        assert_eq!(f.entries[0].name, "pw");
        assert_eq!(f.entries[0].data, "d");
    }
}
