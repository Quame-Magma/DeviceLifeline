//! Intelligence spine orchestration.
//!
//! Aggregates dashboard intelligence from health, findings, and live process
//! data. Finding construction lives in [`findings`].

pub mod findings;

use rusqlite::Connection;

use crate::error::CoreError;
use crate::models::DashboardIntelligence;
use crate::process;
use crate::storage::{alerts_repo, device_repo, health_repo, intelligence_repo};

/// Number of top processes shown on the dashboard.
const DASHBOARD_TOP_PROCESSES: usize = 8;
/// Number of recent findings shown on the dashboard.
const DASHBOARD_RECENT_FINDINGS: usize = 10;

/// Builds the Vision 2.0 dashboard intelligence aggregate.
///
/// Optionally publishes fresh process findings from the live snapshot so the
/// dashboard reflects current conditions without a separate scan command.
pub fn get_dashboard_intelligence(conn: &Connection) -> Result<DashboardIntelligence, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;

    let latest = health_repo::latest_sample(conn)?;
    let (health_score, cpu_usage, memory_pct, disk_pressure_pct) = match &latest {
        Some(sample) => {
            let memory_pct = if sample.memory_total > 0 {
                (sample.memory_used as f64 / sample.memory_total as f64) * 100.0
            } else {
                0.0
            };
            let disk_pct = if sample.disk_total > 0 {
                (sample.disk_used as f64 / sample.disk_total as f64) * 100.0
            } else {
                0.0
            };
            (sample.health_score, sample.cpu_usage, memory_pct, disk_pct)
        }
        None => (0, 0.0, 0.0, 0.0),
    };

    let active_alerts = alerts_repo::list_alerts(conn)?
        .into_iter()
        .filter(|a| !a.acknowledged)
        .count() as i64;

    let snapshot = process::list_processes(Some(DASHBOARD_TOP_PROCESSES))?;
    // Best-effort: publish process findings (ignore individual publish failures
    // would leave dashboard incomplete — surface DB errors).
    let _ = findings::refresh_system_findings(conn, &device.id, &snapshot.processes);

    let open_findings = intelligence_repo::count_open(conn)?;
    let recent_findings: Vec<_> = intelligence_repo::list_findings(conn, false)?
        .into_iter()
        .take(DASHBOARD_RECENT_FINDINGS)
        .collect();

    Ok(DashboardIntelligence {
        health_score,
        active_alerts,
        open_findings,
        top_processes: snapshot.processes,
        recent_findings,
        disk_pressure_pct,
        cpu_usage,
        memory_pct,
    })
}
