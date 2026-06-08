//! Crash Intelligence.
//!
//! Collects crash / stability events from the platform
//! [`CrashCollector`](crate::collectors::CrashCollector), classifies them
//! (`classify`) into plain-English categories, and persists them idempotently
//! via `storage::crash_repo`. Contains no SQL and no raw event-log parsing of
//! its own (see doc 48 §4.1).

pub mod classify;

use rusqlite::Connection;

use crate::collectors::{default_crash_collector, CrashCollector};
use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::{CrashEvent, RawCrashEvent};
use crate::storage::{crash_repo, device_repo};

/// Scans the OS event log for crash / stability events using the platform
/// default collector, persists any new ones (re-scans are idempotent), and
/// returns the full list newest-first.
pub fn scan_and_store(conn: &mut Connection) -> Result<Vec<CrashEvent>, CoreError> {
    scan_with_collector(conn, default_crash_collector().as_ref())
}

/// Scans using the supplied collector. Split out so tests can inject the mock
/// collector deterministically on any platform.
fn scan_with_collector(
    conn: &mut Connection,
    collector: &dyn CrashCollector,
) -> Result<Vec<CrashEvent>, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    let captured_at = now_rfc3339()?;
    let events: Vec<CrashEvent> = collector
        .collect()?
        .into_iter()
        .map(|raw| to_event(&device.id, &captured_at, raw))
        .collect();

    crash_repo::insert_events(conn, &events)?;
    crash_repo::list_events(conn)
}

/// Converts a [`RawCrashEvent`] into a persistable [`CrashEvent`] by applying
/// the [`classify`](classify::classify) policy.
fn to_event(device_id: &str, captured_at: &str, raw: RawCrashEvent) -> CrashEvent {
    let class = classify::classify(&raw.provider, raw.event_id);
    CrashEvent {
        id: uuid::Uuid::new_v4().to_string(),
        device_id: device_id.to_string(),
        occurred_at: raw.occurred_at,
        captured_at: captured_at.to_string(),
        category: class.category,
        severity: class.severity,
        source: raw.provider,
        title: class.title,
        detail: raw.message,
        event_id: raw.event_id,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::collectors::crash::MockCrashCollector;
    use crate::storage::db;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    #[test]
    fn scan_persists_classified_events() {
        let mut conn = memory_db();
        let collector = MockCrashCollector::new();

        let events = scan_with_collector(&mut conn, &collector).expect("scan");

        assert_eq!(events.len(), 4);
        assert!(events.iter().any(|e| e.category == "bsod"));
        assert!(events.iter().any(|e| e.category == "app_crash"));
        assert!(events.iter().any(|e| e.category == "app_hang"));
        assert!(events.iter().all(|e| !e.device_id.is_empty()));
    }

    #[test]
    fn rescanning_is_idempotent() {
        let mut conn = memory_db();
        let collector = MockCrashCollector::new();

        scan_with_collector(&mut conn, &collector).expect("first scan");
        let second = scan_with_collector(&mut conn, &collector).expect("second scan");

        // The same events must not be inserted twice.
        assert_eq!(second.len(), 4);
    }
}
