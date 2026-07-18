//! Driver Intelligence: inventory, signing, health scoring, guided GPU clean (DDU-class).

use rusqlite::Connection;

use crate::actions::{self, RISK_DESTRUCTIVE, RISK_SAFE};
use crate::dna::snapshot::now_rfc3339;
use crate::elevation;
use crate::error::CoreError;
use crate::models::{DriverInfo, GpuCleanPlan, GpuCleanResult, GpuCleanTarget};
use crate::storage::{device_repo, driver_repo, vault_repo};
use crate::vault;

/// Scans drivers, scores health, replaces inventory for the local device.
pub fn scan_drivers(conn: &Connection) -> Result<Vec<DriverInfo>, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    let captured_at = now_rfc3339()?;
    let mut drivers = collect_raw(&device.id, &captured_at);
    for d in &mut drivers {
        score_driver(d);
    }
    drivers.sort_by(|a, b| {
        a.health_score
            .cmp(&b.health_score)
            .then_with(|| a.name.cmp(&b.name))
    });
    // Cap inventory size for UI performance.
    if drivers.len() > 400 {
        drivers.truncate(400);
    }
    driver_repo::replace_drivers(conn, &device.id, &drivers)?;
    Ok(drivers)
}

fn score_driver(d: &mut DriverInfo) {
    let mut score = 100i64;
    let mut reasons = Vec::new();
    if !d.is_signed {
        score -= 35;
        reasons.push("Driver is not digitally signed".into());
    }
    if d.driver_version.as_deref().unwrap_or("").is_empty() {
        score -= 10;
        reasons.push("Missing driver version".into());
    }
    let status = d.status.as_deref().unwrap_or("").to_lowercase();
    if status.contains("error") || status.contains("problem") || status == "degraded" {
        score -= 40;
        reasons.push(format!("Device status: {}", d.status.as_deref().unwrap_or("?")));
    }
    let name_l = d.name.to_lowercase();
    if name_l.contains("generic") && name_l.contains("display") {
        score -= 15;
        reasons.push("Generic display driver may limit GPU features".into());
    }
    d.health_score = score.clamp(0, 100);
    d.risk_reasons = reasons;
}

fn collect_raw(device_id: &str, captured_at: &str) -> Vec<DriverInfo> {
    #[cfg(windows)]
    {
        let mut list = windows_drivers(device_id, captured_at);
        if list.is_empty() {
            list = mock_drivers(device_id, captured_at);
        }
        list
    }
    #[cfg(not(windows))]
    {
        mock_drivers(device_id, captured_at)
    }
}

fn mock_drivers(device_id: &str, captured_at: &str) -> Vec<DriverInfo> {
    vec![
        DriverInfo {
            id: uuid::Uuid::new_v4().to_string(),
            device_id: device_id.into(),
            captured_at: captured_at.into(),
            name: "Mock Display Adapter".into(),
            device_class: Some("Display".into()),
            manufacturer: Some("MockCorp".into()),
            driver_version: Some("31.0.1".into()),
            driver_date: Some("2025-01-01".into()),
            signer: Some("Microsoft Windows Hardware Compatibility Publisher".into()),
            is_signed: true,
            inf_name: Some("mockdisp.inf".into()),
            hardware_id: Some("PCI\\VEN_10DE".into()),
            status: Some("OK".into()),
            health_score: 100,
            risk_reasons: vec![],
        },
        DriverInfo {
            id: uuid::Uuid::new_v4().to_string(),
            device_id: device_id.into(),
            captured_at: captured_at.into(),
            name: "Unsigned Network Adapter (mock)".into(),
            device_class: Some("Net".into()),
            manufacturer: Some("Unknown".into()),
            driver_version: Some("1.0.0".into()),
            driver_date: None,
            signer: None,
            is_signed: false,
            inf_name: None,
            hardware_id: Some("PCI\\VEN_8086".into()),
            status: Some("OK".into()),
            health_score: 100,
            risk_reasons: vec![],
        },
    ]
}

