//! Windows elevation helpers.
//!
//! Deep process maps, named handles, USN, and some disk tools need admin.
//! Users forget "Run as administrator", so release builds self-elevate once
//! via UAC. **Debug / `tauri dev` does not auto-elevate** — relaunching would
//! drop Tauri/Vite env vars and produce a blank WebView. Use the sidebar
//! Elevate button (or run an elevated terminal) when testing admin features.
//!
//! Elevation uses `ShellExecuteExW` with verb `runas` — never PowerShell —
//! so no black console host appears. Elevation checks use the process token
//! API, not `net session`.

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

/// Detach any accidental console (e.g. parent attached one). Safe no-op if none.
pub fn detach_console() {
    #[cfg(windows)]
    {
        // FreeConsole returns 0 if the process has no console — ignore errors.
        unsafe {
            let _ = windows_sys::Win32::System::Console::FreeConsole();
        }
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
    // env and shows a blank WebView.
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
        log::warn!(
            "DeviceLifeline is not elevated. Deep process maps, USN index, and some disk tools will be limited."
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
            // Elevated instance is starting; exit this non-elevated process.
            std::process::exit(0);
        }
        false
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
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::Security::{
        GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
    };
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }

        let mut elevation: TOKEN_ELEVATION = zeroed();
        let mut returned = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut _,
            size_of::<TOKEN_ELEVATION>() as u32,
            &mut returned,
        );
        let _ = CloseHandle(token);
        ok != 0 && elevation.TokenIsElevated != 0
    }
}

/// Relaunch this executable elevated via ShellExecuteW + runas (no console host).
#[cfg(windows)]
fn relaunch_elevated() -> bool {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return false,
    };

    let args: Vec<String> = std::env::args().skip(1).collect();
    let params = if args.is_empty() {
        String::new()
    } else {
        // Quote args that contain spaces for the command line.
        args.iter()
            .map(|a| {
                if a.contains(' ') || a.contains('"') {
                    format!("\"{}\"", a.replace('"', "\\\""))
                } else {
                    a.clone()
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    };

    fn wide(s: &OsStr) -> Vec<u16> {
        s.encode_wide().chain(std::iter::once(0)).collect()
    }

    let file_w = wide(exe.as_os_str());
    let verb_w = wide(OsStr::new("runas"));
    let params_w = wide(OsStr::new(&params));

    // ShellExecuteW returns a value > 32 on success (HINSTANCE cast to isize).
    unsafe {
        let result = ShellExecuteW(
            ptr::null_mut(),
            verb_w.as_ptr(),
            file_w.as_ptr(),
            if params.is_empty() {
                ptr::null()
            } else {
                params_w.as_ptr()
            },
            ptr::null(),
            SW_SHOWNORMAL,
        );
        result as isize > 32
    }
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
