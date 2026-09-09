use std::collections::HashMap;
use std::sync::atomic::AtomicU32;
use std::sync::Mutex;

use crate::pty::Session;

/// Global registry of live PTY sessions, managed by Tauri.
pub struct PtyManager {
    pub sessions: Mutex<HashMap<u32, std::sync::Arc<Session>>>,
    pub next_id: AtomicU32,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            next_id: AtomicU32::new(1),
        }
    }
}
