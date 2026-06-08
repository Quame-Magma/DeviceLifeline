//! HealthScore computation.
//!
//! A pure, deterministic mapping from CPU / memory / disk usage to a `0..=100`
//! health score (higher is healthier). No I/O and no sampling live here, which
//! keeps the scoring policy unit-testable in isolation from `sysinfo`.

/// Weight applied to CPU usage when computing the health score.
const CPU_WEIGHT: f64 = 0.25;
/// Weight applied to memory usage when computing the health score.
const MEMORY_WEIGHT: f64 = 0.35;
/// Weight applied to disk usage when computing the health score.
const DISK_WEIGHT: f64 = 0.40;

/// Computes a `0..=100` health score from CPU, memory, and disk usage
/// percentages; higher is healthier.
///
/// Each input is treated as a percentage and clamped to `0.0..=100.0`. The
/// score is `100 - pressure`, where `pressure` is the weighted average of the
/// three usages (the weights sum to `1.0`), rounded to the nearest integer and
/// clamped to `0..=100`. Idle resources score `100`; fully saturated resources
/// score `0`; a uniform 50% load scores `50`.
pub fn compute_score(cpu_pct: f64, memory_pct: f64, disk_pct: f64) -> i64 {
    let cpu = cpu_pct.clamp(0.0, 100.0);
    let memory = memory_pct.clamp(0.0, 100.0);
    let disk = disk_pct.clamp(0.0, 100.0);

    let pressure = cpu * CPU_WEIGHT + memory * MEMORY_WEIGHT + disk * DISK_WEIGHT;
    let score = (100.0 - pressure).round() as i64;
    score.clamp(0, 100)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idle_resources_score_one_hundred() {
        assert_eq!(compute_score(0.0, 0.0, 0.0), 100);
    }

    #[test]
    fn fully_saturated_resources_score_zero() {
        assert_eq!(compute_score(100.0, 100.0, 100.0), 0);
    }

    #[test]
    fn uniform_half_load_scores_fifty() {
        assert_eq!(compute_score(50.0, 50.0, 50.0), 50);
    }

    #[test]
    fn weights_are_applied_per_resource() {
        // 0.25*20 + 0.35*60 + 0.40*80 = 5 + 21 + 32 = 58 -> 100 - 58 = 42.
        assert_eq!(compute_score(20.0, 60.0, 80.0), 42);
    }

    #[test]
    fn out_of_range_inputs_are_clamped() {
        assert_eq!(compute_score(-50.0, -10.0, 0.0), 100);
        assert_eq!(compute_score(150.0, 200.0, 300.0), 0);
    }
}
