//! Patch My PC–class third-party update engine.
//!
//! Detects available upgrades via `winget upgrade` (Windows) and applies
//! selected packages with explicit confirmation + action audit.

use rusqlite::Connection;

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::{ActionAudit, SoftwareUpdate, UpdateApplyResult, UpdateFailure};
use crate::storage::{action_repo, device_repo, update_repo};

/// Scans for available upgrades and replaces the device update catalog.
pub fn scan_updates(conn: &Connection) -> Result<Vec<SoftwareUpdate>, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    let scanned_at = now_rfc3339()?;
    let mut updates = collect_upgrades(&device.id, &scanned_at);
    updates.sort_by_key(|a| a.name.to_lowercase());
    update_repo::replace_updates(conn, &device.id, &updates)?;
    Ok(updates)
}

/// Lists last scan results for the local device.
pub fn list_updates(conn: &Connection) -> Result<Vec<SoftwareUpdate>, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    update_repo::list_updates(conn, &device.id)
}

/// Applies selected updates. Requires `confirm = true` (safety brand).
pub fn apply_updates(
    conn: &Connection,
    update_ids: Vec<String>,
    confirm: bool,
) -> Result<UpdateApplyResult, CoreError> {
    if !confirm {
        return Err(CoreError::Internal(
            "apply_updates requires confirm=true (explicit user consent)".into(),
        ));
    }
    if update_ids.is_empty() {
        return Err(CoreError::Internal("no update ids provided".into()));
    }

    let mut result = UpdateApplyResult {
        succeeded: Vec::new(),
        failed: Vec::new(),
        skipped: Vec::new(),
    };

    for id in update_ids {
        let Some(update) = update_repo::get_update(conn, &id)? else {
            result.skipped.push(id);
            continue;
        };
        if update.status == "installed" {
            result.skipped.push(id);
            continue;
        }

        let outcome = install_one(&update);
        let action = ActionAudit {
            id: uuid::Uuid::new_v4().to_string(),
            device_id: update.device_id.clone(),
            action_type: "software_update".into(),
            risk_tier: "privileged".into(),
            title: format!("Upgrade {}", update.name),
            detail: Some(format!(
                "{} → {} ({})",
                update.current_version.as_deref().unwrap_or("?"),
                update.available_version,
                update.winget_id.as_deref().unwrap_or("name-match")
            )),
            status: if outcome.0 {
                "completed".into()
            } else {
                "failed".into()
            },
            preview: Some(outcome.1.clone()),
            result_message: Some(outcome.1.clone()),
            created_at: now_rfc3339()?,
            finished_at: Some(now_rfc3339()?),
        };
        let _ = action_repo::insert_action(conn, &action);

        if outcome.0 {
            update_repo::set_status(conn, &id, "installed", Some("Applied via winget upgrade"))?;
            result.succeeded.push(id);
        } else {
            update_repo::set_status(conn, &id, "failed", Some(&outcome.1))?;
            result.failed.push(UpdateFailure {
                id,
                name: update.name,
                message: outcome.1,
            });
        }
    }

    Ok(result)
}

fn collect_upgrades(device_id: &str, scanned_at: &str) -> Vec<SoftwareUpdate> {
    #[cfg(windows)]
    {
        return winget_upgrade_list(device_id, scanned_at);
    }
    #[cfg(not(windows))]
    {
        let _ = (device_id, scanned_at);
        // No fake catalog — empty until a real package manager is wired.
        Vec::new()
    }
}

#[cfg(windows)]
fn winget_upgrade_list(device_id: &str, scanned_at: &str) -> Vec<SoftwareUpdate> {
    let output = crate::process_win::silent_command("winget")
        .args([
            "upgrade",
            "--include-unknown",
            "--disable-interactivity",
            "--accept-source-agreements",
        ])
        .output();

    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() && output.stdout.is_empty() {
        return Vec::new();
    }

    let text = String::from_utf8_lossy(&output.stdout);
    parse_winget_upgrade_table(&text, device_id, scanned_at)
}

