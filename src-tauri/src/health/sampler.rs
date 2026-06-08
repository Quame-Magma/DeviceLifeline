//! On-device resource sampling via [`sysinfo`].
//!
//! Unlike the registry-backed software/config collectors (which are Windows-only
//! and fall back to mock data elsewhere), `sysinfo` returns real CPU, memory,
//! and disk metrics on every supported platform. This sampler therefore needs
//! no platform `cfg` split and no mock.

use std::thread::sleep;

use sysinfo::{Disks, MINIMUM_CPU_UPDATE_INTERVAL, System};

/// A single raw resource reading, prior to scoring and persistence.
#[derive(Clone, Debug)]
pub struct HealthMetrics {
    /// Overall CPU usage as a percentage in `0.0..=100.0`.
    pub cpu_usage: f64,
    /// Total physical memory, in bytes.
    pub memory_total: u64,
    /// Used physical memory, in bytes.
    pub memory_used: u64,
    /// Total space of the primary disk, in bytes (`0` if none was found).
    pub disk_total: u64,
    /// Used space of the primary disk, in bytes.
    pub disk_used: u64,
}

/// Samples current CPU, memory, and disk usage from the host.
///
/// CPU usage is a delta between two measurements, so this refreshes CPU stats,
/// sleeps for [`MINIMUM_CPU_UPDATE_INTERVAL`], then refreshes again before
/// reading the global usage. The sleep makes this a brief blocking call.
pub fn sample() -> HealthMetrics {
    let mut sys = System::new();

    // CPU usage needs two measurements separated by a minimum interval.
    sys.refresh_cpu_usage();
    sleep(MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu_usage();
    let cpu_usage = f64::from(sys.global_cpu_usage());

    sys.refresh_memory();
    let memory_total = sys.total_memory();
    let memory_used = sys.used_memory();

    let (disk_total, disk_used) = primary_disk_usage();

    HealthMetrics {
        cpu_usage,
        memory_total,
        memory_used,
        disk_total,
        disk_used,
    }
}

/// Returns `(total, used)` bytes for the primary disk — the one with the
/// largest total capacity, typically the system drive — or `(0, 0)` when no
/// disks are reported.
fn primary_disk_usage() -> (u64, u64) {
    let disks = Disks::new_with_refreshed_list();
    disks
        .list()
        .iter()
        .max_by_key(|disk| disk.total_space())
        .map(|disk| {
            let total = disk.total_space();
            let used = total.saturating_sub(disk.available_space());
            (total, used)
        })
        .unwrap_or((0, 0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sample_returns_values_in_expected_ranges() {
        let metrics = sample();

        assert!((0.0..=100.0).contains(&metrics.cpu_usage));
        assert!(metrics.memory_used <= metrics.memory_total);
        assert!(metrics.disk_used <= metrics.disk_total);
    }
}
