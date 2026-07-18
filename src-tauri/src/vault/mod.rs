//! Recovery Vault: Windows System Restore (VSS-backed), DNA vault backups,
//! and directory disk images via robocopy / recursive copy.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::VaultEntry;
use crate::storage::{device_repo, vault_repo};

/// Lists vault entries newest first.
pub fn list_entries(conn: &Connection) -> Result<Vec<VaultEntry>, CoreError> {
    vault_repo::list(conn)
}

/// Creates a Windows System Restore point (VSS-backed) when available.
pub fn create_restore_point(conn: &Connection, description: Option<String>) -> Result<VaultEntry, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    let desc = description.unwrap_or_else(|| "DeviceLifeline checkpoint".into());
    let created_at = now_rfc3339()?;
    let id = uuid::Uuid::new_v4().to_string();

    let (status, detail) = create_system_restore_point(&desc);

    let entry = VaultEntry {
        id,
        device_id: device.id,
        kind: "restore_point".into(),
        title: desc,
        status,
        detail: Some(detail),
        path: None,
        size_bytes: 0,
        created_at,
        metadata_json: "{}".into(),
    };
    vault_repo::insert(conn, &entry)?;
    Ok(entry)
}

/// Exports latest DNA snapshot as a vaulted `.dlsetup` bundle under the app data vault folder.
pub fn create_dna_vault_backup(conn: &mut Connection) -> Result<VaultEntry, CoreError> {
    use crate::setup;

    let device = device_repo::ensure_local_device(conn)?;
    let snapshots = device_repo::list_snapshots(conn)?;
    let snapshot = snapshots
        .first()
        .ok_or_else(|| CoreError::NotFound("no snapshot to vault".into()))?;

    let bundle = setup::build_bundle(conn, &snapshot.id)?;
    let vault_dir = vault_root_dir()?;
    fs::create_dir_all(&vault_dir).map_err(|e| CoreError::Internal(e.to_string()))?;

    let file_name = format!("dna-vault-{}.dlsetup.json", snapshot.id);
    let path = vault_dir.join(&file_name);
    let json = serde_json::to_string_pretty(&bundle)
        .map_err(|e| CoreError::Internal(e.to_string()))?;
    fs::write(&path, &json).map_err(|e| CoreError::Internal(e.to_string()))?;

    let entry = VaultEntry {
        id: uuid::Uuid::new_v4().to_string(),
        device_id: device.id,
        kind: "dna_backup".into(),
        title: format!("DNA vault: {}", snapshot.captured_at),
        status: "completed".into(),
        detail: Some("Portable Device DNA setup bundle stored in local vault.".into()),
        path: Some(path.display().to_string()),
        size_bytes: json.len() as i64,
        created_at: now_rfc3339()?,
        metadata_json: serde_json::json!({ "snapshotId": snapshot.id }).to_string(),
    };
    vault_repo::insert(conn, &entry)?;
    Ok(entry)
}

/// Creates a recursive directory image (file-level) of `source` into the vault.
/// This is a practical disk-image alternative for user data folders (not a block device image).
pub fn create_directory_image(
    conn: &Connection,
    source: String,
) -> Result<VaultEntry, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    let src = PathBuf::from(&source);
    if !src.exists() {
        return Err(CoreError::NotFound(format!("path {source}")));
    }
    let vault_dir = vault_root_dir()?.join("images");
    fs::create_dir_all(&vault_dir).map_err(|e| CoreError::Internal(e.to_string()))?;
    let stamp = now_rfc3339()?.replace(':', "-");
    let dest = vault_dir.join(format!("img-{}", &stamp[..stamp.len().min(19)]));
    fs::create_dir_all(&dest).map_err(|e| CoreError::Internal(e.to_string()))?;

    let (copied, bytes, errors) = copy_tree(&src, &dest, 0, 8, 50_000)?;
    let status = if errors.is_empty() {
        "completed"
    } else if copied > 0 {
        "completed_with_errors"
    } else {
        "failed"
    };

    let entry = VaultEntry {
        id: uuid::Uuid::new_v4().to_string(),
        device_id: device.id,
        kind: "directory_image".into(),
        title: format!("Directory image: {}", src.display()),
        status: status.into(),
        detail: Some(format!(
            "Copied {copied} entries, {bytes} bytes. {} error(s).",
            errors.len()
        )),
        path: Some(dest.display().to_string()),
        size_bytes: bytes as i64,
        created_at: now_rfc3339()?,
        metadata_json: serde_json::json!({
            "source": source,
            "errors": errors.into_iter().take(20).collect::<Vec<_>>(),
        })
        .to_string(),
    };
    vault_repo::insert(conn, &entry)?;
    Ok(entry)
}

