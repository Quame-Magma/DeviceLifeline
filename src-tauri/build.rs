fn main() {
    // Note: we intentionally do NOT embed requireAdministrator here.
    // That would force UAC on unit-test binaries (os error 740).
    // Elevation is handled at process start by elevation::ensure_elevated().
    tauri_build::build()
}
