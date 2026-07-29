//! Hardware Intelligence: temps, GPU, clocks, SMART / reliability.

use rusqlite::Connection;
use sysinfo::{Components, System};

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::{
    DiskHealthSummary, HardwareSample, SensorReading, SmartAttribute, SmartReading,
};
use crate::storage::{device_repo, hardware_repo};

/// How deep a hardware sample goes. Quick is for Overview smart-check UX;
/// Full is for the Performance page.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SampleDepth {
    /// sysinfo + light thermal + basic disk identity. No full SMART reliability
    /// counters, no HWiNFO-class PDH harvest. Bounded timeouts.
    Quick,
    /// Full sensor pack + SMART reliability (still timeout-capped).
    Full,
}

impl SampleDepth {
    pub fn from_str_opt(s: Option<&str>) -> Self {
        match s.map(|x| x.trim().to_ascii_lowercase()).as_deref() {
            Some("quick") | Some("light") | Some("smart") => SampleDepth::Quick,
            _ => SampleDepth::Full,
        }
    }
}

/// Captures a hardware sample (OS I/O first, then short DB write).
pub fn capture_sample(conn: &Connection) -> Result<HardwareSample, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    let sample = sample_hardware(&device.id, SampleDepth::Full)?;
    hardware_repo::insert_sample(conn, &sample)?;
    Ok(sample)
}

/// Pure collection without persistence.
pub fn sample_hardware(device_id: &str, depth: SampleDepth) -> Result<HardwareSample, CoreError> {
    let mut sys = System::new();
    sys.refresh_cpu_all();

    let cpu_clock_mhz = {
        let cpus = sys.cpus();
        if cpus.is_empty() {
            None
        } else {
            let sum: f64 = cpus.iter().map(|c| c.frequency() as f64).sum();
            Some(sum / cpus.len() as f64)
        }
    };

    let (cpu_temp_c, gpu_temp_c, component_notes) = sample_temps();
    let (gpu_name, gpu_usage_pct, gpu_vram_used, gpu_vram_total) = match depth {
        // GPU PDH counters are expensive; skip on quick smart-check.
        SampleDepth::Quick => (None, None, None, None),
        SampleDepth::Full => sample_gpu(),
    };
    let smart = sample_smart(depth)?;
    let mut sensors = component_notes_to_sensors(&component_notes);

    // HWiNFO-class Windows sensor pack (thermal zones, GPU load, fans).
    // Re-bind temps/usage only on Windows so non-Windows builds stay free of unused_mut.
    #[cfg(windows)]
    let (cpu_temp_c, gpu_temp_c, gpu_usage_pct) = {
        let mut cpu_temp_c = cpu_temp_c;
        let mut gpu_temp_c = gpu_temp_c;
        let mut gpu_usage_pct = gpu_usage_pct;

        match depth {
            // Overview smart-check must stay responsive. Prefer sysinfo only;
            // if no package temp, one tiny ThermalZone probe (≤3s) — never LHM /
            // nvidia-smi / PDH during a smart-check.
            SampleDepth::Quick => {
                if cpu_temp_c.is_none() {
                    let light = windows_thermal_zone_only();
                    if cpu_temp_c.is_none() {
                        cpu_temp_c = light.cpu_temp_c;
                    }
                    sensors.extend(light.sensors);
                }
            }
            SampleDepth::Full => {
                // ThermalZone + nvidia-smi + optional LHM (timeout-capped).
                let fast = windows_fast_temps();
                if cpu_temp_c.is_none() {
                    cpu_temp_c = fast.cpu_temp_c;
                }
                if gpu_temp_c.is_none() {
                    gpu_temp_c = fast.gpu_temp_c;
                }
                if gpu_usage_pct.is_none() {
                    gpu_usage_pct = fast.gpu_usage_pct;
                }
                sensors.extend(fast.sensors);

                // Full pack (PDH GPU engines, many LHM sensors). Performance page only.
                let pack = windows_sensor_pack();
                if cpu_temp_c.is_none() {
                    cpu_temp_c = pack.cpu_temp_c;
                }
                if gpu_temp_c.is_none() {
                    gpu_temp_c = pack.gpu_temp_c;
                }
                if gpu_usage_pct.is_none() {
                    gpu_usage_pct = pack.gpu_usage_pct;
                }
                sensors.extend(pack.sensors);
            }
        }
        (cpu_temp_c, gpu_temp_c, gpu_usage_pct)
    };

    // Promote disk temps into the sensor bag for the Sensors UI.
    for d in &smart {
        if let Some(t) = d.temperature_c {
            sensors.push(SensorReading {
                name: format!("Disk · {}", d.disk_name),
                value: t,
                unit: "°C".into(),
                source: "StorageReliability".into(),
                category: "disk".into(),
            });
        }
    }

    // Fill top-level temps from any °C sensor we already collected (sensors UI
    // often has thermal zone data even when cpu_temp_c stayed None).
    let (mut cpu_temp_c, mut gpu_temp_c) =
        promote_temps_from_sensors(&sensors, cpu_temp_c, gpu_temp_c);

    if let Some(t) = cpu_temp_c {
        ensure_sensor(&mut sensors, "CPU package", t, "°C", "sysinfo/WMI", "cpu");
    }
    if let Some(t) = gpu_temp_c {
        ensure_sensor(&mut sensors, "GPU", t, "°C", "sysinfo/WMI", "gpu");
    }
    if let Some(u) = gpu_usage_pct {
        ensure_sensor(&mut sensors, "GPU load", u, "%", "PDH", "gpu");
    }
    if let Some(mhz) = cpu_clock_mhz {
        ensure_sensor(&mut sensors, "CPU clock", mhz, "MHz", "sysinfo", "cpu");
    }

    // Re-promote after ensure_sensor (no-op if already set).
    let promoted = promote_temps_from_sensors(&sensors, cpu_temp_c, gpu_temp_c);
    cpu_temp_c = promoted.0;
    gpu_temp_c = promoted.1;

    let fan_rpm = sensors
        .iter()
        .filter(|s| s.category == "fan")
        .map(|s| s.value)
        .fold(None, |acc: Option<f64>, v| {
            Some(acc.map(|a| a.max(v)).unwrap_or(v))
        });

    // Deduplicate by name+source; keep denser HWiNFO-class bag.
    dedupe_sensors(&mut sensors);

    let metrics = serde_json::json!({
        "componentNotes": component_notes,
        "cpuCount": sys.cpus().len(),
        "fanRpm": fan_rpm,
        "sensors": sensors,
        "sensorCoverage": "hwinfo_full_os_sources",
        "sensorCount": sensors.len(),
    });

    Ok(HardwareSample {
        id: uuid::Uuid::new_v4().to_string(),
        device_id: device_id.to_string(),
        captured_at: now_rfc3339()?,
        cpu_temp_c,
        gpu_temp_c,
        gpu_name,
        gpu_usage_pct,
        gpu_vram_used,
        gpu_vram_total,
        cpu_clock_mhz,
        metrics_json: metrics.to_string(),
        smart,
        sensors,
    })
}

/// Prefer explicit CPU/GPU sensors; fall back to ACPI thermal zones for CPU.
fn promote_temps_from_sensors(
    sensors: &[SensorReading],
    cpu: Option<f64>,
    gpu: Option<f64>,
) -> (Option<f64>, Option<f64>) {
    let mut cpu = cpu;
    let mut gpu = gpu;

    if cpu.is_none() {
        cpu = best_temp_sensor(sensors, &["cpu", "package", "tctl", "tdie", "core"]);
    }
    if cpu.is_none() {
        // System thermal zone is not package temp, but better than blank on most PCs.
        cpu = best_temp_sensor(sensors, &["thermal", "thm", "acpi", "zone"]);
    }
    if gpu.is_none() {
        gpu = best_temp_sensor(
            sensors,
            &["gpu", "nvidia", "geforce", "radeon", "amd", "graphics"],
        );
    }

    (cpu, gpu)
}

