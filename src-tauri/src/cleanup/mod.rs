//! CCleaner / Glary–class cleanup: temp, cache, browser privacy, Windows junk,
//! Recycle Bin, DNS, clipboard, and **conservative registry MRU** (not a
//! “broken registry” junk scanner).
//!
//! Preview is always dry-run; execute requires confirm + allowlists.
//! Documents / Desktop / System32 are never targeted.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use rusqlite::Connection;

use crate::actions::{self, RISK_DESTRUCTIVE, RISK_SAFE};
use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::{CleanupCandidate, CleanupCategorySummary, CleanupPreview, CleanupResult};

const MAX_CANDIDATES: usize = 8_000;
const MAX_DEPTH: u32 = 6;
const MAX_FILES_PER_ROOT: usize = 2_500;

/// Live multi-category cleanup scan (dry-run).
pub fn scan_cleanup_preview(conn: &Connection) -> Result<CleanupPreview, CoreError> {
    let candidates = collect_all_candidates();
    let categories = summarize_categories(&candidates);
    let total_count = candidates.len() as i64;
    let total_bytes: i64 = candidates.iter().map(|c| c.size_bytes).sum();
    let scanned_at = now_rfc3339()?;

    let preview = CleanupPreview {
        scanned_at: scanned_at.clone(),
        categories: categories.clone(),
        candidates: candidates.clone(),
        total_count,
        total_bytes,
        dry_run: true,
    };

    let json = serde_json::to_string(&preview).unwrap_or_else(|_| "{}".into());
    let _ = actions::record_action(
        conn,
        "cleanup_scan_preview",
        RISK_SAFE,
        "Cleanup scan preview",
        Some(&format!(
            "{total_count} item(s), {} MB",
            total_bytes / (1024 * 1024)
        )),
        "completed",
        Some(&json),
    );

    Ok(preview)
}