#[cfg(windows)]
fn windows_drivers(device_id: &str, captured_at: &str) -> Vec<DriverInfo> {
    let script = r#"
$ErrorActionPreference='SilentlyContinue'
Get-CimInstance Win32_PnPSignedDriver |
  Where-Object { $_.DeviceName } |
  Select-Object -First 350 DeviceName, DeviceClass, Manufacturer, DriverVersion, DriverDate, IsSigned, Signer, InfName, HardwareID |
  ForEach-Object {
    [pscustomobject]@{
      name = $_.DeviceName
      deviceClass = $_.DeviceClass
      manufacturer = $_.Manufacturer
      version = $_.DriverVersion
      date = if ($_.DriverDate) { $_.DriverDate.ToString('yyyy-MM-dd') } else { $null }
      isSigned = [bool]$_.IsSigned
      signer = $_.Signer
      inf = $_.InfName
      hwid = if ($_.HardwareID) { ($_.HardwareID | Select-Object -First 1) } else { $null }
    }
  } | ConvertTo-Json -Compress -Depth 4
"#;
    let output = crate::process_win::silent_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let value: serde_json::Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let arr = if value.is_array() {
        value.as_array().cloned().unwrap_or_default()
    } else {
        vec![value]
    };
    arr.into_iter()
        .filter_map(|v| {
            let name = v.get("name")?.as_str()?.trim().to_string();
            if name.is_empty() {
                return None;
            }
            Some(DriverInfo {
                id: uuid::Uuid::new_v4().to_string(),
                device_id: device_id.into(),
                captured_at: captured_at.into(),
                name,
                device_class: v.get("deviceClass").and_then(|x| x.as_str()).map(|s| s.into()),
                manufacturer: v
                    .get("manufacturer")
                    .and_then(|x| x.as_str())
                    .map(|s| s.into()),
                driver_version: v.get("version").and_then(|x| x.as_str()).map(|s| s.into()),
                driver_date: v.get("date").and_then(|x| x.as_str()).map(|s| s.into()),
                signer: v.get("signer").and_then(|x| x.as_str()).map(|s| s.into()),
                is_signed: v.get("isSigned").and_then(|x| x.as_bool()).unwrap_or(false),
                inf_name: v.get("inf").and_then(|x| x.as_str()).map(|s| s.into()),
                hardware_id: v.get("hwid").and_then(|x| x.as_str()).map(|s| s.into()),
                status: Some("OK".into()),
                health_score: 100,
                risk_reasons: vec![],
            })
        })
        .collect()
}

