//! Local-only diagnosis LLM: packaged **Qwen3** via `llama-server`.
//!
//! No cloud providers (OpenAI / xAI Grok / Gemini) are used. When the local
//! model or runtime is missing, the app falls back to offline heuristics.
//!
//! Provision assets with:
//!   `pwsh scripts/fetch-qwen3.ps1`
//! which downloads into `resources/ai/` (not committed — large binaries).

use crate::diagnosis::provider::{DiagnosisProvider, FindingDraft, HeuristicProvider};
use crate::models::DiagnosisContext;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

const LOCAL_QWEN_BASE: &str = "http://127.0.0.1:39201/v1";
const LOCAL_QWEN_MODEL: &str = "Qwen3-0.6B";
const LOCAL_QWEN_FILENAME: &str = "Qwen3-0.6B-Q8_0.gguf";
const LOCAL_QWEN_DOWNLOAD_URL: &str =
    "https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf?download=true";
/// Pinned llama.cpp Windows CPU build (includes `llama-server.exe` + impl DLLs).
const LLAMA_RUNTIME_DOWNLOAD_URL: &str =
    "https://github.com/ggml-org/llama.cpp/releases/download/b10092/llama-b10092-bin-win-cpu-x64.zip";
/// Model (~640 MB) + runtime (~80 MB unpacked) + headroom for extract staging.
const MIN_AI_FREE_BYTES: u64 = 1_500_000_000;

static LOCAL_SERVER: OnceLock<Mutex<Option<Child>>> = OnceLock::new();
static INSTALL_PROGRESS: OnceLock<Mutex<LocalQwenInstallProgress>> = OnceLock::new();

/// Progress of an in-app local model download.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalQwenInstallProgress {
    /// idle | downloading_runtime | extracting_runtime | downloading_model | verifying | ready | error
    pub phase: String,
    /// 0–100 overall estimate
    pub percent: u8,
    pub message: String,
    pub error: Option<String>,
    pub busy: bool,
}

impl Default for LocalQwenInstallProgress {
    fn default() -> Self {
        Self {
            phase: "idle".into(),
            percent: 0,
            message: "Local Qwen3 is not installed yet.".into(),
            error: None,
            busy: false,
        }
    }
}

fn install_progress() -> &'static Mutex<LocalQwenInstallProgress> {
    INSTALL_PROGRESS.get_or_init(|| Mutex::new(LocalQwenInstallProgress::default()))
}

fn set_install_progress(
    phase: &str,
    percent: u8,
    message: impl Into<String>,
    error: Option<String>,
    busy: bool,
) {
    if let Ok(mut g) = install_progress().lock() {
        g.phase = phase.into();
        g.percent = percent.min(100);
        g.message = message.into();
        g.error = error;
        g.busy = busy;
    }
}

