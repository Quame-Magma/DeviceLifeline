//! DeviceLifeline Rust Core library root.
//!
//! Wires together the Tauri application: opens the on-device SQLite database
//! (running migrations), registers managed [`AppState`], and exposes the
//! Increment 1 IPC command surface.

pub mod collectors;
pub mod commands;
pub mod crash;
pub mod diagnosis;
pub mod dna;
pub mod error;
pub mod health;
pub mod installer;
pub mod models;
pub mod restore;
pub mod setup;
pub mod storage;
pub mod timeline;

use std::sync::Mutex;

use tauri::Manager;

/// Application state managed by Tauri and shared across command handlers.
///
/// Holds the single SQLite [`Connection`](rusqlite::Connection) behind a
/// [`Mutex`] since `rusqlite::Connection` is not `Sync`.
pub struct AppState {
    /// The on-device SQLite connection.
    pub db: Mutex<rusqlite::Connection>,
}

/// Builds and runs the DeviceLifeline Tauri application.
///
/// # Panics
///
/// Panics only if the Tauri runtime itself fails to start, which represents an
/// unrecoverable programming/configuration error rather than user data error.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("devicelifeline.db");
            let conn = storage::db::open(&db_path)?;
            app.manage(AppState {
                db: Mutex::new(conn),
            });

            // Background health sampler (M4-01): capture a sample on launch,
            // then re-check every minute and sample once the interval elapses.
            // Runs while the app is open; the on-device Windows service is the
            // future always-on agent.
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                if let Some(state) = handle.try_state::<AppState>() {
                    if let Ok(conn) = state.db.lock() {
                        let _ = health::scheduler::maybe_sample(
                            &conn,
                            health::scheduler::DEFAULT_INTERVAL_SECS,
                        );
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
            commands::diagnosis::get_diagnosis_findings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
