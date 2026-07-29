//! Windows process helpers — hide console windows for child tools.
//!
//! Console apps (`powershell`, `cmd`, `net`, …) flash a black window unless
//! started with `CREATE_NO_WINDOW`. Call [`hide_console`] on every helper
//! command that should stay silent.
//!
//! Long-running probes must use [`run_silent_timeout`] so a hung CIM/SMART
//! call cannot freeze the UI or pin the system at high priority forever.

use std::io::Read;
use std::process::{Command, Output, Stdio};
use std::time::{Duration, Instant};

/// CreateProcess flag: do not allocate a console for the child.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// Prefer not to starve interactive apps while sensors/SMART probe.
#[cfg(windows)]
const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;

/// Suppress the black console host for console-subsystem children on Windows.
/// No-op on other platforms.
pub fn hide_console(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS);
    }
    let _ = cmd;
}

/// Build a `Command` that will not show a console window on Windows.
pub fn silent_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::new(program);
    hide_console(&mut cmd);
    cmd
}

/// Run a silent command with a hard wall-clock timeout.
///
/// On timeout the child is killed and `None` is returned so callers can fall
/// back to lighter probes instead of hanging the whole app.
pub fn run_silent_timeout(mut cmd: Command, timeout: Duration) -> Option<Output> {
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    hide_console(&mut cmd);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(_) => return None,
    };

    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_status)) => {
                // Process finished — drain pipes.
                let mut stdout = Vec::new();
                let mut stderr = Vec::new();
                if let Some(mut out) = child.stdout.take() {
                    let _ = out.read_to_end(&mut stdout);
                }
                if let Some(mut err) = child.stderr.take() {
                    let _ = err.read_to_end(&mut stderr);
                }
                let status = child.wait().ok()?;
                return Some(Output {
                    status,
                    stdout,
                    stderr,
                });
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    kill_child_tree(&mut child);
                    log::warn!(
                        "child process timed out after {}ms and was killed",
                        timeout.as_millis()
                    );
                    return None;
                }
                std::thread::sleep(Duration::from_millis(40));
            }
            Err(_) => {
                kill_child_tree(&mut child);
                return None;
            }
        }
    }
}

/// Kill the process and any grandchildren (e.g. powershell → wmic/cim).
/// Plain `Child::kill` only ends the root; orphaned CIM hosts keep thrashing the PC.
fn kill_child_tree(child: &mut std::process::Child) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let pid = child.id();
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}