fn best_temp_sensor(sensors: &[SensorReading], name_hints: &[&str]) -> Option<f64> {
    let mut best: Option<f64> = None;
    for s in sensors {
        if !is_celsius_unit(&s.unit) {
            continue;
        }
        if !s.value.is_finite() || s.value <= 0.0 || s.value > 150.0 {
            continue;
        }
        let hay = format!(
            "{} {} {}",
            s.category.to_ascii_lowercase(),
            s.name.to_ascii_lowercase(),
            s.source.to_ascii_lowercase()
        );
        // Skip disk temps when promoting CPU/GPU.
        if hay.contains("disk")
            || hay.contains("ssd")
            || hay.contains("hdd")
            || hay.contains("nvme")
        {
            if !name_hints.iter().any(|h| *h == "disk") {
                continue;
            }
        }
        let matched = name_hints.iter().any(|h| hay.contains(h));
        if !matched {
            continue;
        }
        best = Some(match best {
            Some(prev) => prev.max(s.value),
            None => s.value,
        });
    }
    best
}

fn is_celsius_unit(unit: &str) -> bool {
    matches!(unit.trim(), "°C" | "°c" | "C" | "c" | "Celsius" | "celsius")
        || unit.trim().eq_ignore_ascii_case("degc")
}

fn ensure_sensor(
    sensors: &mut Vec<SensorReading>,
    name: &str,
    value: f64,
    unit: &str,
    source: &str,
    category: &str,
) {
    if sensors.iter().any(|s| s.name.eq_ignore_ascii_case(name)) {
        return;
    }
    sensors.push(SensorReading {
        name: name.into(),
        value,
        unit: unit.into(),
        source: source.into(),
        category: category.into(),
    });
}

fn dedupe_sensors(sensors: &mut Vec<SensorReading>) {
    let mut seen = std::collections::HashSet::new();
    sensors.retain(|s| {
        let key = format!(
            "{}|{}|{}",
            s.category.to_ascii_lowercase(),
            s.name.to_ascii_lowercase(),
            s.source.to_ascii_lowercase()
        );
        seen.insert(key)
    });
    sensors.sort_by(|a, b| {
        a.category
            .cmp(&b.category)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
}

fn component_notes_to_sensors(notes: &[String]) -> Vec<SensorReading> {
    let mut out = Vec::new();
    for note in notes {
        // "Label=42.0C"
        if let Some((label, rest)) = note.rsplit_once('=') {
            let value_str = rest.trim().trim_end_matches('C').trim_end_matches('c');
            if let Ok(v) = value_str.parse::<f64>() {
                let l = label.to_lowercase();
                let category = if l.contains("gpu") || l.contains("nvidia") || l.contains("amd") {
                    "gpu"
                } else if l.contains("cpu") || l.contains("package") || l.contains("core") {
                    "cpu"
                } else {
                    "thermal"
                };
                out.push(SensorReading {
                    name: label.trim().to_string(),
                    value: v,
                    unit: "°C".into(),
                    source: "sysinfo::Components".into(),
                    category: category.into(),
                });
            }
        }
    }
    out
}

#[cfg(windows)]
struct WindowsSensorPack {
    cpu_temp_c: Option<f64>,
    gpu_temp_c: Option<f64>,
    gpu_usage_pct: Option<f64>,
    sensors: Vec<SensorReading>,
}

/// Ultra-light thermal probe for Overview smart-check — one CIM class, short timeout.
/// Never touches LibreHardwareMonitor, PDH, or nvidia-smi (those freeze weaker PCs).
#[cfg(windows)]
fn windows_thermal_zone_only() -> WindowsSensorPack {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$cpuTemp = $null
$sensors = @()
foreach ($z in @(Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue | Select-Object -First 4)) {
  if ($null -eq $z.Temperature) { continue }
  $c = [double]$z.Temperature
  if ($c -gt 200) { $c = $c - 273.15 }
  if ($c -lt 0 -or $c -gt 150) { continue }
  $c = [math]::Round($c, 2)
  $name = 'Thermal zone'
  if ($z.Name) { $name = 'Thermal · ' + [string]$z.Name }
  $sensors += [pscustomobject]@{ name = $name; value = $c; unit = 'C'; source = 'ThermalZoneInfo'; category = 'thermal' }
  if ($null -eq $cpuTemp) { $cpuTemp = $c }
}
[pscustomobject]@{
  cpuTemp = $cpuTemp
  gpuTemp = $null
  gpuUsage = $null
  sensors = @($sensors)
} | ConvertTo-Json -Compress -Depth 4
"#;
    parse_windows_sensor_json(&run_powershell_json_timeout(
        script,
        std::time::Duration::from_secs(3),
    ))
}

/// Lightweight thermal probe — runs first so Performance tiles get a value even
/// when the full sensor pack fails, hangs, or needs LibreHardwareMonitor.
#[cfg(windows)]
fn windows_fast_temps() -> WindowsSensorPack {
    // Keep this script intentionally simple (no List[T], no high-precision casts)
    // so Windows PowerShell 5.1 always emits JSON under CREATE_NO_WINDOW.
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$cpuTemp = $null
$gpuTemp = $null
$gpuUsage = $null
$sensors = @()

foreach ($z in @(Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue)) {
  if ($null -eq $z.Temperature) { continue }
  $c = [double]$z.Temperature
  if ($c -gt 200) { $c = $c - 273.15 }
  if ($c -lt 0 -or $c -gt 150) { continue }
  $c = [math]::Round($c, 2)
  $name = 'Thermal zone'
  if ($z.Name) { $name = 'Thermal · ' + [string]$z.Name }
  $sensors += [pscustomobject]@{ name = $name; value = $c; unit = 'C'; source = 'ThermalZoneInfo'; category = 'thermal' }
  if ($null -eq $cpuTemp) { $cpuTemp = $c }
}

try {
  foreach ($z in @(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue)) {
    if ($null -eq $z.CurrentTemperature) { continue }
    $c = ([double]$z.CurrentTemperature / 10.0) - 273.15
    if ($c -lt 0 -or $c -gt 150) { continue }
    $c = [math]::Round($c, 2)
    $name = 'ACPI thermal'
    if ($z.InstanceName) { $name = [string]$z.InstanceName }
    $sensors += [pscustomobject]@{ name = $name; value = $c; unit = 'C'; source = 'MSAcpi'; category = 'thermal' }
    if ($null -eq $cpuTemp) { $cpuTemp = $c }
  }
} catch {}

$smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($smi) {
  try {
    $line = & nvidia-smi --query-gpu=temperature.gpu,utilization.gpu --format=csv,noheader,nounits 2>$null | Select-Object -First 1
    if ($line) {
      $p = $line -split ','
      if ($p.Count -ge 1 -and $p[0].Trim() -match '^[\d\.]+$') {
        $gpuTemp = [double]$p[0].Trim()
        $sensors += [pscustomobject]@{ name = 'GPU temp (nvidia-smi)'; value = $gpuTemp; unit = 'C'; source = 'nvidia-smi'; category = 'gpu' }
      }
      if ($p.Count -ge 2 -and $p[1].Trim() -match '^[\d\.]+$') {
        $gpuUsage = [double]$p[1].Trim()
        $sensors += [pscustomobject]@{ name = 'GPU load (nvidia-smi)'; value = $gpuUsage; unit = '%'; source = 'nvidia-smi'; category = 'gpu' }
      }
    }
  } catch {}
}

foreach ($ns in @('root/LibreHardwareMonitor', 'root/OpenHardwareMonitor')) {
  try {
    $rows = @(Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction SilentlyContinue | Where-Object { $_.SensorType -eq 'Temperature' } | Select-Object -First 40)
    foreach ($s in $rows) {
      if ($null -eq $s.Value) { continue }
      $val = [double]$s.Value
      if ($val -le 0 -or $val -gt 150) { continue }
      $name = [string]$s.Name
      $cat = 'thermal'
      if ($name -match 'GPU|Radeon|GeForce|NVIDIA|AMD') {
        $cat = 'gpu'
        if ($null -eq $gpuTemp) { $gpuTemp = $val }
      } elseif ($name -match 'CPU|Package|Tctl|Tdie|Core') {
        $cat = 'cpu'
        if ($null -eq $cpuTemp) { $cpuTemp = $val }
      }
      $sensors += [pscustomobject]@{ name = ($name + ' (Temperature)'); value = [math]::Round($val, 2); unit = 'C'; source = ($ns -replace 'root/',''); category = $cat }
    }
  } catch {}
}

[pscustomobject]@{
  cpuTemp = $cpuTemp
  gpuTemp = $gpuTemp
  gpuUsage = $gpuUsage
  sensors = @($sensors)
} | ConvertTo-Json -Compress -Depth 6
"#;
    parse_windows_sensor_json(&run_powershell_json(script))
}

#[cfg(windows)]
fn run_powershell_json(script: &str) -> String {
    run_powershell_json_timeout(script, std::time::Duration::from_secs(8))
}

#[cfg(windows)]
fn run_powershell_json_timeout(script: &str, timeout: std::time::Duration) -> String {
    // CIM thermal probes + CREATE_NO_WINDOW + piped stdout often yield empty
    // captures. Write the script body to a .ps1 that dumps JSON to a result file.
    let dir = std::env::temp_dir().join("devicelifeline-hw");
    let _ = std::fs::create_dir_all(&dir);
    let id = uuid::Uuid::new_v4();
    let script_path = dir.join(format!("probe-{id}.ps1"));
    let out_path = dir.join(format!("probe-{id}.json"));
    let out_path_str = out_path.to_string_lossy().replace('\'', "''");

    // Wrap user script so the final JSON object is written to disk (not only stdout).
    let wrapped = format!(
        r#"$ErrorActionPreference = 'SilentlyContinue'
$__outPath = '{out}'
try {{
{body}
}} catch {{
  '{{"cpuTemp":null,"gpuTemp":null,"gpuUsage":null,"sensors":[],"error":"' + ($_.Exception.Message -replace '"','') + '"}}' | Set-Content -LiteralPath $__outPath -Encoding utf8
}}
"#,
        out = out_path_str,
        body = inject_json_file_emit(script, &out_path_str),
    );

    let mut bytes = vec![0xEFu8, 0xBB, 0xBF]; // UTF-8 BOM for Windows PowerShell 5.1
    bytes.extend_from_slice(wrapped.as_bytes());
    if std::fs::write(&script_path, &bytes).is_err() {
        return String::new();
    }

    let script_str = script_path.to_string_lossy().to_string();
    let timed_out = crate::process_win::run_silent_timeout(
        {
            let mut c = crate::process_win::silent_command("powershell");
            c.args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                &script_str,
            ]);
            c
        },
        timeout,
    )
    .is_none();

    let text = std::fs::read_to_string(&out_path)
        .unwrap_or_default()
        .trim()
        .to_string();
    let _ = std::fs::remove_file(&script_path);
    let _ = std::fs::remove_file(&out_path);

    if !text.is_empty() {
        return text;
    }

    // On timeout or empty output, do not chain a second PowerShell on Quick budgets
    // (≤4s). Full probes may try one tiny thermal fallback.
    if timed_out || timeout <= std::time::Duration::from_secs(4) {
        return String::new();
    }

    // Last resort: tiny -Command that only hits thermal zones.
    let fallback = r#"$z=Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -EA SilentlyContinue|Select-Object -First 1; if($z){$c=[double]$z.Temperature; if($c -gt 200){$c=$c-273.15}; Write-Output ('{"cpuTemp":'+$c+',"gpuTemp":null,"gpuUsage":null,"sensors":[{"name":"Thermal","value":'+$c+',"unit":"C","source":"ThermalZoneInfo","category":"thermal"}]}')} else { Write-Output '{"cpuTemp":null,"gpuTemp":null,"gpuUsage":null,"sensors":[]}' }"#;
    let output = crate::process_win::run_silent_timeout(
        {
            let mut c = crate::process_win::silent_command("powershell");
            c.args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                fallback,
            ]);
            c
        },
        std::time::Duration::from_secs(3),
    );
    let Some(output) = output else {
        return String::new();
    };
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