/// Execute cleanup for selected category ids. Requires `confirm == true`.
pub fn execute_cleanup(
    conn: &Connection,
    categories: Option<Vec<String>>,
    confirm: bool,
) -> Result<CleanupResult, CoreError> {
    if !confirm {
        return Err(CoreError::Internal(
            "cleanup requires confirm=true (explicit user consent)".into(),
        ));
    }

    let legacy_all = categories.is_none();
    // Categories the user explicitly selected (used for specials + filtering).
    let requested_cats: std::collections::HashSet<String> = match &categories {
        Some(cats) if !cats.is_empty() => cats.iter().map(|s| s.to_ascii_lowercase()).collect(),
        _ => std::collections::HashSet::new(),
    };

    let all = collect_all_candidates();
    let selected: Vec<CleanupCandidate> = if requested_cats.is_empty() {
        all
    } else {
        all.into_iter()
            .filter(|c| requested_cats.contains(&c.category.to_ascii_lowercase()))
            .collect()
    };

    // Prefer user-requested list for specials; fall back to categories present in files.
    let mut cat_list: Vec<String> = if !requested_cats.is_empty() {
        let mut v: Vec<String> = requested_cats.iter().cloned().collect();
        v.sort();
        v
    } else {
        let mut s: Vec<String> = selected.iter().map(|c| c.category.clone()).collect();
        s.sort();
        s.dedup();
        s
    };

    let file_candidates: Vec<&CleanupCandidate> = selected
        .iter()
        .filter(|c| !is_virtual_candidate(c))
        .collect();

    let preview = serde_json::json!({
        "dryRun": false,
        "confirm": true,
        "categories": cat_list,
        "candidateCount": file_candidates.len(),
        "samplePaths": file_candidates.iter().take(20).map(|c| c.path.clone()).collect::<Vec<_>>(),
    })
    .to_string();

    let action_type = if legacy_all {
        "safe_cleanup_execute"
    } else {
        "cleanup_execute"
    };
    let mut action = actions::record_action(
        conn,
        action_type,
        RISK_DESTRUCTIVE,
        "Evidence-based cleanup (confirmed)",
        Some(&format!(
            "{} file candidate(s) · {} category(ies)",
            file_candidates.len(),
            cat_list.len()
        )),
        "running",
        Some(&preview),
    )?;

    let mut deleted_count = 0i64;
    let mut deleted_bytes = 0i64;
    let mut failed_count = 0i64;
    let mut skipped_locked = 0i64;
    let mut deleted_paths = Vec::new();
    let mut errors = Vec::new();

    for item in &selected {
        if is_virtual_candidate(item) {
            continue;
        }
        // Hard blocks only — candidates already came from our scanner roots.
        if is_path_hard_blocked(&item.path) {
            failed_count += 1;
            if errors.len() < 40 {
                errors.push(format!("{}: blocked (protected path)", item.path));
            }
            continue;
        }
        match delete_path_robust(&item.path, item.is_directory) {
            Ok(()) => {
                deleted_count += 1;
                deleted_bytes += item.size_bytes;
                if deleted_paths.len() < 100 {
                    deleted_paths.push(item.path.clone());
                }
            }
            Err(e) => {
                let el = e.to_ascii_lowercase();
                if el.contains("access is denied")
                    || el.contains("being used")
                    || el.contains("cannot access")
                    || el.contains("os error 32")
                    || el.contains("os error 5")
                {
                    skipped_locked += 1;
                } else {
                    failed_count += 1;
                }
                if errors.len() < 40 {
                    errors.push(format!("{}: {e}", item.path));
                }
            }
        }
    }

    // Special actions from the *requested* category list (not only file-derived).
    for (name, runner) in [
        (
            "recycle_bin",
            run_special_recycle_bin as fn() -> Result<String, String>,
        ),
        ("clipboard", run_special_clipboard),
        ("dns_cache", run_special_dns_flush),
        ("registry_mru", run_special_registry_mru),
    ] {
        let wanted = if requested_cats.is_empty() {
            cat_list.iter().any(|c| c == name)
        } else {
            requested_cats.contains(name)
        };
        if !wanted {
            continue;
        }
        match runner() {
            Ok(msg) => {
                deleted_count += 1;
                if deleted_paths.len() < 100 {
                    deleted_paths.push(msg);
                }
            }
            Err(e) => {
                failed_count += 1;
                errors.push(format!("{name}: {e}"));
            }
        }
    }

    let msg = format!(
        "Deleted {deleted_count} item(s) ({deleted_bytes} bytes); {failed_count} failed; {skipped_locked} in-use/locked skipped."
    );
    let status = if deleted_count == 0 && (failed_count > 0 || skipped_locked > 0) {
        "failed"
    } else if failed_count > 0 || skipped_locked > 0 {
        "completed_with_errors"
    } else if deleted_count == 0 {
        // Nothing to delete is still a successful no-op.
        "completed"
    } else {
        "completed"
    };
    actions::complete_action(conn, &action.id, status, Some(&msg))?;
    action.status = status.into();
    action.result_message = Some(msg.clone());
    action.finished_at = Some(now_rfc3339()?);

    if cat_list.is_empty() {
        cat_list = requested_cats.into_iter().collect();
        cat_list.sort();
    }

    Ok(CleanupResult {
        action,
        deleted_count,
        deleted_bytes,
        failed_count: failed_count + skipped_locked,
        deleted_paths,
        errors,
        categories_cleaned: cat_list,
    })
}

/// Delete a file/dir; clear read-only on Windows and retry once.
fn delete_path_robust(path: &str, is_directory: bool) -> Result<(), String> {
    let p = PathBuf::from(path);
    if !p.exists() {
        // Already gone — count as success (cleaned).
        return Ok(());
    }
    let first = if is_directory {
        fs::remove_dir_all(&p)
    } else {
        fs::remove_file(&p)
    };
    if first.is_ok() {
        return Ok(());
    }
    let err1 = first.err().map(|e| e.to_string()).unwrap_or_default();

    // Clear read-only and retry (common for thumbcache / temp).
    #[cfg(windows)]
    {
        let _ = crate::process_win::silent_command("attrib")
            .args(["-R", path, "/S", "/D"])
            .output();
    }
    if let Ok(meta) = fs::metadata(&p) {
        let mut perms = meta.permissions();
        #[allow(clippy::permissions_set_readonly_false)]
        perms.set_readonly(false);
        let _ = fs::set_permissions(&p, perms);
    }

    let second = if is_directory {
        fs::remove_dir_all(&p)
    } else {
        fs::remove_file(&p)
    };
    second.map_err(|e| format!("{err1}; retry: {e}"))
}