/// Snapshot of install progress for the UI.
pub fn local_qwen_install_progress() -> LocalQwenInstallProgress {
    install_progress()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

/// User-writable install root for local Copilot assets.
///
/// Resolution order:
/// 1. `DEVICELIFELINE_AI_DIR` (explicit override)
/// 2. `%LOCALAPPDATA%\DeviceLifeline\ai` when that volume has enough free space
/// 3. First fixed drive with ≥1.5 GB free → `{drive}\DeviceLifeline\ai`
///    (common when C: is nearly full)
pub fn user_ai_dir() -> Option<PathBuf> {
    if let Some(path) = env_path("DEVICELIFELINE_AI_DIR") {
        return Some(path);
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(local) = dirs::data_local_dir() {
        candidates.push(local.join("DeviceLifeline").join("ai"));
    }
    #[cfg(windows)]
    {
        for root in windows_fixed_drive_roots() {
            let cand = root.join("DeviceLifeline").join("ai");
            if !candidates.iter().any(|c| c == &cand) {
                candidates.push(cand);
            }
        }
    }

    // Prefer first candidate that already has assets, then first with free space.
    for cand in &candidates {
        if cand.join(LOCAL_QWEN_FILENAME).is_file()
            && cand
                .join(if cfg!(windows) {
                    "llama-server.exe"
                } else {
                    "llama-server"
                })
                .is_file()
        {
            return Some(cand.clone());
        }
    }
    for cand in &candidates {
        if free_bytes_for_path(cand) >= MIN_AI_FREE_BYTES {
            return Some(cand.clone());
        }
    }
    // Last resort: first candidate (install will report a clear disk-space error).
    candidates.into_iter().next()
}

#[cfg(windows)]
fn windows_fixed_drive_roots() -> Vec<PathBuf> {
    use sysinfo::Disks;
    let disks = Disks::new_with_refreshed_list();
    let mut roots: Vec<(u64, PathBuf)> = disks
        .list()
        .iter()
        .filter_map(|d| {
            let mount = d.mount_point();
            // Windows mount points look like "C:\"
            let s = mount.to_string_lossy();
            if s.len() >= 2 && s.as_bytes().get(1) == Some(&b':') {
                Some((d.available_space(), mount.to_path_buf()))
            } else {
                None
            }
        })
        .collect();
    // Prefer more free space first.
    roots.sort_by(|a, b| b.0.cmp(&a.0));
    roots.into_iter().map(|(_, p)| p).collect()
}

#[cfg(not(windows))]
fn windows_fixed_drive_roots() -> Vec<PathBuf> {
    Vec::new()
}

fn free_bytes_for_path(path: &Path) -> u64 {
    use sysinfo::Disks;
    let disks = Disks::new_with_refreshed_list();
    let target = path.to_string_lossy().to_ascii_lowercase();
    let mut best: Option<(usize, u64)> = None;
    for disk in disks.list() {
        let mount = disk.mount_point().to_string_lossy().to_ascii_lowercase();
        if target.starts_with(mount.trim_end_matches('\\'))
            || target.starts_with(mount.as_str())
        {
            let len = mount.len();
            if best.map(|(l, _)| len > l).unwrap_or(true) {
                best = Some((len, disk.available_space()));
            }
        }
    }
    best.map(|(_, b)| b).unwrap_or(0)
}

fn format_bytes_gb(bytes: u64) -> String {
    format!("{:.1} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
}

/// Starts background download of llama-server + Qwen3 into the user AI dir.
/// Returns immediately; poll [`local_qwen_install_progress`].
pub fn start_local_qwen_install() -> Result<(), String> {
    {
        let g = install_progress()
            .lock()
            .map_err(|_| "install progress lock unavailable".to_string())?;
        if g.busy {
            return Err("A local model install is already in progress.".into());
        }
    }
    if local_model_path().is_some() && local_runtime_path().is_some() {
        set_install_progress(
            "ready",
            100,
            "Local Qwen3 is already installed on this PC.",
            None,
            false,
        );
        return Ok(());
    }

    set_install_progress(
        "downloading_runtime",
        1,
        "Preparing download (~640 MB). Keep DeviceLifeline open…",
        None,
        true,
    );

    thread::spawn(|| {
        if let Err(err) = run_local_qwen_install() {
            set_install_progress("error", 0, "Install failed.", Some(err), false);
        }
    });
    Ok(())
}

fn run_local_qwen_install() -> Result<(), String> {
    let ai_dir = user_ai_dir().ok_or_else(|| "Could not resolve app data directory.".to_string())?;
    fs::create_dir_all(&ai_dir).map_err(|e| format!("create ai dir: {e}"))?;

    let free = free_bytes_for_path(&ai_dir);
    if free < MIN_AI_FREE_BYTES {
        return Err(format!(
            "Not enough free disk space for local Copilot. Need about {}, found {} free at {}. Free space on that drive, or set DEVICELIFELINE_AI_DIR to a folder on a drive with more room (for example D:\\DeviceLifeline\\ai).",
            format_bytes_gb(MIN_AI_FREE_BYTES),
            format_bytes_gb(free),
            ai_dir.display()
        ));
    }

    set_install_progress(
        "downloading_runtime",
        3,
        format!("Installing into {}…", ai_dir.display()),
        None,
        true,
    );

    let model_path = ai_dir.join(LOCAL_QWEN_FILENAME);
    let runtime_name = if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    };
    let runtime_path = ai_dir.join(runtime_name);

    // Drop broken 0-byte leftovers from a previous failed extract (common when C: is full).
    scrub_broken_runtime_files(&ai_dir, runtime_name);

    // 1) Runtime zip (if missing or incomplete)
    let runtime_ok = runtime_is_usable(&runtime_path);
    if !runtime_ok {
        set_install_progress(
            "downloading_runtime",
            5,
            "Downloading llama-server runtime…",
            None,
            true,
        );
        let zip_path = ai_dir.join("llama-runtime.zip");
        download_file(LLAMA_RUNTIME_DOWNLOAD_URL, &zip_path, 5, 35)?;
        // Reject empty/HTML error bodies that aren't real zips.
        let zip_meta = fs::metadata(&zip_path).map_err(|e| format!("runtime zip: {e}"))?;
        if zip_meta.len() < 1_000_000 {
            let _ = fs::remove_file(&zip_path);
            return Err(format!(
                "Runtime download looks incomplete ({} bytes). Check network access to GitHub releases.",
                zip_meta.len()
            ));
        }
        set_install_progress(
            "extracting_runtime",
            38,
            "Extracting llama-server…",
            None,
            true,
        );
        let extract_dir = ai_dir.join("_runtime_extract");
        let _ = fs::remove_dir_all(&extract_dir);
        fs::create_dir_all(&extract_dir).map_err(|e| format!("create extract dir: {e}"))?;
        extract_runtime_zip(&zip_path, &extract_dir)?;
        promote_runtime_from_extract(&extract_dir, &ai_dir, runtime_name)?;
        let _ = fs::remove_dir_all(&extract_dir);
        let _ = fs::remove_file(&zip_path);
        if !runtime_is_usable(&runtime_path) {
            let free_now = free_bytes_for_path(&ai_dir);
            return Err(format!(
                "llama-server was not found after extract (install dir: {}). Free space now: {}. Set DEVICELIFELINE_AI_DIR to another drive if this volume is full.",
                ai_dir.display(),
                format_bytes_gb(free_now)
            ));
        }
    } else {
        set_install_progress(
            "extracting_runtime",
            40,
            "llama-server already present.",
            None,
            true,
        );
    }

    // 2) Model GGUF
    if !model_path.is_file() || fs::metadata(&model_path).map(|m| m.len()).unwrap_or(0) < 1_000_000 {
        let _ = fs::remove_file(&model_path);
        set_install_progress(
            "downloading_model",
            45,
            "Downloading Qwen3 model (~640 MB)…",
            None,
            true,
        );
        download_file(LOCAL_QWEN_DOWNLOAD_URL, &model_path, 45, 95)?;
        let model_len = fs::metadata(&model_path).map(|m| m.len()).unwrap_or(0);
        if model_len < 100_000_000 {
            let _ = fs::remove_file(&model_path);
            return Err(format!(
                "Model download looks incomplete ({} MB). Need ~640 MB; free more disk space and retry.",
                model_len / (1024 * 1024)
            ));
        }
    }

    set_install_progress("verifying", 97, "Verifying install…", None, true);
    if !model_path.is_file() || !runtime_is_usable(&runtime_path) {
        return Err("Install finished but files are missing or incomplete.".into());
    }

    set_install_progress(
        "ready",
        100,
        format!(
            "Local Qwen3 is ready at {}. You can use Copilot with on-device AI.",
            ai_dir.display()
        ),
        None,
        false,
    );
    Ok(())
}

fn runtime_is_usable(runtime_path: &Path) -> bool {
    let Ok(meta) = fs::metadata(runtime_path) else {
        return false;
    };
    if !meta.is_file() || meta.len() == 0 {
        return false;
    }
    // Tiny stub is fine (~9 KB); require companion impl DLL next to it on Windows.
    if cfg!(windows) {
        if let Some(dir) = runtime_path.parent() {
            let impl_dll = dir.join("llama-server-impl.dll");
            let llama_dll = dir.join("llama.dll");
            let impl_ok = fs::metadata(&impl_dll)
                .map(|m| m.is_file() && m.len() > 1_000_000)
                .unwrap_or(false);
            let llama_ok = fs::metadata(&llama_dll)
                .map(|m| m.is_file() && m.len() > 100_000)
                .unwrap_or(false);
            return impl_ok && llama_ok;
        }
        return false;
    }
    true
}

fn scrub_broken_runtime_files(ai_dir: &Path, runtime_name: &str) {
    let runtime = ai_dir.join(runtime_name);
    if runtime.is_file()
        && fs::metadata(&runtime).map(|m| m.len()).unwrap_or(0) == 0
    {
        let _ = fs::remove_file(&runtime);
    }
    // Zero-byte DLLs left by a failed Expand-Archive on a full disk.
    if let Ok(rd) = fs::read_dir(ai_dir) {
        for e in rd.flatten() {
            let p = e.path();
            let name = p
                .file_name()
                .map(|n| n.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            if !(name.ends_with(".dll") || name.ends_with(".exe")) {
                continue;
            }
            if fs::metadata(&p).map(|m| m.len()).unwrap_or(1) == 0 {
                let _ = fs::remove_file(&p);
            }
        }
    }
}

/// Copy llama-server + companion DLLs from extract tree into `ai_dir` (flat).
fn promote_runtime_from_extract(
    extract_dir: &Path,
    ai_dir: &Path,
    runtime_name: &str,
) -> Result<(), String> {
    let found = find_file_named(extract_dir, runtime_name).ok_or_else(|| {
        format!("archive did not contain {runtime_name}")
    })?;
    let src_dir = found
        .parent()
        .ok_or_else(|| "runtime path has no parent".to_string())?;

    // Copy every file sitting next to llama-server (exe + DLLs). Modern llama.cpp
    // ships a tiny stub exe that loads llama-server-impl.dll + ggml*.dll.
    let rd = fs::read_dir(src_dir).map_err(|e| format!("read extract: {e}"))?;
    for e in rd.flatten() {
        let p = e.path();
        if !p.is_file() {
            continue;
        }
        let name = match p.file_name() {
            Some(n) => n.to_owned(),
            None => continue,
        };
        let dest = ai_dir.join(&name);
        fs::copy(&p, &dest).map_err(|e| {
            format!(
                "copy {} → {}: {e} (disk full?)",
                p.display(),
                dest.display()
            )
        })?;
    }

    // Also pull any ggml/llama DLLs nested one level deeper just in case.
    if let Some(nested) = find_file_named(extract_dir, "llama-server-impl.dll") {
        if let Some(dir) = nested.parent() {
            if dir != src_dir {
                if let Ok(rd) = fs::read_dir(dir) {
                    for e in rd.flatten() {
                        let p = e.path();
                        if !p.is_file() {
                            continue;
                        }
                        let name = match p.file_name() {
                            Some(n) => n.to_owned(),
                            None => continue,
                        };
                        let dest = ai_dir.join(&name);
                        if !dest.is_file() {
                            let _ = fs::copy(&p, &dest);
                        }
                    }
                }
            }
        }
    }

    if !ai_dir.join(runtime_name).is_file() {
        return Err(format!("{runtime_name} missing after promote"));
    }
    Ok(())
}

fn download_file(url: &str, dest: &Path, pct_start: u8, pct_end: u8) -> Result<(), String> {
    let partial = dest.with_extension("partial");
    let _ = fs::remove_file(&partial);

    let resp = ureq::get(url)
        .timeout(Duration::from_secs(60 * 30))
        .call()
        .map_err(|e| format!("download failed: {e}"))?;
    if resp.status() >= 300 {
        return Err(format!("download HTTP {}", resp.status()));
    }
    let total = resp
        .header("Content-Length")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    let mut reader = resp.into_reader();
    let mut file = File::create(&partial).map_err(|e| format!("create file: {e}"))?;
    let mut buf = [0u8; 64 * 1024];
    let mut done: u64 = 0;
    let span = (pct_end.saturating_sub(pct_start)) as u64;

    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("read download: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .map_err(|e| format!("write download: {e}"))?;
        done += n as u64;
        let pct = if total > 0 {
            pct_start.saturating_add((((done.min(total) * span) / total) as u8).min(span as u8))
        } else {
            pct_start.saturating_add((span / 2) as u8)
        };
        let mb = done as f64 / (1024.0 * 1024.0);
        let msg = if total > 0 {
            format!(
                "Downloading… {mb:.0} / {:.0} MB",
                total as f64 / (1024.0 * 1024.0)
            )
        } else {
            format!("Downloading… {mb:.0} MB")
        };
        set_install_progress(
            if pct_start < 40 {
                "downloading_runtime"
            } else {
                "downloading_model"
            },
            pct.min(pct_end),
            msg,
            None,
            true,
        );
    }
    drop(file);
    fs::rename(&partial, dest).map_err(|e| format!("finalize download: {e}"))?;
    Ok(())
}

fn extract_runtime_zip(zip_path: &Path, dest_dir: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        let zip = zip_path.display().to_string().replace('\'', "''");
        let dest = dest_dir.display().to_string().replace('\'', "''");
        // Stop on first failure (disk full used to leave partial 0-byte files
        // while Expand-Archive still exited 0 in some hosts).
        let script = format!(
            "$ErrorActionPreference='Stop'; \
             Expand-Archive -LiteralPath '{zip}' -DestinationPath '{dest}' -Force; \
             $server = Get-ChildItem -LiteralPath '{dest}' -Filter 'llama-server.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1; \
             if (-not $server) {{ throw 'llama-server.exe missing from archive extract' }}"
        );
        let output = crate::process_win::silent_command("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &script,
            ])
            .output()
            .map_err(|e| format!("expand archive: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let detail = [stderr.trim(), stdout.trim()]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or("unknown expand error");
            let free = free_bytes_for_path(dest_dir);
            return Err(format!(
                "expand archive failed ({detail}). Free space on install volume: {}. Free more space or set DEVICELIFELINE_AI_DIR.",
                format_bytes_gb(free)
            ));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (zip_path, dest_dir);
        Err("Runtime install is currently Windows-only.".into())
    }
}

fn find_file_named(root: &Path, name: &str) -> Option<PathBuf> {
    fn walk(dir: &Path, name: &str, depth: u32) -> Option<PathBuf> {
        if depth > 6 {
            return None;
        }
        let rd = fs::read_dir(dir).ok()?;
        for e in rd.flatten() {
            let p = e.path();
            if p.is_file()
                && p.file_name()
                    .map(|n| n.to_string_lossy().eq_ignore_ascii_case(name))
                    .unwrap_or(false)
            {
                return Some(p);
            }
            if p.is_dir() {
                if let Some(found) = walk(&p, name, depth + 1) {
                    return Some(found);
                }
            }
        }
        None
    }
    walk(root, name, 0)
}

/// Installation and readiness details for the local Copilot model.
pub struct LocalQwenStatus {
    pub model: &'static str,
    pub endpoint: String,
    pub model_path: Option<String>,
    pub runtime_path: Option<String>,
    pub model_installed: bool,
    pub runtime_installed: bool,
    pub ready: bool,
    pub model_download_url: &'static str,
    pub runtime_download_url: &'static str,
}

/// Only backend: on-device Qwen3.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LlmBackend {
    LocalQwen,
}

impl LlmBackend {
    pub fn as_str(self) -> &'static str {
        "local-qwen3"
    }
}

/// True when the local Qwen3 server can be used (or is already up).
pub fn llm_configured() -> bool {
    local_qwen_status().ready || (local_model_path().is_some() && local_runtime_path().is_some())
}

/// Provider slugs currently available (local only).
pub fn configured_providers() -> Vec<&'static str> {
    if local_qwen_status().ready || (local_model_path().is_some() && local_runtime_path().is_some())
    {
        vec!["local-qwen3"]
    } else {
        vec![]
    }
}

