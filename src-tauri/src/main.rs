// GUI app: never allocate a console host (debug or release).
// Debug used to be console-subsystem, so Elevate opened a black
// "Administrator: …\device-lifeline.exe" window.
#![windows_subsystem = "windows"]

fn main() {
    // Drop any inherited/attached console (belt-and-suspenders).
    devicelifeline_lib::elevation::detach_console();
    // Auto-elevate on Windows so deep tools work without "Run as administrator".
    // Skip with DEVICELIFELINE_SKIP_ELEVATION=1 (tests/CI). Debug skips auto-elevate.
    devicelifeline_lib::elevation::ensure_elevated();
    devicelifeline_lib::run()
}
