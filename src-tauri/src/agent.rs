//! Agent notifications: the Tier-3 integration installer.
//!
//! CommandWave runs CLI coding agents inside terminal panes and wants to know
//! when one needs confirmation, finishes a turn, or errors. Tier 0/1 (output
//! idle + terminal escape signals) need no cooperation; Tier 3 installs each
//! agent's own hook so the agent reports its state explicitly. Every hook
//! ultimately runs this same binary with `--agent-event <event>`; the CLI
//! reads the pane id / port / token from the environment that `pty.rs`
//! injects into every pane and POSTs to the local loopback API server.
//!
//! Installations are conservative: the original config is backed up to
//! `<file>.commandwave.bak` before the first write, our entries are tagged by
//! the `--agent-event` marker so they can be removed surgically, and
//! `uninstall` restores the backup when one exists.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;

/// Environment variables injected into every pane (see `pty.rs`).
pub const ENV_PANE_ID: &str = "COMMANDWAVE_PANE_ID";
pub const ENV_API_PORT: &str = "COMMANDWAVE_API_PORT";
pub const ENV_HOOK_TOKEN: &str = "COMMANDWAVE_HOOK_TOKEN";

/// Canonical agent events reported to the app.
pub const EVENTS: &[&str] = &["working", "needs-confirmation", "finished", "error", "idle"];

/// Marker that identifies our hook entries inside a user config file.
const MARKER: &str = "--agent-event";
const BACKUP_SUFFIX: &str = ".commandwave.bak";

#[derive(Clone, Copy, PartialEq)]
pub enum Strategy {
    /// JSON config with a top-level `hooks` object (Claude / Gemini / …).
    JsonHooks {
        file: &'static str,
        /// (our event, the agent's own hook event name)
        events: &'static [(&'static str, &'static str)],
    },
    /// TOML config with `[[hooks]]` tables carrying `event` + `command`.
    TomlHooks {
        file: &'static str,
        events: &'static [(&'static str, &'static str)],
    },
    /// A plugin file CommandWave owns outright inside a plugin directory.
    Plugin {
        dir: &'static str,
        filename: &'static str,
        body: &'static str,
    },
    /// Append one managed line to a config file (aider's notifications command).
    ManagedLine {
        file: &'static str,
        line: &'static str,
    },
}

pub struct AgentSpec {
    pub id: &'static str,
    pub label: &'static str,
    /// Binary basenames used for zero-config recognition (mirrored to the UI).
    pub binaries: &'static [&'static str],
    pub strategy: Strategy,
}

