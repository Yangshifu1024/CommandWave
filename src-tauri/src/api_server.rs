//! Local scripting API: a loopback-only HTTP server (127.0.0.1, random
//! port + token) exposing panes/writes/tab-creation to external scripts
//! (Python, curl…). The port and token are written to `<config>/api.json`
//! so callers can discover them. The iTerm2-style in-process Python API is
//! approximated by this scriptable HTTP surface.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;

use tauri::{AppHandle, Emitter, Manager};

use crate::state::PtyManager;

pub struct ApiHandle {
    pub port: u16,
    pub token: String,
}

/// Start the API server; returns its address for discovery-file writes.
pub fn start(app: AppHandle) -> std::io::Result<ApiHandle> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let port = listener.local_addr()?.port();
    let token = format!("{:016x}", rand_u64());
    write_discovery(&app, port, &token);

    let app2 = app.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let app = app2.clone();
            std::thread::spawn(move || serve_conn(app, stream));
        }
    });
    Ok(ApiHandle { port, token })
}

fn rand_u64() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9e3779b97f4a7c15);
    // splitmix64
    let mut z = ns.wrapping_add(0x9e3779b97f4a7c15);
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
    z ^ (z >> 31)
}

fn write_discovery(app: &AppHandle, port: u16, token: &str) {
    if let Ok(dir) = app.path().app_config_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(
            dir.join("api.json"),
            format!("{{\"port\":{port},\"token\":\"{token}\"}}"),
        );
    }
}

struct Request {
    method: String,
    path: String,
    body: String,
    token_ok: bool,
}

fn read_request(stream: &mut TcpStream) -> Option<Request> {
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let mut parts = line.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.split('?').next()?.to_string();
    let mut token = String::new();
    let mut content_length = 0usize;
    loop {
        let mut header = String::new();
        reader.read_line(&mut header).ok()?;
        let h = header.trim();
        if h.is_empty() {
            break;
        }
        let lower = h.to_ascii_lowercase();
        if let Some(v) = lower.strip_prefix("authorization:") {
            token = h[h.len() - v.trim().len()..].trim().to_string();
        } else if let Some(v) = lower.strip_prefix("content-length:") {
            content_length = v.trim().parse().unwrap_or(0);
        }
    }
    let mut body = vec![0u8; content_length.min(64 * 1024)];
    if content_length > 0 {
        reader.read_exact(&mut body).ok()?;
    }
    Some(Request {
        method,
        path,
        body: String::from_utf8_lossy(&body).into_owned(),
        token_ok: !token.is_empty() && token == current_token(),
    })
}

fn current_token() -> String {
    TOKEN.with(|t| t.borrow().clone())
}

thread_local! {
    static TOKEN: std::cell::RefCell<String> = std::cell::RefCell::new(String::new());
}

use std::net::TcpStream;

fn serve_conn(app: AppHandle, mut stream: TcpStream) {
    TOKEN.with(|t| *t.borrow_mut() = read_token(&app));
    let Some(req) = read_request(&mut stream) else {
        return;
    };
    let (status, body) = route(&app, &req);
    let resp = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(resp.as_bytes());
}

fn read_token(app: &AppHandle) -> String {
    if let Ok(dir) = app.path().app_config_dir() {
        if let Ok(text) = std::fs::read_to_string(dir.join("api.json")) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                return v["token"].as_str().unwrap_or("").to_string();
            }
        }
    }
    String::new()
}

fn route(app: &AppHandle, req: &Request) -> (&'static str, String) {
    if !req.token_ok {
        return ("401 Unauthorized", r#"{"error":"bad token"}"#.into());
    }
    match (req.method.as_str(), req.path.as_str()) {
        ("GET", "/health") => ("200 OK", r#"{"ok":true}"#.into()),
        ("GET", "/panes") => {
            let manager = app.state::<PtyManager>();
            let sessions = manager.sessions.lock().unwrap();
            let ids: Vec<u32> = sessions.keys().copied().collect();
            (
                "200 OK",
                serde_json::to_string(&serde_json::json!({ "panes": ids })).unwrap_or_default(),
            )
        }
        ("POST", "/write") => {
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&req.body) else {
                return ("400 Bad Request", r#"{"error":"bad json"}"#.into());
            };
            let Some(pty_id) = v["ptyId"].as_u64() else {
                return ("400 Bad Request", r#"{"error":"ptyId required"}"#.into());
            };
            let Some(data) = v["data"].as_str() else {
                return ("400 Bad Request", r#"{"error":"data required"}"#.into());
            };
            let manager = app.state::<PtyManager>();
            let ok = manager
                .sessions
                .lock()
                .unwrap()
                .get(&(pty_id as u32))
                .map(|s| s.write(data).is_ok())
                .unwrap_or(false);
            (
                if ok { "200 OK" } else { "404 Not Found" },
                serde_json::to_string(&serde_json::json!({ "ok": ok })).unwrap_or_default(),
            )
        }
        ("POST", "/new-tab") => {
            let _ = app.emit("api-new-tab", ());
            ("200 OK", r#"{"ok":true}"#.into())
        }
        _ => ("404 Not Found", r#"{"error":"unknown route"}"#.into()),
    }
}
