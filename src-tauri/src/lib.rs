//! DeviceLifeline Rust Core library root.
//!
//! Wires together the Tauri application: opens the on-device SQLite pool
//! (running migrations), registers managed [`AppState`], and exposes the
//! Vision 2.0 IPC command surface.

pub mod actions;
pub mod backup;
pub mod cleanup;
pub mod collectors;
pub mod commands;
pub mod crash;
pub mod diagnosis;
pub mod dna;
pub mod drivers;
pub mod elevation;
pub mod error;
pub mod hardware;
pub mod health;
pub mod installer;
pub mod intelligence;
pub mod models;
pub mod process;
pub mod restore;
pub mod search;
pub mod security;
pub mod setup;
pub mod startup;
pub mod storage;
pub mod storage_engine;
pub mod sync;
pub mod sysreport;
pub mod timeline;
pub mod uninstall;
pub mod updates;
pub mod vault;

use tauri::Manager;

use crate::error::CoreError;
use crate::storage::DbPool;

/// Application state managed by Tauri and shared across command handlers.
///
/// Uses a short-lived connection pool (`DbPool`) so OS I/O never holds a single
/// global `Mutex` across collectors.
pub struct AppState {
    /// On-device SQLite connection factory (WAL mode).
    pub db: DbPool,
}

impl AppState {
    /// Opens a short-lived SQLite connection. Drop it after the SQL work.
    pub fn conn(&self) -> Result<rusqlite::Connection, CoreError> {
        self.db.get()
    }
}

/// Builds and runs the DeviceLifeline Tauri application.
///
/// # Panics
///
/// Panics only if the Tauri runtime itself fails to start.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("devicelifeline.db");
            let pool = DbPool::open(db_path)?;
            app.manage(AppState { db: pool });

            // Background health + agent heartbeat sampler while UI is open.
            // The separate `device-lifeline-agent` binary covers always-on mode.
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                if let Some(state) = handle.try_state::<AppState>() {
                    if let Ok(conn) = state.conn() {
                        let _ = health::scheduler::maybe_sample(
                            &conn,
                            health::scheduler::DEFAULT_INTERVAL_SECS,
                        );
                        if let Ok(device) = storage::device_repo::ensure_local_device(&conn) {
                            if let Ok(ts) = dna::snapshot::now_rfc3339() {
                                let beat = models::AgentHeartbeat {
                                    id: uuid::Uuid::new_v4().to_string(),
                                    device_id: device.id,
                                    source: "ui_process".into(),
                                    captured_at: ts,
                                    status: "running".into(),
                                    detail: Some("UI-hosted background sampler".into()),
                                };
                                let _ = storage::agent_repo::insert(&conn, &beat);
                            }
                        }
                    }
                }
                std::thread::sleep(std::time::Duration::from_secs(60));
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::device::collect_dna_snapshot,
            commands::device::get_devices,
            commands::device::get_snapshots,
            commands::device::get_snapshot,
            commands::device::get_software_inventory,
            commands::device::get_config_items,
            commands::device::get_timeline_events,
            commands::restore::create_restore_plan,
            commands::restore::get_restore_plans,
            commands::restore::get_restore_plan_steps,
            commands::restore::run_restore,
            commands::restore::get_restore_jobs,
            commands::restore::get_restore_step_results,
            commands::health::collect_health_sample,
            commands::health::get_health_samples,
            commands::health::get_latest_health_sample,
            commands::health::get_health_alerts,
            commands::health::acknowledge_alert,
            commands::crash::scan_crash_events,
            commands::crash::get_crash_events,
            commands::setup::export_setup,
            commands::setup::import_setup,
            commands::diagnosis::run_diagnosis,
            commands::diagnosis::get_diagnosis_sessions,
            commands::diagnosis::get_diagnosis_findings,
            commands::sync::get_sync_status,
            commands::sync::trigger_sync,
            commands::intelligence::get_dashboard_intelligence,
            commands::intelligence::list_intelligence_findings,
            commands::intelligence::dismiss_finding,
            commands::intelligence::list_action_audit,
            commands::intelligence::propose_safe_cleanup,
            commands::intelligence::execute_safe_cleanup,
            commands::cleanup::scan_cleanup_preview,
            commands::cleanup::execute_cleanup,
            commands::uninstall::list_installed_apps,
            commands::uninstall::scan_uninstall_leftovers,
            commands::uninstall::uninstall_app,
            commands::uninstall::remove_uninstall_leftovers,
            commands::sysreport::get_system_inventory_report,
            commands::sysreport::run_system_benchmark,
            commands::intelligence::get_copilot_status,
            commands::process::list_processes,
            commands::process::get_process_tree,
            commands::process::get_process_detail,
            commands::process::kill_process,
            commands::process::list_services,
            commands::process::get_process_deep,
            commands::storage_engine::scan_storage,
            commands::storage_engine::get_latest_storage_scan,
            commands::storage_engine::get_storage_items,
            commands::storage_engine::get_storage_folder_map,
            commands::storage_engine::get_volume_map,
            commands::storage_engine::list_logical_drives,
            commands::search::search_all,
            commands::search::rebuild_search_index,
            commands::search::rebuild_file_index,
            commands::search::rebuild_all_search,
            commands::search::get_file_index_status,
            commands::search::rebuild_usn_index,
            commands::hardware::collect_hardware_sample,
            commands::hardware::get_latest_hardware_sample,
            commands::hardware::get_hardware_samples,
            commands::hardware::get_disk_health_summaries,
            commands::drivers::scan_drivers,
            commands::drivers::list_drivers,
            commands::drivers::preview_gpu_driver_clean,
            commands::drivers::create_gpu_clean_restore_point,
            commands::drivers::execute_gpu_driver_clean,
            commands::startup::list_startup_entries,
            commands::startup::set_startup_enabled,
            commands::security::scan_security,
            commands::security::list_security_findings,
            commands::security::dismiss_security_finding,
            commands::vault::list_vault_entries,
            commands::vault::create_restore_point,
            commands::vault::create_dna_vault_backup,
            commands::vault::create_directory_image,
            commands::agent::get_agent_status,
            commands::agent::ping_agent,
            commands::elevation::get_elevation_status,
            commands::elevation::request_elevation,
            commands::updates::scan_software_updates,
            commands::updates::list_software_updates,
            commands::updates::apply_software_updates,
            commands::backup::create_volume_shadow,
            commands::backup::list_volume_shadows,
            commands::backup::create_backup_schedule,
            commands::backup::list_backup_schedules,
            commands::backup::set_backup_schedule_enabled,
            commands::backup::run_backup_schedule_now,
            commands::backup::restore_from_shadow,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