/// The full recognition + integration registry. Recognition is intentionally
/// broad; installation is only meaningful for agents with a real hook/notify
/// mechanism, so a few entries install a best-effort integration.
pub const AGENTS: &[AgentSpec] = &[
    AgentSpec {
        id: "claude",
        label: "Claude Code",
        binaries: &["claude"],
        strategy: Strategy::JsonHooks {
            file: ".claude/settings.json",
            events: &[
                ("needs-confirmation", "Notification"),
                ("finished", "Stop"),
                ("error", "StopFailure"),
            ],
        },
    },
    AgentSpec {
        id: "codex",
        label: "Codex CLI",
        binaries: &["codex"],
        strategy: Strategy::JsonHooks {
            file: ".codex/hooks.json",
            events: &[
                ("needs-confirmation", "PermissionRequest"),
                ("finished", "Stop"),
            ],
        },
    },
    AgentSpec {
        id: "gemini",
        label: "Gemini CLI",
        binaries: &["gemini"],
        strategy: Strategy::JsonHooks {
            file: ".gemini/settings.json",
            events: &[
                ("needs-confirmation", "Notification"),
                ("finished", "AfterAgent"),
            ],
        },
    },
    AgentSpec {
        id: "opencode",
        label: "OpenCode",
        binaries: &["opencode"],
        strategy: Strategy::Plugin {
            dir: ".config/opencode/plugins",
            filename: "commandwave-notify.js",
            body: include_str!("agent_plugins/opencode.js"),
        },
    },
    AgentSpec {
        id: "aider",
        label: "aider",
        binaries: &["aider"],
        strategy: Strategy::ManagedLine {
            file: ".aider.conf.yml",
            line: "notifications: true",
        },
    },
    AgentSpec {
        id: "cursor",
        label: "Cursor CLI",
        binaries: &["cursor-agent", "agent"],
        strategy: Strategy::JsonHooks {
            file: ".cursor/hooks.json",
            events: &[("finished", "stop")],
        },
    },
    AgentSpec {
        id: "copilot",
        label: "GitHub Copilot CLI",
        binaries: &["copilot"],
        strategy: Strategy::JsonHooks {
            file: ".copilot/hooks.json",
            events: &[
                ("needs-confirmation", "notification"),
                ("finished", "agentStop"),
                ("error", "errorOccurred"),
            ],
        },
    },
    AgentSpec {
        id: "kimi",
        label: "Kimi CLI",
        binaries: &["kimi", "kimi-code"],
        strategy: Strategy::TomlHooks {
            file: ".kimi/config.toml",
            events: &[
                ("needs-confirmation", "Notification"),
                ("finished", "Stop"),
                ("error", "StopFailure"),
            ],
        },
    },
    AgentSpec {
        id: "crush",
        label: "Crush",
        binaries: &["crush"],
        strategy: Strategy::JsonHooks {
            file: ".config/crush/crush.json",
            events: &[("needs-confirmation", "PreToolUse")],
        },
    },
    AgentSpec {
        id: "grok",
        label: "Grok CLI",
        binaries: &["grok"],
        strategy: Strategy::JsonHooks {
            file: ".grok/hooks.json",
            events: &[
                ("needs-confirmation", "Notification"),
                ("finished", "Stop"),
                ("error", "StopFailure"),
            ],
        },
    },
    AgentSpec {
        id: "antigravity",
        label: "Antigravity",
        binaries: &["agy"],
        strategy: Strategy::JsonHooks {
            file: ".gemini/config/hooks.json",
            events: &[("finished", "Stop")],
        },
    },
    AgentSpec {
        id: "amp",
        label: "Amp",
        binaries: &["amp"],
        strategy: Strategy::Plugin {
            dir: ".config/amp/plugins",
            filename: "commandwave-notify.ts",
            body: include_str!("agent_plugins/amp.ts"),
        },
    },
    AgentSpec {
        id: "pi",
        label: "Pi",
        binaries: &["pi"],
        strategy: Strategy::Plugin {
            dir: ".pi/agent/extensions",
            filename: "commandwave-notify.ts",
            body: include_str!("agent_plugins/pi.ts"),
        },
    },
];

pub fn find(agent_id: &str) -> Option<&'static AgentSpec> {
    AGENTS.iter().find(|a| a.id == agent_id)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub id: String,
    pub label: String,
    pub binaries: Vec<String>,
    /// Detected on this machine (binary on PATH or config directory present).
    pub detected: bool,
    pub installed: bool,
    pub config_path: Option<String>,
}

/// Absolute path of a `~`-relative config path.
fn home_path(rel: &str) -> Option<PathBuf> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)?;
    Some(home.join(rel))
}

/// Whether a config path or its containing directory already exists.
fn config_present(rel: &str) -> bool {
    match home_path(rel) {
        Some(p) => p.exists() || p.parent().map(|d| d.exists()).unwrap_or(false),
        None => false,
    }
}

fn file_exists(name: &str) -> bool {
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    let exts: Vec<String> = if cfg!(windows) {
        std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".EXE;.CMD;.BAT".into())
            .split(';')
            .map(|s| s.to_lowercase())
            .collect()
    } else {
        vec![String::new()]
    };
    for dir in std::env::split_paths(&path) {
        for ext in &exts {
            let candidate = dir.join(format!("{name}{ext}"));
            if candidate.is_file() {
                return true;
            }
        }
    }
    false
}

pub fn detected(spec: &AgentSpec) -> bool {
    spec.binaries.iter().any(|b| file_exists(b))
        || strategy_path(spec).map(config_present).unwrap_or(false)
}

/// The config path (relative to home) a strategy writes to.
fn strategy_path(spec: &AgentSpec) -> Option<&'static str> {
    match spec.strategy {
        Strategy::JsonHooks { file, .. } => Some(file),
        Strategy::TomlHooks { file, .. } => Some(file),
        Strategy::ManagedLine { file, .. } => Some(file),
        Strategy::Plugin { dir, .. } => Some(dir),
    }
}

