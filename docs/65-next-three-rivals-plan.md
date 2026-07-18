# 65. Next three rivals — HWiNFO · Autoruns · DDU

**Approved direction:** full OS-level rival depth (not marketing “subset”).  
**Rivals:** HWiNFO · Sysinternals Autoruns · Display Driver Uninstaller  
**Status:** Full implementation against every *available OS / vendor tool surface* — without shipping ring-0 sensor drivers or unsigned kernel hooks.

| # | Rival | DeviceLifeline surface | Full implementation |
|---|-------|------------------------|---------------------|
| 1 | HWiNFO | Hardware → Sensors | ACPI thermal, ThermalZoneInfo, PDH CPU/GPU/mem, LHM/OHM WMI if installed, nvidia-smi, Win32 fan/probe/battery/processor, SMART disk temps; structured `sensors[]` |
| 2 | Autoruns | **Startup** | Logon (Run/RunOnce/RunOnceEx/Policies), Startup folders, **all** scheduled tasks, **all** services (+ protected read-only), kernel drivers, Winlogon, AppInit, IFEO, BootExecute, KnownDLLs, LSA, Winsock, print monitors, network providers, codecs, BHOs, ShellExecuteHooks, WMI consumers |
| 3 | DDU | Drivers → GPU clean | Checklist · restore-point gate · elevated · stop vendor GPU services · `pnputil /remove-device` display instances · `pnputil /delete-driver oemXX.inf` · audit |

### Safety bars (still required for “full”)

- No faked sensor values when no source exposes them (same as honest HWiNFO offline chips).
- Startup toggles: `confirm=true` + audit; critical services / Userinit / Shell protected.
- GPU clean: elevation + completed restore point + checklist + `confirm=true`; OEM + display-instance allowlists only.
- We do **not** ship a custom kernel sensor driver or force Safe Mode without the user (DDU-the-app is separate software).

### What “full” means vs HWiNFO binary

HWiNFO’s exclusive value is **its own ring-0 driver** reading EC/SMBus chips. We implement **full coverage of every public OS and vendor path** (including LHM/nvidia-smi when present). That is the correct product boundary for a Tauri app without redistributing proprietary kernel drivers.
