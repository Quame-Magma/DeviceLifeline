//! Always-on DeviceLifeline agent.
//!
//! Standalone process that samples health + records heartbeats while the UI is
//! closed. On Windows, can be registered as a service via `sc.exe` or
//! `windows-service` (service dispatcher entry below).
//!
//! Usage:
//!   device-lifeline-agent [--interval-secs 60]
//!
//! Database path: `%LOCALAPPDATA%/com.devicelifeline.app/devicelifeline.db`
//! (same as the Tauri app data dir for identifier com.devicelifeline.app).

use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use devicelifeline_lib::dna::snapshot::now_rfc3339;
use devicelifeline_lib::health;
use devicelifeline_lib::models::AgentHeartbeat;
use devicelifeline_lib::storage::{agent_repo, db, device_repo};

fn default_db_path() -> PathBuf {
    // Match Tauri app_data_dir for identifier com.devicelifeline.app on Windows.
    if let Some(base) = dirs::data_local_dir() {
        return base
            .join("com.devicelifeline.app")
            .join("devicelifeline.db");
    }
    PathBuf::from("devicelifeline.db")
}

fn agent_loop(interval: Duration) {
    let path = default_db_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    println!("DeviceLifeline agent starting; db={}", path.display());
    println!("elevated={}", devicelifeline_lib::elevation::is_elevated());

    loop {
        match db::open(&path) {
            Ok(conn) => {
                if let Err(e) =
                    health::scheduler::maybe_sample(&conn, health::scheduler::DEFAULT_INTERVAL_SECS)
                {
                    eprintln!("health sample error: {e}");
                }
                match device_repo::ensure_local_device(&conn) {
                    Ok(device) => {
                        if let Ok(ts) = now_rfc3339() {
                            let beat = AgentHeartbeat {
                                id: uuid::Uuid::new_v4().to_string(),
                                device_id: device.id,
                                source: "agent_service".into(),
                                captured_at: ts,
                                status: "running".into(),
                                detail: Some("Always-on agent heartbeat".into()),
                            };
                            if let Err(e) = agent_repo::insert(&conn, &beat) {
                                eprintln!("heartbeat error: {e}");
                            }
                        }
                    }
                    Err(e) => eprintln!("device error: {e}"),
                }
            }
            Err(e) => eprintln!("db open error: {e}"),
        }
        thread::sleep(interval);
    }
}

fn parse_interval() -> Duration {
    let mut secs = 60u64;
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        if a == "--interval-secs" {
            if let Some(v) = args.next() {
                if let Ok(n) = v.parse::<u64>() {
                    secs = n.max(15);
                }
            }
        }
    }
    Duration::from_secs(secs)
}

#[cfg(windows)]
fn main() -> windows_service::Result<()> {
    // When started interactively, run the loop. When started by SCM, service main.
    let interactive = std::env::args().any(|a| a == "--console")
        || std::env::var("DEVICELIFELINE_AGENT_CONSOLE").is_ok();
    if interactive {
        // Console runs can self-elevate; Windows services are already configured with an account.
        devicelifeline_lib::elevation::ensure_elevated();
        agent_loop(parse_interval());
        return Ok(());
    }

    // Try service dispatcher; if it fails (not started by SCM), fall back to console loop.
    use windows_service::service_dispatcher;
    match service_dispatcher::start("DeviceLifelineAgent", ffi_service_main) {
        Ok(()) => Ok(()),
        Err(_) => {
            eprintln!("Service dispatcher unavailable; running in console mode.");
            agent_loop(parse_interval());
            Ok(())
        }
    }
}

#[cfg(windows)]
windows_service::define_windows_service!(ffi_service_main, service_main);

#[cfg(windows)]
fn service_main(_args: Vec<std::ffi::OsString>) {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use windows_service::service::{
        ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus,
        ServiceType,
    };
    use windows_service::service_control_handler::{self, ServiceControlHandlerResult};

    let running = Arc::new(AtomicBool::new(true));
    let running_handler = running.clone();

    let status_handle =
        service_control_handler::register("DeviceLifelineAgent", move |event| match event {
            ServiceControl::Stop | ServiceControl::Shutdown => {
                running_handler.store(false, Ordering::SeqCst);
                ServiceControlHandlerResult::NoError
            }
            ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
            _ => ServiceControlHandlerResult::NotImplemented,
        });

    if let Ok(handle) = status_handle {
        let _ = handle.set_service_status(ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: ServiceState::Running,
            controls_accepted: ServiceControlAccept::STOP,
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: Duration::default(),
            process_id: None,
        });

        let interval = parse_interval();
        let path = default_db_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        while running.load(Ordering::SeqCst) {
            if let Ok(conn) = db::open(&path) {
                let _ = health::scheduler::maybe_sample(
                    &conn,
                    health::scheduler::DEFAULT_INTERVAL_SECS,
                );
                if let Ok(device) = device_repo::ensure_local_device(&conn) {
                    if let Ok(ts) = now_rfc3339() {
                        let beat = AgentHeartbeat {
                            id: uuid::Uuid::new_v4().to_string(),
                            device_id: device.id,
                            source: "agent_service".into(),
                            captured_at: ts,
                            status: "running".into(),
                            detail: Some("Windows service agent heartbeat".into()),
                        };
                        let _ = agent_repo::insert(&conn, &beat);
                    }
                }
            }
            // Sleep in small slices so Stop is responsive.
            for _ in 0..interval.as_secs().max(1) {
                if !running.load(Ordering::SeqCst) {
                    break;
                }
                thread::sleep(Duration::from_secs(1));
            }
        }

        let _ = handle.set_service_status(ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: ServiceState::Stopped,
            controls_accepted: ServiceControlAccept::empty(),
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: Duration::default(),
            process_id: None,
        });
    }
}

#[cfg(not(windows))]
fn main() {
    agent_loop(parse_interval());
}
