//! Health Intelligence.
//!
//! Samples on-device resource usage (`sampler`), derives a `0..=100` HealthScore
//! (`score`), and orchestrates capture: it resolves the local device, builds a
//! [`HealthSample`](crate::models::HealthSample), and delegates persistence to
//! `storage::health_repo`. Contains no SQL and no raw sampling details of its
//! own (see doc 48 §4.1).

pub mod sampler;
pub mod score;

use rusqlite::Connection;

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::HealthSample;
use crate::storage::{device_repo, health_repo};

/// Captures a health sample for the local device, persists it, and returns it.
pub fn capture_sample(conn: &Connection) -> Result<HealthSample, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    let metrics = sampler::sample();
    let sample = build_sample(&device.id, &metrics)?;
    health_repo::insert_sample(conn, &sample)?;
    Ok(sample)
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
}