fn installed(app: &AppHandle, id: &str) -> bool {
    crate::settings::load(app)
        .ok()
        .and_then(|s| s.notifications.integrations.get(id).map(|i| i.installed))
        .unwrap_or(false)
}

pub fn list(app: &AppHandle) -> Vec<AgentInfo> {
    AGENTS
        .iter()
        .map(|spec| AgentInfo {
            id: spec.id.to_string(),
            label: spec.label.to_string(),
            binaries: spec.binaries.iter().map(|b| b.to_string()).collect(),
            detected: detected(spec),
            installed: installed(app, spec.id),
            config_path: strategy_path(spec)
                .and_then(|rel| home_path(rel).map(|p| p.to_string_lossy().into_owned())),
        })
        .collect()
}

// ---------- Command construction ----------

/// Absolute path to this executable, used by every hook.
pub fn binary_path(_app: &AppHandle) -> String {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "commandwave".to_string())
}

/// The hook command line: this binary reporting `event`.
pub fn hook_command(app: &AppHandle, event: &str) -> String {
    format!("\"{}\" {MARKER} {event}", binary_path(app))
}

/// A Claude-style hook definition for one event.
fn json_hook_entry(command: &str) -> serde_json::Value {
    serde_json::json!({
        "hooks": [
            { "type": "command", "command": command }
        ]
    })
}

// ---------- Filesystem helpers ----------

fn backup_path(path: &Path) -> PathBuf {
    PathBuf::from(format!("{}{}", path.to_string_lossy(), BACKUP_SUFFIX))
}

/// Copy `path` to its backup once (never overwrite an existing backup).
fn ensure_backup(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let backup = backup_path(path);
    if backup.exists() {
        return Ok(());
    }
    std::fs::copy(path, &backup)
        .map(|_| ())
        .map_err(|e| format!("backup {}: {e}", backup.display()))
}

fn write(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, contents).map_err(|e| e.to_string())
}

// ---------- Install / uninstall ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOutcome {
    pub path: String,
    pub preview: String,
}

pub fn install(app: &AppHandle, agent_id: &str) -> Result<InstallOutcome, String> {
    let spec = find(agent_id).ok_or_else(|| format!("unknown agent {agent_id}"))?;
    match spec.strategy {
        Strategy::JsonHooks { file, events } => install_json(app, spec, file, events),
        Strategy::TomlHooks { file, events } => install_toml(app, spec, file, events),
        Strategy::Plugin {
            dir,
            filename,
            body,
        } => install_plugin(app, spec, dir, filename, body),
        Strategy::ManagedLine { file, line } => install_line(app, spec, file, line),
    }
}

pub fn uninstall(_app: &AppHandle, agent_id: &str) -> Result<InstallOutcome, String> {
    let spec = find(agent_id).ok_or_else(|| format!("unknown agent {agent_id}"))?;
    let rel = strategy_path(spec).ok_or("agent has no config path")?;
    let path = home_path(rel).ok_or("no home directory")?;
    match spec.strategy {
        Strategy::Plugin { filename, .. } => {
            let target = path.join(filename);
            if target.exists() {
                std::fs::remove_file(&target).map_err(|e| e.to_string())?;
            }
            Ok(InstallOutcome {
                path: target.to_string_lossy().into_owned(),
                preview: "removed".into(),
            })
        }
        _ => {
            let backup = backup_path(&path);
            if backup.exists() {
                std::fs::copy(&backup, &path).map_err(|e| e.to_string())?;
                std::fs::remove_file(&backup).map_err(|e| e.to_string())?;
            } else if path.exists() {
                // No backup: strip our entries surgically.
                let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
                let stripped = strip_managed(&text);
                write(&path, &stripped)?;
            }
            Ok(InstallOutcome {
                path: path.to_string_lossy().into_owned(),
                preview: "restored".into(),
            })
        }
    }
}

