//! Pure snapshot-diffing logic for the Performance Timeline.
//!
//! [`compute_events`] compares the software and configuration inventories of a
//! newer snapshot against an older one and emits a deterministic list of
//! [`TimelineEvent`]s. It performs no I/O and allocates fresh UUIDs for each
//! event, making it straightforward to unit test.

use std::collections::HashMap;

use crate::models::{ConfigItem, DeviceDnaSnapshot, SoftwareInventoryItem, TimelineEvent};

/// `category` value for software-related events.
const CATEGORY_SOFTWARE: &str = "software";
/// `category` value for configuration-related events.
const CATEGORY_CONFIG: &str = "config";

/// Computes the change events between `previous_snapshot` and `new_snapshot`.
///
/// Software is keyed by `name`; configuration by `(kind, name)`. The returned
/// `Vec` is deterministically ordered (all software events, then all config
/// events, each sorted by `title`) so callers and tests observe a stable order.
pub fn compute_events(
    new_snapshot: &DeviceDnaSnapshot,
    previous_snapshot: &DeviceDnaSnapshot,
    previous_software: &[SoftwareInventoryItem],
    new_software: &[SoftwareInventoryItem],
    previous_config: &[ConfigItem],
    new_config: &[ConfigItem],
) -> Vec<TimelineEvent> {
    let mut software_events = software_change_events(
        new_snapshot,
        previous_snapshot,
        previous_software,
        new_software,
    );
    software_events.sort_by(|a, b| a.title.cmp(&b.title));

    let mut config_events = config_change_events(
        new_snapshot,
        previous_snapshot,
        previous_config,
        new_config,
    );
    config_events.sort_by(|a, b| a.title.cmp(&b.title));

    let mut events = software_events;
    events.extend(config_events);
    events
}

/// Builds the software install/removal/update events (unordered).
fn software_change_events(
    new_snapshot: &DeviceDnaSnapshot,
    previous_snapshot: &DeviceDnaSnapshot,
    previous_software: &[SoftwareInventoryItem],
    new_software: &[SoftwareInventoryItem],
) -> Vec<TimelineEvent> {
    let prev_by_name: HashMap<&str, &SoftwareInventoryItem> = previous_software
        .iter()
        .map(|item| (item.name.as_str(), item))
        .collect();
    let new_by_name: HashMap<&str, &SoftwareInventoryItem> = new_software
        .iter()
        .map(|item| (item.name.as_str(), item))
        .collect();

    let mut events = Vec::new();

    for item in new_software {
        match prev_by_name.get(item.name.as_str()) {
            None => {
                events.push(make_event(
                    new_snapshot,
                    previous_snapshot,
                    "software_install",
                    CATEGORY_SOFTWARE,
                    format!("Installed {}", item.name),
                    item.version.clone(),
                ));
            }
            Some(prev) => {
                if let Some(detail) = version_change_detail(&prev.version, &item.version) {
                    events.push(make_event(
                        new_snapshot,
                        previous_snapshot,
                        "software_update",
                        CATEGORY_SOFTWARE,
                        format!("Updated {}", item.name),
                        Some(detail),
                    ));
                }
            }
        }
    }

    for item in previous_software {
        if !new_by_name.contains_key(item.name.as_str()) {
            events.push(make_event(
                new_snapshot,
                previous_snapshot,
                "software_removal",
                CATEGORY_SOFTWARE,
                format!("Removed {}", item.name),
                item.version.clone(),
            ));
        }
    }

    events
}

/// Builds the config added/removed events (unordered).
fn config_change_events(
    new_snapshot: &DeviceDnaSnapshot,
    previous_snapshot: &DeviceDnaSnapshot,
    previous_config: &[ConfigItem],
    new_config: &[ConfigItem],
) -> Vec<TimelineEvent> {
    let prev_keys: HashMap<(&str, &str), &ConfigItem> = previous_config
        .iter()
        .map(|item| ((item.kind.as_str(), item.name.as_str()), item))
        .collect();
    let new_keys: HashMap<(&str, &str), &ConfigItem> = new_config
        .iter()
        .map(|item| ((item.kind.as_str(), item.name.as_str()), item))
        .collect();

    let mut events = Vec::new();

    for item in new_config {
        let key = (item.kind.as_str(), item.name.as_str());
        if !prev_keys.contains_key(&key) {
            events.push(make_event(
                new_snapshot,
                previous_snapshot,
                "config_added",
                CATEGORY_CONFIG,
                format!("Added {}: {}", kind_label(&item.kind), item.name),
                item.status.clone(),
            ));
        }
    }

    for item in previous_config {
        let key = (item.kind.as_str(), item.name.as_str());
        if !new_keys.contains_key(&key) {
            events.push(make_event(
                new_snapshot,
                previous_snapshot,
                "config_removed",
                CATEGORY_CONFIG,
                format!("Removed {}: {}", kind_label(&item.kind), item.name),
                None,
            ));
        }
    }

    events
}

/// Constructs a [`TimelineEvent`] with a fresh id, wiring the snapshot ids and
/// `occurred_at` from the newer snapshot.
fn make_event(
    new_snapshot: &DeviceDnaSnapshot,
    previous_snapshot: &DeviceDnaSnapshot,
    event_type: &str,
    category: &str,
    title: String,
    detail: Option<String>,
) -> TimelineEvent {
    TimelineEvent {
        id: uuid::Uuid::new_v4().to_string(),
        device_id: new_snapshot.device_id.clone(),
        snapshot_id: new_snapshot.id.clone(),
        previous_snapshot_id: Some(previous_snapshot.id.clone()),
        event_type: event_type.to_string(),
        category: category.to_string(),
        title,
        detail,
        occurred_at: new_snapshot.captured_at.clone(),
    }
}

