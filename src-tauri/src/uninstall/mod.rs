//! Revo Uninstaller–class software removal + leftover scan.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::actions::{self, RISK_DESTRUCTIVE, RISK_PRIVILEGED};
use crate::error::CoreError;
use crate::models::{InstalledApp, LeftoverPath, UninstallResult, UninstallScan};

/// Lists installed apps with uninstall metadata from the registry.
pub fn list_installed_apps() -> Result<Vec<InstalledApp>, CoreError> {
    #[cfg(windows)]
    {
        Ok(windows_list_apps())
    }
    #[cfg(not(windows))]
    {
        Ok(mock_apps())
    }
}

/// Scan leftovers for an app without uninstalling.
pub fn scan_leftovers(app_id: &str) -> Result<UninstallScan, CoreError> {
    let apps = list_installed_apps()?;
    let app = apps
        .into_iter()
        .find(|a| a.id == app_id)
        .ok_or_else(|| CoreError::NotFound(format!("app {app_id}")))?;
    let leftovers = find_leftovers(&app);
    let total_leftover_bytes: i64 = leftovers.iter().map(|l| l.size_bytes).sum();
    Ok(UninstallScan {
        app,
        leftovers,
        total_leftover_bytes,
    })
}

/// Run the uninstaller (QuietUninstallString or UninstallString), then scan leftovers.
pub fn uninstall_app(
    conn: &Connection,
    app_id: &str,
    confirm: bool,
) -> Result<UninstallResult, CoreError> {
    if !confirm {
        return Err(CoreError::Internal(
            "uninstall requires confirm=true".into(),
        ));
    }
    let scan = scan_leftovers(app_id)?;
    let app = scan.app.clone();

    let cmd = app
        .quiet_uninstall_string
        .clone()
        .or_else(|| app.uninstall_string.clone())
        .ok_or_else(|| CoreError::Internal(format!("no uninstall string for '{}'", app.name)))?;

    let preview = serde_json::json!({
        "appId": app.id,
        "name": app.name,
        "command": cmd,
        "preLeftovers": scan.leftovers.len(),
    })
    .to_string();

    let action = actions::record_action(
        conn,
        "software_uninstall",
        RISK_PRIVILEGED,
        &format!("Uninstall {}", app.name),
        Some(&cmd),
        "running",
        Some(&preview),
    )?;

    let run = run_uninstall_command(&cmd);
    let post = find_leftovers(&app);
    match run {
        Ok(msg) => {
            let message = format!(
                "{msg} · {} leftover path(s) remain ({} MB).",
                post.len(),
                post.iter().map(|l| l.size_bytes).sum::<i64>() / (1024 * 1024)
            );
            let _ = actions::complete_action(conn, &action.id, "completed", Some(&message));
            Ok(UninstallResult {
                status: "completed".into(),
                message,
                app_name: app.name,
                leftovers: post,
                removed_paths: Vec::new(),
            })
        }
        Err(e) => {
            let message = format!("Uninstall failed: {e}");
            let _ = actions::complete_action(conn, &action.id, "failed", Some(&message));
            Err(CoreError::Internal(message))
        }
    }
}

/// Remove leftover paths after uninstall. Requires confirm + `app_id`.
/// Only paths returned by a fresh `scan_leftovers(app_id)` may be deleted.
pub fn remove_leftovers(
    conn: &Connection,
    app_id: &str,
    paths: Vec<String>,
    confirm: bool,
) -> Result<UninstallResult, CoreError> {
    if !confirm {
        return Err(CoreError::Internal(
            "leftover removal requires confirm=true".into(),
        ));
    }
    if app_id.trim().is_empty() {
        return Err(CoreError::Internal(
            "leftover removal requires app_id (re-scan leftovers for the app first)".into(),
        ));
    }
    if paths.is_empty() {
        return Err(CoreError::Internal("no leftover paths selected".into()));
    }

    let scan = scan_leftovers(app_id)?;
    let scan_allowed: std::collections::HashSet<String> = scan
        .leftovers
        .iter()
        .map(|l| normalize_path_key(&l.path))
        .collect();

    let preview = serde_json::json!({ "appId": app_id, "paths": paths }).to_string();
    let action = actions::record_action(
        conn,
        "software_leftover_remove",
        RISK_DESTRUCTIVE,
        "Remove uninstall leftovers",
        Some(&format!("{} path(s) for {}", paths.len(), scan.app.name)),
        "running",
        Some(&preview),
    )?;

    let mut removed = Vec::new();
    let mut errors = Vec::new();
    for p in &paths {
        let key = normalize_path_key(p);
        if !scan_allowed.contains(&key) {
            errors.push(format!(
                "{p}: not in current leftover scan for this app (re-scan and retry)"
            ));
            continue;
        }
        if !is_leftover_path_allowed(p) {
            errors.push(format!("{p}: not in allowlisted leftover roots"));
            continue;
        }
        let path = PathBuf::from(p);
        let res = if path.is_dir() {
            fs::remove_dir_all(&path)
        } else {
            fs::remove_file(&path)
        };
        match res {
            Ok(()) => removed.push(p.clone()),
            Err(e) => errors.push(format!("{p}: {e}")),
        }
    }

    let status = if removed.is_empty() && !errors.is_empty() {
        "failed"
    } else if !errors.is_empty() {
        "completed_with_errors"
    } else {
        "completed"
    };
    let message = if errors.is_empty() {
        format!("Removed {} leftover path(s).", removed.len())
    } else {
        format!(
            "Removed {} path(s); errors: {}",
            removed.len(),
            errors.join("; ")
        )
    };
    let _ = actions::complete_action(conn, &action.id, status, Some(&message));

    Ok(UninstallResult {
        status: status.into(),
        message,
        app_name: scan.app.name,
        leftovers: Vec::new(),
        removed_paths: removed,
    })
}