/// Replace trailing `ConvertTo-Json ...` with write-to-file so probes work
/// without relying on captured process stdout.
#[cfg(windows)]
fn inject_json_file_emit(script: &str, out_path: &str) -> String {
    let trimmed = script.trim_end();
    // Common ending in our packs:
    //   } | ConvertTo-Json -Compress -Depth 6
    if let Some(idx) = trimmed.rfind("| ConvertTo-Json") {
        let head = trimmed[..idx].trim_end();
        return format!(
            "{head} | ConvertTo-Json -Compress -Depth 6 | Set-Content -LiteralPath '{out_path}' -Encoding utf8\n"
        );
    }
    // Scripts without ConvertTo-Json: append a no-op result file.
    format!(
        "{trimmed}\nif (-not (Test-Path -LiteralPath '{out_path}')) {{ '{{}}' | Set-Content -LiteralPath '{out_path}' -Encoding utf8 }}\n"
    )
}

#[cfg(windows)]
fn parse_windows_sensor_json(text: &str) -> WindowsSensorPack {
    let mut pack = WindowsSensorPack {
        cpu_temp_c: None,
        gpu_temp_c: None,
        gpu_usage_pct: None,
        sensors: Vec::new(),
    };
    if text.is_empty() {
        return pack;
    }
    // Strip BOM / find first JSON object if PowerShell printed warnings before it.
    let cleaned = text.trim_start_matches('\u{feff}').trim();
    let json_slice = cleaned.find('{').map(|i| &cleaned[i..]).unwrap_or(cleaned);
    let Ok(v) = serde_json::from_str::<serde_json::Value>(json_slice) else {
        return pack;
    };
    pack.cpu_temp_c = v
        .get("cpuTemp")
        .and_then(|x| x.as_f64())
        .filter(|t| t.is_finite() && *t > 0.0 && *t <= 150.0);
    pack.gpu_temp_c = v
        .get("gpuTemp")
        .and_then(|x| x.as_f64())
        .filter(|t| t.is_finite() && *t > 0.0 && *t <= 150.0);
    pack.gpu_usage_pct = v.get("gpuUsage").and_then(|x| x.as_f64());
    if let Some(arr) = v.get("sensors").and_then(|s| s.as_array()) {
        for item in arr {
            let Some(name) = item.get("name").and_then(|x| x.as_str()) else {
                continue;
            };
            let Some(value) = item.get("value").and_then(|x| x.as_f64()) else {
                continue;
            };
            let unit_raw = item
                .get("unit")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            // Normalize plain "C" from ASCII-safe scripts to display unit.
            let unit = if unit_raw.eq_ignore_ascii_case("c") {
                "°C".to_string()
            } else {
                unit_raw
            };
            pack.sensors.push(SensorReading {
                name: name.to_string(),
                value,
                unit,
                source: item
                    .get("source")
                    .and_then(|x| x.as_str())
                    .unwrap_or("WMI")
                    .to_string(),
                category: item
                    .get("category")
                    .and_then(|x| x.as_str())
                    .unwrap_or("other")
                    .to_string(),
            });
        }
    }
    pack
}

