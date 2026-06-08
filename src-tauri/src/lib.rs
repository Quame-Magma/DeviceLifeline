//! DeviceLifeline Rust Core library root.
//!
//! Wires together the Tauri application: opens the on-device SQLite database
//! (running migrations), registers managed [`AppState`], and exposes the
//! Increment 1 IPC command surface.

pub mod collectors;
pub mod commands;
pub mod dna;
pub mod error;
pub mod models;
pub mod storage;

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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::device::collect_dna_snapshot,
            commands::device::get_devices,
            commands::device::get_snapshots,
            commands::device::get_snapshot,
            commands::device::get_software_inventory,
            commands::device::get_config_items
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
