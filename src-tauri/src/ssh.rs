//! Parse `~/.ssh/config` into host entries for SSH profile import.

use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct SshHost {
    pub host: String,
    pub hostname: Option<String>,
    pub user: Option<String>,
}

/// Parse an ssh_config text. Handles `Host` patterns (skipping wildcards),
/// `HostName` and `User` directives; `Include` is not followed.
pub fn parse_ssh_config(text: &str) -> Vec<SshHost> {
    let mut out: Vec<SshHost> = Vec::new();
    let mut current: Option<SshHost> = None;
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let (key, value) = match line.split_once(char::is_whitespace) {
            Some((k, v)) => (k.to_ascii_lowercase(), v.trim()),
            None => (line.to_ascii_lowercase(), ""),
        };
        match key.as_str() {
            "host" => {
                if let Some(host) = current.take() {
                    out.push(host);
                }
                if value.is_empty() || value.contains('*') || value.contains('?') {
                    continue; // wildcard pattern — not a concrete host
                }
                current = Some(SshHost {
                    host: value.to_string(),
                    hostname: None,
                    user: None,
                });
            }
            "hostname" => {
                if let Some(h) = current.as_mut() {
                    h.hostname = Some(value.to_string());
                }
            }
            "user" => {
                if let Some(h) = current.as_mut() {
                    h.user = Some(value.to_string());
                }
            }
            _ => {}
        }
    }
    if let Some(host) = current {
        out.push(host);
    }
    out
}

/// Read the user's ssh config (empty list when absent).
pub fn load_hosts() -> Vec<SshHost> {
    let Some(home) = dirs_home() else {
        return vec![];
    };
    let path = home.join(".ssh").join("config");
    let Ok(text) = std::fs::read_to_string(path) else {
        return vec![];
    };
    parse_ssh_config(&text)
}

fn dirs_home() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(std::path::PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_hosts_with_directives() {
        let text = "
# comment
Host web-server
  HostName 192.168.1.10
  User deploy
  Port 22

Host *
  User default

Host db.internal
  HostName 10.0.0.5
";
        let hosts = parse_ssh_config(text);
        assert_eq!(hosts.len(), 2);
        assert_eq!(hosts[0], SshHost {
            host: "web-server".into(),
            hostname: Some("192.168.1.10".into()),
            user: Some("deploy".into()),
        });
        assert_eq!(hosts[1].host, "db.internal");
        assert_eq!(hosts[1].user, None);
    }

    #[test]
    fn skips_wildcards_and_empty() {
        assert!(parse_ssh_config("Host *\n  User x\n").is_empty());
        assert!(parse_ssh_config("").is_empty());
    }
}