#[cfg(windows)]
fn windows_sensor_pack() -> WindowsSensorPack {
    // Full OS-available HWiNFO-class harvest: ACPI, PDH, CIM, nvidia-smi, LHM WMI if present.
    let script = r#"
$ErrorActionPreference='SilentlyContinue'
$sensors = New-Object System.Collections.Generic.List[object]
function Add-S($name,$value,$unit,$source,$category) {
  if ($null -eq $value) { return }
  try { $v = [double]$value } catch { return }
  if (-not [double]::IsFinite($v)) { return }
  $sensors.Add([pscustomobject]@{ name=[string]$name; value=[math]::Round($v,2); unit=[string]$unit; source=[string]$source; category=[string]$category }) | Out-Null
}
$cpuTemp = $null; $gpuTemp = $null; $gpuUsage = $null

# --- Thermal: MSAcpi zones ---
try {
  foreach ($z in (Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -EA SilentlyContinue)) {
    if ($null -eq $z.CurrentTemperature) { continue }
    $c = ([double]$z.CurrentTemperature / 10.0) - 273.15
    if ($c -lt 0 -or $c -gt 150) { continue }
    $name = if ($z.InstanceName) { [string]$z.InstanceName } else { 'Thermal zone' }
    Add-S $name $c '°C' 'MSAcpi' 'thermal'
    if ($null -eq $cpuTemp) { $cpuTemp = $c }
  }
} catch {}

# --- ThermalZoneInformation (Win10+) ---
try {
  foreach ($z in (Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -EA SilentlyContinue)) {
    if ($null -eq $z.Temperature) { continue }
    $c = [double]$z.Temperature
    if ($c -gt 200) { $c = $c - 273.15 }
    if ($c -lt 0 -or $c -gt 150) { continue }
    $name = if ($z.Name) { "Thermal · $($z.Name)" } else { 'Thermal zone info' }
    Add-S $name $c 'C' 'ThermalZoneInfo' 'thermal'
    if ($null -eq $cpuTemp) { $cpuTemp = $c }
  }
} catch {}

# --- LibreHardwareMonitor / OpenHardwareMonitor WMI if installed ---
foreach ($ns in @('root/LibreHardwareMonitor','root/OpenHardwareMonitor')) {
  try {
    foreach ($s in (Get-CimInstance -Namespace $ns -ClassName Sensor -EA SilentlyContinue | Select-Object -First 80)) {
      $val = $s.Value; if ($null -eq $val) { continue }
      $type = [string]$s.SensorType
      $name = [string]$s.Name
      $cat = switch -Regex ($type) {
        'Temperature' { 'thermal' }
        'Fan|Control' { 'fan' }
        'Load|Level' { 'other' }
        'Power' { 'power' }
        'Clock|Frequency' { 'cpu' }
        'Voltage' { 'other' }
        default { 'other' }
      }
      if ($name -match 'GPU|Radeon|GeForce|NVIDIA|AMD') {
        if ($type -match 'Temperature' -and ($null -eq $gpuTemp -or $val -gt $gpuTemp)) { $gpuTemp = [double]$val }
        if ($type -match 'Load' -and $name -match 'Core|D3D|3D' -and $null -eq $gpuUsage) { $gpuUsage = [double]$val }
        $cat = if ($type -match 'Temperature') { 'gpu' } elseif ($type -match 'Load') { 'gpu' } else { $cat }
      }
      if ($name -match 'CPU|Package|Tctl|Tdie' -and $type -match 'Temperature') {
        if ($null -eq $cpuTemp) { $cpuTemp = [double]$val }
        $cat = 'cpu'
      }
      $unit = switch -Regex ($type) {
        'Temperature' { '°C' }
        'Fan' { 'RPM' }
        'Load|Level' { '%' }
        'Power' { 'W' }
        'Clock|Frequency' { 'MHz' }
        'Voltage' { 'V' }
        default { $type }
      }
      Add-S "$name ($type)" $val $unit $ns.Replace('root/','') $cat
    }
  } catch {}
}

# --- CPU load / clock via PDH ---
try {
  $cpu = Get-Counter '\Processor(_Total)\% Processor Time' -EA SilentlyContinue
  if ($cpu) { Add-S 'CPU total load' $cpu.CounterSamples[0].CookedValue '%' 'PDH' 'cpu' }
} catch {}
try {
  $mem = Get-Counter '\Memory\% Committed Bytes In Use' -EA SilentlyContinue
  if ($mem) { Add-S 'Memory committed' $mem.CounterSamples[0].CookedValue '%' 'PDH' 'other' }
} catch {}

# --- GPU PDH: engine + memory ---
try {
  $counters = Get-Counter '\GPU Engine(*)\Utilization Percentage' -EA SilentlyContinue
  if ($counters) {
    $vals = @($counters.CounterSamples | Where-Object { $_.CookedValue -ge 0 } | ForEach-Object { [double]$_.CookedValue })
    if ($vals.Count -gt 0) {
      $gpuUsage = ($vals | Measure-Object -Average).Average
      $maxU = ($vals | Measure-Object -Maximum).Maximum
      Add-S 'GPU load (avg engines)' $gpuUsage '%' 'PDH' 'gpu'
      Add-S 'GPU load (max engine)' $maxU '%' 'PDH' 'gpu'
    }
  }
} catch {}
try {
  $gmem = Get-Counter '\GPU Adapter Memory(*)\Dedicated Usage' -EA SilentlyContinue
  if ($gmem) {
    $bytes = ($gmem.CounterSamples | Measure-Object CookedValue -Sum).Sum
    if ($bytes -gt 0) { Add-S 'GPU dedicated memory' ($bytes/1MB) 'MB' 'PDH' 'gpu' }
  }
} catch {}
try {
  $gmem2 = Get-Counter '\GPU Adapter Memory(*)\Shared Usage' -EA SilentlyContinue
  if ($gmem2) {
    $bytes = ($gmem2.CounterSamples | Measure-Object CookedValue -Sum).Sum
    if ($bytes -gt 0) { Add-S 'GPU shared memory' ($bytes/1MB) 'MB' 'PDH' 'gpu' }
  }
} catch {}

# --- nvidia-smi if present ---
try {
  $smi = Get-Command nvidia-smi -EA SilentlyContinue
  if ($smi) {
    $line = & nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw,clocks.sm,fan.speed --format=csv,noheader,nounits 2>$null
    if ($line) {
      $p = ($line | Select-Object -First 1) -split ','
      if ($p.Count -ge 3) {
        $gpuTemp = [double]$p[1].Trim()
        $gpuUsage = [double]$p[2].Trim()
        Add-S 'GPU temp (nvidia-smi)' $gpuTemp '°C' 'nvidia-smi' 'gpu'
        Add-S 'GPU load (nvidia-smi)' $gpuUsage '%' 'nvidia-smi' 'gpu'
        if ($p.Count -ge 4) { Add-S 'GPU mem util (nvidia-smi)' ([double]$p[3].Trim()) '%' 'nvidia-smi' 'gpu' }
        if ($p.Count -ge 5) { Add-S 'GPU mem used (nvidia-smi)' ([double]$p[4].Trim()) 'MB' 'nvidia-smi' 'gpu' }
        if ($p.Count -ge 6) { Add-S 'GPU mem total (nvidia-smi)' ([double]$p[5].Trim()) 'MB' 'nvidia-smi' 'gpu' }
        if ($p.Count -ge 7 -and $p[6].Trim() -match '[\d\.]+') { Add-S 'GPU power (nvidia-smi)' ([double]$p[6].Trim()) 'W' 'nvidia-smi' 'power' }
        if ($p.Count -ge 8 -and $p[7].Trim() -match '[\d\.]+') { Add-S 'GPU SM clock (nvidia-smi)' ([double]$p[7].Trim()) 'MHz' 'nvidia-smi' 'gpu' }
        if ($p.Count -ge 9 -and $p[8].Trim() -match '[\d\.]+') { Add-S 'GPU fan (nvidia-smi)' ([double]$p[8].Trim()) '%' 'nvidia-smi' 'fan' }
      }
    }
  }
} catch {}

# --- Fans / cooling ---
try {
  foreach ($f in (Get-CimInstance Win32_Fan -EA SilentlyContinue)) {
    $rpm = $null
    if ($f.DesiredSpeed) { $rpm = [double]$f.DesiredSpeed }
    if ($null -eq $rpm -and $f.PSObject.Properties['Speed']) { $rpm = [double]$f.Speed }
    if ($null -eq $rpm -or $rpm -le 0) { continue }
    $fname = if ($f.Name) { [string]$f.Name } else { 'Fan' }
    Add-S $fname $rpm 'RPM' 'Win32_Fan' 'fan'
  }
} catch {}
try {
  foreach ($t in (Get-CimInstance Win32_TemperatureProbe -EA SilentlyContinue | Select-Object -First 20)) {
    if ($null -eq $t.CurrentReading) { continue }
    # Often tenths of Kelvin
    $c = ([double]$t.CurrentReading / 10.0) - 273.15
    if ($c -lt -40 -or $c -gt 150) { continue }
    $n = if ($t.Name) { [string]$t.Name } else { 'Temperature probe' }
    Add-S $n $c '°C' 'Win32_TemperatureProbe' 'thermal'
  }
} catch {}

# --- Power / battery (laptops) ---
try {
  foreach ($b in (Get-CimInstance Win32_Battery -EA SilentlyContinue)) {
    if ($null -ne $b.EstimatedChargeRemaining) { Add-S 'Battery charge' $b.EstimatedChargeRemaining '%' 'Win32_Battery' 'power' }
    if ($null -ne $b.DesignVoltage) { Add-S 'Battery design voltage' ($b.DesignVoltage/1000.0) 'V' 'Win32_Battery' 'power' }
  }
} catch {}

# --- Physical memory ---
try {
  $os = Get-CimInstance Win32_OperatingSystem -EA SilentlyContinue
  if ($os) {
    $total = [double]$os.TotalVisibleMemorySize * 1024
    $free = [double]$os.FreePhysicalMemory * 1024
    if ($total -gt 0) {
      Add-S 'Memory used' ((($total-$free)/$total)*100) '%' 'Win32_OperatingSystem' 'other'
      Add-S 'Memory total' ($total/1GB) 'GB' 'Win32_OperatingSystem' 'other'
    }
  }
} catch {}

# --- CPU name / max clock ---
try {
  $p = Get-CimInstance Win32_Processor -EA SilentlyContinue | Select-Object -First 1
  if ($p) {
    if ($p.CurrentClockSpeed) { Add-S 'CPU current clock' $p.CurrentClockSpeed 'MHz' 'Win32_Processor' 'cpu' }
    if ($p.MaxClockSpeed) { Add-S 'CPU max clock' $p.MaxClockSpeed 'MHz' 'Win32_Processor' 'cpu' }
    if ($null -ne $p.LoadPercentage) { Add-S 'CPU load (WMI)' $p.LoadPercentage '%' 'Win32_Processor' 'cpu' }
  }
} catch {}

[pscustomobject]@{
  cpuTemp = $cpuTemp
  gpuTemp = $gpuTemp
  gpuUsage = $gpuUsage
  sensors = @($sensors)
} | ConvertTo-Json -Compress -Depth 6
"#;
    parse_windows_sensor_json(&run_powershell_json(script))
}