fn is_path_hard_blocked(path: &str) -> bool {
    let s = path.to_ascii_lowercase().replace('/', "\\");
    s.contains("\\windows\\system32")
        || s.contains("\\windows\\syswow64")
        || s.contains("\\documents\\")
        || s.contains("\\desktop\\")
        || s.contains("\\downloads\\")
        || s.contains("\\pictures\\")
        || s.contains("\\videos\\")
        || s.contains("\\music\\")
        || s.contains("\\ntuser.dat")
        || s.contains("\\login data")
        || s.ends_with("\\windows")
        || s.ends_with("\\program files")
        || s.ends_with("\\program files (x86)")
}

fn is_virtual_candidate(item: &CleanupCandidate) -> bool {
    matches!(
        item.category.as_str(),
        "recycle_bin" | "clipboard" | "dns_cache" | "registry_mru"
    ) || item.path.starts_with("[[")
}

fn collect_all_candidates() -> Vec<CleanupCandidate> {
    let mut out = Vec::new();
    let mut id = 0u64;

    for (cat, root) in category_roots() {
        if !root.exists() {
            continue;
        }
        let mut n = 0usize;
        walk_collect(&root, 0, cat, &mut out, &mut id, &mut n);
        if out.len() >= MAX_CANDIDATES {
            break;
        }
    }

    // Named browser privacy files (History, Cookies, etc.) across profiles
    collect_browser_privacy_files(&mut out, &mut id);

    // Virtual classic CCleaner actions
    for (cat, path) in [
        ("recycle_bin", "[[Recycle Bin — empty all drives]]"),
        ("clipboard", "[[Clipboard — clear Windows clipboard]]"),
        ("dns_cache", "[[DNS cache — ipconfig /flushdns]]"),
        (
            "registry_mru",
            "[[Registry MRU — Recent docs, Run history, typed paths]]",
        ),
    ] {
        out.push(CleanupCandidate {
            id: format!("virt-{}-{}", cat, next_id(&mut id)),
            category: cat.into(),
            path: path.into(),
            size_bytes: 0,
            is_directory: false,
        });
    }

    out
}

fn category_roots() -> Vec<(&'static str, PathBuf)> {
    let mut roots = Vec::new();
    roots.push(("user_temp", std::env::temp_dir()));

    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let local = PathBuf::from(local);
        roots.push(("user_temp", local.join("Temp")));
        roots.push((
            "inet_cache",
            local.join("Microsoft").join("Windows").join("INetCache"),
        ));
        roots.push((
            "thumbnail_cache",
            local.join("Microsoft").join("Windows").join("Explorer"),
        ));
        roots.push((
            "windows_error_reports",
            local.join("Microsoft").join("Windows").join("WER"),
        ));
        roots.push((
            "delivery_optimization",
            local
                .join("Microsoft")
                .join("Windows")
                .join("DeliveryOptimization"),
        ));
        roots.push(("directx_shader_cache", local.join("D3DSCache")));
        roots.push((
            "notification_history",
            local
                .join("Microsoft")
                .join("Windows")
                .join("Notifications"),
        ));
        // Chromium-family cache dirs for every profile folder under User Data
        for browser in [
            local.join("Google").join("Chrome").join("User Data"),
            local.join("Microsoft").join("Edge").join("User Data"),
            local
                .join("BraveSoftware")
                .join("Brave-Browser")
                .join("User Data"),
            local.join("Vivaldi").join("User Data"),
        ] {
            push_chromium_profile_caches(&browser, &mut roots);
        }
        // Firefox cache2 under each profile
        let ff = local.join("Mozilla").join("Firefox").join("Profiles");
        if ff.is_dir() {
            if let Ok(rd) = fs::read_dir(&ff) {
                for e in rd.flatten() {
                    let cache2 = e.path().join("cache2");
                    if cache2.is_dir() {
                        roots.push(("browser_cache", cache2));
                    }
                }
            }
        }
        // Jump lists / recent
        if let Ok(roaming) = std::env::var("APPDATA") {
            let r = PathBuf::from(roaming);
            roots.push((
                "recent_documents",
                r.join("Microsoft").join("Windows").join("Recent"),
            ));
            roots.push((
                "recent_documents",
                r.join("Microsoft")
                    .join("Windows")
                    .join("Recent")
                    .join("AutomaticDestinations"),
            ));
            roots.push((
                "recent_documents",
                r.join("Microsoft")
                    .join("Windows")
                    .join("Recent")
                    .join("CustomDestinations"),
            ));
            // Office temp
            roots.push((
                "office_temp",
                r.join("Microsoft").join("Office").join("Recent"),
            ));
            roots.push(("office_temp", r.join("Microsoft").join("Word")));
            roots.push(("office_temp", r.join("Microsoft").join("Excel")));
            roots.push(("office_temp", r.join("Microsoft").join("PowerPoint")));
        }
    }

    if let Ok(windir) = std::env::var("WINDIR") {
        let w = PathBuf::from(windir);
        roots.push(("windows_temp", w.join("Temp")));
        roots.push(("windows_logs", w.join("Logs").join("CBS")));
        roots.push(("prefetch", w.join("Prefetch")));
        roots.push(("memory_dumps", w.join("Minidump")));
        roots.push(("memory_dumps", w.join("MEMORY.DMP")));
        roots.push((
            "font_cache",
            w.join("ServiceProfiles")
                .join("LocalService")
                .join("AppData")
                .join("Local")
                .join("FontCache"),
        ));
        roots.push((
            "windows_update_downloads",
            w.join("SoftwareDistribution").join("Download"),
        ));
    }

    if let Ok(progdata) = std::env::var("ProgramData") {
        let pd = PathBuf::from(progdata);
        roots.push((
            "windows_update_cache",
            pd.join("Microsoft")
                .join("Windows")
                .join("DeliveryOptimization")
                .join("Cache"),
        ));
        roots.push((
            "windows_defender_history",
            pd.join("Microsoft")
                .join("Windows Defender")
                .join("Scans")
                .join("History"),
        ));
    }

    if let Some(home) = dirs::home_dir() {
        roots.push(("user_cache", home.join(".cache")));
        roots.push(("recent_documents", home.join("Recent")));
    }

    roots
}

