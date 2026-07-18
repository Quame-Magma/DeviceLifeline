//! AIDA64-class system inventory report + lightweight synthetic benchmarks.

use std::fs;
use std::io::{Read, Write};
use std::time::Instant;

use sysinfo::{Disks, System};

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::{BenchmarkResult, InventoryRow, SystemInventoryReport};

/// Build a full system inventory report (OS-available facts only).
pub fn build_inventory_report() -> Result<SystemInventoryReport, CoreError> {
    let mut rows = Vec::new();
    let mut sys = System::new_all();
    sys.refresh_all();

    // OS
    rows.push(row("Operating System", "Name", System::name().unwrap_or_else(|| "Unknown".into())));
    rows.push(row(
        "Operating System",
        "Version",
        System::os_version().unwrap_or_else(|| "Unknown".into()),
    ));
    rows.push(row(
        "Operating System",
        "Kernel",
        System::kernel_version().unwrap_or_else(|| "Unknown".into()),
    ));
    rows.push(row(
        "Operating System",
        "Hostname",
        System::host_name().unwrap_or_else(|| "Unknown".into()),
    ));
    rows.push(row(
        "Operating System",
        "Uptime (hours)",
        format!("{:.1}", System::uptime() as f64 / 3600.0),
    ));

    // CPU
    let cpus = sys.cpus();
    if let Some(cpu0) = cpus.first() {
        rows.push(row("CPU", "Brand", cpu0.brand().to_string()));
        rows.push(row("CPU", "Vendor", cpu0.vendor_id().to_string()));
        rows.push(row(
            "CPU",
            "Frequency (MHz)",
            format!("{}", cpu0.frequency()),
        ));
    }
    rows.push(row("CPU", "Logical processors", format!("{}", cpus.len())));
    rows.push(row("CPU", "Architecture", sysinfo::System::cpu_arch()));

    // Memory
    let total = sys.total_memory();
    let used = sys.used_memory();
    rows.push(row(
        "Memory",
        "Total (GB)",
        format!("{:.2}", total as f64 / (1024.0 * 1024.0 * 1024.0)),
    ));
    rows.push(row(
        "Memory",
        "Used (GB)",
        format!("{:.2}", used as f64 / (1024.0 * 1024.0 * 1024.0)),
    ));
    rows.push(row(
        "Memory",
        "Usage %",
        if total > 0 {
            format!("{:.1}", (used as f64 / total as f64) * 100.0)
        } else {
            "0".into()
        },
    ));

    // Disks
    let disks = Disks::new_with_refreshed_list();
    for (i, d) in disks.list().iter().enumerate() {
        let total_b = d.total_space();
        let avail = d.available_space();
        let mount = d.mount_point().display().to_string();
        let name = d.name().to_string_lossy().to_string();
        let fs = d.file_system().to_string_lossy().to_string();
        let prefix = format!("Disk {i} ({mount})");
        rows.push(row(&prefix, "Name", name));
        rows.push(row(&prefix, "File system", fs));
        rows.push(row(
            &prefix,
            "Total (GB)",
            format!("{:.1}", total_b as f64 / 1e9),
        ));
        rows.push(row(
            &prefix,
            "Free (GB)",
            format!("{:.1}", avail as f64 / 1e9),
        ));
        rows.push(row(
            &prefix,
            "Removable",
            if d.is_removable() { "Yes" } else { "No" }.into(),
        ));
    }

    // GPU / extra via PowerShell on Windows
    #[cfg(windows)]
    {
        for r in windows_extra_rows() {
            rows.push(r);
        }
    }

    // Software count (quick registry sample is expensive; use process count as live)
    let software_count = {
        #[cfg(windows)]
        {
            crate::uninstall::list_installed_apps()
                .map(|a| a.len() as i64)
                .unwrap_or(0)
        }
        #[cfg(not(windows))]
        {
            0i64
        }
    };
    rows.push(row(
        "Software",
        "Installed apps (uninstall registry)",
        format!("{software_count}"),
    ));
    rows.push(row(
        "Processes",
        "Running",
        format!("{}", sys.processes().len()),
    ));

    let summary = format!(
        "{} · {} logical CPU · {:.0} GB RAM · {} disk(s) · {software_count} apps",
        System::name().unwrap_or_else(|| "PC".into()),
        cpus.len(),
        total as f64 / (1024.0 * 1024.0 * 1024.0),
        disks.list().len(),
    );

    Ok(SystemInventoryReport {
        captured_at: now_rfc3339()?,
        rows,
        software_count,
        summary,
    })
}

