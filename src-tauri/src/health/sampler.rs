//! On-device resource sampling via [`sysinfo`].
//!
//! Unlike the registry-backed software/config collectors (which are Windows-only
//! and fall back to mock data elsewhere), `sysinfo` returns real CPU, memory,
//! and disk metrics on every supported platform. This sampler therefore needs
//! no platform `cfg` split and no mock.

use std::thread::sleep;

use sysinfo::{Disks, System, MINIMUM_CPU_UPDATE_INTERVAL};

/// A single raw resource reading, prior to scoring and persistence.
#[derive(Clone, Debug)]
pub struct HealthMetrics {
    /// Overall CPU usage as a percentage in `0.0..=100.0`.
    pub cpu_usage: f64,
    /// Total physical memory, in bytes.
    pub memory_total: u64,
    /// Used physical memory, in bytes.
    pub memory_used: u64,
    /// Total space of the most saturated detected disk, in bytes (`0` if none was found).
    pub disk_total: u64,
    /// Used space of the most saturated detected disk, in bytes.
    pub disk_used: u64,
    /// Display name / mount point of the most saturated detected disk.
    pub disk_name: Option<String>,
    /// Number of disks considered for disk-pressure scoring.
    pub disk_count: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct DiskPressure {
    name: String,
    total: u64,
    used: u64,
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

    let disk_pressure = detected_disk_pressure();

    HealthMetrics {
        cpu_usage,
        memory_total,
        memory_used,
        disk_total: disk_pressure
            .most_saturated
            .as_ref()
            .map(|disk| disk.total)
            .unwrap_or(0),
        disk_used: disk_pressure
            .most_saturated
            .as_ref()
            .map(|disk| disk.used)
            .unwrap_or(0),
        disk_name: disk_pressure
            .most_saturated
            .as_ref()
            .map(|disk| disk.name.clone()),
        disk_count: disk_pressure.count,
    }
}

struct DiskPressureSummary {
    most_saturated: Option<DiskPressure>,
    count: usize,
}

/// Scans every reported disk and returns the one with the highest used-space
/// percentage. Using the most saturated disk prevents a nearly-full secondary
/// drive from being hidden by a large healthy drive.
fn detected_disk_pressure() -> DiskPressureSummary {
    let disks = Disks::new_with_refreshed_list();
    let detected: Vec<DiskPressure> = disks
        .list()
        .iter()
        .filter_map(|disk| {
            let total = disk.total_space();
            if total == 0 {
                return None;
            }
            let used = total.saturating_sub(disk.available_space());
            let mount_point = disk.mount_point().display().to_string();
            let disk_name = disk.name().to_string_lossy();
            let name = if mount_point.is_empty() {
                disk_name.to_string()
            } else {
                mount_point
            };
            Some(DiskPressure { name, total, used })
        })
        .collect();
    let count = detected.len();
    let most_saturated = most_saturated_disk(detected);
    DiskPressureSummary {
        most_saturated,
        count,
    }
}

fn most_saturated_disk(disks: Vec<DiskPressure>) -> Option<DiskPressure> {
    disks.into_iter().max_by(|a, b| {
        let left = usage_basis_points(a.used, a.total);
        let right = usage_basis_points(b.used, b.total);
        left.cmp(&right).then_with(|| a.total.cmp(&b.total))
    })
}

fn usage_basis_points(used: u64, total: u64) -> u64 {
    if total == 0 {
        return 0;
    }
    used.saturating_mul(10_000) / total
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
        if metrics.disk_count == 0 {
            assert!(metrics.disk_name.is_none());
        }
    }

    #[test]
    fn most_saturated_disk_uses_highest_usage_not_largest_disk() {
        let disks = vec![
            DiskPressure {
                name: "C:\\".to_string(),
                total: 1_000,
                used: 200,
            },
            DiskPressure {
                name: "D:\\".to_string(),
                total: 100,
                used: 95,
            },
        ];

        let selected = most_saturated_disk(disks).expect("selected disk");
        assert_eq!(selected.name, "D:\\");
        assert_eq!(selected.used, 95);
    }
}
