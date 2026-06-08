//! Health Intelligence.
//!
//! Samples on-device resource usage (`sampler`), derives a `0..=100` HealthScore
//! (`score`), and orchestrates capture: it resolves the local device, builds a
//! [`HealthSample`](crate::models::HealthSample), and delegates persistence to
//! `storage::health_repo`. Contains no SQL and no raw sampling details of its
//! own (see doc 48 §4.1).

pub mod alerts;
pub mod sampler;
pub mod scheduler;
pub mod score;

use rusqlite::Connection;

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::{HealthAlert, HealthSample};
use crate::storage::{alerts_repo, device_repo, health_repo};

/// Captures a health sample for the local device, persists it, evaluates the
/// reading against the alert thresholds (persisting any breaches), and returns
/// the sample.
pub fn capture_sample(conn: &Connection) -> Result<HealthSample, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    let metrics = sampler::sample();
    let sample = build_sample(&device.id, &metrics)?;
    health_repo::insert_sample(conn, &sample)?;

    let memory_pct = percentage(metrics.memory_used, metrics.memory_total);
    let disk_pct = percentage(metrics.disk_used, metrics.disk_total);
    let new_alerts = build_alerts(&sample, metrics.cpu_usage, memory_pct, disk_pct);
    if !new_alerts.is_empty() {
        alerts_repo::insert_alerts(conn, &new_alerts)?;
    }

    // Best-effort: queue the sample for cloud sync (never fails a capture).
    let _ =
        crate::storage::sync_repo::enqueue(conn, "health_sample", &sample.id, &sample.captured_at);

    Ok(sample)
}

/// Builds persistable [`HealthAlert`]s for any threshold breaches in the given
/// reading, tying each to `sample`.
fn build_alerts(
    sample: &HealthSample,
    cpu_pct: f64,
    memory_pct: f64,
    disk_pct: f64,
) -> Vec<HealthAlert> {
    alerts::evaluate(cpu_pct, memory_pct, disk_pct)
        .into_iter()
        .map(|draft| HealthAlert {
            id: uuid::Uuid::new_v4().to_string(),
            device_id: sample.device_id.clone(),
            sample_id: sample.id.clone(),
            created_at: sample.captured_at.clone(),
            kind: draft.kind,
            severity: draft.severity,
            title: draft.title,
            detail: draft.detail,
            value: draft.value,
            acknowledged: false,
        })
        .collect()
}

/// Builds a [`HealthSample`] from raw [`HealthMetrics`](sampler::HealthMetrics)
/// for `device_id`, deriving memory/disk usage percentages and the health
/// score. Separated from sampling so it can be unit-tested deterministically.
fn build_sample(
    device_id: &str,
    metrics: &sampler::HealthMetrics,
) -> Result<HealthSample, CoreError> {
    let memory_pct = percentage(metrics.memory_used, metrics.memory_total);
    let disk_pct = percentage(metrics.disk_used, metrics.disk_total);
    let health_score = score::compute_score(metrics.cpu_usage, memory_pct, disk_pct);

    Ok(HealthSample {
        id: uuid::Uuid::new_v4().to_string(),
        device_id: device_id.to_string(),
        captured_at: now_rfc3339()?,
        cpu_usage: metrics.cpu_usage,
        memory_total: metrics.memory_total as i64,
        memory_used: metrics.memory_used as i64,
        disk_total: metrics.disk_total as i64,
        disk_used: metrics.disk_used as i64,
        health_score,
    })
}

/// Returns `used / total` as a percentage in `0.0..=100.0`, or `0.0` when
/// `total` is zero (avoids division by zero when a resource is unavailable).
fn percentage(used: u64, total: u64) -> f64 {
    if total == 0 {
        return 0.0;
    }
    (used as f64 / total as f64) * 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_sample_derives_score_and_copies_metrics() {
        let metrics = sampler::HealthMetrics {
            cpu_usage: 20.0,
            memory_total: 100,
            memory_used: 60,
            disk_total: 100,
            disk_used: 80,
        };

        let sample = build_sample("device-1", &metrics).expect("build sample");

        assert_eq!(sample.device_id, "device-1");
        assert_eq!(sample.memory_total, 100);
        assert_eq!(sample.memory_used, 60);
        assert_eq!(sample.disk_total, 100);
        assert_eq!(sample.disk_used, 80);
        // compute_score(20, 60, 80) = 100 - (5 + 21 + 32) = 42.
        assert_eq!(sample.health_score, 42);
        assert!(!sample.id.is_empty());
        assert!(!sample.captured_at.is_empty());
    }

    #[test]
    fn percentage_guards_against_zero_total() {
        assert_eq!(percentage(0, 0), 0.0);
        assert_eq!(percentage(5, 0), 0.0);
        assert_eq!(percentage(50, 100), 50.0);
    }

    #[test]
    fn build_alerts_ties_breaches_to_sample() {
        let metrics = sampler::HealthMetrics {
            cpu_usage: 10.0,
            memory_total: 100,
            memory_used: 95,
            disk_total: 100,
            disk_used: 20,
        };
        let sample = build_sample("device-1", &metrics).expect("build sample");

        // 95% memory breaches; 20% disk and 10% cpu do not.
        let built = build_alerts(&sample, 10.0, 95.0, 20.0);
        assert_eq!(built.len(), 1);
        assert_eq!(built[0].kind, "memory_critical");
        assert_eq!(built[0].sample_id, sample.id);
        assert_eq!(built[0].device_id, "device-1");
        assert!(!built[0].acknowledged);
    }
}
