use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{Arc, Condvar, Mutex},
    time::Duration,
};
use tauri::{ipc::Channel, State};

#[derive(Default)]
pub struct Sessions(Mutex<HashMap<String, Arc<Session>>>);
struct Flow {
    pending: usize,
    closed: bool,
}
struct Session {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    flow: (Mutex<Flow>, Condvar),
}
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Output {
    Data { bytes: Vec<u8> },
    Exit { code: Option<u32> },
    Error { message: String },
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    id: String,
    shell: String,
    cwd: String,
    pid: Option<u32>,
}
fn size(cols: u16, rows: u16) -> Result<PtySize, String> {
    if !(2..=1000).contains(&cols) || !(1..=500).contains(&rows) {
        return Err("Invalid terminal dimensions".into());
    }
    Ok(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })
}
impl Session {
    fn stop(&self) {
        let mut flow = self.flow.0.lock().unwrap();
        if flow.closed {
            return;
        }
        flow.closed = true;
        self.flow.1.notify_all();
        drop(flow);
        // Signal this PTY's foreground job as well as its shell, never another session.
        #[cfg(unix)]
        if let Some(fd) = self.master.lock().unwrap().as_raw_fd() {
            let group = unsafe { libc::tcgetpgrp(fd) };
            if group > 1 {
                unsafe {
                    libc::kill(-group, libc::SIGHUP);
                }
            }
        }
        let _ = self.killer.lock().unwrap().kill();
    }
}
impl Sessions {
    fn get(&self, id: &str) -> Result<Arc<Session>, String> {
        self.0
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| "Terminal session has ended".into())
    }
    pub fn shutdown(&self) {
        for (_, session) in self.0.lock().unwrap().drain() {
            session.stop();
        }
    }
}
#[tauri::command]
pub fn open_terminal(
    state: State<'_, Sessions>,
    cols: u16,
    rows: u16,
    output: Channel<Output>,
) -> Result<Info, String> {
    let mut sessions = state.0.lock().unwrap();
    if sessions.len() >= 12 {
        return Err("You can open up to 12 terminals".into());
    }
    let pair = native_pty_system()
        .openpty(size(cols, rows)?)
        .map_err(|e| e.to_string())?;
    let shell = std::env::var("SHELL")
        .ok()
        .filter(|p| std::path::Path::new(p).is_absolute() && std::path::Path::new(p).is_file())
        .unwrap_or_else(|| "/bin/zsh".into());
    let cwd = std::env::var("HOME").unwrap_or_else(|_| "/".into());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l");
    cmd.arg("-i");
    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "Ultron");
    cmd.env("TERM_PROGRAM_VERSION", env!("CARGO_PKG_VERSION"));
    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let pid = child.process_id();
    let reader = pair.master.try_clone_reader();
    let writer = pair.master.take_writer();
    let (mut reader, writer) = match (reader, writer) {
        (Ok(r), Ok(w)) => (r, w),
        _ => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Unable to create terminal streams".into());
        }
    };
    let session = Arc::new(Session {
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        killer: Mutex::new(child.clone_killer()),
        flow: (
            Mutex::new(Flow {
                pending: 0,
                closed: false,
            }),
            Condvar::new(),
        ),
    });
    let id = uuid::Uuid::new_v4().to_string();
    sessions.insert(id.clone(), session.clone());
    std::thread::spawn(move || {
        let mut buf = [0; 8192];
        loop {
            let mut flow = session.flow.0.lock().unwrap();
            while flow.pending >= 262144 && !flow.closed {
                flow = session
                    .flow
                    .1
                    .wait_timeout(flow, Duration::from_secs(1))
                    .unwrap()
                    .0;
            }
            if flow.closed {
                break;
            }
            drop(flow);
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    session.flow.0.lock().unwrap().pending += n;
                    if output
                        .send(Output::Data {
                            bytes: buf[..n].to_vec(),
                        })
                        .is_err()
                    {
                        session.stop();
                        break;
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(e) => {
                    // Unix PTYs may report EIO instead of EOF after the slave exits.
                    if e.raw_os_error() != Some(libc::EIO) && !session.flow.0.lock().unwrap().closed
                    {
                        let _ = output.send(Output::Error {
                            message: e.to_string(),
                        });
                    }
                    break;
                }
            }
        }
        let code = child.wait().ok().map(|s| s.exit_code());
        session.flow.0.lock().unwrap().closed = true;
        let _ = output.send(Output::Exit { code });
    });
    Ok(Info {
        id,
        shell,
        cwd,
        pid,
    })
}
#[tauri::command]
pub async fn write_terminal(
    state: State<'_, Sessions>,
    id: String,
    data: String,
) -> Result<(), String> {
    if data.len() > 65536 {
        return Err("Input is too large; paste smaller chunks".into());
    }
    let session = state.get(&id)?;
    if session.flow.0.lock().unwrap().closed {
        return Err("Terminal session has ended".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut writer = session.writer.lock().unwrap();
        writer
            .write_all(data.as_bytes())
            .and_then(|_| writer.flush())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn resize_terminal(
    state: State<'_, Sessions>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = state.get(&id)?;
    let result = session
        .master
        .lock()
        .unwrap()
        .resize(size(cols, rows)?)
        .map_err(|e| e.to_string());
    result
}
#[tauri::command]
pub fn ack_terminal(state: State<'_, Sessions>, id: String, bytes: usize) -> Result<(), String> {
    let session = state.get(&id)?;
    let mut flow = session.flow.0.lock().unwrap();
    flow.pending = flow.pending.saturating_sub(bytes);
    session.flow.1.notify_all();
    Ok(())
}
#[tauri::command]
pub fn close_terminal(state: State<'_, Sessions>, id: String) {
    if let Some(session) = state.0.lock().unwrap().remove(&id) {
        session.stop();
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dimensions_are_bounded() {
        assert!(size(80, 24).is_ok());
        assert!(size(0, 24).is_err());
        assert!(size(80, 501).is_err());
    }
    #[test]
    fn real_pty_is_interactive_preserves_unicode_and_resizes() {
        let pair = native_pty_system().openpty(size(80, 24).unwrap()).unwrap();
        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.arg("-c");
        cmd.arg("test -t 0 && test -t 1 && stty size; printf 'พร้อม ☕\\n'; read line; printf 'received:%s\\n' \"$line\"");
        let mut child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);
        pair.master.resize(size(100, 30).unwrap()).unwrap();
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut writer = pair.master.take_writer().unwrap();
        writer.write_all(b"ultron-test\n").unwrap();
        writer.flush().unwrap();
        let watchdog = child.clone_killer();
        let (done_tx, done_rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            if done_rx.recv_timeout(Duration::from_secs(10)).is_err() {
                let mut killer = watchdog;
                let _ = killer.kill();
            }
        });
        let mut data = Vec::new();
        let mut buf = [0; 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => data.extend_from_slice(&buf[..n]),
            }
        }
        let status = child.wait().unwrap();
        let _ = done_tx.send(());
        let text = String::from_utf8(data).unwrap();
        assert!(status.success());
        assert!(text.contains("พร้อม ☕"));
        assert!(text.contains("received:ultron-test"));
        assert_eq!(pair.master.get_size().unwrap().cols, 100);
    }
    #[test]
    fn closing_one_session_preserves_the_other_and_shutdown_releases_all() {
        fn spawn() -> (Arc<Session>, Box<dyn portable_pty::Child + Send + Sync>) {
            let pair = native_pty_system().openpty(size(80, 24).unwrap()).unwrap();
            let mut cmd = CommandBuilder::new("/bin/sh");
            cmd.arg("-c");
            cmd.arg("read line; exit 0");
            let child = pair.slave.spawn_command(cmd).unwrap();
            drop(pair.slave);
            let writer = pair.master.take_writer().unwrap();
            let session = Arc::new(Session {
                master: Mutex::new(pair.master),
                writer: Mutex::new(writer),
                killer: Mutex::new(child.clone_killer()),
                flow: (
                    Mutex::new(Flow {
                        pending: 262144,
                        closed: false,
                    }),
                    Condvar::new(),
                ),
            });
            (session, child)
        }
        fn wait(
            child: &mut Box<dyn portable_pty::Child + Send + Sync>,
        ) -> portable_pty::ExitStatus {
            for _ in 0..100 {
                if let Some(status) = child.try_wait().unwrap() {
                    return status;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            let _ = child.kill();
            let _ = child.wait();
            panic!("Session failed to terminate");
        }
        let (first, mut first_child) = spawn();
        let (second, mut second_child) = spawn();
        let sessions = Sessions::default();
        sessions
            .0
            .lock()
            .unwrap()
            .insert("first".into(), first.clone());
        sessions
            .0
            .lock()
            .unwrap()
            .insert("second".into(), second.clone());
        first.stop();
        let _ = wait(&mut first_child);
        assert!(first.flow.0.lock().unwrap().closed);
        assert!(second_child.try_wait().unwrap().is_none());
        assert!(!second.flow.0.lock().unwrap().closed);
        sessions.shutdown();
        let _ = wait(&mut second_child);
        assert!(sessions.0.lock().unwrap().is_empty());
        assert!(second.flow.0.lock().unwrap().closed);
    }
}