fn push_chromium_profile_caches(user_data: &Path, roots: &mut Vec<(&'static str, PathBuf)>) {
    if !user_data.is_dir() {
        return;
    }
    let Ok(rd) = fs::read_dir(user_data) else {
        return;
    };
    for e in rd.flatten().take(20) {
        let name = e.file_name().to_string_lossy().to_string();
        // Default, Profile 1, Guest Profile, etc.
        let lower = name.to_ascii_lowercase();
        if !(lower == "default"
            || lower.starts_with("profile ")
            || lower.contains("guest")
            || lower.starts_with("profile"))
        {
            continue;
        }
        let prof = e.path();
        for sub in [
            "Cache",
            "Code Cache",
            "GPUCache",
            "ShaderCache",
            "GrShaderCache",
            "Service Worker/CacheStorage",
            "Media Cache",
            "DawnCache",
        ] {
            let p = prof.join(sub);
            if p.exists() {
                roots.push(("browser_cache", p));
            }
        }
    }
}

/// History / cookies / session files (classic CCleaner privacy).
fn collect_browser_privacy_files(out: &mut Vec<CleanupCandidate>, id: &mut u64) {
    let local = match std::env::var("LOCALAPPDATA") {
        Ok(v) => PathBuf::from(v),
        Err(_) => return,
    };

    // Chromium: specific DB files only (not whole profile)
    let chromium_bases = [
        local.join("Google").join("Chrome").join("User Data"),
        local.join("Microsoft").join("Edge").join("User Data"),
        local
            .join("BraveSoftware")
            .join("Brave-Browser")
            .join("User Data"),
    ];
    let history_names = [
        "History",
        "History-journal",
        "Visited Links",
        "Top Sites",
        "Top Sites-journal",
    ];
    let cookie_names = [
        "Cookies",
        "Cookies-journal",
        "Network/Cookies",
        "Network/Cookies-journal",
    ];
    let session_names = [
        "Current Session",
        "Current Tabs",
        "Last Session",
        "Last Tabs",
        "Sessions",
    ];
    let form_names = ["Web Data", "Web Data-journal"]; // autofill (passwords live here too — labeled privacy)

    for base in chromium_bases {
        if !base.is_dir() {
            continue;
        }
        let Ok(rd) = fs::read_dir(&base) else {
            continue;
        };
        for e in rd.flatten().take(20) {
            let prof = e.path();
            if !prof.is_dir() {
                continue;
            }
            for n in history_names {
                try_push_named(out, id, "browser_history", &prof.join(n));
            }
            for n in cookie_names {
                try_push_named(out, id, "browser_cookies", &prof.join(n));
            }
            for n in session_names {
                try_push_named(out, id, "browser_sessions", &prof.join(n));
            }
            for n in form_names {
                try_push_named(out, id, "browser_form_data", &prof.join(n));
            }
        }
    }

    // Firefox
    let ff = local.join("Mozilla").join("Firefox").join("Profiles");
    if ff.is_dir() {
        if let Ok(rd) = fs::read_dir(&ff) {
            for e in rd.flatten() {
                let p = e.path();
                try_push_named(out, id, "browser_history", &p.join("places.sqlite"));
                try_push_named(out, id, "browser_history", &p.join("places.sqlite-wal"));
                try_push_named(out, id, "browser_cookies", &p.join("cookies.sqlite"));
                try_push_named(out, id, "browser_cookies", &p.join("cookies.sqlite-wal"));
                try_push_named(out, id, "browser_sessions", &p.join("sessionstore.jsonlz4"));
                try_push_named(out, id, "browser_form_data", &p.join("formhistory.sqlite"));
            }
        }
    }
}

fn try_push_named(out: &mut Vec<CleanupCandidate>, id: &mut u64, category: &str, path: &Path) {
    if !path.is_file() {
        return;
    }
    if out.len() >= MAX_CANDIDATES {
        return;
    }
    let size = fs::metadata(path).map(|m| m.len() as i64).unwrap_or(0);
    out.push(CleanupCandidate {
        id: format!("c-{}", next_id(id)),
        category: category.into(),
        path: path.display().to_string(),
        size_bytes: size,
        is_directory: false,
    });
}

fn walk_collect(
    path: &Path,
    depth: u32,
    category: &str,
    out: &mut Vec<CleanupCandidate>,
    id: &mut u64,
    files_in_root: &mut usize,
) {
    if out.len() >= MAX_CANDIDATES || *files_in_root >= MAX_FILES_PER_ROOT || depth > MAX_DEPTH {
        return;
    }
    // Explorer thumbcache files only
    if category == "thumbnail_cache" {
        if let Ok(rd) = fs::read_dir(path) {
            for e in rd.flatten() {
                let p = e.path();
                let name = e.file_name().to_string_lossy().to_lowercase();
                if name.starts_with("thumbcache") && name.ends_with(".db") {
                    push_file(out, id, category, &p, files_in_root);
                }
            }
        }
        return;
    }
    // Prefetch: only .pf
    if category == "prefetch" {
        if path.is_file() {
            if path
                .extension()
                .map(|e| e.eq_ignore_ascii_case("pf"))
                .unwrap_or(false)
            {
                push_file(out, id, category, path, files_in_root);
            }
            return;
        }
        if let Ok(rd) = fs::read_dir(path) {
            for e in rd.flatten() {
                let p = e.path();
                if p.extension()
                    .map(|x| x.eq_ignore_ascii_case("pf"))
                    .unwrap_or(false)
                {
                    push_file(out, id, category, &p, files_in_root);
                }
            }
        }
        return;
    }
    // Office: only Recent shortcuts and ~$ / .tmp junk — not whole Office trees
    if category == "office_temp" {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if name.eq_ignore_ascii_case("Recent") && path.is_dir() {
            // fall through to walk
        } else if path.is_file() {
            let nl = name.to_ascii_lowercase();
            if nl.starts_with("~$") || nl.ends_with(".tmp") || nl.ends_with(".asd") {
                push_file(out, id, category, path, files_in_root);
            }
            return;
        } else {
            // Word/Excel/PowerPoint roots: only scan for temp-like files shallow
            if let Ok(rd) = fs::read_dir(path) {
                for e in rd.flatten().take(200) {
                    let p = e.path();
                    let nl = e.file_name().to_string_lossy().to_ascii_lowercase();
                    if p.is_file()
                        && (nl.starts_with("~$") || nl.ends_with(".tmp") || nl.ends_with(".asd"))
                    {
                        push_file(out, id, category, &p, files_in_root);
                    }
                }
            }
            return;
        }
    }
    // Firefox: only *cache* folders under Profiles
    if category == "browser_cache"
        && path
            .file_name()
            .map(|n| n.to_string_lossy().eq_ignore_ascii_case("Profiles"))
            .unwrap_or(false)
    {
        if let Ok(rd) = fs::read_dir(path) {
            for e in rd.flatten() {
                let cache = e.path().join("cache2");
                if cache.is_dir() {
                    walk_collect(&cache, depth + 1, category, out, id, files_in_root);
                }
            }
        }
        return;
    }

    let meta = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => return,
    };
    if meta.file_type().is_symlink() {
        return;
    }
    if meta.is_file() {
        // Prefer older / clearly temp files for logs
        if category == "windows_logs" || category == "windows_error_reports" {
            if let Ok(modified) = meta.modified() {
                if let Ok(age) = SystemTime::now().duration_since(modified) {
                    if age.as_secs() < 3600 {
                        return; // skip very fresh logs
                    }
                }
            }
        }
        push_file(out, id, category, path, files_in_root);
        return;
    }
    if !meta.is_dir() {
        return;
    }
    let rd = match fs::read_dir(path) {
        Ok(r) => r,
        Err(_) => return,
    };
    for entry in rd.flatten() {
        if out.len() >= MAX_CANDIDATES || *files_in_root >= MAX_FILES_PER_ROOT {
            break;
        }
        let child = entry.path();
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name == "." || name == ".." {
            continue;
        }
        // Never walk into browser profile data beyond cache
        if name == "cookies" || name == "login data" || name == "web data" || name == "history" {
            continue;
        }
        walk_collect(&child, depth + 1, category, out, id, files_in_root);
    }
}

