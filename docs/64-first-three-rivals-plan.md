# 64. First three rivals — plan & parity bars

**Approved direction:** implement depth toward three specialists first.  
**Rivals:** Process Hacker/Sysinternals · CrystalDiskInfo/WizTree · Everything Search  
**Status:** Complete for testable rival-wave (not infinite specialist parity).

| # | Rival | DeviceLifeline surface | Shipped for testing |
|---|-------|------------------------|---------------------|
| 1 | Process Hacker / Sysinternals | Process Explorer | List/tree/services; modules; threads/handles; end process + process tree kill + audit |
| 2 | CrystalDiskInfo + WizTree | Hardware + Storage | Full reliability/SMART attribute dump + health score; deep folder size map |
| 3 | Everything Search | Universal Search | Scoped file index (80k); hybrid Everything CLI (`es.exe`) when installed; auto-index on first search |

### Specialist-depth wave (implemented for testing)

| Area | Capability | Implementation notes |
|------|------------|----------------------|
| Process | Memory maps | VirtualQueryEx via embedded P/Invoke (elevate for best results) |
| Process | Wait chains | Thread state + WaitReason enumeration |
| Process | Token privileges | OpenProcessToken + privilege list + elevated flag |
| Process | Named handles | NtQuerySystemInformation handle table + NtQueryObject names |
| Disk | SMART without smartctl | Full StorageReliabilityCounter property dump; smartctl if present |
| Search | USN journal | `fsutil usn` + volume walk fallback into FTS |
| Storage | Volume/MFT-style map | High-cap volume accumulator (`get_volume_map`) |

Still later / kernel-tier: raw $MFT parser, boot-time imaging, AV signatures.
