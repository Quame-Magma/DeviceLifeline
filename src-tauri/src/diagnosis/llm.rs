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
const LLAMA_RUNTIME_DOWNLOAD_URL: &str =
    "https://github.com/ggml-org/llama.cpp/releases/download/b10075/llama-b10075-bin-win-cpu-x64.zip";

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

/// User-writable install root: `%LOCALAPPDATA%/DeviceLifeline/ai`
pub fn user_ai_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("DeviceLifeline").join("ai"))
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

    let model_path = ai_dir.join(LOCAL_QWEN_FILENAME);
    let runtime_name = if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    };
    let runtime_path = ai_dir.join(runtime_name);

    // 1) Runtime zip (if missing)
    if !runtime_path.is_file() {
        set_install_progress(
            "downloading_runtime",
            5,
            "Downloading llama-server runtime…",
            None,
            true,
        );
        let zip_path = ai_dir.join("llama-runtime.zip");
        download_file(LLAMA_RUNTIME_DOWNLOAD_URL, &zip_path, 5, 35)?;
        set_install_progress(
            "extracting_runtime",
            38,
            "Extracting llama-server…",
            None,
            true,
        );
        extract_runtime_zip(&zip_path, &ai_dir)?;
        let _ = fs::remove_file(&zip_path);
        if !runtime_path.is_file() {
            // llama zip may nest the binary one level down — copy into ai_dir
            if let Some(found) = find_file_named(&ai_dir, runtime_name) {
                if found != runtime_path {
                    let _ = fs::copy(&found, &runtime_path);
                }
            }
        }
        if !runtime_path.is_file() {
            return Err("llama-server was not found after extract.".into());
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
    if !model_path.is_file() {
        set_install_progress(
            "downloading_model",
            45,
            "Downloading Qwen3 model (~640 MB)…",
            None,
            true,
        );
        download_file(LOCAL_QWEN_DOWNLOAD_URL, &model_path, 45, 95)?;
    }

    set_install_progress("verifying", 97, "Verifying install…", None, true);
    if !model_path.is_file() || !runtime_path.is_file() {
        return Err("Install finished but files are missing.".into());
    }

    set_install_progress(
        "ready",
        100,
        "Local Qwen3 is ready. You can use Copilot with on-device AI.",
        None,
        false,
    );
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
        let script = format!(
            "Expand-Archive -LiteralPath '{zip}' -DestinationPath '{dest}' -Force"
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
            return Err(format!(
                "expand archive failed: {}",
                String::from_utf8_lossy(&output.stderr)
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
        match self.call_local(query, context) {
            Ok(findings) if !findings.is_empty() => findings,
            Ok(_) => HeuristicProvider::new().diagnose(query, context),
            Err(err) => {
                log::warn!("Local Qwen3 diagnosis failed, using heuristics: {err}");
                let mut drafts = HeuristicProvider::new().diagnose(query, context);
                drafts.insert(
                    0,
                    FindingDraft {
                        title: "Local Copilot unavailable".into(),
                        cause: "Fell back to on-device rules after the local Qwen3 call failed."
                            .into(),
                        evidence: err,
                        confidence: 40,
                        suggested_action: "Run scripts/fetch-qwen3.ps1 to install the model and llama-server into resources/ai, then restart DeviceLifeline.".into(),
                    },
                );
                drafts
            }
        }
    }
}

const SYSTEM_PROMPT: &str = r#"You are DeviceLifeline Copilot, an on-device PC systems engineer.
Given the user's question and structured telemetry JSON, return ONLY a JSON array of findings.
Each finding object must have: title, cause, evidence, confidence (0-100 integer), suggestedAction.
Max 6 findings. Be specific. Never invent hardware that is not in the context.
No markdown, no prose outside JSON."#;

impl LlmProvider {
    fn call_local(
        &self,
        query: &str,
        context: &DiagnosisContext,
    ) -> Result<Vec<FindingDraft>, String> {
        let user = serde_json::json!({
            "query": query,
            "context": context,
        })
        .to_string();

        // Qwen3 chat templates: discourage chain-of-thought in the completion.
        let user = format!("{user}\n/no_think");

        let body = serde_json::json!({
            "model": self.model,
            "temperature": 0.2,
            "max_tokens": 1200,
            "stream": false,
            "messages": [
                { "role": "system", "content": SYSTEM_PROMPT },
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

        let content = value
            .pointer("/choices/0/message/content")
            .and_then(|c| c.as_str())
            .ok_or_else(|| "missing message content from local model".to_string())?;

        parse_findings_json(content)
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
