use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::Result;
use portable_pty::{native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri::ipc::Channel;

use crate::shell_integration;
use crate::state::PtyManager;

/// Lifetime of one PTY session. The reader thread owns the read end; input
/// goes through `writer`; `master` handles resizes; `killer` aborts the child.
pub struct Session {
    pub id: u32,
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    closed: AtomicBool,
}

impl Session {
    pub fn write(&self, data: &str) -> Result<()> {
        self.writer.lock().unwrap().write_all(data.as_bytes())?;
        self.writer.lock().unwrap().flush()?;
        Ok(())
    }

    pub fn resize(&self, rows: u16, cols: u16) -> Result<()> {
        self.master.lock().unwrap().resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    }

    pub fn kill(&self) {
        let _ = self.killer.lock().unwrap().kill();
    }

    pub fn is_closed(&self) -> bool {
        self.closed.load(Ordering::Relaxed)
    }

    fn mark_closed(&self) {
        self.closed.store(true, Ordering::Relaxed);
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyCreateOptions {
    pub rows: u16,
    pub cols: u16,
    pub cwd: Option<String>,
    pub shell: Option<String>,
    pub args: Option<Vec<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyCreated {
    pub pty_id: u32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PtyExit {
    pub pty_id: u32,
    pub exit_code: u32,
}

fn default_shell() -> (String, Vec<String>) {
    #[cfg(target_os = "windows")]
    {
        ("powershell.exe".to_string(), vec![])
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(shell) = std::env::var("SHELL").ok().filter(|s| !s.is_empty()) {
            (shell, vec!["-l".to_string()])
        } else if cfg!(target_os = "macos") {
            ("/bin/zsh".to_string(), vec!["-l".to_string()])
        } else {
            ("/bin/bash".to_string(), vec!["-l".to_string()])
        }
    }
}

pub fn spawn_session(
    manager: &PtyManager,
    app: AppHandle,
    options: PtyCreateOptions,
    on_output: Channel<Vec<u8>>,
) -> Result<PtyCreated> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: options.rows,
        cols: options.cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let custom_shell = options.shell.is_some();
    let (shell, args) = match options.shell {
        Some(s) => (s, options.args.unwrap_or_default()),
        None => default_shell(),
    };
    let mut cmd = CommandBuilder::new(&shell);
    cmd.args(&args);
    if let Some(cwd) = &options.cwd {
        cmd.cwd(cwd);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "CommandWave");
    // Inject cwd-reporting integration (OSC 7 → tab titles) for the default
    // shell only; profile-configured custom shells are left untouched.
    if !custom_shell {
        if let Ok(config_dir) = app.path().app_config_dir() {
            if let Some(vars) = shell_integration::env_for_shell(&shell, &config_dir) {
                for (key, value) in vars {
                    cmd.env(key, value);
                }
            }
        }
    }

    let child = pair.slave.spawn_command(cmd)?;
    let writer = pair.master.take_writer()?;
    let reader = pair.master.try_clone_reader()?;
    let killer = child.clone_killer();

    let id = manager.next_id.fetch_add(1, Ordering::Relaxed);
    let session = Arc::new(Session {
        id,
        writer: Mutex::new(writer),
        master: Mutex::new(pair.master),
        killer: Mutex::new(killer),
        child: Mutex::new(child),
        closed: AtomicBool::new(false),
    });
    manager
        .sessions
        .lock()
        .unwrap()
        .insert(id, session.clone());

    spawn_output_forwarder(reader, on_output, session, app);
    Ok(PtyCreated { pty_id: id })
}

/// Reads PTY output on a dedicated thread and forwards it to the frontend
/// channel. Output is batched: an 8ms ticker flushes partial batches so
/// interactive prompts appear immediately, while large bursts are flushed
/// early (64KB) to bound memory and keep the IPC stream flowing.
fn spawn_output_forwarder(
    mut reader: Box<dyn Read + Send>,
    on_output: Channel<Vec<u8>>,
    session: Arc<Session>,
    app: AppHandle,
) {
    std::thread::spawn(move || {
        let pending = Arc::new(Mutex::new(Vec::<u8>::new()));

        // Ticker: flush whatever accumulated in the last tick.
        {
            let pending = pending.clone();
            let session = session.clone();
            let on_output = on_output.clone();
            std::thread::spawn(move || {
                while !session.is_closed() {
                    std::thread::sleep(Duration::from_millis(8));
                    let chunk = std::mem::take(&mut *pending.lock().unwrap());
                    if !chunk.is_empty() {
                        if on_output.send(chunk).is_err() {
                            break;
                        }
                    }
                }
                let chunk = std::mem::take(&mut *pending.lock().unwrap());
                if !chunk.is_empty() {
                    let _ = on_output.send(chunk);
                }
            });
        }

        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let mut p = pending.lock().unwrap();
                    p.extend_from_slice(&buf[..n]);
                    if p.len() > 64 * 1024 {
                        let chunk = std::mem::take(&mut *p);
                        drop(p);
                        if on_output.send(chunk).is_err() {
                            break;
                        }
                    }
                }
                Err(_) => break,
            }
        }

        session.mark_closed();
        // Wait for the child so we can report a real exit code.
        let exit_code = session
            .child
            .lock()
            .unwrap()
            .wait()
            .ok()
            .map(|s| s.exit_code())
            .unwrap_or(0);
        if let Some(sessions) = app.try_state::<PtyManager>() {
            sessions.sessions.lock().unwrap().remove(&session.id);
        }
        let _ = app.emit(
            "pty-exit",
            PtyExit {
                pty_id: session.id,
                exit_code,
            },
        );
    });
}

pub fn close_session(manager: &PtyManager, pty_id: u32) {
    if let Some(session) = manager.sessions.lock().unwrap().get(&pty_id) {
        session.kill();
    }
}
