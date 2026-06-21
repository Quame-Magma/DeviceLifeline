//! Restore plan generation.
//!
//! [`build_plan`] is a pure transform from a snapshot's software inventory into
//! a [`RestorePlan`] plus its ordered [`RestorePlanStep`]s. It performs no I/O
//! and no persistence; callers persist the result via
//! [`restore_repo`](crate::storage::restore_repo).

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::{DeviceDnaSnapshot, RestorePlan, RestorePlanStep, SoftwareInventoryItem};

/// Installer source stamped onto every generated step in this cut.
const STEP_SOURCE: &str = "winget";

/// Builds a [`RestorePlan`] (and its steps) from a snapshot's software
/// inventory.
///
/// Produces one step per `software` item, sorted by name, with `order_index`
/// running `0..n`. `target_version` mirrors the item's version; `winget_id` is
/// filled for known packages and `source` is `"winget"`.
pub fn build_plan(
    device_id: &str,
    snapshot: &DeviceDnaSnapshot,
    software: &[SoftwareInventoryItem],
) -> Result<(RestorePlan, Vec<RestorePlanStep>), CoreError> {
    let plan_id = uuid::Uuid::new_v4().to_string();

    let mut sorted: Vec<&SoftwareInventoryItem> = software.iter().collect();
    sorted.sort_by(|a, b| a.name.cmp(&b.name));

    let steps: Vec<RestorePlanStep> = sorted
        .into_iter()
        .enumerate()
        .map(|(index, item)| RestorePlanStep {
            id: uuid::Uuid::new_v4().to_string(),
            plan_id: plan_id.clone(),
            order_index: index as i64,
            software_name: item.name.clone(),
            target_version: item.version.clone(),
            winget_id: resolve_winget_id(item),
            source: STEP_SOURCE.to_string(),
        })
        .collect();

    let plan = RestorePlan {
        id: plan_id,
        device_id: device_id.to_string(),
        snapshot_id: snapshot.id.clone(),
        name: format!("Restore from {}", snapshot.captured_at),
        created_at: now_rfc3339()?,
        step_count: steps.len() as i64,
    };

    Ok((plan, steps))
}

fn resolve_winget_id(item: &SoftwareInventoryItem) -> Option<String> {
    let normalized = normalize_package_name(&item.name);
    let id = match normalized.as_str() {
        "7 zip" | "7 zip 64 bit" | "7 zip 32 bit" => "7zip.7zip",
        "brave" | "brave browser" => "Brave.Brave",
        "discord" => "Discord.Discord",
        "docker desktop" => "Docker.DockerDesktop",
        "figma" => "Figma.Figma",
        "git" | "git version control" => "Git.Git",
        "github desktop" => "GitHub.GitHubDesktop",
        "google chrome" | "chrome" => "Google.Chrome",
        "microsoft edge" | "edge" => "Microsoft.Edge",
        "microsoft onedrive" | "onedrive" => "Microsoft.OneDrive",
        "microsoft powertoys" | "powertoys" => "Microsoft.PowerToys",
        "microsoft teams" | "teams" => "Microsoft.Teams",
        "microsoft visual studio code" | "visual studio code" | "vs code" => {
            "Microsoft.VisualStudioCode"
        }
        "mozilla firefox" | "firefox" => "Mozilla.Firefox",
        "node js" | "nodejs" | "node" => "OpenJS.NodeJS",
        "notion" => "Notion.Notion",
        "postman" => "Postman.Postman",
        "python" | "python 3" => "Python.Python.3",
        "slack" => "SlackTechnologies.Slack",
        "spotify" => "Spotify.Spotify",
        "vlc media player" | "vlc" => "VideoLAN.VLC",
        "whatsapp" => "WhatsApp.WhatsApp",
        "zoom" | "zoom workplace" => "Zoom.Zoom",
        _ => return None,
    };
    Some(id.to_string())
}

fn normalize_package_name(name: &str) -> String {
    name.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot() -> DeviceDnaSnapshot {
        DeviceDnaSnapshot {
            id: "snap-1".to_string(),
            device_id: "dev-1".to_string(),
            captured_at: "2026-06-08T00:00:00Z".to_string(),
            schema_version: 1,
            source: "manual".to_string(),
            software_count: 2,
            config_count: 0,
        }
    }

    fn item(name: &str, version: Option<&str>) -> SoftwareInventoryItem {
        SoftwareInventoryItem {
            id: uuid::Uuid::new_v4().to_string(),
            snapshot_id: "snap-1".to_string(),
            name: name.to_string(),
            version: version.map(|v| v.to_string()),
            publisher: None,
            install_date: None,
            source: "mock".to_string(),
            install_location: None,
        }
    }

    #[test]
    fn build_plan_orders_steps_and_maps_fields() {
        let snap = snapshot();
        let software = vec![item("Zeta App", Some("2.0")), item("Alpha Tool", None)];

        let (plan, steps) = build_plan("dev-1", &snap, &software).expect("build plan");

        assert_eq!(plan.device_id, "dev-1");
        assert_eq!(plan.snapshot_id, "snap-1");
        assert_eq!(plan.name, "Restore from 2026-06-08T00:00:00Z");
        assert_eq!(plan.step_count, 2);
        assert_eq!(steps.len(), 2);

        // Sorted by name: "Alpha Tool" precedes "Zeta App".
        assert_eq!(steps[0].order_index, 0);
        assert_eq!(steps[0].software_name, "Alpha Tool");
        assert_eq!(steps[0].target_version, None);
        assert_eq!(steps[0].winget_id, None);
        assert_eq!(steps[0].source, "winget");
        assert!(steps.iter().all(|step| step.plan_id == plan.id));

        assert_eq!(steps[1].order_index, 1);
        assert_eq!(steps[1].software_name, "Zeta App");
        assert_eq!(steps[1].target_version.as_deref(), Some("2.0"));
    }

    #[test]
    fn build_plan_handles_empty_inventory() {
        let snap = snapshot();
        let (plan, steps) = build_plan("dev-1", &snap, &[]).expect("build plan");
        assert_eq!(plan.step_count, 0);
        assert!(steps.is_empty());
    }

    #[test]
    fn build_plan_resolves_known_winget_ids() {
        let snap = snapshot();
        let software = vec![item("Google Chrome", Some("126.0"))];

        let (_plan, steps) = build_plan("dev-1", &snap, &software).expect("build plan");

        assert_eq!(steps.len(), 1);
        assert_eq!(steps[0].winget_id.as_deref(), Some("Google.Chrome"));
    }

    #[test]
    fn build_plan_leaves_unknown_winget_ids_empty() {
        let snap = snapshot();
        let software = vec![item("Special Vendor Utility", None)];

        let (_plan, steps) = build_plan("dev-1", &snap, &software).expect("build plan");

        assert_eq!(steps.len(), 1);
        assert_eq!(steps[0].winget_id, None);
    }
}