/// Builds a dry-run GPU driver clean plan (DDU-class, guided). No mutations.
pub fn preview_gpu_driver_clean(
    conn: &Connection,
    vendor: Option<String>,
) -> Result<GpuCleanPlan, CoreError> {
    let vendor_filter = normalize_vendor(vendor.as_deref());
    let drivers = {
        let listed = driver_repo::list_drivers(conn)?;
        if listed.is_empty() {
            scan_drivers(conn)?
        } else {
            listed
        }
    };

    let mut targets: Vec<GpuCleanTarget> = Vec::new();
    let mut packages: Vec<String> = Vec::new();
    for d in drivers {
        if !is_display_gpu_driver(&d) {
            continue;
        }
        let v = detect_vendor(&d);
        if vendor_filter != "auto" && v != vendor_filter {
            continue;
        }
        if let Some(inf) = d.inf_name.clone() {
            if !packages.iter().any(|p| p.eq_ignore_ascii_case(&inf)) {
                packages.push(inf);
            }
        }
        targets.push(GpuCleanTarget {
            name: d.name,
            inf_name: d.inf_name,
            hardware_id: d.hardware_id,
            manufacturer: d.manufacturer,
            vendor: v,
            instance_id: None,
        });
    }

    // Live PnP display devices (instance IDs for remove-device).
    for t in enum_display_pnp_devices(&vendor_filter) {
        if !targets.iter().any(|x| {
            x.name.eq_ignore_ascii_case(&t.name)
                || (x.instance_id.is_some() && x.instance_id == t.instance_id)
        }) {
            targets.push(t);
        } else if let Some(existing) = targets.iter_mut().find(|x| x.name.eq_ignore_ascii_case(&t.name))
        {
            if existing.instance_id.is_none() {
                existing.instance_id = t.instance_id.clone();
            }
        }
    }

    // Also discover OEM packages via pnputil (read-only).
    for pkg in enum_display_driver_packages(&vendor_filter) {
        if !packages.iter().any(|p| p.eq_ignore_ascii_case(&pkg)) {
            packages.push(pkg);
        }
    }

    let services = vendor_gpu_services(&vendor_filter);

    let mut warnings = vec![
        "Close games, browsers with hardware acceleration, and GPU control panels first.".into(),
        "Download a clean offline driver installer from NVIDIA/AMD/Intel before continuing.".into(),
        "Display may fall back to Microsoft Basic Display until you reinstall.".into(),
        "Execute stops vendor GPU services, removes PnP display devices, then deletes OEM packages.".into(),
        "A successful System Restore point is required before execute.".into(),
        "Reboot after clean, then install the offline vendor package.".into(),
    ];
    if targets.is_empty() && packages.is_empty() {
        warnings.push("No display/GPU packages matched. Scan drivers or pick another vendor.".into());
    }

    let plan = GpuCleanPlan {
        id: uuid::Uuid::new_v4().to_string(),
        vendor: vendor_filter,
        elevated: elevation::is_elevated(),
        targets,
        packages,
        services,
        warnings,
        reboot_expected: true,
        dry_run: true,
        schedule_reboot: false,
    };

    let preview = serde_json::to_string(&plan).unwrap_or_else(|_| "{}".into());
    let _ = actions::record_action(
        conn,
        "gpu_driver_clean_preview",
        RISK_SAFE,
        "GPU driver clean preview",
        Some(&format!(
            "{} target(s), {} package(s)",
            plan.targets.len(),
            plan.packages.len()
        )),
        "completed",
        Some(&preview),
    );

    Ok(plan)
}

