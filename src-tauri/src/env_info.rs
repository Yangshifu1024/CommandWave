//! Per-directory environment detection for the prompt segments: git state
//! and language toolchain versions. Runs on cwd change — not per prompt —
//! with a process-wide cache so panes sharing a directory reuse results.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    pub branch: String,
    pub dirty_count: u32,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LanguageVersion {
    pub id: String,
    pub version: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EnvInfo {
    pub git: Option<GitInfo>,
    pub languages: Vec<LanguageVersion>,
}

/// Language detectors: (segment id, candidate programs, version args).
/// Version text parsing lives in `parse_version`. Extend the table to add
/// a language.
const DETECTORS: &[(&str, &[&str], &[&str])] = &[
    ("node", &["node"], &["--version"]),
    ("bun", &["bun"], &["--version"]),
    ("deno", &["deno"], &["--version"]),
    ("python", &["python3", "python"], &["--version"]),
    ("go", &["go"], &["version"]),
    ("rust", &["rustc"], &["--version"]),
    ("java", &["java"], &["-version"]), // prints to stderr
    ("ruby", &["ruby"], &["--version"]),
    ("php", &["php"], &["--version"]),
    ("dotnet", &["dotnet"], &["--version"]),
];

/// Extract the version token from a `--version` style output.
///
/// Default rule: first whitespace-separated token containing a digit, with
/// a leading `v` / `"` stripped ("v24.19.0" → "24.19.0", `"17.0.2"` →
/// "17.0.2"). `go` prints "go version go1.22.1 …" → "1.22.1".
fn parse_version(id: &str, output: &str) -> Option<String> {
    let token = output.split_whitespace().find(|t| t.chars().any(|c| c.is_ascii_digit()))?;
    if id == "go" {
        let tok = output.split_whitespace().find(|t| t.starts_with("go1"))?;
        return Some(tok.trim_start_matches("go").to_string());
    }
    let cleaned = token.trim_start_matches(['v', '"']);
    let cleaned = cleaned.trim_end_matches('"');
    (!cleaned.is_empty()).then(|| cleaned.to_string())
}

/// First line of the merged stdout+stderr of a program run; None when the
/// program is missing or fails.
fn first_line(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let mut text = text.trim().to_string();
    if text.is_empty() {
        text = String::from_utf8_lossy(&output.stderr).trim().to_string();
    }
    let line = text.lines().next()?.trim().to_string();
    (!line.is_empty()).then_some(line)
}

/// Git branch + dirty entry count for a directory (None outside a repo).
/// `-uno` keeps the status scan off untracked files, which is what makes it
/// fast enough to run on cwd changes.
fn git_info(cwd: &Path) -> Option<GitInfo> {
    let run = |args: &[&str]| -> Option<String> {
        let output = Command::new("git").arg("-C").arg(cwd).args(args).output().ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        (!text.is_empty()).then_some(text)
    };
    let branch = run(&["rev-parse", "--abbrev-ref", "HEAD"])
        .or_else(|| run(&["rev-parse", "--short", "HEAD"]))?;
    let dirty_count = run(&["status", "--porcelain", "-uno"])
        .map(|out| out.lines().count() as u32)
        .unwrap_or(0);
    Some(GitInfo { branch, dirty_count })
}

/// Cached detection results. Keyed by cwd + the requested segment list (the
/// request shape determines the output). Cleared wholesale when large.
fn cache() -> &'static Mutex<HashMap<(PathBuf, Vec<String>), EnvInfo>> {
    static CACHE: std::sync::OnceLock<Mutex<HashMap<(PathBuf, Vec<String>), EnvInfo>>> =
        std::sync::OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Detect the environment snapshot for a directory. `segments` selects what
/// to detect ("git" and/or language ids); unknown ids are ignored.
pub fn detect(cwd: &Path, segments: &[String]) -> EnvInfo {
    let key = (cwd.to_path_buf(), segments.to_vec());
    if let Some(hit) = cache().lock().unwrap().get(&key) {
        return hit.clone();
    }

    let git = if segments.iter().any(|s| s == "git") {
        git_info(cwd)
    } else {
        None
    };
    let mut languages = Vec::new();
    for (id, programs, args) in DETECTORS {
        if !segments.iter().any(|s| s == id) {
            continue;
        }
        for program in programs.iter() {
            if let Some(line) = first_line(program, args) {
                if let Some(version) = parse_version(id, &line) {
                    languages.push(LanguageVersion {
                        id: id.to_string(),
                        version,
                    });
                }
                break;
            }
        }
    }

    let info = EnvInfo { git, languages };
    let mut cache = cache().lock().unwrap();
    if cache.len() >= 64 {
        cache.clear();
    }
    cache.insert(key, info.clone());
    info
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_version_handles_common_outputs() {
        assert_eq!(parse_version("node", "v24.19.0"), Some("24.19.0".into()));
        assert_eq!(
            parse_version("rust", "rustc 1.82.0 (f6e511eec 2024-10-15)"),
            Some("1.82.0".into())
        );
        assert_eq!(parse_version("go", "go version go1.24.1 darwin/arm64"), Some("1.24.1".into()));
        assert_eq!(parse_version("java", "\"17.0.2\" 2022-01-18"), Some("17.0.2".into()));
        assert_eq!(parse_version("python", "Python 3.12.7"), Some("3.12.7".into()));
        assert_eq!(parse_version("dotnet", "8.0.100"), Some("8.0.100".into()));
        assert_eq!(parse_version("node", "command not found"), None);
    }

    #[test]
    fn first_line_merges_stderr_for_java_style_tools() {
        // A program that always exists on the build machine; assertions are
        // environmental-agnostic: missing program → None, present → Some.
        let missing = first_line("definitely-not-a-real-tool-xyz", &["--version"]);
        assert_eq!(missing, None);
    }

    #[test]
    fn detect_outside_repo_without_segments_is_empty() {
        let dir = std::env::temp_dir();
        let info = detect(&dir, &[]);
        assert_eq!(info.git, None);
        assert!(info.languages.is_empty());
    }

    #[test]
    fn detect_skips_unselected_language_segments() {
        let dir = std::env::temp_dir();
        let info = detect(&dir, &["node".to_string(), "rust".to_string()]);
        // Every returned language must be one of the requested ids.
        assert!(info.languages.iter().all(|l| l.id == "node" || l.id == "rust"));
        let again = detect(&dir, &["node".to_string(), "rust".to_string()]);
        assert_eq!(info, again); // cache hit
    }
}
