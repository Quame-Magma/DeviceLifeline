# 66. Rival wave — CCleaner / Revo / AIDA64

**Approved:** Proceed with recommended trio after HWiNFO · Autoruns · DDU.  
**Status:** Implemented

| # | Rival | Surface | Implementation |
|---|--------|---------|----------------|
| 1 | CCleaner / Glary (safer) | **Cleanup** page | Live multi-category scan; category toggles; evidence file list; confirm + audit; temp/cache/logs/browser cache/recycle bin only — **no registry junk** |
| 2 | Revo Uninstaller | **Software → Uninstall** | Registry uninstall strings; run uninstaller; leftover scan (PF/AppData); allowlisted leftover remove + audit |
| 3 | AIDA64 | **Report** page | Full OS inventory (OS/CPU/RAM/disks/GPU/BIOS/net); JSON export; synthetic CPU/disk/memory benches |

### Safety

- Cleanup: allowlisted roots only; no documents/system32; confirm required  
- Uninstall: confirm; leftover delete only under PF/AppData/ProgramData allowlist  
- Benchmarks: clearly labeled synthetic (not SPECint / CrystalDiskMark certified)  