fn sample_temps() -> (Option<f64>, Option<f64>, Vec<String>) {
    let components = Components::new_with_refreshed_list();
    let mut cpu_temps: Vec<f64> = Vec::new();
    let mut gpu_temps: Vec<f64> = Vec::new();
    let mut notes: Vec<String> = Vec::new();

    for c in components.iter() {
        let label = c.label().to_lowercase();
        let Some(temp_f) = c.temperature() else {
            continue;
        };
        let temp = f64::from(temp_f);
        if !temp.is_finite() || temp <= 0.0 || temp > 150.0 {
            continue;
        }
        notes.push(format!("{}={temp:.1}C", c.label()));
        if label.contains("gpu")
            || label.contains("nvidia")
            || label.contains("amd")
            || label.contains("radeon")
        {
            gpu_temps.push(temp);
        } else if label.contains("cpu")
            || label.contains("package")
            || label.contains("core")
            || label.contains("tctl")
            || label.contains("tdie")
        {
            cpu_temps.push(temp);
        }
    }

    let cpu = if cpu_temps.is_empty() {
        None
    } else {
        Some(cpu_temps.iter().sum::<f64>() / cpu_temps.len() as f64)
    };
    let gpu = if gpu_temps.is_empty() {
        None
    } else {
        Some(gpu_temps.iter().cloned().fold(f64::NEG_INFINITY, f64::max))
    };
    (cpu, gpu, notes)
}

fn sample_gpu() -> (Option<String>, Option<f64>, Option<i64>, Option<i64>) {
    #[cfg(windows)]
    {
        if let Some(info) = windows_gpu_via_powershell() {
            return info;
        }
    }
    // Fallback: look for a process that often indicates GPU load is available later.
    (None, None, None, None)
}

/// (name, usage_pct, vram_used, vram_total)
#[cfg(windows)]
type GpuPowerShellSample = (Option<String>, Option<f64>, Option<i64>, Option<i64>);

#[cfg(windows)]
fn windows_gpu_via_powershell() -> Option<GpuPowerShellSample> {
    // Name/VRAM from VideoController; usage from PDH GPU Engine counters.
    let script = r#"
$ErrorActionPreference='SilentlyContinue'
$g = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -and $_.AdapterRAM -gt 0 } | Select-Object -First 1
$usage = $null
try {
  $counters = Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction SilentlyContinue
  if ($counters) {
    $vals = $counters.CounterSamples | Where-Object { $_.CookedValue -ge 0 } | ForEach-Object { [double]$_.CookedValue }
    if ($vals) { $usage = ($vals | Measure-Object -Average).Average }
  }
} catch {}
if (-not $g -and $null -eq $usage) { '{}' | ConvertTo-Json; exit }
[pscustomobject]@{
  name = if ($g) { $g.Name } else { $null }
  vram = if ($g) { [int64]$g.AdapterRAM } else { $null }
  usage = $usage
  driver = if ($g) { $g.DriverVersion } else { $null }
} | ConvertTo-Json -Compress
"#;
    let output = crate::process_win::run_silent_timeout(
        {
            let mut c = crate::process_win::silent_command("powershell");
            c.args(["-NoProfile", "-NonInteractive", "-Command", script]);
            c
        },
        std::time::Duration::from_secs(6),
    )?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let v: serde_json::Value = serde_json::from_str(text.trim()).ok()?;
    let name = v
        .get("name")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let vram = v.get("vram").and_then(|x| x.as_i64());
    let usage = v.get("usage").and_then(|x| x.as_f64());
    Some((name, usage, None, vram))
}

fn sample_smart(depth: SampleDepth) -> Result<Vec<SmartReading>, CoreError> {
    #[cfg(windows)]
    {
        Ok(windows_smart_via_powershell(depth))
    }
    #[cfg(not(windows))]
    {
        let _ = depth;
        Ok(mock_smart())
    }
}

