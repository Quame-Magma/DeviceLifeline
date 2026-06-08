//! Background health-sampling scheduler.
//!
//! A small, testable policy ([`is_due`]) for deciding when the next health
//! sample is due, plus [`maybe_sample`] which the background thread calls on
//! each tick. The thread itself is spawned in [`run`](crate::run); on launch it
//! samples immediately (so a HealthScore exists within seconds of startup) and
//! then re-checks on an interval.

use rusqlite::Connection;

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::storage::health_repo;

/// Default interval between automatic health samples (15 minutes).
pub const DEFAULT_INTERVAL_SECS: i64 = 15 * 60;

/// Parses an RFC3339 timestamp, returning `None` if it cannot be parsed.
fn parse(ts: &str) -> Option<time::OffsetDateTime> {
    time::OffsetDateTime::parse(ts, &time::format_description::well_known::Rfc3339).ok()
}

/// Returns whether a new sample is due: `true` when there is no previous sample,
/// when a timestamp cannot be parsed (fail open — prefer sampling), or when at
/// least `interval_secs` have elapsed since `last`.
pub fn is_due(last: Option<&str>, now: &str, interval_secs: i64) -> bool {
    let Some(last) = last else {
        return true;
    };
    match (parse(last), parse(now)) {
        (Some(last_t), Some(now_t)) => (now_t - last_t).whole_seconds() >= interval_secs,
        _ => true,
    }
}

/// Captures a health sample if one is due relative to the most recent stored
/// sample. Returns whether a new sample was captured.
pub fn maybe_sample(conn: &Connection, interval_secs: i64) -> Result<bool, CoreError> {
    let latest = health_repo::latest_sample(conn)?;
    let now = now_rfc3339()?;
    let due = is_due(
        latest.as_ref().map(|sample| sample.captured_at.as_str()),
        &now,
        interval_secs,
    );
    if due {
        super::capture_sample(conn)?;
    }
    Ok(due)
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
    fn due_when_no_previous_sample() {
        assert!(is_due(None, "2026-06-08T10:00:00Z", 900));
    }

    #[test]
    fn not_due_before_interval_elapses() {
        assert!(!is_due(
            Some("2026-06-08T10:00:00Z"),
            "2026-06-08T10:10:00Z",
            900
        ));
    }

    #[test]
    fn due_after_interval_elapses() {
        assert!(is_due(
            Some("2026-06-08T10:00:00Z"),
            "2026-06-08T10:20:00Z",
            900
        ));
    }

    #[test]
    fn unparseable_timestamps_fail_open() {
        assert!(is_due(Some("not-a-date"), "also-not-a-date", 900));
    }

    #[test]
    fn maybe_sample_captures_then_skips_within_interval() {
        let conn = memory_db();
        // No prior sample → captures.
        assert!(maybe_sample(&conn, 900).expect("first sample"));
        // Just sampled → not due again within the interval.
        assert!(!maybe_sample(&conn, 900).expect("second sample"));
    }

    #[test]
    fn zero_interval_is_always_due() {
        let conn = memory_db();
        assert!(maybe_sample(&conn, 0).expect("first sample"));
        assert!(maybe_sample(&conn, 0).expect("second sample"));
    }
}
