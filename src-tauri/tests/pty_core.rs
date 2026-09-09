//! Headless tests for the PTY core: exercises the same portable-pty calls
//! used by `pty::spawn_session` without needing a running Tauri app.

use std::io::Read;
use std::time::{Duration, Instant};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};

#[test]
fn pty_echoes_command_output() {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("openpty failed");

    let mut cmd = CommandBuilder::new("/bin/echo");
    cmd.arg("hello-commandwave");
    cmd.env("TERM", "xterm-256color");
    let mut child = pair.slave.spawn_command(cmd).expect("spawn failed");

    let mut reader = pair.master.try_clone_reader().expect("clone reader failed");
    drop(pair); // our handles are no longer needed

    let mut output = Vec::new();
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut buf = [0u8; 4096];
    while !output.windows(15).any(|w| w == b"hello-commandwave") {
        if Instant::now() > deadline {
            panic!("timed out waiting for echo output; got: {:?}", output);
        }
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => output.extend_from_slice(&buf[..n]),
            Err(_) => break,
        }
    }

    let text = String::from_utf8_lossy(&output);
    assert!(
        text.contains("hello-commandwave"),
        "expected echo output, got: {text:?}"
    );

    let status = child.wait().expect("wait failed");
    assert_eq!(status.exit_code(), 0);
}

#[test]
fn pty_resize_is_accepted() {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("openpty failed");

    pair.master
        .resize(PtySize {
            rows: 40,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("resize failed");
}