/// Returns a `"{old} → {new}"` detail string when both versions are present and
/// differ, signalling a software update; otherwise `None`.
fn version_change_detail(old: &Option<String>, new: &Option<String>) -> Option<String> {
    match (old, new) {
        (Some(old), Some(new)) if old != new => Some(format!("{old} \u{2192} {new}")),
        _ => None,
    }
}

/// Maps a config `kind` to its human-readable label used in event titles.
fn kind_label(kind: &str) -> &str {
    match kind {
        "startup" => "startup item",
        "service" => "service",
        "scheduled_task" => "scheduled task",
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(id: &str) -> DeviceDnaSnapshot {
        DeviceDnaSnapshot {
            id: id.to_string(),
            device_id: "device-1".to_string(),
            captured_at: "2026-06-08T00:00:00Z".to_string(),
            schema_version: 1,
            source: "manual".to_string(),
            software_count: 0,
            config_count: 0,
        }
    }

    fn software(name: &str, version: Option<&str>) -> SoftwareInventoryItem {
        SoftwareInventoryItem {
            id: uuid::Uuid::new_v4().to_string(),
            snapshot_id: "snap".to_string(),
            name: name.to_string(),
            version: version.map(|v| v.to_string()),
            publisher: None,
            install_date: None,
            source: "mock".to_string(),
            install_location: None,
        }
    }

    fn config(kind: &str, name: &str, status: Option<&str>) -> ConfigItem {
        ConfigItem {
            id: uuid::Uuid::new_v4().to_string(),
            snapshot_id: "snap".to_string(),
            kind: kind.to_string(),
            name: name.to_string(),
            status: status.map(|s| s.to_string()),
            path: None,
            publisher: None,
            source: "mock".to_string(),
        }
    }

    #[test]
    fn detects_software_install_removal_and_update() {
        let new_snap = snapshot("snap-new");
        let prev_snap = snapshot("snap-prev");

        let prev_software = vec![software("Chrome", Some("1.0")), software("OldApp", Some("3.0"))];
        let new_software = vec![software("Chrome", Some("2.0")), software("NewApp", Some("9.0"))];

        let events = compute_events(
            &new_snap,
            &prev_snap,
            &prev_software,
            &new_software,
            &[],
            &[],
        );

        assert_eq!(events.len(), 3);
        // Software events sorted by title: Installed, Removed, Updated.
        assert_eq!(events[0].event_type, "software_install");
        assert_eq!(events[0].title, "Installed NewApp");
        assert_eq!(events[0].detail.as_deref(), Some("9.0"));
        assert_eq!(events[0].category, "software");
        assert_eq!(events[0].snapshot_id, "snap-new");
        assert_eq!(events[0].previous_snapshot_id.as_deref(), Some("snap-prev"));

        assert_eq!(events[1].event_type, "software_removal");
        assert_eq!(events[1].title, "Removed OldApp");
        assert_eq!(events[1].detail.as_deref(), Some("3.0"));

        assert_eq!(events[2].event_type, "software_update");
        assert_eq!(events[2].title, "Updated Chrome");
        assert_eq!(events[2].detail.as_deref(), Some("1.0 \u{2192} 2.0"));
    }

    #[test]
    fn detects_config_added_and_removed_with_labels() {
        let new_snap = snapshot("snap-new");
        let prev_snap = snapshot("snap-prev");

        let prev_config = vec![config("service", "OldSvc", Some("auto"))];
        let new_config = vec![
            config("startup", "Launcher", Some("enabled")),
            config("scheduled_task", "Backup", None),
        ];

        let events = compute_events(&new_snap, &prev_snap, &[], &[], &prev_config, &new_config);

        assert_eq!(events.len(), 3);
        // Config events sorted by title.
        assert_eq!(events[0].event_type, "config_added");
        assert_eq!(events[0].title, "Added scheduled task: Backup");
        assert_eq!(events[0].detail, None);
        assert_eq!(events[0].category, "config");

        assert_eq!(events[1].event_type, "config_added");
        assert_eq!(events[1].title, "Added startup item: Launcher");
        assert_eq!(events[1].detail.as_deref(), Some("enabled"));

        assert_eq!(events[2].event_type, "config_removed");
        assert_eq!(events[2].title, "Removed service: OldSvc");
    }

    #[test]
    fn no_version_change_yields_no_update() {
        let new_snap = snapshot("snap-new");
        let prev_snap = snapshot("snap-prev");

        // Same version, and a missing-version pair: neither is an update.
        let prev_software = vec![software("Chrome", Some("1.0")), software("Tool", None)];
        let new_software = vec![software("Chrome", Some("1.0")), software("Tool", Some("2.0"))];

        let events = compute_events(
            &new_snap,
            &prev_snap,
            &prev_software,
            &new_software,
            &[],
            &[],
        );

        assert!(events.is_empty());
    }

    #[test]
    fn identical_inventories_yield_no_events() {
        let new_snap = snapshot("snap-new");
        let prev_snap = snapshot("snap-prev");

        let software_items = vec![software("Chrome", Some("1.0")), software("Git", Some("2.0"))];
        let config_items = vec![
            config("service", "Svc", Some("auto")),
            config("startup", "App", None),
        ];

        let events = compute_events(
            &new_snap,
            &prev_snap,
            &software_items,
            &software_items,
            &config_items,
            &config_items,
        );

        assert!(events.is_empty());
    }
}