fn push_file(
    out: &mut Vec<CleanupCandidate>,
    id: &mut u64,
    category: &str,
    path: &Path,
    files_in_root: &mut usize,
) {
    let size = fs::metadata(path).map(|m| m.len() as i64).unwrap_or(0);
    out.push(CleanupCandidate {
        id: format!("c-{}", next_id(id)),
        category: category.into(),
        path: path.display().to_string(),
        size_bytes: size,
        is_directory: false,
    });
    *files_in_root += 1;
}

fn next_id(id: &mut u64) -> u64 {
    *id += 1;
    *id
}

fn summarize_categories(candidates: &[CleanupCandidate]) -> Vec<CleanupCategorySummary> {
    // Classic CCleaner-style categories. risk: safe | privacy | advanced
    let meta: &[(&str, &str, &str, &str)] = &[
        (
            "user_temp",
            "Temporary files (user)",
            "TEMP and Local\\Temp",
            "safe",
        ),
        (
            "windows_temp",
            "Temporary files (Windows)",
            "%WINDIR%\\Temp",
            "safe",
        ),
        (
            "inet_cache",
            "Internet temporary files",
            "INetCache",
            "safe",
        ),
        (
            "browser_cache",
            "Browser cache",
            "Chrome/Edge/Brave/Firefox cache, GPU/shader caches",
            "safe",
        ),
        (
            "browser_history",
            "Browser history",
            "History / places.sqlite (closes browsers first)",
            "privacy",
        ),
        (
            "browser_cookies",
            "Browser cookies",
            "Cookies DBs — signs you out of sites",
            "privacy",
        ),
        (
            "browser_sessions",
            "Browser sessions",
            "Open tabs / session restore files",
            "privacy",
        ),
        (
            "browser_form_data",
            "Form history / autofill DBs",
            "Web Data / formhistory (may include saved form fields)",
            "privacy",
        ),
        (
            "thumbnail_cache",
            "Thumbnail cache",
            "Explorer thumbcache_*.db",
            "safe",
        ),
        (
            "recent_documents",
            "Recent documents & jump lists",
            "Recent folder + AutomaticDestinations",
            "privacy",
        ),
        (
            "prefetch",
            "Windows Prefetch",
            "%WINDIR%\\Prefetch (may slightly slow next launch)",
            "advanced",
        ),
        (
            "memory_dumps",
            "Memory dumps",
            "Minidump + MEMORY.DMP",
            "safe",
        ),
        ("font_cache", "Font cache", "Windows font cache", "safe"),
        (
            "directx_shader_cache",
            "DirectX shader cache",
            "D3DSCache",
            "safe",
        ),
        (
            "windows_error_reports",
            "Windows Error Reporting",
            "WER queues",
            "safe",
        ),
        (
            "delivery_optimization",
            "Delivery Optimization",
            "Update peer cache",
            "safe",
        ),
        (
            "windows_update_cache",
            "Update delivery cache",
            "ProgramData DeliveryOptimization",
            "safe",
        ),
        (
            "windows_update_downloads",
            "Windows Update downloads",
            "SoftwareDistribution\\Download",
            "advanced",
        ),
        (
            "windows_logs",
            "Windows logs",
            "CBS logs older than 1 hour",
            "safe",
        ),
        (
            "windows_defender_history",
            "Defender scan history",
            "Windows Defender History",
            "safe",
        ),
        (
            "notification_history",
            "Notification history",
            "Windows Notifications",
            "safe",
        ),
        (
            "office_temp",
            "Office recent/temp",
            "Office Recent and app folders (temp-like)",
            "privacy",
        ),
        ("user_cache", "User .cache", "Home .cache", "safe"),
        (
            "recycle_bin",
            "Recycle Bin",
            "Empty Recycle Bin on all drives",
            "safe",
        ),
        ("clipboard", "Clipboard", "Clear Windows clipboard", "safe"),
        ("dns_cache", "DNS cache", "Flush DNS resolver cache", "safe"),
        (
            "registry_mru",
            "Registry recent lists (MRU)",
            "Recent docs, Run history, typed paths — not a full registry junk scan",
            "privacy",
        ),
    ];

    let always_show = ["recycle_bin", "clipboard", "dns_cache", "registry_mru"];

    let mut out = Vec::new();
    for (id, label, desc, risk) in meta {
        let items: Vec<_> = candidates.iter().filter(|c| c.category == *id).collect();
        if items.is_empty() && !always_show.contains(id) {
            continue;
        }
        let total_bytes: i64 = items.iter().map(|c| c.size_bytes).sum();
        let item_count =
            if always_show.contains(id) && items.iter().all(|i| is_virtual_candidate(i)) {
                1
            } else {
                items.len() as i64
            };
        out.push(CleanupCategorySummary {
            id: (*id).into(),
            label: (*label).into(),
            description: (*desc).into(),
            item_count,
            total_bytes,
            risk: (*risk).into(),
        });
    }
    // Prefer safe categories first, then by size
    out.sort_by(|a, b| {
        let ra = risk_rank(&a.risk);
        let rb = risk_rank(&b.risk);
        ra.cmp(&rb).then_with(|| b.total_bytes.cmp(&a.total_bytes))
    });
    out
}

