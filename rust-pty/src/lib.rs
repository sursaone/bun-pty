//! lib.rs  —  bun-pty backend (final fixed version)

use crossbeam::channel::{unbounded, Receiver, Sender};
use portable_pty::{
    native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize, SlavePty,
};
use serde::{Deserialize, Serialize};
use shell_words::split;                  // <-- NEW
use std::{
    collections::HashMap,
    ffi::CStr,
    io::{Read, Write},
    os::raw::{c_char, c_int},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

/* ---------- constants ---------- */

const SUCCESS: c_int      = 0;
const ERROR: c_int        = -1;
const CHILD_EXITED: c_int = -2;

/* ---------- helpers ---------- */

fn debug(msg: &str) {
    if std::env::var("BUN_PTY_DEBUG").unwrap_or_default() == "1" {
        eprintln!("[rust-pty] {msg}");
    }
}

fn parse_env_string(env_ptr: *const c_char) -> HashMap<String, String> {
    if env_ptr.is_null() {
        return HashMap::new();
    }

    let mut env_map = HashMap::new();
    let mut current_ptr = env_ptr;

    unsafe {
        while *current_ptr != 0 {
            let cstr = CStr::from_ptr(current_ptr);
            
            if let Ok(env_str) = cstr.to_str() {
                if let Some((key, value)) = env_str.split_once('=') {
                    if !key.is_empty() {
                        env_map.insert(key.to_string(), value.to_string());
                    }
                }
            }

            current_ptr = current_ptr.add(cstr.to_bytes_with_nul().len());
        }
    }

    env_map
}

/* ---------- command struct ---------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Command {
    cmd: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    cwd: String,
}

impl Command {
    fn from_cmdline(cmdline: &str, cwd: &str, env_ptr: *const c_char) -> Self {
        let tokens = split(cmdline).unwrap_or_default();   // shell-accurate split
        if tokens.is_empty() {
            return Self {
                cmd: String::new(),
                args: Vec::new(),
                env: HashMap::new(),
                cwd: cwd.to_owned(),
            };
        }

        let cmd  = tokens[0].clone();
        let args = tokens[1..].to_vec();

        let env = parse_env_string(env_ptr);

        Self { cmd, args, env, cwd: cwd.to_owned() }
    }

    fn to_builder(&self) -> CommandBuilder {
        let mut b = CommandBuilder::new(&self.cmd);
        b.cwd(&self.cwd);
        for a in &self.args {
            b.arg(a);
        }
        for (k, v) in &self.env {
            b.env(k, v);
        }
        b
    }
}

/* ---------- async message channel ---------- */

#[derive(Debug, PartialEq, Eq)]
enum Msg {
    Data(Vec<u8>),
    End,
}

struct Reader {
    rx:   Receiver<Msg>,
    done: AtomicBool,
}
impl Reader {
    fn new(rx: Receiver<Msg>) -> Self {
        Self { rx, done: AtomicBool::new(false) }
    }

    fn read(&self) -> Result<Msg, Box<dyn std::error::Error + Send + Sync>> {
        if self.done.load(Ordering::Relaxed) {
            return Ok(Msg::End);
        }
        let mut msgs: Vec<_> = self.rx.try_iter().collect();
        if msgs.iter().any(|m| matches!(m, Msg::End)) {
            self.done.store(true, Ordering::Relaxed);
            thread::sleep(Duration::from_millis(20));
            msgs.extend(self.rx.try_iter());
            msgs.retain(|m| !matches!(m, Msg::End));
            if msgs.is_empty() { return Ok(Msg::End); }
        }
        if msgs.is_empty() {
            return Ok(Msg::Data(Vec::new()));
        }
        let mut out = Vec::new();
        for m in msgs {
            if let Msg::Data(d) = m { out.extend(d); }
        }
        Ok(Msg::Data(out))
    }
}

/* ---------- Pty wrapper ---------- */

struct Pty {
    reader: Reader,
    tx_w:   Sender<(Vec<u8>, usize)>,      // (buffer, len)
    _slave: Box<dyn SlavePty + Send>,
    master: Box<dyn MasterPty + Send>,
    killer: Arc<Mutex<Box<dyn ChildKiller + Send + Sync>>>,
    exited: AtomicBool,
    pid:    c_int,
    pending: Mutex<Vec<u8>>,               // NEW: stash bytes that didn't fit last time
}

unsafe impl Send for Pty {}
unsafe impl Sync for Pty {}

impl Pty {
    fn new(cmd: Command, size: PtySize) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let sys  = native_pty_system();
        let pair = sys.openpty(size)?;
        let mut child = pair.slave.spawn_command(cmd.to_builder())?;
        let killer = Arc::new(Mutex::new(child.clone_killer()));
        let pid    = child.process_id().map(|p| p as c_int).unwrap_or(ERROR);

        /* channels */
        let (tx_r, rx_r)   = unbounded::<Msg>();
        let (tx_w, rx_w)   = unbounded::<(Vec<u8>, usize)>();

        /* wait-thread */
        {
            let tx = tx_r.clone();
            thread::spawn(move || {
                let _ = child.wait();
                let _ = tx.send(Msg::End);
            });
        }

        /* read-thread */
        {
            let mut rdr = pair.master.try_clone_reader()?;
            let tx = tx_r.clone();
            thread::spawn(move || {
                let mut buf = vec![0; 8192];
                loop {
                    match rdr.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => { let _ = tx.send(Msg::Data(buf[..n].to_vec())); }
                        Err(_) => break,
                    }
                }
                let _ = tx.send(Msg::End);
            });
        }

        /* write-thread  (length-aware) */
        {
            let mut wtr = pair.master.take_writer()?;
            thread::spawn(move || {
                while let Ok((data, len)) = rx_w.recv() {
                    if wtr.write_all(&data[..len]).is_err() { break; }
                    let _ = wtr.flush();
                }
            });
        }

        Ok(Self {
            reader: Reader::new(rx_r),
            tx_w,
            _slave: pair.slave,
            master: pair.master,
            killer,
            exited: AtomicBool::new(false),
            pid,
            pending: Mutex::new(Vec::new()),       // NEW: initialize empty pending buffer
        })
    }

    fn read(&self) -> Result<Msg, Box<dyn std::error::Error + Send + Sync>> {
        let m = self.reader.read()?;
        if matches!(m, Msg::End) { self.exited.store(true, Ordering::Relaxed); }
        Ok(m)
    }

    fn write(&self, data: *const u8, len: usize) -> c_int {
        if self.exited.load(Ordering::Relaxed) { return CHILD_EXITED; }
        let slice = unsafe { std::slice::from_raw_parts(data, len) };
        match self.tx_w.send((slice.to_vec(), len)) {
            Ok(_)  => SUCCESS,
            Err(_) => ERROR,
        }
    }

    fn resize(&self, size: PtySize) -> c_int {
        if self.exited.load(Ordering::Relaxed) { return CHILD_EXITED; }
        self.master.resize(size).map(|_| SUCCESS).unwrap_or(ERROR)
    }
    fn kill(&self) -> c_int {
        let res = self.killer.lock().map(|mut k| k.kill());
        match res {
            Ok(Ok(_)) => { self.exited.store(true, Ordering::Relaxed); SUCCESS }
            _         => ERROR,
        }
    }
}