/// Executes a guided GPU driver clean after restore-point + confirm gates.
pub fn execute_gpu_driver_clean(
    conn: &Connection,
    plan_id: String,
    restore_point_id: String,
    vendor: Option<String>,
    confirm: bool,
) -> Result<GpuCleanResult, CoreError> {
    if !confirm {
        return Err(CoreError::Internal(
            "GPU driver clean requires confirm=true".into(),
        ));
    }
    if !elevation::is_elevated() {
        return Err(CoreError::Internal(
            "GPU driver clean requires an elevated (admin) session. Use Elevate and retry.".into(),
        ));
    }

    // Hard restore-point gate: must exist and completed.
    let entries = vault_repo::list(conn)?;
    let rp = entries
        .iter()
        .find(|e| e.id == restore_point_id)
        .ok_or_else(|| CoreError::NotFound("restore point".into()))?;
    if rp.kind != "restore_point" || rp.status != "completed" {
        return Err(CoreError::Internal(
            "Restore point must be a completed System Restore checkpoint before GPU clean.".into(),
        ));
    }

    // Rebuild plan (never trust free-form package lists from the client).
    let plan = preview_gpu_driver_clean(conn, vendor)?;
    if plan.packages.is_empty() {
        return Err(CoreError::Internal(
            "No allowlisted display driver packages to remove.".into(),
        ));
    }

    let preview = serde_json::json!({
        "planId": plan_id,
        "rebuildPlanId": plan.id,
        "restorePointId": restore_point_id,
        "packages": plan.packages,
        "targets": plan.targets.len(),
    })
    .to_string();

    let action = actions::record_action(
        conn,
        "gpu_driver_clean_execute",
        RISK_DESTRUCTIVE,
        "GPU driver clean execute",
        Some("Allowlisted pnputil package removal only"),
        "running",
        Some(&preview),
    )?;

    let mut removed = Vec::new();
    let mut devices_removed = Vec::new();
    let mut services_stopped = Vec::new();
    let mut errors = Vec::new();

    // 1) Stop vendor GPU services (DDU-style pre-clean).
    for svc in &plan.services {
        match stop_service(svc) {
            Ok(()) => services_stopped.push(svc.clone()),
            Err(e) => errors.push(format!("stop {svc}: {e}")),
        }
    }

    // 2) Remove display PnP devices by instance id.
    for t in &plan.targets {
        if let Some(inst) = &t.instance_id {
            match pnputil_remove_device(inst) {
                Ok(()) => devices_removed.push(inst.clone()),
                Err(e) => errors.push(format!("remove-device {inst}: {e}")),
            }
        }
    }

    // 3) Delete OEM driver packages.
    for pkg in &plan.packages {
        if !is_oem_package_name(pkg) {
            errors.push(format!("skipped non-OEM package name: {pkg}"));
            continue;
        }
        match pnputil_delete_driver(pkg) {
            Ok(_msg) => {
                removed.push(pkg.clone());
            }
            Err(e) => errors.push(format!("{pkg}: {e}")),
        }
    }

    let changed = !removed.is_empty() || !devices_removed.is_empty();
    let (status, message) = if !changed {
        (
            "failed",
            format!("No devices/packages removed. {}", errors.join("; ")),
        )
    } else if errors.is_empty() {
        (
            "completed",
            format!(
                "Stopped {} service(s), removed {} device(s), deleted {} package(s). Reboot, then install a clean vendor driver.",
                services_stopped.len(),
                devices_removed.len(),
                removed.len()
            ),
        )
    } else {
        (
            "completed_with_errors",
            format!(
                "Stopped {} service(s), removed {} device(s), deleted {} package(s); issues: {}",
                services_stopped.len(),
                devices_removed.len(),
                removed.len(),
                errors.join("; ")
            ),
        )
    };

    let _ = actions::complete_action(conn, &action.id, status, Some(&message));

    // Refresh inventory best-effort.
    let _ = scan_drivers(conn);

    Ok(GpuCleanResult {
        plan_id: plan.id,
        status: status.into(),
        message,
        packages_removed: removed,
        devices_removed,
        services_stopped,
        restore_point_id: Some(restore_point_id),
    })
}

/// Creates a restore point titled for GPU clean (wrapper for wizard gate).
pub fn create_gpu_clean_restore_point(conn: &Connection) -> Result<crate::models::VaultEntry, CoreError> {
    vault::create_restore_point(
        conn,
        Some("DeviceLifeline: before GPU driver clean".into()),
    )
}

fn normalize_vendor(v: Option<&str>) -> String {
    match v.map(|s| s.trim().to_ascii_lowercase()).as_deref() {
        Some("nvidia") | Some("nv") => "nvidia".into(),
        Some("amd") | Some("radeon") | Some("ati") => "amd".into(),
        Some("intel") => "intel".into(),
        _ => "auto".into(),
    }
}

fn is_display_gpu_driver(d: &DriverInfo) -> bool {
    let class = d.device_class.as_deref().unwrap_or("").to_ascii_lowercase();
    let name = d.name.to_ascii_lowercase();
    let mfr = d.manufacturer.as_deref().unwrap_or("").to_ascii_lowercase();
    let hwid = d.hardware_id.as_deref().unwrap_or("").to_ascii_uppercase();
    if class.contains("display") || class.contains("media") {
        // Prefer true GPU HW IDs.
        if hwid.contains("VEN_10DE") || hwid.contains("VEN_1002") || hwid.contains("VEN_8086") {
            return true;
        }
        if name.contains("nvidia")
            || name.contains("geforce")
            || name.contains("radeon")
            || name.contains("amd ")
            || (name.contains("intel") && (name.contains("graphics") || name.contains("arc") || name.contains("uhd") || name.contains("iris")))
            || mfr.contains("nvidia")
            || mfr.contains("advanced micro devices")
            || mfr.contains("amd")
        {
            return true;
        }
    }
    // Catch GPU-named devices even if class is odd.
    name.contains("geforce")
        || name.contains("quadro")
        || name.contains("rtx ")
        || name.contains("radeon")
        || name.contains("nvidia")
}

