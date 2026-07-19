# 67. Ops Center UI redesign & sensor collection notes

> Documents the mid-2026 ops-center UI polish (Health, Performance, Storage) and the Windows sensor /
> SMART collection behavior that power those screens. Part of the DeviceLifeline documentation suite —
> see [Documentation Index](README.md).

**Status:** Implemented in tree (v0.3.x)  
**Date:** 2026-07-19  
**Related:** [50. UI/UX Specification](50-ui-ux-specification.md), [63. Competitive Parity](63-competitive-parity-and-improvement-plan.md), [65. Next Three Rivals](65-next-three-rivals-plan.md)

---

## 1. Purpose

Bring the desktop ops shell closer to the product mocks for **Health**, **Performance** (hardware),
and **Storage**, while making hardware/SMART sampling reliable under Windows’ constrained APIs
(silent PowerShell, optional elevation).

---

## 2. UI surface (what shipped)

### Shared shell

- Pages use `PageShell` with Overview-class density (consistent gutters, panel headers, action rows).
- Global client pagination is **5 items per page** (`DEFAULT_PAGE_SIZE` in `src/hooks/use-pagination.ts`).
- Professional **confirm / prompt / toast** feedback replaces `window.confirm` for destructive flows.
- Shared `MiniSparkline` (`src/components/common/MiniSparkline.tsx`) for metric tiles and sensor trends.

### Health

- Score ring (HEALTH SCORE), status pill, icon resource bars (CPU / Memory / Disk).
- Four sparkline metric tiles (Status / CPU / Memory / Disk).
- Recent samples table with **score pills**.
- Open alerts with severity styling, tip strip, and cleanup CTA navigation.

### Performance (`HardwareCenter`)

- Four spark metric tiles: CPU temp, CPU clock, GPU temp, GPU usage.
- **Sensors** table: icon, category, value, source, trend sparkline.
- **SMART Disks** compact table: disk identity, health badge, temp, wear bar.
- **Disk health** scored rows: Status · Temperature · Power-on Hours · Wear · Score box; expandable SMART attributes when present.
- Tip bar for drive temperature guidance.

### Storage

- **Per-volume hero cards** for every mounted logical drive (C:, D:, remmovable, etc.); cards refresh on an interval so newly inserted media appear.
- Click a volume card to select it for folder/volume map actions.
- Folder map controls + treemap when built.
- Scan stats, category breakdown with progress bars, largest files (5/page).
- Safe cleanup preview/execute wiring; dismissible tip bar.

---

## 3. Hardware / SMART collection (Windows)

### Temperature (CPU)

Sources, in order of preference:

1. `sysinfo` component sensors when available.
2. Fast PowerShell thermal pack written to a **result file** (CREATE_NO_WINDOW stdout is unreliable):
   - `Win32_PerfFormattedData_Counters_ThermalZoneInformation` (Kelvin → °C).
   - `MSAcpi_ThermalZoneTemperature` when permitted (often elevation).
   - `nvidia-smi` when present.
   - LibreHardwareMonitor / OpenHardwareMonitor WMI namespaces when installed.
3. Full sensor bag; promote best °C reading into `cpu_temp_c` if still empty.
4. UI falls back to sensor bag for display if top-level fields are null.

**Note:** Package-level CPU die temp is often unavailable without LHM or vendor tools. Thermal-zone °C is used as a consumer-grade stand-in when package sensors are missing.

### GPU

- Name / VRAM via `Win32_VideoController` and PDH GPU engine counters.
- Temp/usage via `nvidia-smi` or LHM when present; Intel iGPU die temp is frequently **unavailable**.

### SMART / Disk health

Pipeline:

1. Ship `src-tauri/scripts/smart_probe.ps1` via `include_str!`; run under silent PowerShell with `DL_SMART_OUT` pointing at a temp JSON file.
2. Enumerate disks with `Get-PhysicalDisk`, then CIM `MSFT_PhysicalDisk`, then `Win32_DiskDrive`.
3. Attach `Get-StorageReliabilityCounter` fields when the OS allows (often **requires elevation**).
4. Optionally enrich temperature via `IOCTL_STORAGE_QUERY_PROPERTY` / StorageDeviceTemperatureProperty when `\\.\PhysicalDriveN` can be opened.
5. Persist rows on `smart_readings`; disk health scores derive from live sample + reliability signals.

**Known gaps (honest):**

| Signal | Without elevation | With elevation (typical) |
|--------|-------------------|---------------------------|
| Disk name / media / Healthy | Yes | Yes |
| Health score | Partial (status-based) | Stronger with wear/temp |
| Temperature | Sometimes (IOCTL / counters) | More reliable |
| Wear % / power-on hours | Often blocked | Usually available |

### Pagination JSON bug (fixed)

SMART JSON arrays were incorrectly sliced starting at the first `{` instead of `[`, which produced **zero disks** in the UI even when the probe file contained valid data. Arrays are now preferred when `[` appears before `{`.

---

## 4. Elevation & silent process rules

- Child tools use `CREATE_NO_WINDOW` / `process_win::silent_command` so helper consoles do not flash.
- The main app is a Windows GUI subsystem binary so elevated relaunches do not open a black console.
- UAC elevation unlocks reliability counters and some ACPI thermal zones; it does not replace missing iGPU sensors.

---

## 5. Developer commands

```bash
pnpm tauri dev
# If disk-full on C:, point Cargo cache elsewhere:
#   $env:CARGO_TARGET_DIR = "D:\cargo-target\devicelifeline"

cargo test --manifest-path src-tauri/Cargo.toml --lib hardware::tests
pnpm run typecheck
```

Production packages (when built): `pnpm tauri build` → installer artifacts under the Cargo target / release folder.

---

## 6. Acceptance criteria

- [x] Health mock layout: score ring, bars, spark tiles, score pills, alerts.
- [x] Performance mock layout: spark tiles, sensors, SMART, disk health.
- [x] Storage multi-drive heroes + map + scan breakdown.
- [x] Pagination default 5 items/page app-wide.
- [x] CPU thermal zone sampling works without admin on typical Win10/11.
- [x] SMART disks list identity without admin; reliability fields when allowed.
- [x] SMART multi-disk JSON arrays parse correctly.

---

## 7. Future work

- Deeper SMART attribute tables (CrystalDisk-class).
- Optional LibreHardwareMonitor sidecar for package/GPU die temps.
- Admin-gated “full reliability refresh” button with clear UX copy when fields are blank.
- Persist disk temperature history for sparklines independent of full hardware samples.
