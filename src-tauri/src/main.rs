// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Auto-elevate on Windows so deep tools work without "Run as administrator".
    // Skip with DEVICELIFELINE_SKIP_ELEVATION=1 (tests/CI).
    devicelifeline_lib::elevation::ensure_elevated();
    devicelifeline_lib::run()
}