fn normalize_path_key(p: &str) -> String {
    p.trim()
        .trim_end_matches(['\\', '/'])
        .to_ascii_lowercase()
        .replace('/', "\\")
}

fn run_uninstall_command(cmd: &str) -> Result<String, String> {
    let cmd = cmd.trim();
    if cmd.is_empty() {
        return Err("empty uninstall command".into());
    }
    // Prefer cmd /C for registry-style commands with quotes and args.
    let output = crate::process_win::silent_command("cmd")
        .args(["/C", cmd])
        .output()
        .map_err(|e| format!("spawn: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if output.status.success() {
        Ok(if stdout.trim().is_empty() {
            "Uninstaller finished".into()
        } else {
            stdout.trim().chars().take(200).collect()
        })
    } else {
        // Many uninstallers return non-zero even on success (UI closed).
        let combined = format!("{stdout} {stderr}").to_ascii_lowercase();
        if combined.contains("success") || output.status.code() == Some(3010) {
            Ok("Uninstaller finished (reboot may be required)".into())
        } else {
            Err(format!(
                "exit {:?} — {}",
                output.status.code(),
                stderr.trim().chars().take(200).collect::<String>()
            ))
        }
    }
}

fn find_leftovers(app: &InstalledApp) -> Vec<LeftoverPath> {
    let mut out = Vec::new();
    let mut tokens = name_tokens(&app.name);
    if let Some(pubname) = &app.publisher {
        for t in name_tokens(pubname) {
            if t.len() >= 4 {
                tokens.push(t);
            }
        }
    }
    tokens.sort();
    tokens.dedup();
    if tokens.is_empty() {
        return out;
    }

    let mut roots = leftover_search_roots();
    if let Some(loc) = &app.install_location {
        let p = PathBuf::from(loc);
        if p.exists() {
            push_leftover(&mut out, &p, "install_location");
        }
    }

    for root in roots.drain(..) {
        if !root.is_dir() {
            continue;
        }
        let rd = match fs::read_dir(&root) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd.flatten().take(400) {
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if !tokens.iter().any(|t| name.contains(t)) {
                continue;
            }
            let path = entry.path();
            // Never flag Windows / Program Files (x86) root itself
            if is_protected_leftover_root(&path) {
                continue;
            }
            let kind = if root
                .file_name()
                .map(|n| {
                    let s = n.to_string_lossy().to_ascii_lowercase();
                    s == "roaming" || s == "local"
                })
                .unwrap_or(false)
            {
                "appdata"
            } else {
                "program_files"
            };
            push_leftover(&mut out, &path, kind);
            if out.len() >= 80 {
                return out;
            }
        }
    }
    out
}

fn push_leftover(out: &mut Vec<LeftoverPath>, path: &Path, kind: &str) {
    let is_directory = path.is_dir();
    let size_bytes = if is_directory {
        dir_size_capped(path, 0, 4, &mut 0)
    } else {
        fs::metadata(path).map(|m| m.len() as i64).unwrap_or(0)
    };
    out.push(LeftoverPath {
        path: path.display().to_string(),
        size_bytes,
        kind: kind.into(),
        is_directory,
    });
}

fn dir_size_capped(path: &Path, depth: u32, max_depth: u32, files: &mut usize) -> i64 {
    if depth > max_depth || *files > 5_000 {
        return 0;
    }
    let rd = match fs::read_dir(path) {
        Ok(r) => r,
        Err(_) => return 0,
    };
    let mut total = 0i64;
    for e in rd.flatten() {
        if *files > 5_000 {
            break;
        }
        let p = e.path();
        if let Ok(m) = e.metadata() {
            if m.is_file() {
                *files += 1;
                total += m.len() as i64;
            } else if m.is_dir() {
                total += dir_size_capped(&p, depth + 1, max_depth, files);
            }
        }
    }
    total
}

fn name_tokens(name: &str) -> Vec<String> {
    name.split(|c: char| !c.is_alphanumeric())
        .map(|s| s.to_ascii_lowercase())
        .filter(|s| s.len() >= 4)
        .filter(|s| {
            !matches!(
                s.as_str(),
                "microsoft"
                    | "windows"
                    | "inc"
                    | "ltd"
                    | "corp"
                    | "the"
                    | "and"
                    | "version"
                    | "setup"
                    | "installer"
            )
        })
        .collect()
}

fn leftover_search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(pf) = std::env::var("ProgramFiles") {
        roots.push(PathBuf::from(pf));
    }
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
        roots.push(PathBuf::from(pf86));
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(local));
    }
    if let Ok(roaming) = std::env::var("APPDATA") {
        roots.push(PathBuf::from(roaming));
    }
    if let Ok(progdata) = std::env::var("ProgramData") {
        roots.push(PathBuf::from(progdata));
    }
    roots
}