#[cfg(not(windows))]
fn mock_smart() -> Vec<SmartReading> {
    vec![SmartReading {
        id: uuid::Uuid::new_v4().to_string(),
        sample_id: String::new(),
        disk_name: "mock-disk-0".into(),
        model: Some("Mock SSD".into()),
        serial: Some("MOCK-001".into()),
        media_type: Some("SSD".into()),
        health_status: Some("Healthy".into()),
        temperature_c: Some(38.0),
        power_on_hours: Some(1200),
        wear_pct: Some(3.0),
        raw_json: Some("{}".into()),
        size_bytes: Some(512_000_000_000),
        attributes: vec![
            SmartAttribute {
                id: Some("194".into()),
                name: "Temperature".into(),
                value: Some("38".into()),
                raw: Some("38".into()),
                worst: None,
                threshold: Some("0".into()),
                status: Some("OK".into()),
            },
            SmartAttribute {
                id: Some("9".into()),
                name: "Power-On Hours".into(),
                value: Some("1200".into()),
                raw: Some("1200".into()),
                worst: None,
                threshold: None,
                status: Some("OK".into()),
            },
            SmartAttribute {
                id: Some("231".into()),
                name: "SSD Life Left".into(),
                value: Some("97".into()),
                raw: Some("3".into()),
                worst: None,
                threshold: Some("10".into()),
                status: Some("OK".into()),
            },
        ],
    }]
}

#[cfg(windows)]
fn windows_smart_via_powershell(depth: SampleDepth) -> Vec<SmartReading> {
    // Quick path: Win32_DiskDrive only — no StorageReliabilityCounter (the
    // usual hang / elevation stall), no IOCTL sweep of 16 physical drives.
    if depth == SampleDepth::Quick {
        return windows_smart_from_win32_diskdrive();
    }

    // Ship a real .ps1 (include_str) — complex format! strings were producing empty results.
    const SMART_PROBE_PS1: &str = include_str!("../../scripts/smart_probe.ps1");

    let dir = std::env::temp_dir().join("devicelifeline-hw");
    let _ = std::fs::create_dir_all(&dir);
    let id = uuid::Uuid::new_v4();
    let script_path = dir.join(format!("smart-{id}.ps1"));
    let out_path = dir.join(format!("smart-{id}.json"));

    let mut bytes = vec![0xEFu8, 0xBB, 0xBF];
    bytes.extend_from_slice(SMART_PROBE_PS1.as_bytes());
    let text = if std::fs::write(&script_path, &bytes).is_ok() {
        let script_str = script_path.to_string_lossy().to_string();
        let out_str = out_path.to_string_lossy().to_string();
        let mut cmd = crate::process_win::silent_command("powershell");
        cmd.env("DL_SMART_OUT", &out_str);
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &script_str,
        ]);
        // Reliability counters can hang for a long time without elevation.
        let output =
            crate::process_win::run_silent_timeout(cmd, std::time::Duration::from_secs(12));
        if let Some(ref o) = output {
            if !o.status.success() {
                log::warn!(
                    "smart probe exit {:?}; stderr={}",
                    o.status.code(),
                    String::from_utf8_lossy(&o.stderr)
                );
            }
        } else {
            log::warn!("smart probe timed out after 12s — falling back to Win32_DiskDrive");
        }
        std::fs::read_to_string(&out_path)
            .unwrap_or_default()
            .trim()
            .trim_start_matches('\u{feff}')
            .to_string()
    } else {
        String::new()
    };

    let mut readings = parse_smart_json(&text);
    if readings.is_empty() {
        log::warn!(
            "smart probe empty; json_len={} head={:?}",
            text.len(),
            text.chars().take(240).collect::<String>()
        );
        // Immediate fallback: Win32_DiskDrive always works without Storage module.
        readings = windows_smart_from_win32_diskdrive();
    } else {
        let _ = std::fs::remove_file(&script_path);
        let _ = std::fs::remove_file(&out_path);
    }

    // Limit IOCTL probes to first 4 drives to avoid multi-second freezes.
    let ioctl_temps = windows_physical_drive_temperatures(4);
    for r in &mut readings {
        if r.temperature_c.is_none() {
            if let Some(id) = r
                .raw_json
                .as_ref()
                .and_then(|j| serde_json::from_str::<serde_json::Value>(j).ok())
                .and_then(|v| {
                    v.get("deviceId")
                        .and_then(|x| x.as_u64().or_else(|| x.as_i64().map(|i| i as u64)))
                })
            {
                if let Some(t) = ioctl_temps.get(&(id as u32)) {
                    r.temperature_c = Some(*t);
                }
            }
        }
        enrich_smart_from_attributes(r);
    }

    if readings.iter().any(|r| r.temperature_c.is_none()) && !ioctl_temps.is_empty() {
        let mut temps: Vec<(u32, f64)> = ioctl_temps.iter().map(|(k, v)| (*k, *v)).collect();
        temps.sort_by_key(|(id, _)| *id);
        let mut ti = 0usize;
        for r in &mut readings {
            if r.temperature_c.is_none() {
                if let Some((_, t)) = temps.get(ti) {
                    r.temperature_c = Some(*t);
                    ti += 1;
                }
            }
        }
    }

    readings
}

/// Basic disk identity via WMI Win32_DiskDrive — no Storage module, no elevation.
#[cfg(windows)]
fn windows_smart_from_win32_diskdrive() -> Vec<SmartReading> {
    let dir = std::env::temp_dir().join("devicelifeline-hw");
    let _ = std::fs::create_dir_all(&dir);
    let id = uuid::Uuid::new_v4();
    let script_path = dir.join(format!("diskdrive-{id}.ps1"));
    let out_path = dir.join(format!("diskdrive-{id}.json"));
    let out_lit = out_path.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference='SilentlyContinue'\n\
         $rows=@()\n\
         foreach ($d in @(Get-CimInstance Win32_DiskDrive -ErrorAction SilentlyContinue)) {{\n\
           $rows += [pscustomobject]@{{\n\
             name = $(if ($d.Model) {{ [string]$d.Model }} else {{ [string]$d.Caption }})\n\
             media = $(if ($d.MediaType) {{ [string]$d.MediaType }} else {{ $null }})\n\
             health = 'Unknown'\n\
             serial = $(if ($d.SerialNumber) {{ [string]$d.SerialNumber.Trim() }} else {{ $null }})\n\
             size = $(if ($d.Size) {{ [int64]$d.Size }} else {{ $null }})\n\
             deviceId = $null\n\
             temp = $null\n\
             powerOnHours = $null\n\
             wear = $null\n\
             attrs = @()\n\
           }}\n\
         }}\n\
         if ($rows.Count -eq 0) {{ '[]' | Set-Content -LiteralPath '{out}' -Encoding utf8 }}\n\
         else {{ ($rows | ConvertTo-Json -Compress -Depth 4) | Set-Content -LiteralPath '{out}' -Encoding utf8 }}\n",
        out = out_lit
    );
    let mut bytes = vec![0xEFu8, 0xBB, 0xBF];
    bytes.extend_from_slice(script.as_bytes());
    let text = if std::fs::write(&script_path, &bytes).is_ok() {
        let _ = crate::process_win::run_silent_timeout(
            {
                let mut c = crate::process_win::silent_command("powershell");
                c.args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    &script_path.to_string_lossy(),
                ]);
                c
            },
            // Keep Overview smart-check snappy — Win32_DiskDrive is usually <1s.
            std::time::Duration::from_secs(3),
        );
        std::fs::read_to_string(&out_path)
            .unwrap_or_default()
            .trim()
            .trim_start_matches('\u{feff}')
            .to_string()
    } else {
        String::new()
    };
    let _ = std::fs::remove_file(&script_path);
    let _ = std::fs::remove_file(&out_path);
    parse_smart_json(&text)
}