/// Run lightweight synthetic benchmarks: `cpu`, `disk`, or `all`.
pub fn run_benchmark(kind: Option<String>) -> Result<Vec<BenchmarkResult>, CoreError> {
    let k = kind.unwrap_or_else(|| "all".into()).to_ascii_lowercase();
    let mut out = Vec::new();
    if k == "cpu" || k == "all" {
        out.push(bench_cpu());
    }
    if k == "disk" || k == "all" {
        out.push(bench_disk()?);
    }
    if k == "memory" || k == "all" {
        out.push(bench_memory());
    }
    if out.is_empty() {
        return Err(CoreError::Internal(
            "unknown benchmark kind (use cpu, disk, memory, or all)".into(),
        ));
    }
    Ok(out)
}

fn row(section: &str, key: &str, value: String) -> InventoryRow {
    InventoryRow {
        section: section.into(),
        key: key.into(),
        value,
    }
}

fn bench_cpu() -> BenchmarkResult {
    let start = Instant::now();
    // Synthetic integer + float work (not SPECint — relative score).
    let mut acc: u64 = 0;
    let mut f: f64 = 1.000001;
    for i in 0..25_000_000u64 {
        acc = acc.wrapping_mul(1664525).wrapping_add(i).wrapping_add(1013904223);
        f = f.sin().cos().abs() + 1.0000001;
    }
    let ms = start.elapsed().as_millis() as i64;
    let score = if ms > 0 {
        (25_000_000.0 / ms as f64) * 10.0
    } else {
        0.0
    };
    // Keep acc/f live so optimizer cannot eliminate the loop.
    let detail = format!("acc={acc} f={f:.6} (synthetic; higher score is better)");
    BenchmarkResult {
        kind: "cpu".into(),
        label: "CPU synthetic".into(),
        score,
        unit: "ops/ms ×10".into(),
        duration_ms: ms,
        detail,
    }
}

fn bench_disk() -> Result<BenchmarkResult, CoreError> {
    let dir = std::env::temp_dir().join("devicelifeline-bench");
    let _ = fs::create_dir_all(&dir);
    let path = dir.join("bench.bin");
    let size: usize = 32 * 1024 * 1024; // 32 MiB
    let buf = vec![0xA5u8; 64 * 1024];

    let start = Instant::now();
    {
        let mut f = fs::File::create(&path).map_err(|e| CoreError::Internal(e.to_string()))?;
        let mut written = 0usize;
        while written < size {
            f.write_all(&buf)
                .map_err(|e| CoreError::Internal(e.to_string()))?;
            written += buf.len();
        }
        f.sync_all().ok();
    }
    let write_ms = start.elapsed().as_millis() as i64;

    let start_r = Instant::now();
    {
        let mut f = fs::File::open(&path).map_err(|e| CoreError::Internal(e.to_string()))?;
        let mut scratch = vec![0u8; 64 * 1024];
        loop {
            let n = f
                .read(&mut scratch)
                .map_err(|e| CoreError::Internal(e.to_string()))?;
            if n == 0 {
                break;
            }
        }
    }
    let read_ms = start_r.elapsed().as_millis() as i64;
    let _ = fs::remove_file(&path);

    let write_mb_s = if write_ms > 0 {
        (size as f64 / (1024.0 * 1024.0)) / (write_ms as f64 / 1000.0)
    } else {
        0.0
    };
    let read_mb_s = if read_ms > 0 {
        (size as f64 / (1024.0 * 1024.0)) / (read_ms as f64 / 1000.0)
    } else {
        0.0
    };
    let score = (write_mb_s + read_mb_s) / 2.0;

    Ok(BenchmarkResult {
        kind: "disk".into(),
        label: "Disk sequential (temp)".into(),
        score,
        unit: "MB/s avg".into(),
        duration_ms: write_ms + read_ms,
        detail: format!(
            "32 MiB write {write_mb_s:.1} MB/s · read {read_mb_s:.1} MB/s on {}",
            dir.display()
        ),
    })
}