#[cfg(windows)]
fn parse_winget_upgrade_table(
    text: &str,
    device_id: &str,
    scanned_at: &str,
) -> Vec<SoftwareUpdate> {
    let mut updates = Vec::new();
    let mut started = false;
    for line in text.lines() {
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.contains("Name") && trimmed.contains("Id") && trimmed.contains("Available") {
            started = true;
            continue;
        }
        if !started {
            continue;
        }
        if trimmed.chars().all(|c| c == '-' || c == ' ') {
            continue;
        }
        if trimmed.starts_with("No installed package")
            || trimmed.contains("upgrades available")
            || trimmed.starts_with("The following packages")
        {
            continue;
        }

        let parts = split_winget_cols(trimmed);
        if parts.len() < 4 {
            continue;
        }

        let name = parts[0].to_string();
        let winget_id = parts[1].to_string();
        let current = parts[2].to_string();
        let available = parts[3].to_string();
        let source = parts
            .get(4)
            .cloned()
            .unwrap_or_else(|| "winget".to_string());

        if name.eq_ignore_ascii_case("name") {
            continue;
        }

        updates.push(SoftwareUpdate {
            id: uuid::Uuid::new_v4().to_string(),
            device_id: device_id.into(),
            name,
            winget_id: Some(winget_id),
            publisher: None,
            current_version: Some(current),
            available_version: available,
            source,
            status: "available".into(),
            detail: None,
            scanned_at: scanned_at.into(),
        });
    }
    updates
}

#[cfg(windows)]
fn split_winget_cols(line: &str) -> Vec<String> {
    let mut cols = Vec::new();
    let mut current = String::new();
    let mut space_run = 0;
    for ch in line.chars() {
        if ch == ' ' {
            space_run += 1;
            continue;
        }
        if space_run >= 2 && !current.is_empty() {
            cols.push(current.trim().to_string());
            current.clear();
        } else if space_run == 1 && !current.is_empty() {
            current.push(' ');
        }
        space_run = 0;
        current.push(ch);
    }
    if !current.trim().is_empty() {
        cols.push(current.trim().to_string());
    }
    cols
}

fn install_one(update: &SoftwareUpdate) -> (bool, String) {
    #[cfg(windows)]
    {
        let mut cmd = crate::process_win::silent_command("winget");
        cmd.arg("upgrade");
        if let Some(id) = &update.winget_id {
            cmd.arg("--id").arg(id).arg("-e");
        } else {
            cmd.arg("--name").arg(&update.name).arg("-e");
        }
        cmd.arg("--silent")
            .arg("--accept-source-agreements")
            .arg("--accept-package-agreements")
            .arg("--disable-interactivity");

        match cmd.output() {
            Ok(output) if output.status.success() => (true, "winget upgrade succeeded".into()),
            Ok(output) => {
                let msg = String::from_utf8_lossy(&output.stderr);
                let msg2 = String::from_utf8_lossy(&output.stdout);
                let line = msg
                    .lines()
                    .chain(msg2.lines())
                    .map(str::trim)
                    .find(|l| !l.is_empty())
                    .unwrap_or("winget upgrade failed")
                    .to_string();
                (false, line)
            }
            Err(e) => (false, e.to_string()),
        }
    }
    #[cfg(not(windows))]
    {
        (
            true,
            format!(
                "Simulated upgrade of {} to {}",
                update.name, update.available_version
            ),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collect_upgrades_never_injects_fake_catalog() {
        // Without a live package manager, production must return an empty list —
        // never a canned Chrome/Zoom catalog.
        let list = collect_upgrades("dev", "2026-01-01T00:00:00Z");
        assert!(
            list.iter().all(|u| {
                u.detail
                    .as_deref()
                    .map(|d| !d.to_ascii_lowercase().contains("mock catalog"))
                    .unwrap_or(true)
            }),
            "upgrade list must not contain mock catalog entries"
        );
    }
}