fn vault_root_dir() -> Result<PathBuf, CoreError> {
    let base = dirs::data_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| CoreError::Internal("no data dir".into()))?;
    Ok(base.join("DeviceLifeline").join("vault"))
}

fn create_system_restore_point(description: &str) -> (String, String) {
    #[cfg(windows)]
    {
        // Checkpoint-Computer requires admin; fall back gracefully.
        let script = format!(
            "$ErrorActionPreference='Stop'; try {{ Checkpoint-Computer -Description '{}' -RestorePointType MODIFY_SETTINGS; 'OK' }} catch {{ $_.Exception.Message }}",
            description.replace('\'', "''")
        );
        match crate::process_win::silent_command("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()
        {
            Ok(out) => {
                let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
                if out.status.success() && text.contains("OK") {
                    (
                        "completed".into(),
                        "Windows System Restore point created (VSS-backed).".into(),
                    )
                } else {
                    (
                        "failed".into(),
                        format!(
                            "Could not create restore point (admin/System Protection may be required): {} {}",
                            text, err
                        )
                        .trim()
                        .into(),
                    )
                }
            }
            Err(e) => ("failed".into(), format!("powershell failed: {e}")),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = description;
        (
            "skipped".into(),
            "System Restore points are only available on Windows.".into(),
        )
    }
}

fn copy_tree(
    src: &Path,
    dest: &Path,
    depth: u32,
    max_depth: u32,
    max_files: usize,
) -> Result<(usize, u64, Vec<String>), CoreError> {
    let mut copied = 0usize;
    let mut bytes = 0u64;
    let mut errors = Vec::new();
    if depth > max_depth || copied >= max_files {
        return Ok((copied, bytes, errors));
    }
    let entries = match fs::read_dir(src) {
        Ok(e) => e,
        Err(e) => {
            errors.push(format!("{}: {e}", src.display()));
            return Ok((copied, bytes, errors));
        }
    };
    for entry in entries.flatten() {
        if copied >= max_files {
            break;
        }
        let path = entry.path();
        let name = entry.file_name();
        let target = dest.join(&name);
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(e) => {
                errors.push(format!("{}: {e}", path.display()));
                continue;
            }
        };
        if ft.is_dir() {
            if let Err(e) = fs::create_dir_all(&target) {
                errors.push(format!("{}: {e}", target.display()));
                continue;
            }
            let (c, b, mut errs) = copy_tree(&path, &target, depth + 1, max_depth, max_files - copied)?;
            copied += c;
            bytes += b;
            errors.append(&mut errs);
        } else if ft.is_file() {
            match fs::copy(&path, &target) {
                Ok(n) => {
                    copied += 1;
                    bytes += n;
                }
                Err(e) => errors.push(format!("{}: {e}", path.display())),
            }
        }
    }
    Ok((copied, bytes, errors))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db;
    use rusqlite::Connection;
    use std::io::Write;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        db::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn directory_image_copies_files() {
        let conn = memory_db();
        let dir = std::env::temp_dir().join(format!("dl-vault-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let mut f = fs::File::create(dir.join("a.txt")).unwrap();
        writeln!(f, "hello").unwrap();
        let entry = create_directory_image(&conn, dir.display().to_string()).expect("image");
        assert!(entry.size_bytes > 0);
        assert_eq!(entry.kind, "directory_image");
        let _ = fs::remove_dir_all(&dir);
        if let Some(p) = entry.path {
            let _ = fs::remove_dir_all(p);
        }
    }
}
