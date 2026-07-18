//! AIDA64-class system report + benchmark IPC.

use crate::error::CoreError;
use crate::models::{BenchmarkResult, SystemInventoryReport};
use crate::sysreport;

#[tauri::command]
pub fn get_system_inventory_report() -> Result<SystemInventoryReport, CoreError> {
    sysreport::build_inventory_report()
}

#[tauri::command]
pub fn run_system_benchmark(kind: Option<String>) -> Result<Vec<BenchmarkResult>, CoreError> {
    sysreport::run_benchmark(kind)
}