fn is_protected_leftover_root(path: &Path) -> bool {
    let s = path.display().to_string().to_ascii_lowercase();
    s.ends_with("\\windows")
        || s.ends_with("\\program files")
        || s.ends_with("\\program files (x86)")
        || s.contains("\\windows\\system32")
        || s.contains("\\microsoft\\windows")
}

fn is_leftover_path_allowed(path: &str) -> bool {
    let s = path.to_ascii_lowercase().replace('/', "\\");
    if is_protected_leftover_root(Path::new(path)) {
        return false;
    }
    if s.contains("\\windows\\system32") || s.contains("\\windows\\syswow64") {
        return false;
    }
    leftover_search_roots().iter().any(|root| {
        let r = root
            .display()
            .to_string()
            .to_ascii_lowercase()
            .replace('/', "\\");
        s.starts_with(&r)
    })
}

#[cfg(windows)]
fn windows_list_apps() -> Vec<InstalledApp> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const PATHS: &[(isize, &str)] = &[
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
    ];

    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for (hive, sub) in PATHS {
        let root = RegKey::predef(*hive);
        let key = match root.open_subkey_with_flags(sub, KEY_READ) {
            Ok(k) => k,
            Err(_) => continue,
        };
        for subkey_name in key.enum_keys().flatten() {
            let entry = match key.open_subkey_with_flags(&subkey_name, KEY_READ) {
                Ok(e) => e,
                Err(_) => continue,
            };
            let name: String = match entry.get_value("DisplayName") {
                Ok(v) => v,
                Err(_) => continue,
            };
            let name = name.trim().to_string();
            if name.is_empty() {
                continue;
            }
            let system_component: u32 = entry.get_value("SystemComponent").unwrap_or(0);
            if system_component == 1 {
                continue;
            }
            let parent: String = entry.get_value("ParentKeyName").unwrap_or_default();
            if !parent.is_empty() {
                continue;
            }
            let version = entry.get_value("DisplayVersion").ok();
            let dedupe = format!("{name}|{}", version.clone().unwrap_or_default());
            if !seen.insert(dedupe) {
                continue;
            }
            let uninstall_string = entry.get_value("UninstallString").ok();
            let quiet = entry.get_value("QuietUninstallString").ok();
            if uninstall_string.is_none() && quiet.is_none() {
                continue;
            }
            let size: Option<i64> = entry
                .get_value::<u32, _>("EstimatedSize")
                .ok()
                .map(|v| v as i64);
            out.push(InstalledApp {
                id: format!(
                    "app:{hive_label}:{subkey_name}",
                    hive_label = hive_tag(*hive)
                ),
                name,
                version,
                publisher: entry.get_value("Publisher").ok(),
                install_location: entry.get_value("InstallLocation").ok(),
                uninstall_string,
                quiet_uninstall_string: quiet,
                install_date: entry.get_value("InstallDate").ok(),
                estimated_size_kb: size,
                source: "registry".into(),
            });
            if out.len() >= 600 {
                break;
            }
        }
    }
    out.sort_by_key(|a| a.name.to_lowercase());
    out
}

#[cfg(windows)]
fn hive_tag(hive: isize) -> &'static str {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    if hive == HKEY_CURRENT_USER {
        "hkcu"
    } else if hive == HKEY_LOCAL_MACHINE {
        "hklm"
    } else {
        "reg"
    }
}

#[cfg(not(windows))]
fn mock_apps() -> Vec<InstalledApp> {
    vec![InstalledApp {
        id: "app:mock:demo".into(),
        name: "Demo App".into(),
        version: Some("1.0".into()),
        publisher: Some("MockCorp".into()),
        install_location: None,
        uninstall_string: Some("echo uninstall".into()),
        quiet_uninstall_string: Some("echo uninstall".into()),
        install_date: None,
        estimated_size_kb: Some(1024),
        source: "mock".into(),
    }]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_tokens_filters_noise() {
        let t = name_tokens("Microsoft Visual Studio Code");
        assert!(t
            .iter()
            .any(|x| x == "visual" || x == "studio" || x == "code"));
        assert!(!t.iter().any(|x| x == "microsoft"));
    }

    #[test]
    fn list_apps_runs() {
        let apps = list_installed_apps().expect("list");
        let _ = apps.len();
    }

    #[test]
    fn leftover_allowlist_blocks_system32() {
        assert!(!is_leftover_path_allowed(r"C:\Windows\System32\foo"));
    }
}