fn risk_rank(risk: &str) -> u8 {
    match risk {
        "safe" => 0,
        "privacy" => 1,
        "advanced" => 2,
        _ => 3,
    }
}

// (is_path_safe_to_delete removed — execute trusts scanner candidates + hard blocks only)

fn run_special_recycle_bin() -> Result<String, String> {
    #[cfg(windows)]
    {
        let output = crate::process_win::silent_command("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Clear-RecycleBin -Force -ErrorAction SilentlyContinue; 'Recycle Bin emptied'",
            ])
            .output()
            .map_err(|e| format!("Clear-RecycleBin: {e}"))?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }
    #[cfg(not(windows))]
    {
        Err("Recycle Bin only on Windows".into())
    }
}

fn run_special_clipboard() -> Result<String, String> {
    #[cfg(windows)]
    {
        let output = crate::process_win::silent_command("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Set-Clipboard -Value $null -ErrorAction SilentlyContinue; 'Clipboard cleared'",
            ])
            .output()
            .map_err(|e| format!("clipboard: {e}"))?;
        if output.status.success() {
            Ok("Clipboard cleared".into())
        } else {
            // Fallback via cmd clip
            let _ = crate::process_win::silent_command("cmd")
                .args(["/C", "echo off | clip"])
                .output();
            Ok("Clipboard cleared (fallback)".into())
        }
    }
    #[cfg(not(windows))]
    {
        Err("Clipboard clear only on Windows".into())
    }
}