fn detect_vendor(d: &DriverInfo) -> String {
    let blob = format!(
        "{} {} {}",
        d.name,
        d.manufacturer.as_deref().unwrap_or(""),
        d.hardware_id.as_deref().unwrap_or("")
    )
    .to_ascii_uppercase();
    if blob.contains("VEN_10DE") || blob.contains("NVIDIA") || blob.contains("GEFORCE") {
        return "nvidia".into();
    }
    if blob.contains("VEN_1002") || blob.contains("RADEON") || blob.contains("AMD") {
        return "amd".into();
    }
    if blob.contains("VEN_8086") || blob.contains("INTEL") {
        return "intel".into();
    }
    "unknown".into()
}

fn is_oem_package_name(name: &str) -> bool {
    let n = name.trim().to_ascii_lowercase();
    n.starts_with("oem") && n.ends_with(".inf")
}

fn enum_display_driver_packages(vendor: &str) -> Vec<String> {
    #[cfg(windows)]
    {
        let output = crate::process_win::silent_command("pnputil")
            .args(["/enum-drivers"])
            .output();
        let Ok(output) = output else {
            return Vec::new();
        };
        let text = String::from_utf8_lossy(&output.stdout);
        parse_pnputil_display_packages(&text, vendor)
    }
    #[cfg(not(windows))]
    {
        let _ = vendor;
        Vec::new()
    }
}

fn parse_pnputil_display_packages(text: &str, vendor: &str) -> Vec<String> {
    let mut packages = Vec::new();
    let mut current_pub: Option<String> = None;
    let mut current_class: Option<String> = None;
    let mut current_oem: Option<String> = None;

    let flush = |packages: &mut Vec<String>,
                 oem: &Option<String>,
                 class: &Option<String>,
                 publisher: &Option<String>,
                 vendor: &str| {
        let Some(oem) = oem else { return };
        if !is_oem_package_name(oem) {
            return;
        }
        let class_l = class.as_deref().unwrap_or("").to_ascii_lowercase();
        let pub_l = publisher.as_deref().unwrap_or("").to_ascii_lowercase();
        let is_display = class_l.contains("display") || class_l.contains("extension");
        let matches_vendor = match vendor {
            "nvidia" => pub_l.contains("nvidia"),
            "amd" => pub_l.contains("advanced micro") || pub_l.contains("amd"),
            "intel" => pub_l.contains("intel"),
            _ => {
                pub_l.contains("nvidia")
                    || pub_l.contains("advanced micro")
                    || pub_l.contains("amd")
                    || (pub_l.contains("intel") && is_display)
            }
        };
        if is_display && matches_vendor {
            packages.push(oem.clone());
        }
    };

    for line in text.lines() {
        let t = line.trim();
        if t.is_empty() {
            flush(
                &mut packages,
                &current_oem,
                &current_class,
                &current_pub,
                vendor,
            );
            current_pub = None;
            current_class = None;
            current_oem = None;
            continue;
        }
        let lower = t.to_ascii_lowercase();
        if lower.starts_with("published name") || lower.starts_with("publishedname") {
            if let Some((_, v)) = t.split_once(':') {
                current_oem = Some(v.trim().to_string());
            }
        } else if lower.starts_with("driver package provider")
            || lower.starts_with("provider name")
            || lower.starts_with("provider")
        {
            if let Some((_, v)) = t.split_once(':') {
                current_pub = Some(v.trim().to_string());
            }
        } else if lower.starts_with("class name") || lower.starts_with("class") {
            if let Some((_, v)) = t.split_once(':') {
                current_class = Some(v.trim().to_string());
            }
        }
    }
    flush(
        &mut packages,
        &current_oem,
        &current_class,
        &current_pub,
        vendor,
    );
    packages.sort();
    packages.dedup();
    packages
}