/// Active provider slug and model for status UI.
pub fn active_provider_status() -> (String, String, bool) {
    match LlmProvider::from_env() {
        Some(p) => (p.backend.as_str().into(), p.model.clone(), true),
        None => ("heuristic".into(), "offline".into(), false),
    }
}

/// Returns the local Qwen3 installation state.
pub fn local_qwen_status() -> LocalQwenStatus {
    let endpoint = local_base_url();
    let model_path = local_model_path().map(|path| path.display().to_string());
    let runtime_path = local_runtime_path().map(|path| path.display().to_string());
    let model_installed = model_path.is_some();
    let runtime_installed = runtime_path.is_some();
    // Do not spawn the server just to report status — only probe if already up,
    // or report ready when both assets exist (started on first diagnose).
    let ready = probe_endpoint(&endpoint)
        || (model_installed && runtime_installed && try_start_local_server(&endpoint).is_ok());

    LocalQwenStatus {
        model: LOCAL_QWEN_MODEL,
        endpoint,
        model_path,
        runtime_path,
        model_installed,
        runtime_installed,
        ready,
        model_download_url: LOCAL_QWEN_DOWNLOAD_URL,
        runtime_download_url: LLAMA_RUNTIME_DOWNLOAD_URL,
    }
}

/// Stops a server started by DeviceLifeline before the app exits.
pub fn shutdown_local_server() {
    if let Some(lock) = LOCAL_SERVER.get() {
        if let Ok(mut guard) = lock.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

/// Local Qwen3 OpenAI-compatible chat provider. On failure, heuristics take over.
pub struct LlmProvider {
    backend: LlmBackend,
    base_url: String,
    model: String,
}

impl LlmProvider {
    /// Resolves local Qwen3 when model + runtime are available (or server already up).
    pub fn from_env() -> Option<Self> {
        Self::for_local()
    }

    fn for_local() -> Option<Self> {
        let endpoint = local_base_url();
        if !probe_endpoint(&endpoint) {
            try_start_local_server(&endpoint).ok()?;
        }
        Some(Self {
            backend: LlmBackend::LocalQwen,
            base_url: endpoint,
            // Must match llama-server --alias (path env is DEVICELIFELINE_QWEN3_MODEL file).
            model: std::env::var("DEVICELIFELINE_QWEN3_ALIAS")
                .unwrap_or_else(|_| LOCAL_QWEN_MODEL.into()),
        })
    }
}

impl DiagnosisProvider for LlmProvider {
    fn diagnose(&self, query: &str, context: &DiagnosisContext) -> Vec<FindingDraft> {
        use crate::diagnosis::provider::{
            detect_intent, filter_findings_for_intent, is_chat_query, QueryIntent,
        };

        // Never turn greetings into a wall of critical cards.
        if is_chat_query(query) {
            return Vec::new();
        }

        let intent = detect_intent(query);
        let grounded = HeuristicProvider::new().diagnose(query, context);

        // Tiny local models invent off-topic cards (e.g. CPU on a disk question).
        // For clear resource intents, prefer telemetry-grounded heuristics.
        if matches!(
            intent,
            QueryIntent::Disk
                | QueryIntent::Memory
                | QueryIntent::Cpu
                | QueryIntent::Crash
                | QueryIntent::Startup
                | QueryIntent::Network
        ) {
            if !grounded.is_empty()
                && !(grounded.len() == 1 && grounded[0].title == "No major issues detected")
            {
                return grounded;
            }
        }

        match self.call_local(query, context, intent) {
            Ok(findings) => {
                let filtered = filter_findings_for_intent(findings, intent);
                if !filtered.is_empty() {
                    filtered
                } else {
                    grounded
                }
            }
            Err(err) => {
                log::warn!("Local Qwen3 diagnosis failed, using heuristics: {err}");
                grounded
            }
        }
    }
}

const FINDINGS_SYSTEM_PROMPT: &str = r#"You are DeviceLifeline Copilot on-device.
Return ONLY a JSON array of findings that answer the user's question.
Each object: title, cause, evidence, confidence (0-100), suggestedAction.
Max 4. Never invent hardware not in context. Stay on-topic for the intent.
Disk questions = disk only. No markdown."#;

const CHAT_SYSTEM_PROMPT: &str = r#"You are DeviceLifeline Copilot, a sharp senior Windows engineer sitting next to the user.
Write a natural reply in 2-5 short paragraphs (plain prose, not a template).
Rules:
- Answer THIS question specifically. Do not reuse a canned greeting if they asked about disk/CPU/etc.
- Ground claims in the telemetry JSON. Quote real numbers (diskPct, memoryPct, cpuUsage, healthScore, process names).
- Never invent disks, apps, or crashes that are not in the context.
- Stay on-topic: disk questions must not become CPU essays.
- Sound human: vary sentence openings, be direct, slightly opinionated when the data is clear.
- End with one concrete next step inside DeviceLifeline (Storage, Cleanup, Processes, Startup, Crashes).
- No markdown headings. No JSON. No bullet walls unless listing at most 3 actions.
If chat history is provided, continue the conversation coherently."#;

/// Free-form conversational answer from local Qwen when the server is up.
/// Returns None if the model is unavailable or the reply is unusable.
pub fn generate_chat_reply(
    query: &str,
    context: &DiagnosisContext,
    findings: &[FindingDraft],
    history: Option<&str>,
) -> Option<String> {
    let provider = LlmProvider::for_local()?;
    provider
        .call_chat(query, context, findings, history)
        .ok()
        .and_then(|s| {
            let t = s.trim().to_string();
            if t.len() < 40 {
                None
            } else {
                Some(t)
            }
        })
}

impl LlmProvider {
    fn call_local(
        &self,
        query: &str,
        context: &DiagnosisContext,
        intent: crate::diagnosis::provider::QueryIntent,
    ) -> Result<Vec<FindingDraft>, String> {
        let focus = match intent {
            crate::diagnosis::provider::QueryIntent::Disk => {
                "FOCUS: disk space / storage only. Do not mention CPU or memory."
            }
            crate::diagnosis::provider::QueryIntent::Memory => {
                "FOCUS: memory / RAM only. Do not mention disk or CPU unless asked."
            }
            crate::diagnosis::provider::QueryIntent::Cpu => {
                "FOCUS: CPU load only. Do not mention disk or memory unless asked."
            }
            crate::diagnosis::provider::QueryIntent::Crash => {
                "FOCUS: crashes / stability only."
            }
            crate::diagnosis::provider::QueryIntent::Startup => {
                "FOCUS: startup / boot / login only."
            }
            crate::diagnosis::provider::QueryIntent::Network => "FOCUS: network only.",
            crate::diagnosis::provider::QueryIntent::Slow => {
                "FOCUS: performance / slowness causes only."
            }
            _ => "Answer only what was asked.",
        };

        let user = serde_json::json!({
            "query": query,
            "intent": intent.as_str(),
            "focus": focus,
            "context": context,
        })
        .to_string();

        let content = self.chat_completion(FINDINGS_SYSTEM_PROMPT, &format!("{user}\n/no_think"), 0.15, 900)?;
        parse_findings_json(&content)
    }

    fn call_chat(
        &self,
        query: &str,
        context: &DiagnosisContext,
        findings: &[FindingDraft],
        history: Option<&str>,
    ) -> Result<String, String> {
        let intent = crate::diagnosis::provider::detect_intent(query);
        let finding_brief: Vec<serde_json::Value> = findings
            .iter()
            .take(4)
            .map(|f| {
                serde_json::json!({
                    "title": f.title,
                    "cause": f.cause,
                    "evidence": f.evidence,
                })
            })
            .collect();

        let user = serde_json::json!({
            "query": query,
            "intent": intent.as_str(),
            "history": history.unwrap_or(""),
            "telemetry": context,
            "groundedFindings": finding_brief,
        })
        .to_string();

        let content =
            self.chat_completion(CHAT_SYSTEM_PROMPT, &format!("{user}\n/no_think"), 0.55, 700)?;
        // Strip accidental JSON-only replies from tiny models.
        let trimmed = content.trim();
        if trimmed.starts_with('[') || trimmed.starts_with('{') {
            return Err("model returned structured data instead of prose".into());
        }
        Ok(content)
    }

    fn chat_completion(
        &self,
        system: &str,
        user: &str,
        temperature: f32,
        max_tokens: u32,
    ) -> Result<String, String> {
        let body = serde_json::json!({
            "model": self.model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": false,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": user }
            ]
        });

        let url = format!("{}/chat/completions", self.base_url.trim_end_matches('/'));

        let resp = ureq::post(&url)
            .set("Content-Type", "application/json")
            .timeout(Duration::from_secs(90))
            .send_json(body)
            .map_err(|e| format!("local model request error: {e}"))?;

        if resp.status() >= 300 {
            return Err(format!("local model HTTP {}", resp.status()));
        }

        let value: serde_json::Value = resp
            .into_json()
            .map_err(|e| format!("local model parse error: {e}"))?;

        value
            .pointer("/choices/0/message/content")
            .and_then(|c| c.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "missing message content from local model".to_string())
    }
}