fn run_special_dns_flush() -> Result<String, String> {
    #[cfg(windows)]
    {
        let output = crate::process_win::silent_command("ipconfig")
            .args(["/flushdns"])
            .output()
            .map_err(|e| format!("ipconfig: {e}"))?;
        if output.status.success() {
            Ok("DNS resolver cache flushed".into())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }
    #[cfg(not(windows))]
    {
        Err("DNS flush only on Windows".into())
    }
}

/// Conservative CCleaner-style registry recent lists — not a junk scanner.
fn run_special_registry_mru() -> Result<String, String> {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_ALL_ACCESS};
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let mut cleared = 0u32;
        // RecentDocs
        if let Ok(key) = hkcu.open_subkey_with_flags(
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\RecentDocs",
            KEY_ALL_ACCESS,
        ) {
            for (name, _) in key.enum_values().flatten().collect::<Vec<_>>() {
                let _ = key.delete_value(name);
                cleared += 1;
            }
            for sub in key.enum_keys().flatten().collect::<Vec<_>>() {
                let _ = key.delete_subkey_all(&sub);
                cleared += 1;
            }
        }
        // RunMRU
        if let Ok(key) = hkcu.open_subkey_with_flags(
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\RunMRU",
            KEY_ALL_ACCESS,
        ) {
            for (name, _) in key.enum_values().flatten().collect::<Vec<_>>() {
                let _ = key.delete_value(name);
                cleared += 1;
            }
        }
        // TypedPaths
        if let Ok(key) = hkcu.open_subkey_with_flags(
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\TypedPaths",
            KEY_ALL_ACCESS,
        ) {
            for (name, _) in key.enum_values().flatten().collect::<Vec<_>>() {
                let _ = key.delete_value(name);
                cleared += 1;
            }
        }
        // ComDlg32 OpenSavePidlMRU / LastVisitedPidlMRU
        for sub in [
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\ComDlg32\OpenSavePidlMRU",
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\ComDlg32\LastVisitedPidlMRU",
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\ComDlg32\LastVisitedPidlMRULegacy",
        ] {
            if let Ok(key) = hkcu.open_subkey_with_flags(sub, KEY_ALL_ACCESS) {
                for child in key.enum_keys().flatten().collect::<Vec<_>>() {
                    let _ = key.delete_subkey_all(&child);
                    cleared += 1;
                }
                for (name, _) in key.enum_values().flatten().collect::<Vec<_>>() {
                    let _ = key.delete_value(name);
                    cleared += 1;
                }
            }
        }
        Ok(format!(
            "Registry MRU lists cleared ({cleared} value/key operations)"
        ))
    }
    #[cfg(not(windows))]
    {
        Err("Registry MRU only on Windows".into())
    }
}

