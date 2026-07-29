// GUI app: never allocate a console host (debug or release).
// Debug used to be console-subsystem, so Elevate opened a black
// "Administrator: …\device-lifeline.exe" window.
#![windows_subsystem = "windows"]

fn main() {
    // Drop any inherited/attached console (belt-and-suspenders).
    devicelifeline_lib::elevation::detach_console();
    // Least privilege: do not UAC-elevate the whole UI by default.
    // Deep tools prompt via the in-app Elevate control (or DEVICELIFELINE_FORCE_ELEVATE=1).
    devicelifeline_lib::elevation::ensure_elevated();
    devicelifeline_lib::run()
}