fn local_base_url() -> String {
    std::env::var("DEVICELIFELINE_LOCAL_LLM_URL").unwrap_or_else(|_| LOCAL_QWEN_BASE.into())
}

fn local_model_path() -> Option<PathBuf> {
    if let Some(path) = env_path("DEVICELIFELINE_QWEN3_MODEL") {
        if path.is_file() {
            return Some(path);
        }
    }

    model_search_roots()
        .into_iter()
        .map(|root| root.join(LOCAL_QWEN_FILENAME))
        .find(|path| path.is_file())
}

fn local_runtime_path() -> Option<PathBuf> {
    if let Some(path) = env_path("DEVICELIFELINE_LLAMA_SERVER") {
        if path.is_file() {
            return Some(path);
        }
    }

    let executable = if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    };

    if let Some(path) = model_search_roots()
        .into_iter()
        .flat_map(|root| {
            [
                root.join(executable),
                root.join("bin").join(executable),
                root.join("llama").join(executable),
            ]
        })
        .find(|path| path.is_file())
    {
        return Some(path);
    }

    // PATH fallback
    Command::new(executable)
        .arg("--version")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|_| PathBuf::from(executable))
}

/// Directories that may contain the GGUF model and/or llama-server.
fn model_search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    // Next to the running binary (release install / tauri bundle)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push(parent.join("resources").join("ai"));
            roots.push(parent.join("resources").join("models"));
            roots.push(parent.join("models"));
            roots.push(parent.to_path_buf());
        }
    }

    // Prefer user-provisioned install (in-app download target)
    if let Some(ai) = user_ai_dir() {
        roots.insert(0, ai);
    }
    if let Some(local) = dirs::data_local_dir() {
        roots.push(local.join("DeviceLifeline").join("models"));
    }

    // Dev / source tree: src-tauri/../resources/ai
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    roots.push(manifest.join("..").join("resources").join("ai"));
    roots.push(manifest.join("resources").join("ai"));

    roots
}

