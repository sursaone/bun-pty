//! lib.rs  —  bun-pty backend (final fixed version)

use crossbeam::channel::{unbounded, Receiver, Sender};
use portable_pty::{
    native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize, SlavePty,
};
use serde::{Deserialize, Serialize};
use shell_words::split;                  // <-- NEW
use std::{
    collections::HashMap,
    ffi::{CStr, OsStr, OsString},
    io::{Read, Write},
    os::raw::{c_char, c_int},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicI32, Ordering},
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
        let mut b = CommandBuilder::new(self.program());
        // `CommandBuilder::new` seeds the environment from the parent's
        // startup environment. The map the caller passed is the whole
        // environment, as in node-pty, so drop the seeded one first.
        // portable-pty still sets SHELL when the map holds no usable one.
        b.env_clear();
        // On Windows an empty map keeps the parent's environment, as in
        // node-pty; portable-pty would build an unterminated block for it.
        // Copy the process environment, not portable-pty's seeded one,
        // which also applies values from the registry.
        if cfg!(windows) && self.env.is_empty() {
            for (k, v) in std::env::vars_os() {
                b.env(k, v);
            }
        }
        b.cwd(&self.cwd);
        for a in &self.args {
            b.arg(a);
        }
        for (k, v) in &self.env {
            b.env(k, v);
        }
        b
    }

    /// The map's value for `key`. Windows matches the key without case.
    fn map_var(&self, key: &str) -> Option<&str> {
        self.env
            .iter()
            .find(|(k, _)| if cfg!(windows) { k.eq_ignore_ascii_case(key) } else { k.as_str() == key })
            .map(|(_, v)| v.as_str())
    }

    /// portable-pty looks up a relative program with the PATH in the
    /// child's environment. Before `env_clear()`, a map with no PATH fell
    /// back to the parent's PATH. Keep that fallback, so a bare name such
    /// as `sh` or `cmd.exe` still resolves, without adding PATH to the child.
    fn program(&self) -> OsString {
        if self.cmd.is_empty() || self.map_var("PATH").is_some() {
            return self.cmd.clone().into();
        }
        std::env::var_os("PATH")
            .and_then(|path| self.search_path(&path))
            .map_or_else(|| self.cmd.clone().into(), PathBuf::into_os_string)
    }

    /// Mirrors portable-pty's Unix lookup: a relative program found in the
    /// cwd stays as it is, else the first executable match in `path`.
    #[cfg(unix)]
    fn search_path(&self, path: &OsStr) -> Option<PathBuf> {
        use std::{os::unix::fs::PermissionsExt, path::Path};

        let exe = Path::new(&self.cmd);
        if exe.is_absolute() || Path::new(&self.cwd).join(exe).exists() {
            return None;
        }
        std::env::split_paths(path).map(|dir| dir.join(exe)).find(|candidate| {
            candidate
                .metadata()
                .is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        })
    }

    /// Mirrors portable-pty's Windows lookup: each `path` entry with the
    /// name as given, then with each PATHEXT extension.
    #[cfg(windows)]
    fn search_path(&self, path: &OsStr) -> Option<PathBuf> {
        let pathext = self
            .map_var("PATHEXT")
            .map(OsString::from)
            .or_else(|| std::env::var_os("PATHEXT"))
            .unwrap_or_else(|| ".EXE".into());
        for dir in std::env::split_paths(path) {
            let candidate = dir.join(&self.cmd);
            if candidate.exists() {
                return Some(candidate);
            }
            for ext in std::env::split_paths(&pathext) {
                let Some(ext) = ext.to_str().and_then(|e| e.strip_prefix('.')) else {
                    continue;
                };
                let candidate = dir.join(&self.cmd).with_extension(ext);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
        None
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
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    killer: Arc<Mutex<Box<dyn ChildKiller + Send + Sync>>>,
    exited: AtomicBool,
    exit_code: AtomicI32,
    pid:    c_int,
    pending: Mutex<Vec<u8>>,               // NEW: stash bytes that didn't fit last time
}

unsafe impl Send for Pty {}
unsafe impl Sync for Pty {}

impl Pty {
    fn new(cmd: Command, size: PtySize) -> Result<Arc<Self>, Box<dyn std::error::Error + Send + Sync>> {
        let sys  = native_pty_system();
        let pair = sys.openpty(size)?;
        let mut child = pair.slave.spawn_command(cmd.to_builder())?;
        let killer = Arc::new(Mutex::new(child.clone_killer()));
        let pid    = child.process_id().map(|p| p as c_int).unwrap_or(ERROR);

        /* channels */
        let (tx_r, rx_r)   = unbounded::<Msg>();
        let (tx_w, rx_w)   = unbounded::<(Vec<u8>, usize)>();

        let master = Arc::new(Mutex::new(pair.master));

        let pty = Arc::new(Self {
            reader: Reader::new(rx_r),
            tx_w,
            _slave: pair.slave,
            master: master.clone(),
            killer,
            exited: AtomicBool::new(false),
            exit_code: AtomicI32::new(-1),
            pid,
            pending: Mutex::new(Vec::new()),       // NEW: initialize empty pending buffer
        });

        /* wait-thread */
        {
            let tx = tx_r.clone();
            let pty_clone = pty.clone();
            thread::spawn(move || {
                let status = child.wait();
                if let Ok(exit_status) = status {
                    let code = exit_status.exit_code() as i32;
                    debug(&format!("exit_status.exit_code(): {}", code));
                    pty_clone.exit_code.store(code, Ordering::Relaxed);
                }
                let _ = tx.send(Msg::End);
            });
        }

        /* read-thread */
        {
            let mut rdr = master.lock().unwrap().try_clone_reader()?;
            let tx = tx_r.clone();
            thread::spawn(move || {
                let mut buf = vec![0; 8192];
                loop {
                    match rdr.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => { let _ = tx.send(Msg::Data(buf[..n].to_vec())); }
                        // FIX (bun-pty deaf-PTY bug): a transient read error
                        // (EINTR from a signal, EWOULDBLOCK) must NOT be treated
                        // as EOF. The old `Err(_) => break` ended the reader on
                        // any error → Msg::End → exited=true → bun_pty_write
                        // early-returns CHILD_EXITED forever, permanently deafening
                        // input while the child is still alive. Retry instead.
                        Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            std::thread::sleep(std::time::Duration::from_millis(2));
                            continue;
                        }
                        Err(_) => break,
                    }
                }
                let _ = tx.send(Msg::End);
            });
        }

        /* write-thread  (length-aware) */
        {
            let mut wtr = master.lock().unwrap().take_writer()?;
            thread::spawn(move || {
                while let Ok((data, len)) = rx_w.recv() {
                    // Don't let one (possibly transient) write error kill the
                    // writer thread forever — that would silently drop ALL
                    // subsequent input. Retry transient errors; on a fatal one,
                    // drop just this chunk but keep serving later writes.
                    let mut buf = &data[..len];
                    while !buf.is_empty() {
                        match wtr.write(buf) {
                            Ok(0) => break,
                            Ok(n) => buf = &buf[n..],
                            Err(ref e)
                                if e.kind() == std::io::ErrorKind::Interrupted
                                    || e.kind() == std::io::ErrorKind::WouldBlock =>
                            {
                                std::thread::sleep(std::time::Duration::from_millis(2));
                            }
                            Err(_) => break,
                        }
                    }
                    let _ = wtr.flush();
                }
            });
        }

        Ok(pty)
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
        self.master.lock().unwrap().resize(size).map(|_| SUCCESS).unwrap_or(ERROR)
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
        Ok(p)  => store(p) as c_int,
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
pub extern "C" fn bun_pty_get_exit_code(handle: c_int) -> c_int {
    if handle <= 0 { return ERROR; }
    with(handle as u32, |p| p.exit_code.load(Ordering::Relaxed))
}

#[unsafe(no_mangle)]
pub extern "C" fn bun_pty_close(handle: c_int) {
    if handle <= 0 { return; }
    REG.lock().unwrap().remove(&(handle as u32));
}