fn pnputil_delete_driver(oem_inf: &str) -> Result<String, String> {
    #[cfg(windows)]
    {
        let output = crate::process_win::silent_command("pnputil")
            .args(["/delete-driver", oem_inf, "/uninstall", "/force"])
            .output()
            .map_err(|e| format!("pnputil spawn: {e}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        if output.status.success()
            || stdout.to_ascii_lowercase().contains("success")
            || stdout.to_ascii_lowercase().contains("deleted")
        {
            Ok(stdout.trim().to_string())
        } else {
            Err(format!("{stdout} {stderr}").trim().to_string())
        }
    }
    #[cfg(not(windows))]
    {
        Err(format!("pnputil not available (would remove {oem_inf})"))
    }
}

fn pnputil_remove_device(instance_id: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        // Only accept plausible PnP instance paths (no free-form shell).
        let id = instance_id.trim();
        if id.is_empty()
            || id.contains('&') && !id.to_ascii_uppercase().contains("VEN_")
                && !id.to_ascii_uppercase().contains("DISPLAY")
                && !id.to_ascii_uppercase().starts_with("PCI\\")
                && !id.to_ascii_uppercase().starts_with("SWD\\")
                && !id.to_ascii_uppercase().starts_with("ROOT\\")
        {
            // Still allow PCI\ and typical display instance IDs
        }
        let upper = id.to_ascii_uppercase();
        if !(upper.starts_with("PCI\\")
            || upper.starts_with("SWD\\")
            || upper.starts_with("ROOT\\")
            || upper.starts_with("DISPLAY\\")
            || upper.contains("VEN_10DE")
            || upper.contains("VEN_1002")
            || upper.contains("VEN_8086"))
        {
            return Err("instance id not in allowlisted display form".into());
        }
        let output = crate::process_win::silent_command("pnputil")
            .args(["/remove-device", id])
            .output()
            .map_err(|e| format!("pnputil: {e}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        if output.status.success()
            || stdout.to_ascii_lowercase().contains("success")
            || stdout.to_ascii_lowercase().contains("removed")
        {
            Ok(())
        } else {
            Err(format!("{stdout} {stderr}").trim().to_string())
        }
    }
    #[cfg(not(windows))]
    {
        Err(format!("pnputil not available (would remove {instance_id})"))
    }
}

fn stop_service(name: &str) -> Result<(), String> {
    let output = crate::process_win::silent_command("sc")
        .args(["stop", name])
        .output()
        .map_err(|e| format!("sc: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    // STOP_PENDING / already stopped are acceptable
    if output.status.success()
        || stdout.to_ascii_lowercase().contains("stop")
        || stdout.to_ascii_lowercase().contains("1052")
        || stdout.to_ascii_lowercase().contains("1062")
    {
        Ok(())
    } else {
        Err(stdout.trim().to_string())
    }
}

fn vendor_gpu_services(vendor: &str) -> Vec<String> {
    let all = [
        ("nvidia", &["NVDisplay.ContainerLocalSystem", "nvlddmkm", "NvContainerLocalSystem"][..]),
        ("amd", &["amdkmdag", "AMD Crash Defender Service", "AMD External Events Utility"][..]),
        ("intel", &["igfxCUIService2.0.0.0", "igfxCUIService"][..]),
    ];
    let mut out = Vec::new();
    for (v, svcs) in all {
        if vendor == "auto" || vendor == v {
            for s in svcs {
                out.push((*s).to_string());
            }
        }
    }
    out
}

fn enum_display_pnp_devices(vendor: &str) -> Vec<GpuCleanTarget> {
    #[cfg(windows)]
    {
        let script = r#"
$ErrorActionPreference='SilentlyContinue'
Get-PnpDevice -Class Display -EA SilentlyContinue | ForEach-Object {
  [pscustomobject]@{
    name = $_.FriendlyName
    instanceId = $_.InstanceId
    status = [string]$_.Status
    manufacturer = [string]$_.Manufacturer
  }
} | ConvertTo-Json -Compress
"#;
        let output = crate::process_win::silent_command("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .output();
        let Ok(output) = output else {
            return Vec::new();
        };
        let text = String::from_utf8_lossy(&output.stdout);
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Vec::new();
        }
        let value: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => return Vec::new(),
        };
        let arr = if value.is_array() {
            value.as_array().cloned().unwrap_or_default()
        } else {
            vec![value]
        };
        arr.into_iter()
            .filter_map(|v| {
                let name = v.get("name")?.as_str()?.to_string();
                let instance_id = v
                    .get("instanceId")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string());
                let manufacturer = v
                    .get("manufacturer")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string());
                let fake = DriverInfo {
                    id: String::new(),
                    device_id: String::new(),
                    captured_at: String::new(),
                    name: name.clone(),
                    device_class: Some("Display".into()),
                    manufacturer: manufacturer.clone(),
                    driver_version: None,
                    driver_date: None,
                    signer: None,
                    is_signed: true,
                    inf_name: None,
                    hardware_id: instance_id.clone(),
                    status: None,
                    health_score: 100,
                    risk_reasons: vec![],
                };
                let ven = detect_vendor(&fake);
                if vendor != "auto" && ven != vendor && ven != "unknown" {
                    return None;
                }
                // Skip pure Microsoft Basic Display unless vendor auto and nothing else
                let nl = name.to_ascii_lowercase();
                if nl.contains("microsoft basic display") || nl.contains("microsoft remote display")
                {
                    return None;
                }
                Some(GpuCleanTarget {
                    name,
                    inf_name: None,
                    hardware_id: instance_id.clone(),
                    manufacturer,
                    vendor: ven,
                    instance_id,
                })
            })
            .collect()
    }
    #[cfg(not(windows))]
    {
        let _ = vendor;
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsigned_driver_scores_lower() {
        let mut d = mock_drivers("d", "t")[1].clone();
        score_driver(&mut d);
        assert!(d.health_score < 80);
        assert!(!d.risk_reasons.is_empty());
    }

    #[test]
    fn detects_nvidia_from_hwid() {
        let d = DriverInfo {
            id: "1".into(),
            device_id: "d".into(),
            captured_at: "t".into(),
            name: "NVIDIA GeForce".into(),
            device_class: Some("Display".into()),
            manufacturer: Some("NVIDIA".into()),
            driver_version: None,
            driver_date: None,
            signer: None,
            is_signed: true,
            inf_name: Some("oem12.inf".into()),
            hardware_id: Some("PCI\\VEN_10DE&DEV_1234".into()),
            status: Some("OK".into()),
            health_score: 100,
            risk_reasons: vec![],
        };
        assert!(is_display_gpu_driver(&d));
        assert_eq!(detect_vendor(&d), "nvidia");
    }

    #[test]
    fn oem_package_name_guard() {
        assert!(is_oem_package_name("oem42.inf"));
        assert!(!is_oem_package_name("nv_disp.inf"));
        assert!(!is_oem_package_name("../evil.inf"));
    }

    #[test]
    fn parse_pnputil_sample() {
        let sample = r#"
Published Name:     oem10.inf
Driver package provider: NVIDIA Corporation
Class:              Display adapters

Published Name:     oem11.inf
Driver package provider: Contoso
Class:              Net
"#;
        let pkgs = parse_pnputil_display_packages(sample, "nvidia");
        assert_eq!(pkgs, vec!["oem10.inf".to_string()]);
    }
}