fn install_json(
    app: &AppHandle,
    _spec: &AgentSpec,
    rel: &str,
    events: &[(&str, &str)],
) -> Result<InstallOutcome, String> {
    let path = home_path(rel).ok_or("no home directory")?;
    ensure_backup(&path)?;
    let mut root: serde_json::Value = if path.exists() {
        let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    let obj = root.as_object_mut().ok_or("config root is not an object")?;
    let hooks = obj.entry("hooks").or_insert_with(|| serde_json::json!({}));
    let hooks = hooks.as_object_mut().ok_or("hooks is not an object")?;
    for (our_event, agent_event) in events {
        let command = hook_command(app, our_event);
        let entry = json_hook_entry(&command);
        let list = hooks
            .entry((*agent_event).to_string())
            .or_insert_with(|| serde_json::json!([]));
        if let Some(list) = list.as_array_mut() {
            // Replace any earlier CommandWave entry for the same event.
            list.retain(|v| !v.to_string().contains(MARKER));
            list.push(entry);
        }
    }
    let text = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    write(&path, &text)?;
    Ok(InstallOutcome {
        path: path.to_string_lossy().into_owned(),
        preview: text,
    })
}

fn install_toml(
    app: &AppHandle,
    _spec: &AgentSpec,
    rel: &str,
    events: &[(&str, &str)],
) -> Result<InstallOutcome, String> {
    let path = home_path(rel).ok_or("no home directory")?;
    ensure_backup(&path)?;
    let text = if path.exists() {
        std::fs::read_to_string(&path).map_err(|e| e.to_string())?
    } else {
        String::new()
    };
    let mut doc = text
        .parse::<toml_edit::DocumentMut>()
        .map_err(|e| e.to_string())?;
    // Drop our previously injected hook tables so reinstalling is idempotent.
    strip_toml_managed(&mut doc);
    let mut array = doc
        .get("hooks")
        .and_then(|i| i.as_array_of_tables())
        .cloned()
        .unwrap_or_default();
    for (our_event, agent_event) in events {
        let mut table = toml_edit::Table::new();
        table.insert("event", toml_edit::value(*agent_event));
        let command = hook_command(app, our_event);
        table.insert("command", toml_edit::value(command));
        array.push(table);
    }
    doc["hooks"] = toml_edit::Item::ArrayOfTables(array);
    let out = doc.to_string();
    write(&path, &out)?;
    Ok(InstallOutcome {
        path: path.to_string_lossy().into_owned(),
        preview: out,
    })
}

fn install_plugin(
    app: &AppHandle,
    _spec: &AgentSpec,
    dir: &str,
    filename: &str,
    body: &str,
) -> Result<InstallOutcome, String> {
    let target = home_path(dir).ok_or("no home directory")?.join(filename);
    ensure_backup(&target)?;
    let rendered = body.replace("{BIN}", &binary_path(app));
    write(&target, &rendered)?;
    Ok(InstallOutcome {
        path: target.to_string_lossy().into_owned(),
        preview: rendered,
    })
}

fn install_line(
    _app: &AppHandle,
    _spec: &AgentSpec,
    rel: &str,
    line: &str,
) -> Result<InstallOutcome, String> {
    let path = home_path(rel).ok_or("no home directory")?;
    ensure_backup(&path)?;
    let existing = if path.exists() {
        std::fs::read_to_string(&path).map_err(|e| e.to_string())?
    } else {
        String::new()
    };
    let mut lines: Vec<String> = existing
        .lines()
        .filter(|l| !l.contains(MARKER))
        .map(|s| s.to_string())
        .collect();
    lines.push(line.to_string());
    let out = lines.join("\n") + "\n";
    write(&path, &out)?;
    Ok(InstallOutcome {
        path: path.to_string_lossy().into_owned(),
        preview: out,
    })
}

/// Remove our hook entries from a JSON/plain-text config by recursive marker
/// match, used when no backup exists.
fn strip_managed(text: &str) -> String {
    if let Ok(mut value) = serde_json::from_str::<serde_json::Value>(text) {
        strip_json(&mut value);
        return serde_json::to_string_pretty(&value).unwrap_or_else(|_| text.to_string());
    }
    text.lines()
        .filter(|l| !l.contains(MARKER))
        .collect::<Vec<_>>()
        .join("\n")
}

fn strip_json(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Array(items) => {
            items.retain(|v| !v.to_string().contains(MARKER));
            for item in items.iter_mut() {
                strip_json(item);
            }
        }
        serde_json::Value::Object(map) => {
            // Drop bare marker strings (e.g. a `command` field), then recurse.
            map.retain(|_, v| !matches!(v, serde_json::Value::String(s) if s.contains(MARKER)));
            for (_, v) in map.iter_mut() {
                strip_json(v);
            }
        }
        _ => {}
    }
}

