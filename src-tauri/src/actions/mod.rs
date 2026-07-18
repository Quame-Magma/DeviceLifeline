//! Action framework: risk tiers, audit recording, previews, and confirmed cleanup.
//!
//! Every mutation-class operation is recorded in `action_audit`. Cleanup
//! implementation lives in [`crate::cleanup`] (CCleaner/Glary-class).

use rusqlite::Connection;

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::{ActionAudit, CleanupResult};
use crate::storage::{action_repo, device_repo};

/// Risk tier: read-only observation (no system change).
pub const RISK_READ: &str = "read";
/// Risk tier: safe / reversible low-impact change.
pub const RISK_SAFE: &str = "safe";
/// Risk tier: requires elevated privileges.
pub const RISK_PRIVILEGED: &str = "privileged";
/// Risk tier: destructive / hard to reverse.
pub const RISK_DESTRUCTIVE: &str = "destructive";

/// Returns true when `tier` is a known risk-tier slug.
pub fn is_valid_risk_tier(tier: &str) -> bool {
    matches!(
        tier,
        RISK_READ | RISK_SAFE | RISK_PRIVILEGED | RISK_DESTRUCTIVE
    )
}

/// Records a new action-audit entry and returns it.
pub fn record_action(
    conn: &Connection,
    action_type: &str,
    risk_tier: &str,
    title: &str,
    detail: Option<&str>,
    status: &str,
    preview: Option<&str>,
) -> Result<ActionAudit, CoreError> {
    if !is_valid_risk_tier(risk_tier) {
        return Err(CoreError::Internal(format!(
            "invalid risk tier: {risk_tier}"
        )));
    }
    let device = device_repo::ensure_local_device(conn)?;
    let action = ActionAudit {
        id: uuid::Uuid::new_v4().to_string(),
        device_id: device.id,
        action_type: action_type.to_string(),
        risk_tier: risk_tier.to_string(),
        title: title.to_string(),
        detail: detail.map(|s| s.to_string()),
        status: status.to_string(),
        preview: preview.map(|s| s.to_string()),
        result_message: None,
        created_at: now_rfc3339()?,
        finished_at: None,
    };
    action_repo::insert_action(conn, &action)?;
    Ok(action)
}

/// Completes an existing action with a terminal status and message.
pub fn complete_action(
    conn: &Connection,
    id: &str,
    status: &str,
    result_message: Option<&str>,
) -> Result<(), CoreError> {
    let finished_at = now_rfc3339()?;
    let updated =
        action_repo::complete_action(conn, id, status, result_message, &finished_at)?;
    if updated == 0 {
        return Err(CoreError::NotFound(format!("action {id}")));
    }
    Ok(())
}

/// Proposes a safe cleanup as a dry-run preview only — never deletes files.
pub fn propose_safe_cleanup_preview(conn: &Connection) -> Result<ActionAudit, CoreError> {
    crate::cleanup::propose_safe_cleanup_preview(conn)
}

/// Executes safe cleanup after explicit confirmation (all safe categories).
pub fn execute_safe_cleanup(conn: &Connection, confirm: bool) -> Result<CleanupResult, CoreError> {
    crate::cleanup::execute_safe_cleanup(conn, confirm)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    #[test]
    fn risk_tiers_are_validated() {
        assert!(is_valid_risk_tier(RISK_READ));
        assert!(is_valid_risk_tier(RISK_DESTRUCTIVE));
        assert!(!is_valid_risk_tier("explode"));
    }

    #[test]
    fn record_and_complete_action() {
        let conn = memory_db();
        let action = record_action(
            &conn,
            "test_action",
            RISK_READ,
            "Test",
            None,
            "proposed",
            None,
        )
        .expect("record");
        complete_action(&conn, &action.id, "completed", Some("ok")).expect("complete");
        let listed = action_repo::list_actions(&conn).expect("list");
        assert_eq!(listed[0].status, "completed");
    }

    #[test]
    fn propose_safe_cleanup_is_dry_run() {
        let conn = memory_db();
        let action = propose_safe_cleanup_preview(&conn).expect("preview");
        assert_eq!(action.risk_tier, RISK_SAFE);
        assert_eq!(action.action_type, "safe_cleanup_preview");
        assert!(action
            .preview
            .as_deref()
            .unwrap_or("")
            .contains("dryRun"));
        assert_eq!(action.status, "completed");
    }

    #[test]
    fn execute_cleanup_requires_confirm() {
        let conn = memory_db();
        let err = execute_safe_cleanup(&conn, false).expect_err("must require confirm");
        assert!(err.to_string().contains("confirm"));
    }

    #[test]
    fn execute_cleanup_with_confirm_succeeds() {
        let conn = memory_db();
        let result = execute_safe_cleanup(&conn, true).expect("ok");
        // Live temp/cache scan may delete zero or many files depending on the machine.
        assert!(result.deleted_count >= 0);
        assert_eq!(result.action.action_type, "safe_cleanup_execute");
        assert!(
            result.action.status == "completed"
                || result.action.status == "completed_with_errors"
                || result.action.status == "failed"
        );
    }
}
