//! Windows process helpers — hide console windows for child tools.
//!
//! Console apps (`powershell`, `cmd`, `net`, …) flash a black window unless
//! started with `CREATE_NO_WINDOW`. Call [`hide_console`] on every helper
//! command that should stay silent.

use std::process::Command;

/// CreateProcess flag: do not allocate a console for the child.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Suppress the black console host for console-subsystem children on Windows.
/// No-op on other platforms.
pub fn hide_console(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let _ = cmd;
}

/// Build a `Command` that will not show a console window on Windows.
pub fn silent_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::new(program);
    hide_console(&mut cmd);
    cmd
}