fn env_path(key: &str) -> Option<PathBuf> {
    let value = std::env::var(key).ok()?;
    let value = value.trim();
    if value.is_empty() {
        None
    } else {
        Some(PathBuf::from(value))
    }
}

fn endpoint_socket(endpoint: &str) -> Option<std::net::SocketAddr> {
    let authority = endpoint
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .split('/')
        .next()?;
    authority.to_socket_addrs().ok()?.next()
}

fn probe_endpoint(endpoint: &str) -> bool {
    endpoint_socket(endpoint)
        .map(|address| TcpStream::connect_timeout(&address, Duration::from_millis(180)).is_ok())
        .unwrap_or(false)
}

fn local_loopback_port(endpoint: &str) -> Option<u16> {
    let address = endpoint_socket(endpoint)?;
    if !address.ip().is_loopback() {
        return None;
    }
    Some(address.port())
}

fn try_start_local_server(endpoint: &str) -> Result<(), String> {
    if probe_endpoint(endpoint) {
        return Ok(());
    }
    let model = local_model_path().ok_or_else(|| {
        "Qwen3 model is not installed; run scripts/fetch-qwen3.ps1 (writes resources/ai)"
            .to_string()
    })?;
    let runtime = local_runtime_path().ok_or_else(|| {
        "llama-server is not installed; run scripts/fetch-qwen3.ps1 or set DEVICELIFELINE_LLAMA_SERVER"
            .to_string()
    })?;
    let port = local_loopback_port(endpoint)
        .ok_or_else(|| "local model endpoint must use a loopback address".to_string())?;

    let lock = LOCAL_SERVER.get_or_init(|| Mutex::new(None));
    let mut guard = lock
        .lock()
        .map_err(|_| "local model process lock is unavailable".to_string())?;
    if let Some(child) = guard.as_mut() {
        if child
            .try_wait()
            .map_err(|error| format!("could not inspect local model process: {error}"))?
            .is_none()
        {
            return Err("local model server is still starting".to_string());
        }
        *guard = None;
    }

    // Runtime directory (for adjacent DLLs on Windows).
    let runtime_dir = runtime.parent().map(|p| p.to_path_buf());

    let mut cmd = Command::new(&runtime);
    if let Some(dir) = runtime_dir {
        cmd.current_dir(dir);
    }
    let child = cmd
        .arg("--model")
        .arg(&model)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("--alias")
        .arg(LOCAL_QWEN_MODEL)
        .arg("--jinja")
        .arg("--ctx-size")
        .arg("8192")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("could not start llama-server: {error}"))?;
    *guard = Some(child);
    drop(guard);

    for _ in 0..50 {
        if probe_endpoint(endpoint) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Err("llama-server started but did not become ready in time".to_string())
}