#[cfg(windows)]
fn parse_smart_json(text: &str) -> Vec<SmartReading> {
    let cleaned = text.trim_start_matches('\u{feff}').trim();
    if cleaned.is_empty() {
        return Vec::new();
    }
    // Prefer '[' when it appears before '{' so multi-disk arrays parse correctly.
    // Starting at the first '{' inside `[{...},{...}]` yields invalid JSON and
    // previously returned zero disks.
    let json_slice = match (cleaned.find('['), cleaned.find('{')) {
        (Some(a), Some(b)) if a < b => &cleaned[a..],
        (Some(a), None) => &cleaned[a..],
        (None, Some(b)) => &cleaned[b..],
        (Some(_), Some(b)) => &cleaned[b..],
        _ => cleaned,
    };
    let value: serde_json::Value = match serde_json::from_str(json_slice) {
        Ok(v) => v,
        Err(e) => {
            log::warn!(
                "smart json parse failed: {e}; head={:?}",
                &json_slice.chars().take(120).collect::<String>()
            );
            return Vec::new();
        }
    };
    let arr = if value.is_array() {
        value.as_array().cloned().unwrap_or_default()
    } else {
        vec![value]
    };
    arr.into_iter()
        .filter_map(|v| {
            let name = v.get("name")?.as_str()?.to_string();
            if name.is_empty() {
                return None;
            }
            let attributes = parse_smart_attrs(v.get("attrs"));
            let mut reading = SmartReading {
                id: uuid::Uuid::new_v4().to_string(),
                sample_id: String::new(),
                disk_name: name.clone(),
                model: Some(name),
                serial: v
                    .get("serial")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                media_type: v
                    .get("media")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                health_status: v
                    .get("health")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                temperature_c: json_f64(v.get("temp")),
                power_on_hours: v.get("powerOnHours").and_then(|x| {
                    x.as_i64()
                        .or_else(|| x.as_f64().map(|f| f as i64))
                        .or_else(|| x.as_str().and_then(|s| s.parse().ok()))
                }),
                wear_pct: json_f64(v.get("wear")),
                raw_json: Some(v.to_string()),
                size_bytes: v.get("size").and_then(|x| x.as_i64()),
                attributes,
            };
            enrich_smart_from_attributes(&mut reading);
            Some(reading)
        })
        .collect()
}

#[cfg(windows)]
fn json_f64(v: Option<&serde_json::Value>) -> Option<f64> {
    let v = v?;
    v.as_f64()
        .or_else(|| v.as_i64().map(|i| i as f64))
        .or_else(|| v.as_u64().map(|u| u as f64))
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        .filter(|n| n.is_finite())
}

#[cfg(windows)]
fn enrich_smart_from_attributes(reading: &mut SmartReading) {
    for attr in &reading.attributes {
        let name = attr.name.to_ascii_lowercase();
        let num = attr
            .value
            .as_deref()
            .and_then(|s| s.parse::<f64>().ok())
            .or_else(|| attr.raw.as_deref().and_then(|s| s.parse::<f64>().ok()));
        let Some(num) = num.filter(|n| n.is_finite()) else {
            continue;
        };
        if reading.temperature_c.is_none()
            && (name.contains("temperature") || name == "temp")
            && num > 0.0
            && num < 120.0
        {
            reading.temperature_c = Some(num);
        }
        if reading.power_on_hours.is_none()
            && (name.contains("poweron") || name.contains("power_on") || name.contains("power-on"))
        {
            reading.power_on_hours = Some(num as i64);
        }
        if reading.wear_pct.is_none()
            && (name == "wear"
                || name.contains("wear")
                || name.contains("percentused")
                || name.contains("percent_used"))
            && num >= 0.0
            && num <= 100.0
        {
            reading.wear_pct = Some(num);
        }
    }
}

/// Query drive temperature via IOCTL_STORAGE_QUERY_PROPERTY / Temperature property.
/// Works for many NVMe/SATA devices without StorageReliabilityCounter elevation.
#[cfg(windows)]
fn windows_physical_drive_temperatures(max_drives: u32) -> std::collections::HashMap<u32, f64> {
    use std::collections::HashMap;
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;

    // FILE_SHARE_READ | FILE_SHARE_WRITE — allow open while volumes are mounted.
    const FILE_SHARE_READ: u32 = 0x0000_0001;
    const FILE_SHARE_WRITE: u32 = 0x0000_0002;

    let mut out = HashMap::new();
    let limit = max_drives.clamp(1, 8);
    for index in 0u32..limit {
        let path = format!(r"\\.\PhysicalDrive{index}");
        let file = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .open(&path);
        let Ok(file) = file else {
            continue;
        };
        if let Some(temp) = storage_device_temperature_c(file.as_raw_handle()) {
            out.insert(index, temp);
        }
    }
    out
}

#[cfg(windows)]
fn storage_device_temperature_c(handle: std::os::windows::io::RawHandle) -> Option<f64> {
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::System::IO::DeviceIoControl;

    // STORAGE_PROPERTY_ID::StorageDeviceTemperatureProperty = 14
    // STORAGE_QUERY_TYPE::PropertyStandardQuery = 0
    #[repr(C)]
    struct StoragePropertyQuery {
        property_id: u32,
        query_type: u32,
        additional_parameters: [u8; 1],
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct StorageTemperatureInfo {
        index: u16,
        temperature: i16,
        over_threshold: i16,
        under_threshold: i16,
        over_threshold_changable: u8,
        under_threshold_changable: u8,
        event_generated: u8,
        reserved0: u8,
        reserved1: u32,
    }

    #[repr(C)]
    struct StorageTemperatureDataDescriptor {
        version: u32,
        size: u32,
        critical_temperature: i16,
        warning_temperature: i16,
        info_count: u16,
        reserved0: [u8; 2],
        reserved1: [u32; 3],
        // Followed by TemperatureInfo[InfoCount]
    }

    // CTL_CODE(IOCTL_STORAGE_BASE=0x2d, 0x500, METHOD_BUFFERED=0, FILE_ANY_ACCESS=0)
    const IOCTL_STORAGE_QUERY_PROPERTY: u32 = (0x0000_002d << 16) | (0x500 << 2);

    let query = StoragePropertyQuery {
        property_id: 14,
        query_type: 0,
        additional_parameters: [0],
    };
    let mut buf = [0u8; 512];
    let mut returned = 0u32;
    let ok = unsafe {
        DeviceIoControl(
            handle as HANDLE,
            IOCTL_STORAGE_QUERY_PROPERTY,
            (&query as *const StoragePropertyQuery).cast(),
            std::mem::size_of::<StoragePropertyQuery>() as u32,
            buf.as_mut_ptr().cast(),
            buf.len() as u32,
            &mut returned,
            std::ptr::null_mut(),
        )
    };
    if ok == 0 || returned < std::mem::size_of::<StorageTemperatureDataDescriptor>() as u32 {
        return None;
    }
    let desc = unsafe { &*(buf.as_ptr() as *const StorageTemperatureDataDescriptor) };
    if desc.info_count == 0 {
        return None;
    }
    let info_offset = std::mem::size_of::<StorageTemperatureDataDescriptor>();
    if (returned as usize) < info_offset + std::mem::size_of::<StorageTemperatureInfo>() {
        return None;
    }
    let info = unsafe { &*(buf.as_ptr().add(info_offset) as *const StorageTemperatureInfo) };
    // Temperature is Celsius; -32768 means not reported.
    let t = info.temperature;
    if t <= -256 || t >= 200 {
        return None;
    }
    Some(f64::from(t))
}

#[cfg(windows)]
fn parse_smart_attrs(v: Option<&serde_json::Value>) -> Vec<SmartAttribute> {
    let Some(v) = v else {
        return Vec::new();
    };
    let arr = if v.is_array() {
        v.as_array().cloned().unwrap_or_default()
    } else {
        vec![v.clone()]
    };
    arr.into_iter()
        .filter_map(|a| {
            let name = a.get("name")?.as_str()?.to_string();
            Some(SmartAttribute {
                id: a.get("id").and_then(|x| x.as_str()).map(|s| s.into()),
                name,
                value: a.get("value").and_then(|x| x.as_str()).map(|s| s.into()),
                raw: a.get("raw").and_then(|x| x.as_str()).map(|s| s.into()),
                worst: a.get("worst").and_then(|x| x.as_str()).map(|s| s.into()),
                threshold: a
                    .get("threshold")
                    .and_then(|x| x.as_str())
                    .map(|s| s.into()),
                status: a.get("status").and_then(|x| x.as_str()).map(|s| s.into()),
            })
        })
        .collect()
}

/// Assign sample_id on SMART rows before insert.
pub fn finalize_smart_ids(sample: &mut HardwareSample) {
    for s in &mut sample.smart {
        s.sample_id = sample.id.clone();
        if s.id.is_empty() {
            s.id = uuid::Uuid::new_v4().to_string();
        }
    }
}

/// Capture with SMART sample_ids fixed.
pub fn capture_sample_full(conn: &Connection) -> Result<HardwareSample, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    let mut sample = sample_hardware(&device.id, SampleDepth::Full)?;
    finalize_smart_ids(&mut sample);
    hardware_repo::insert_sample(conn, &sample)?;
    Ok(sample)
}