fn strip_toml_managed(doc: &mut toml_edit::DocumentMut) {
    let keep: Vec<toml_edit::Table> = doc
        .get("hooks")
        .and_then(|i| i.as_array_of_tables())
        .map(|a| {
            a.iter()
                .filter(|t| {
                    !t.get("command")
                        .and_then(|c| c.as_str())
                        .map(|s| s.contains(MARKER))
                        .unwrap_or(false)
                })
                .cloned()
                .collect()
        })
        .unwrap_or_default();
    if keep.is_empty() {
        doc.remove("hooks");
    } else {
        let mut array = toml_edit::ArrayOfTables::new();
        for t in keep {
            array.push(t);
        }
        doc["hooks"] = toml_edit::Item::ArrayOfTables(array);
    }
}

// ---------- Hook CLI ----------

/// `commandwave --agent-event <event>`: report a hook event to the running
/// app over loopback and exit. Returns true when the CLI handled the args so
/// the caller can skip starting the GUI.
pub fn run_event_cli(args: &[String]) -> bool {
    let Some(idx) = args.iter().position(|a| a == MARKER) else {
        return false;
    };
    let event = args.get(idx + 1).cloned().unwrap_or_default();
    if !EVENTS.contains(&event.as_str()) {
        eprintln!("commandwave: unknown agent event {event:?}");
        std::process::exit(2);
    }
    let port = std::env::var(ENV_API_PORT).unwrap_or_default();
    let token = std::env::var(ENV_HOOK_TOKEN).unwrap_or_default();
    let pane = std::env::var(ENV_PANE_ID).unwrap_or_default();
    if port.is_empty() || token.is_empty() {
        // Hook fired outside a CommandWave pane (or the API is down): no-op.
        std::process::exit(0);
    }
    let body = serde_json::json!({
        "paneId": pane,
        "event": event,
        "agent": std::env::var("COMMANDWAVE_AGENT").unwrap_or_default(),
    })
    .to_string();
    let request = format!(
        "POST /agent-event HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let mut stream =
        match std::net::TcpStream::connect(("127.0.0.1", port.parse::<u16>().unwrap_or(0))) {
            Ok(s) => s,
            Err(_) => std::process::exit(0),
        };
    use std::io::Write;
    let _ = stream.write_all(request.as_bytes());
    std::process::exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_ids_are_unique_and_have_binaries() {
        let mut ids: Vec<&str> = AGENTS.iter().map(|a| a.id).collect();
        ids.sort_unstable();
        let before = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), before, "duplicate agent ids");
        for agent in AGENTS {
            assert!(!agent.binaries.is_empty(), "{} has no binaries", agent.id);
        }
    }

    #[test]
    fn every_json_agent_event_is_canonical() {
        for agent in AGENTS {
            let events: &[(&str, &str)] = match agent.strategy {
                Strategy::JsonHooks { events, .. } => events,
                Strategy::TomlHooks { events, .. } => events,
                _ => continue,
            };
            for (our_event, _) in events {
                assert!(EVENTS.contains(our_event), "bad event {our_event}");
            }
        }
    }

    #[test]
    fn json_hook_entry_carries_the_type_and_command() {
        let entry = json_hook_entry("\"cw\" --agent-event finished");
        assert_eq!(entry["hooks"][0]["type"], "command");
        assert!(entry["hooks"][0]["command"]
            .as_str()
            .unwrap()
            .contains("--agent-event"));
    }

    #[test]
    fn strip_json_removes_only_marker_entries() {
        let text = r#"{
            "hooks": {
                "Stop": [
                    {"hooks": [{"type": "command", "command": "keep-me"}]},
                    {"hooks": [{"type": "command", "command": "cw --agent-event finished"}]}
                ]
            },
            "other": {"command": "cw --agent-event error"}
        }"#;
        let stripped = strip_managed(text);
        assert!(stripped.contains("keep-me"));
        assert!(!stripped.contains("--agent-event"));
    }

    #[test]
    fn strip_managed_falls_back_to_line_filter_for_non_json() {
        let text = "notifications: true\n# --agent-event marker\n";
        assert_eq!(strip_managed(text), "notifications: true");
    }

    #[test]
    fn find_resolves_known_agents() {
        assert_eq!(find("claude").map(|a| a.label), Some("Claude Code"));
        assert!(find("does-not-exist").is_none());
    }
}