/* ---------- registry ---------- */

use std::sync::atomic::AtomicU32;
lazy_static::lazy_static! {
    static ref REG: Mutex<HashMap<u32, Arc<Pty>>> = Mutex::new(HashMap::new());
}
static NEXT: AtomicU32 = AtomicU32::new(1);

fn store(pty: Arc<Pty>) -> u32 {
    let id = NEXT.fetch_add(1, Ordering::Relaxed);
    REG.lock().unwrap().insert(id, pty);
    id
}
fn with<F: FnOnce(&Arc<Pty>) -> c_int>(id: u32, f: F) -> c_int {
    REG.lock().unwrap().get(&id).map(f).unwrap_or(ERROR)
}

/* ---------- FFI ---------- */

#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_pty_spawn(
    cmd:  *const c_char,
    cwd:  *const c_char,
    env:  *const c_char,
    cols: c_int,
    rows: c_int,
) -> c_int {
    if cmd.is_null() || cwd.is_null() || cols <= 0 || rows <= 0 { return ERROR; }

    let cmdline = unsafe { CStr::from_ptr(cmd) }.to_string_lossy();
    let cwd     = unsafe { CStr::from_ptr(cwd) }.to_string_lossy();

    let size = PtySize { cols: cols as u16, rows: rows as u16, pixel_width: 0, pixel_height: 0 };
    let cmd = Command::from_cmdline(&cmdline, &cwd, env);
    match Pty::new(cmd, size) {
        Ok(p)  => store(Arc::new(p)) as c_int,
        Err(e) => { debug(&format!("spawn error: {e}")); ERROR },
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_pty_write(
    handle: c_int,
    data:   *const u8,
    len:    c_int,
) -> c_int {
    if handle <= 0 || data.is_null() || len < 0 { return ERROR; }
    with(handle as u32, |p| p.write(data, len as usize))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_pty_read(
    handle: c_int,
    buf:    *mut u8,
    len:    c_int,
) -> c_int {
    if handle <= 0 || buf.is_null() || len <= 0 { return ERROR; }
    with(handle as u32, |pty| {
        let max = len as usize;

        // 1) serve pending data first
        let mut pend = pty.pending.lock().unwrap();
        if !pend.is_empty() {
            let n = pend.len().min(max);
            unsafe { std::ptr::copy_nonoverlapping(pend.as_ptr(), buf, n); }
            // drop the bytes we returned
            pend.drain(..n);
            return n as c_int;
        }
        drop(pend); // release lock before potentially blocking ops

        // 2) pull fresh data
        match pty.read() {
            Ok(Msg::Data(d)) if !d.is_empty() => {
                let n = d.len().min(max);
                unsafe { std::ptr::copy_nonoverlapping(d.as_ptr(), buf, n); }
                if d.len() > n {
                    // stash remainder for next call
                    let mut pend = pty.pending.lock().unwrap();
                    pend.extend_from_slice(&d[n..]);
                }
                n as c_int
            }
            Ok(Msg::End) => CHILD_EXITED,
            _            => 0,                         // no data
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn bun_pty_resize(handle: c_int, cols: c_int, rows: c_int) -> c_int {
    if handle <= 0 || cols <= 0 || rows <= 0 { return ERROR; }
    with(handle as u32, |p| {
        p.resize(PtySize { cols: cols as u16, rows: rows as u16, pixel_width: 0, pixel_height: 0 })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn bun_pty_kill(handle: c_int) -> c_int {
    if handle <= 0 { return ERROR; }
    with(handle as u32, |p| p.kill())
}

#[unsafe(no_mangle)]
pub extern "C" fn bun_pty_get_pid(handle: c_int) -> c_int {
    if handle <= 0 { return ERROR; }
    with(handle as u32, |p| p.pid)
}

#[unsafe(no_mangle)]
pub extern "C" fn bun_pty_close(handle: c_int) {
    if handle <= 0 { return; }
    REG.lock().unwrap().remove(&(handle as u32));
}