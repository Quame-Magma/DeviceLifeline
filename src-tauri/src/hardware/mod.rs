//! Hardware Intelligence: temps, GPU, clocks, SMART / reliability.

use rusqlite::Connection;
use sysinfo::{Components, System};

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::{
    DiskHealthSummary, HardwareSample, SensorReading, SmartAttribute, SmartReading,
};
use crate::storage::{device_repo, hardware_repo};

/// Captures a hardware sample (OS I/O first, then short DB write).
pub fn capture_sample(conn: &Connection) -> Result<HardwareSample, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    let sample = sample_hardware(&device.id)?;
    hardware_repo::insert_sample(conn, &sample)?;
    Ok(sample)
}

/// Pure collection without persistence.
pub fn sample_hardware(device_id: &str) -> Result<HardwareSample, CoreError> {
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
    let (gpu_name, gpu_usage_pct, gpu_vram_used, gpu_vram_total) = sample_gpu();
    let smart = sample_smart()?;
    let mut sensors = component_notes_to_sensors(&component_notes);

    // HWiNFO-class Windows sensor pack (thermal zones, GPU load, fans).
    // Re-bind temps/usage only on Windows so non-Windows builds stay free of unused_mut.
    #[cfg(windows)]
    let (cpu_temp_c, gpu_temp_c, gpu_usage_pct) = {
        let mut cpu_temp_c = cpu_temp_c;
        let mut gpu_temp_c = gpu_temp_c;
        let mut gpu_usage_pct = gpu_usage_pct;
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
    if ($c -gt 200) { $c = $c - 273 } # some expose Kelvin
    if ($c -lt 0 -or $c -gt 150) { continue }
    $name = if ($z.Name) { "Thermal · $($z.Name)" } else { 'Thermal zone info' }
    Add-S $name $c '°C' 'ThermalZoneInfo' 'thermal'
    if ($null -eq $cpuTemp) { $cpuTemp = $c }
  }
} catch {}

# --- LibreHardwareMonitor / OpenHardwareMonitor WMI if installed ---
foreach ($ns in @('root/LibreHardwareMonitor','root/OpenHardwareMonitor')) {
  try {
    foreach ($s in (Get-CimInstance -Namespace $ns -ClassName Sensor -EA SilentlyContinue | Select-Object -First 400)) {
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
    let mut pack = WindowsSensorPack {
        cpu_temp_c: None,
        gpu_temp_c: None,
        gpu_usage_pct: None,
        sensors: Vec::new(),
    };
    let output = crate::process_win::silent_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output();
    let Ok(output) = output else {
        return pack;
    };
    if !output.status.success() {
        return pack;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let Ok(v) = serde_json::from_str::<serde_json::Value>(text.trim()) else {
        return pack;
    };
    pack.cpu_temp_c = v.get("cpuTemp").and_then(|x| x.as_f64());
    pack.gpu_temp_c = v.get("gpuTemp").and_then(|x| x.as_f64());
    pack.gpu_usage_pct = v.get("gpuUsage").and_then(|x| x.as_f64());
    if let Some(arr) = v.get("sensors").and_then(|s| s.as_array()) {
        for item in arr {
            let Some(name) = item.get("name").and_then(|x| x.as_str()) else {
                continue;
            };
            let Some(value) = item.get("value").and_then(|x| x.as_f64()) else {
                continue;
            };
            pack.sensors.push(SensorReading {
                name: name.to_string(),
                value,
                unit: item
                    .get("unit")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string(),
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
    let output = crate::process_win::silent_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .ok()?;
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

fn sample_smart() -> Result<Vec<SmartReading>, CoreError> {
    #[cfg(windows)]
    {
        Ok(windows_smart_via_powershell())
    }
    #[cfg(not(windows))]
    {
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
fn windows_smart_via_powershell() -> Vec<SmartReading> {
    // Full reliability counter dump + physical disk identity.
    let script = r#"
$ErrorActionPreference='SilentlyContinue'
$out = @()
foreach ($d in (Get-PhysicalDisk)) {
  $rel = $null
  try { $rel = $d | Get-StorageReliabilityCounter } catch {}
  $attrs = @()
  if ($rel) {
    $props = $rel.PSObject.Properties | Where-Object {
      $_.Name -notin @('PSComputerName','CimClass','CimInstanceProperties','CimSystemProperties','ObjectId','PassThroughClass','PassThroughIds','PassThroughNamespace','PassThroughServer','UniqueId')
    }
    foreach ($p in $props) {
      if ($null -eq $p.Value) { continue }
      $attrs += [pscustomobject]@{
        id = $null
        name = [string]$p.Name
        value = [string]$p.Value
        raw = [string]$p.Value
        worst = $null
        threshold = $null
        status = 'OK'
      }
    }
  }
  $out += [pscustomobject]@{
    name = $d.FriendlyName
    media = [string]$d.MediaType
    health = [string]$d.HealthStatus
    serial = [string]$d.SerialNumber
    size = [int64]$d.Size
    temp = if ($rel) { $rel.Temperature } else { $null }
    powerOnHours = if ($rel) { $rel.PowerOnHours } else { $null }
    wear = if ($rel) { $rel.Wear } else { $null }
    readErrors = if ($rel) { $rel.ReadErrorsTotal } else { $null }
    writeErrors = if ($rel) { $rel.WriteErrorsTotal } else { $null }
    attrs = $attrs
  }
}
# Optional smartctl if present (full classic SMART).
$smartctl = Get-Command smartctl -ErrorAction SilentlyContinue
if ($smartctl) {
  try {
    $sc = & smartctl -A -j /dev/sda 2>$null | ConvertFrom-Json
    if ($sc.ata_smart_attributes.table) {
      $scAttrs = @()
      foreach ($a in $sc.ata_smart_attributes.table) {
        $scAttrs += [pscustomobject]@{
          id = [string]$a.id
          name = [string]$a.name
          value = [string]$a.value
          raw = [string]$a.raw.value
          worst = [string]$a.worst
          threshold = [string]$a.thresh
          status = if ($a.when_failed) { [string]$a.when_failed } else { 'OK' }
        }
      }
      if ($out.Count -gt 0) { $out[0].attrs = $scAttrs }
    }
  } catch {}
}
$out | ConvertTo-Json -Compress -Depth 6
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
            let name = v.get("name")?.as_str()?.to_string();
            let attributes = parse_smart_attrs(v.get("attrs"));
            Some(SmartReading {
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
                temperature_c: v.get("temp").and_then(|x| x.as_f64()),
                power_on_hours: v.get("powerOnHours").and_then(|x| x.as_i64()),
                wear_pct: v.get("wear").and_then(|x| x.as_f64()),
                raw_json: Some(v.to_string()),
                size_bytes: v.get("size").and_then(|x| x.as_i64()),
                attributes,
            })
        })
        .collect()
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
    let mut sample = sample_hardware(&device.id)?;
    finalize_smart_ids(&mut sample);
    hardware_repo::insert_sample(conn, &sample)?;
    Ok(sample)
}

/// CrystalDisk-style health scores with full attribute dump (live collect).
pub fn disk_health_summaries(conn: &Connection) -> Result<Vec<DiskHealthSummary>, CoreError> {
    // Always sample live so reliability/SMART attributes are complete for testing.
    let device = device_repo::ensure_local_device(conn)?;
    let mut sample = sample_hardware(&device.id)?;
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
        let sample = sample_hardware("dev-1").expect("sample");
        assert_eq!(sample.device_id, "dev-1");
        assert!(!sample.id.is_empty());
    }
}