fn parse_findings_json(content: &str) -> Result<Vec<FindingDraft>, String> {
    let trimmed = content.trim();
    let stripped = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed)
        .strip_suffix("```")
        .unwrap_or(trimmed)
        .trim();

    let arr: Vec<serde_json::Value> = serde_json::from_str(stripped)
        .or_else(|_| {
            let obj: serde_json::Value = serde_json::from_str(stripped)?;
            obj.get("findings")
                .cloned()
                .and_then(|v| serde_json::from_value(v).ok())
                .ok_or_else(|| {
                    serde_json::Error::io(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        "no findings array",
                    ))
                })
        })
        .map_err(|e| format!("findings JSON: {e}"))?;

    let mut out = Vec::new();
    for item in arr {
        let title = item
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Finding")
            .to_string();
        let cause = item
            .get("cause")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let evidence = item
            .get("evidence")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let confidence = item
            .get("confidence")
            .and_then(|v| v.as_i64())
            .unwrap_or(50)
            .clamp(0, 100);
        let suggested_action = item
            .get("suggestedAction")
            .or_else(|| item.get("suggested_action"))
            .and_then(|v| v.as_str())
            .unwrap_or("Review the evidence and apply a safe fix.")
            .to_string();
        out.push(FindingDraft {
            title,
            cause,
            evidence,
            confidence,
            suggested_action,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_array() {
        let raw =
            r#"[{"title":"T","cause":"C","evidence":"E","confidence":80,"suggestedAction":"A"}]"#;
        let f = parse_findings_json(raw).unwrap();
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].title, "T");
    }

    #[test]
    fn no_cloud_backends_in_configured_providers_without_assets() {
        // Without model files, providers list is empty (heuristic mode).
        // This test only asserts cloud slugs never appear.
        let providers = configured_providers();
        assert!(!providers.iter().any(|p| *p == "xai" || *p == "openai" || *p == "gemini"));
    }
}
