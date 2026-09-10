//! Starship integration: detection, preset listing and applying.

use std::path::PathBuf;
use std::process::Command;

fn run_starship(args: &[&str]) -> Option<String> {
    let output = Command::new("starship").args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// The starship binary version string, or None when not installed.
pub fn detect() -> Option<String> {
    let text = run_starship(&["--version"])?;
    text.lines().next().map(|l| l.trim().to_string())
}

/// Known preset names (mirrors `starship preset --list` so the UI works
/// even when starship is temporarily missing).
pub const PRESETS: &[&str] = &[
    "nerd-font-symbols",
    "bracketed-segments",
    "plain-text-symbols",
    "no-runtime-ets",
    "no-empty-icons",
    "pure-preset",
    "pastel-powerline",
    "tokyo-night",
    "gruvbox-powerline",
    "jetpack",
];

/// List presets: live from starship when available, else the built-ins.
pub fn presets() -> Vec<String> {
    if let Some(listing) = run_starship(&["preset", "--list"]) {
        let names: Vec<String> = listing
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .map(|l| l.to_string())
            .collect();
        if !names.is_empty() {
            return names;
        }
    }
    PRESETS.iter().map(|s| s.to_string()).collect()
}

/// Where starship reads its config (`~/.config/starship.toml` on all
/// platforms).
fn config_path() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    Some(PathBuf::from(home).join(".config").join("starship.toml"))
}

/// Read the current starship config (None when absent).
pub fn read_config() -> Option<String> {
    std::fs::read_to_string(config_path()?).ok()
}

/// Overwrite the starship config with the given TOML text.
pub fn write_config(text: &str) -> Result<String, String> {
    let path = config_path().ok_or("no home directory")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Apply a preset by writing it to the starship config path.
pub fn apply_preset(name: &str) -> Result<String, String> {
    // Only allow known-safe names to avoid argument injection.
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("invalid preset name".to_string());
    }
    let path = config_path().ok_or("no home directory")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let output = Command::new("starship")
        .args(["preset", name, "-o"])
        .arg(&path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!(
            "starship preset failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(path.to_string_lossy().into_owned())
}