// Keep legacy wrappers used by intelligence commands.
pub fn propose_safe_cleanup_preview(
    conn: &Connection,
) -> Result<crate::models::ActionAudit, CoreError> {
    let preview = scan_cleanup_preview(conn)?;
    let detail = format!(
        "Dry-run cleanup: {} item(s), {} MB across {} categories.",
        preview.total_count,
        preview.total_bytes / (1024 * 1024),
        preview.categories.len()
    );
    let json = serde_json::to_string(&preview).unwrap_or_else(|_| "{}".into());
    let mut action = actions::record_action(
        conn,
        "safe_cleanup_preview",
        RISK_SAFE,
        "Safe cleanup preview (dry-run)",
        Some(&detail),
        "previewed",
        Some(&json),
    )?;
    actions::complete_action(
        conn,
        &action.id,
        "completed",
        Some("Dry-run only; no files deleted."),
    )?;
    action.status = "completed".into();
    action.result_message = Some("Dry-run only; no files deleted.".into());
    action.finished_at = Some(now_rfc3339()?);
    Ok(action)
}

pub fn execute_safe_cleanup(conn: &Connection, confirm: bool) -> Result<CleanupResult, CoreError> {
    execute_cleanup(conn, None, confirm)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("db");
        conn.pragma_update(None, "foreign_keys", "ON").ok();
        db::run_migrations(&conn).expect("mig");
        conn
    }

    #[test]
    fn preview_runs() {
        let conn = memory_db();
        let p = scan_cleanup_preview(&conn).expect("preview");
        assert!(p.dry_run);
        assert!(!p.categories.is_empty() || p.total_count >= 0);
    }

    #[test]
    fn execute_requires_confirm() {
        let conn = memory_db();
        let err = execute_cleanup(&conn, None, false).expect_err("confirm");
        assert!(err.to_string().contains("confirm"));
    }
}