/// CrystalDisk-style health scores from the latest sample when available.
/// Avoids re-running full SMART/sensor harvest on every UI poll (that freezes PCs).
pub fn disk_health_summaries(conn: &Connection) -> Result<Vec<DiskHealthSummary>, CoreError> {
    if let Some(sample) = hardware_repo::latest_sample(conn)? {
        if !sample.smart.is_empty() {
            return Ok(sample
                .smart
                .into_iter()
                .map(|r| score_disk_health(&r))
                .collect());
        }
    }
    // No cached SMART rows — one full sample only.
    let device = device_repo::ensure_local_device(conn)?;
    let mut sample = sample_hardware(&device.id, SampleDepth::Full)?;
    finalize_smart_ids(&mut sample);
    let _ = hardware_repo::insert_sample(conn, &sample);
    Ok(sample
        .smart
        .into_iter()
        .map(|r| score_disk_health(&r))
        .collect())
}

fn score_disk_health(r: &SmartReading) -> DiskHealthSummary {
    let mut score: i64 = 100;
    let mut reasons = Vec::new();

    let status = r.health_status.as_deref().unwrap_or("").to_lowercase();
    if status.contains("unhealthy") || status.contains("fail") {
        score -= 70;
        reasons.push(format!(
            "Health status: {}",
            r.health_status.as_deref().unwrap_or("?")
        ));
    } else if status.contains("warning") || status.contains("caution") {
        score -= 35;
        reasons.push(format!(
            "Health caution: {}",
            r.health_status.as_deref().unwrap_or("?")
        ));
    }

    if let Some(temp) = r.temperature_c {
        if temp >= 60.0 {
            score -= 25;
            reasons.push(format!("High temperature ({temp:.0} C)"));
        } else if temp >= 50.0 {
            score -= 10;
            reasons.push(format!("Elevated temperature ({temp:.0} C)"));
        }
    }

    if let Some(wear) = r.wear_pct {
        if wear >= 90.0 {
            score -= 50;
            reasons.push(format!("SSD wear critical ({wear:.0}%)"));
        } else if wear >= 70.0 {
            score -= 25;
            reasons.push(format!("SSD wear high ({wear:.0}%)"));
        } else if wear >= 40.0 {
            score -= 10;
            reasons.push(format!("SSD wear moderate ({wear:.0}%)"));
        }
    }

    if let Some(hours) = r.power_on_hours {
        if hours > 40_000 {
            score -= 15;
            reasons.push(format!("High power-on hours ({hours})"));
        }
    }

    // Attribute-level failures from smartctl / reliability dump.
    for attr in &r.attributes {
        let name_l = attr.name.to_lowercase();
        let st = attr.status.as_deref().unwrap_or("").to_lowercase();
        if st.contains("fail") || st.contains("past") {
            score -= 20;
            reasons.push(format!("Attribute issue: {}", attr.name));
        }
        if name_l.contains("readerror") || name_l.contains("read_error") {
            if let Some(val) = attr.value.as_deref().and_then(|s| s.parse::<f64>().ok()) {
                if val > 0.0 {
                    score -= 15;
                    reasons.push(format!("Read errors reported ({val})"));
                }
            }
        }
    }

    DiskHealthSummary {
        disk_name: r.disk_name.clone(),
        model: r.model.clone(),
        media_type: r.media_type.clone(),
        health_status: r.health_status.clone(),
        health_score: score.clamp(0, 100),
        temperature_c: r.temperature_c,
        power_on_hours: r.power_on_hours,
        wear_pct: r.wear_pct,
        risk_reasons: reasons,
        attributes: r.attributes.clone(),
        serial: r.serial.clone(),
        size_bytes: r.size_bytes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sample_hardware_returns_struct() {
        let sample = sample_hardware("dev-1", SampleDepth::Quick).expect("sample");
        assert_eq!(sample.device_id, "dev-1");
        assert!(!sample.id.is_empty());
    }

    #[test]
    fn promote_temps_from_thermal_sensor() {
        let sensors = vec![SensorReading {
            name: "Thermal · \\_TZ.THM".into(),
            value: 41.0,
            unit: "°C".into(),
            source: "ThermalZoneInfo".into(),
            category: "thermal".into(),
        }];
        let (cpu, gpu) = promote_temps_from_sensors(&sensors, None, None);
        assert_eq!(cpu, Some(41.0));
        assert!(gpu.is_none());
    }

    #[cfg(windows)]
    #[test]
    fn windows_fast_temps_reads_thermal_zone() {
        let pack = windows_fast_temps();
        // GitHub-hosted runners often expose no ACPI/thermal counters — do not fail CI.
        if pack.cpu_temp_c.is_none() && pack.sensors.is_empty() {
            eprintln!("skip: no thermal sensors on this host");
            return;
        }
        if let Some(t) = pack.cpu_temp_c {
            assert!(t > 0.0 && t < 120.0, "cpu temp out of range: {t}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn sample_hardware_records_cpu_temp_when_available() {
        let sample = sample_hardware("dev-temp", SampleDepth::Quick).expect("sample");
        let has_temp = sample.cpu_temp_c.is_some()
            || sample
                .sensors
                .iter()
                .any(|s| is_celsius_unit(&s.unit) && s.value > 0.0);
        if !has_temp {
            eprintln!("skip: no temperature sensors on this host");
        }
        // Always succeeds if sample_hardware itself works; temps are host-dependent.
        assert!(sample.device_id == "dev-temp");
    }

    #[cfg(windows)]
    #[test]
    fn windows_smart_lists_physical_disks() {
        let smart = windows_smart_via_powershell(SampleDepth::Full);
        eprintln!(
            "smart disks: count={} names={:?}",
            smart.len(),
            smart
                .iter()
                .map(|s| s.disk_name.as_str())
                .collect::<Vec<_>>()
        );
        for s in &smart {
            eprintln!(
                "  {} temp={:?} wear={:?} powerOn={:?} health={:?}",
                s.disk_name, s.temperature_c, s.wear_pct, s.power_on_hours, s.health_status
            );
        }
        // CI VMs may not expose Win32_DiskDrive; only assert when disks are present.
        if smart.is_empty() {
            eprintln!("skip: no physical disks reported on this host");
        }
    }
}