fn bench_memory() -> BenchmarkResult {
    let start = Instant::now();
    let size = 64 * 1024 * 1024usize;
    let mut a = vec![1u8; size];
    let mut b = vec![2u8; size];
    for _ in 0..4 {
        for i in 0..size {
            a[i] = a[i].wrapping_add(b[i]);
        }
        std::mem::swap(&mut a, &mut b);
    }
    let ms = start.elapsed().as_millis() as i64;
    let score = if ms > 0 {
        (size as f64 * 4.0 / (1024.0 * 1024.0)) / (ms as f64 / 1000.0)
    } else {
        0.0
    };
    let checksum = a.iter().map(|&x| x as u64).sum::<u64>();
    BenchmarkResult {
        kind: "memory".into(),
        label: "Memory bandwidth (synthetic)".into(),
        score,
        unit: "MB/s".into(),
        duration_ms: ms,
        detail: format!("64 MiB × 4 passes · checksum={checksum}"),
    }
}

#[cfg(windows)]
fn windows_extra_rows() -> Vec<InventoryRow> {
    let script = r#"
$ErrorActionPreference='SilentlyContinue'
$rows = @()
try {
  $cs = Get-CimInstance Win32_ComputerSystem
  if ($cs) {
    $rows += [pscustomobject]@{ section='System'; key='Manufacturer'; value=[string]$cs.Manufacturer }
    $rows += [pscustomobject]@{ section='System'; key='Model'; value=[string]$cs.Model }
    $rows += [pscustomobject]@{ section='System'; key='Total physical memory (GB)'; value=[math]::Round($cs.TotalPhysicalMemory/1GB,2).ToString() }
  }
} catch {}
try {
  $bb = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
  if ($bb) {
    $rows += [pscustomobject]@{ section='Motherboard'; key='Manufacturer'; value=[string]$bb.Manufacturer }
    $rows += [pscustomobject]@{ section='Motherboard'; key='Product'; value=[string]$bb.Product }
  }
} catch {}
try {
  Get-CimInstance Win32_VideoController | Where-Object { $_.Name } | Select-Object -First 3 | ForEach-Object {
    $rows += [pscustomobject]@{ section='GPU'; key='Name'; value=[string]$_.Name }
    if ($_.AdapterRAM -gt 0) {
      $rows += [pscustomobject]@{ section='GPU'; key='Adapter RAM (GB)'; value=[math]::Round($_.AdapterRAM/1GB,2).ToString() }
    }
    if ($_.DriverVersion) {
      $rows += [pscustomobject]@{ section='GPU'; key='Driver'; value=[string]$_.DriverVersion }
    }
  }
} catch {}
try {
  Get-CimInstance Win32_NetworkAdapter -Filter 'NetEnabled=true' | Select-Object -First 6 | ForEach-Object {
    $rows += [pscustomobject]@{ section='Network'; key=$_.Name; value=([string]$_.MACAddress) }
  }
} catch {}
try {
  Get-CimInstance Win32_BIOS | Select-Object -First 1 | ForEach-Object {
    $rows += [pscustomobject]@{ section='BIOS'; key='Manufacturer'; value=[string]$_.Manufacturer }
    $rows += [pscustomobject]@{ section='BIOS'; key='Version'; value=[string]$_.SMBIOSBIOSVersion }
    $rows += [pscustomobject]@{ section='BIOS'; key='Release date'; value=[string]$_.ReleaseDate }
  }
} catch {}
$rows | ConvertTo-Json -Compress
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
            Some(InventoryRow {
                section: v.get("section")?.as_str()?.into(),
                key: v.get("key")?.as_str()?.into(),
                value: v.get("value")?.as_str()?.into(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inventory_builds() {
        let r = build_inventory_report().expect("report");
        assert!(!r.rows.is_empty());
        assert!(!r.summary.is_empty());
    }

    #[test]
    fn cpu_bench_runs() {
        let b = bench_cpu();
        assert_eq!(b.kind, "cpu");
        assert!(b.duration_ms >= 0);
    }
}
