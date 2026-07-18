//! Windows elevation helpers.
//!
//! Deep process maps, named handles, USN, and some disk tools need admin.
//! Users forget "Run as administrator", so release builds self-elevate once
//! via UAC. **Debug / `tauri dev` does not auto-elevate** — relaunching would
//! drop Tauri/Vite env vars and produce a blank WebView. Use the sidebar
//! Elevate button (or run an elevated terminal) when testing admin features.

/// Environment variable to skip auto-elevation (tests/CI always set this).
pub const SKIP_ELEVATION_ENV: &str = "DEVICELIFELINE_SKIP_ELEVATION";

/// Returns whether the current process is running elevated (admin).
pub fn is_elevated() -> bool {
    #[cfg(windows)]
    {
        windows_is_elevated()
    }
    #[cfg(not(windows))]
    {
        true
    }
}

/// If not elevated on Windows **release** builds, relaunch with UAC and exit.
///
/// Skipped when:
/// - `DEVICELIFELINE_SKIP_ELEVATION` is set
/// - compiled with debug assertions (`tauri dev` / `cargo run` debug)
pub fn ensure_elevated() {
    if std::env::var_os(SKIP_ELEVATION_ENV).is_some() {
        return;
    }

    // Never auto-elevate under `tauri dev`: the elevated child loses Vite/Tauri
    // env and shows a blank black/white WebView.
    if cfg!(debug_assertions) {
        return;
    }

    #[cfg(windows)]
    {
        if is_elevated() {
            return;
        }
        if relaunch_elevated() {
            std::process::exit(0);
        }
        eprintln!(
            "DeviceLifeline is not elevated. Deep process maps, USN index, and some disk tools will be limited. Use the Elevate control in the app sidebar."
        );
    }
}

/// Explicit elevation request (sidebar button). Works in debug and release.
/// Relaunches with UAC when not elevated. Returns status of *this* process
/// (still false if relaunch was triggered and this process will exit).
pub fn request_elevation_relaunch() -> bool {
    if is_elevated() {
        return true;
    }
    #[cfg(windows)]
    {
        if relaunch_elevated() {
            // Give the elevated process a moment; exit this instance.
            std::process::exit(0);
        }
        return false;
    }
    #[cfg(not(windows))]
    {
        true
    }
}

/// Status payload for the UI.
pub fn status_json() -> serde_json::Value {
    let auto = std::env::var_os(SKIP_ELEVATION_ENV).is_none() && !cfg!(debug_assertions);
    serde_json::json!({
        "elevated": is_elevated(),
        "autoElevate": auto,
        "platform": std::env::consts::OS,
        "devMode": cfg!(debug_assertions),
    })
}

#[cfg(windows)]
fn windows_is_elevated() -> bool {
    std::process::Command::new("net")
        .args(["session"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(windows)]
fn relaunch_elevated() -> bool {
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return false,
    };
    let exe_str = exe.to_string_lossy().replace('\'', "''");

    let args: Vec<String> = std::env::args().skip(1).collect();
    let arg_list = if args.is_empty() {
        String::new()
    } else {
        let joined = args
            .iter()
            .map(|a| format!("'{}'", a.replace('\'', "''")))
            .collect::<Vec<_>>()
            .join(",");
        format!(" -ArgumentList @({joined})")
    };

    // Preserve useful env for elevated child (especially if ever used in hybrid setups).
    // Note: `tauri dev` still should not auto-elevate (see ensure_elevated).
    let ps = format!(
        "Start-Process -FilePath '{exe_str}'{arg_list} -Verb RunAs"
    );

    let status = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &ps,
        ])
        .status();

    matches!(status, Ok(s) if s.success())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_json_has_elevated_key() {
        let v = status_json();
        assert!(v.get("elevated").is_some());
        assert!(v.get("devMode").is_some());
    }
}
