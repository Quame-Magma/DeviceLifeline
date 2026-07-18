//! Deep process introspection: memory maps, wait chains, tokens, named handles.
//!
//! Implemented via embedded PowerShell + .NET P/Invoke so we stay user-mode and
//! dependency-light. Some fields require SeDebugPrivilege / admin and degrade
//! gracefully when access is denied.

use crate::error::CoreError;
#[cfg(windows)]
use crate::models::ProcessInfo;
use crate::models::{
    MemoryRegion, ProcessDeepDetail, ProcessHandle, ProcessTokenInfo, TokenPrivilege, WaitChainNode,
};
use crate::process::{self, enrich};

/// Full deep detail for a PID.
pub fn get_process_deep(pid: u32) -> Result<ProcessDeepDetail, CoreError> {
    let mut process =
        process::get_process(pid)?.ok_or_else(|| CoreError::NotFound(format!("process {pid}")))?;

    // Ensure modules/threads enrichment already applied by get_process.
    let e = enrich::enrich_process(pid);
    if process.modules.is_empty() && !e.modules.is_empty() {
        process.modules = e.modules;
    }

    #[cfg(windows)]
    {
        let mut deep = windows_deep(pid, process);
        if deep.memory_regions.is_empty()
            && deep.handles.is_empty()
            && deep.token.is_none()
            && deep.wait_chains.is_empty()
        {
            deep.notes.push(
                "Deep introspection returned empty results. Run DeviceLifeline elevated for full access."
                    .into(),
            );
        }
        Ok(deep)
    }

    #[cfg(not(windows))]
    {
        Ok(ProcessDeepDetail {
            process,
            memory_regions: mock_memory(),
            wait_chains: mock_waits(),
            token: Some(ProcessTokenInfo {
                user: Some("mock\\user".into()),
                integrity: Some("Medium".into()),
                elevated: false,
                privileges: vec![TokenPrivilege {
                    name: "SeChangeNotifyPrivilege".into(),
                    enabled: true,
                    description: Some("Bypass traverse checking".into()),
                }],
            }),
            handles: mock_handles(),
            elevated: false,
            notes: vec!["Mock deep detail (non-Windows build).".into()],
        })
    }
}

#[cfg(not(windows))]
fn mock_memory() -> Vec<MemoryRegion> {
    vec![
        MemoryRegion {
            base_address: "0x10000".into(),
            size_bytes: 4096,
            state: "MEM_COMMIT".into(),
            protect: "PAGE_READWRITE".into(),
            region_type: "MEM_PRIVATE".into(),
        },
        MemoryRegion {
            base_address: "0x7FF00000".into(),
            size_bytes: 1_048_576,
            state: "MEM_COMMIT".into(),
            protect: "PAGE_EXECUTE_READ".into(),
            region_type: "MEM_IMAGE".into(),
        },
    ]
}

#[cfg(not(windows))]
fn mock_waits() -> Vec<WaitChainNode> {
    vec![WaitChainNode {
        thread_id: 1,
        status: "Running".into(),
        wait_reason: None,
        detail: Some("No wait".into()),
    }]
}

#[cfg(not(windows))]
fn mock_handles() -> Vec<ProcessHandle> {
    vec![
        ProcessHandle {
            handle: "0x4".into(),
            handle_type: "File".into(),
            name: Some(r"C:\temp\mock.txt".into()),
            access: Some("0x120089".into()),
        },
        ProcessHandle {
            handle: "0x8".into(),
            handle_type: "Key".into(),
            name: Some(r"\REGISTRY\MACHINE\SOFTWARE".into()),
            access: Some("0x20019".into()),
        },
    ]
}

#[cfg(windows)]
fn windows_deep(pid: u32, process: ProcessInfo) -> ProcessDeepDetail {
    let script = format!(
        r#"
$ErrorActionPreference = 'SilentlyContinue'
$pidTarget = {pid}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class DlProcDeep {{
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] public static extern int VirtualQueryEx(IntPtr h, IntPtr addr, out MEMORY_BASIC_INFORMATION mbi, uint len);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool OpenProcessToken(IntPtr p, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool GetTokenInformation(IntPtr token, int classId, IntPtr info, int len, out int ret);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode)] public static extern bool LookupPrivilegeName(string sys, ref long luid, StringBuilder name, ref int size);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool ConvertSidToStringSid(IntPtr sid, out IntPtr str);
  [DllImport("kernel32.dll")] public static extern IntPtr LocalFree(IntPtr h);
  [DllImport("ntdll.dll")] public static extern int NtQuerySystemInformation(int cls, IntPtr buf, int len, out int ret);
  [DllImport("ntdll.dll")] public static extern int NtQueryObject(IntPtr h, int infoClass, IntPtr buf, int len, out int ret);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool DuplicateHandle(IntPtr srcProc, IntPtr src, IntPtr dstProc, out IntPtr dst, uint access, bool inherit, uint options);

  public const uint PROCESS_QUERY_INFORMATION = 0x0400;
  public const uint PROCESS_VM_READ = 0x0010;
  public const uint PROCESS_DUP_HANDLE = 0x0040;
  public const uint TOKEN_QUERY = 0x0008;

  [StructLayout(LayoutKind.Sequential)]
  public struct MEMORY_BASIC_INFORMATION {{
    public IntPtr BaseAddress;
    public IntPtr AllocationBase;
    public uint AllocationProtect;
    public UIntPtr RegionSize;
    public uint State;
    public uint Protect;
    public uint Type;
  }}

  [StructLayout(LayoutKind.Sequential)]
  public struct LUID {{ public uint LowPart; public int HighPart; }}
  [StructLayout(LayoutKind.Sequential)]
  public struct LUID_AND_ATTRIBUTES {{ public LUID Luid; public uint Attributes; }}
  [StructLayout(LayoutKind.Sequential)]
  public struct TOKEN_PRIVILEGES_HDR {{ public uint Count; }}

  public static string StateName(uint s) {{
    if (s == 0x1000) return "MEM_COMMIT";
    if (s == 0x2000) return "MEM_RESERVE";
    if (s == 0x10000) return "MEM_FREE";
    return "0x" + s.ToString("X");
  }}
  public static string ProtectName(uint p) {{
    if (p == 0) return "NONE";
    if ((p & 0x40) != 0) return "PAGE_EXECUTE_READWRITE";
    if ((p & 0x20) != 0) return "PAGE_EXECUTE_READ";
    if ((p & 0x10) != 0) return "PAGE_EXECUTE";
    if ((p & 0x04) != 0) return "PAGE_READWRITE";
    if ((p & 0x02) != 0) return "PAGE_READONLY";
    if ((p & 0x01) != 0) return "PAGE_NOACCESS";
    return "0x" + p.ToString("X");
  }}
  public static string TypeName(uint t) {{
    if (t == 0x20000) return "MEM_PRIVATE";
    if (t == 0x40000) return "MEM_MAPPED";
    if (t == 0x1000000) return "MEM_IMAGE";
    return "0x" + t.ToString("X");
  }}

  public static object Collect(int pid) {{
    var notes = new List<string>();
    var regions = new List<object>();
    var waits = new List<object>();
    var handles = new List<object>();
    object tokenInfo = null;
    bool elevated = false;

    uint access = PROCESS_QUERY_INFORMATION | PROCESS_VM_READ | PROCESS_DUP_HANDLE;
    IntPtr hProc = OpenProcess(access, false, pid);
    if (hProc == IntPtr.Zero) {{
      hProc = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid);
    }}
    if (hProc == IntPtr.Zero) {{
      notes.Add("OpenProcess failed (access denied). Elevate DeviceLifeline for full maps/handles.");
      return new {{ notes = notes.ToArray(), regions = regions.ToArray(), waits = waits.ToArray(), handles = handles.ToArray(), token = tokenInfo, elevated = false }};
    }}

    try {{
      // Memory map
      long addr = 0;
      int maxRegions = 400;
      while (regions.Count < maxRegions) {{
        MEMORY_BASIC_INFORMATION mbi;
        int r = VirtualQueryEx(hProc, new IntPtr(addr), out mbi, (uint)Marshal.SizeOf(typeof(MEMORY_BASIC_INFORMATION)));
        if (r == 0) break;
        ulong size = mbi.RegionSize.ToUInt64();
        if (mbi.State == 0x1000) {{ // COMMIT only for signal
          regions.Add(new {{
            baseAddress = "0x" + mbi.BaseAddress.ToInt64().ToString("X"),
            sizeBytes = (long)size,
            state = StateName(mbi.State),
            protect = ProtectName(mbi.Protect),
            regionType = TypeName(mbi.Type)
          }});
        }}
        long next = mbi.BaseAddress.ToInt64() + (long)size;
        if (next <= addr) break;
        addr = next;
        if (addr < 0) break;
      }}

      // Token / privileges
      IntPtr hTok;
      if (OpenProcessToken(hProc, TOKEN_QUERY, out hTok)) {{
        try {{
          // Elevation type (TokenElevation = 20)
          int ret;
          IntPtr elevBuf = Marshal.AllocHGlobal(4);
          bool isElev = false;
          if (GetTokenInformation(hTok, 20, elevBuf, 4, out ret)) {{
            isElev = Marshal.ReadInt32(elevBuf) != 0;
          }}
          Marshal.FreeHGlobal(elevBuf);
          elevated = isElev;

          // Integrity (TokenIntegrityLevel = 25) simplified
          string integrity = null;
          int need = 0;
          GetTokenInformation(hTok, 25, IntPtr.Zero, 0, out need);
          if (need > 0) {{
            IntPtr ibuf = Marshal.AllocHGlobal(need);
            if (GetTokenInformation(hTok, 25, ibuf, need, out ret)) {{
              // SID starts after DWORD + pointer-sized fields; best-effort label
              integrity = isElev ? "High" : "Medium";
            }}
            Marshal.FreeHGlobal(ibuf);
          }}

          // Privileges (TokenPrivileges = 3)
          var privs = new List<object>();
          need = 0;
          GetTokenInformation(hTok, 3, IntPtr.Zero, 0, out need);
          if (need > 0) {{
            IntPtr pbuf = Marshal.AllocHGlobal(need);
            if (GetTokenInformation(hTok, 3, pbuf, need, out ret)) {{
              int count = Marshal.ReadInt32(pbuf);
              int offset = 4;
              // align on 64-bit
              if (IntPtr.Size == 8) offset = 4; 
              for (int i = 0; i < count && i < 64; i++) {{
                long luid = Marshal.ReadInt64(pbuf, offset);
                uint attr = (uint)Marshal.ReadInt32(pbuf, offset + 8);
                offset += 12;
                if (IntPtr.Size == 8) {{ /* LUID_AND_ATTRIBUTES is 12 + pad */ }}
                var sb = new StringBuilder(256);
                int sz = 256;
                long luidCopy = luid;
                string pname = "privilege";
                if (LookupPrivilegeName(null, ref luidCopy, sb, ref sz)) pname = sb.ToString();
                privs.Add(new {{ name = pname, enabled = (attr & 0x2) != 0, description = (string)null }});
              }}
            }}
            Marshal.FreeHGlobal(pbuf);
          }}

          string userName = null;
          try {{
            var p = System.Diagnostics.Process.GetProcessById(pid);
            // owner via WMI is slower; leave null if unknown
          }} catch {{}}

          tokenInfo = new {{
            user = userName,
            integrity = integrity,
            elevated = isElev,
            privileges = privs.ToArray()
          }};
        }} finally {{ CloseHandle(hTok); }}
      }} else {{
        notes.Add("OpenProcessToken failed.");
      }}

      // Thread wait reasons via Process.Threads
      try {{
        var proc = System.Diagnostics.Process.GetProcessById(pid);
        foreach (System.Diagnostics.ProcessThread t in proc.Threads) {{
          if (waits.Count >= 80) break;
          waits.Add(new {{
            threadId = t.Id,
            status = t.ThreadState.ToString(),
            waitReason = t.ThreadState.ToString() == "Wait" ? t.WaitReason.ToString() : null,
            detail = "ThreadState=" + t.ThreadState.ToString()
          }});
        }}
      }} catch (Exception ex) {{
        notes.Add("Thread enumeration: " + ex.Message);
      }}

      // Named handles via SystemHandleInformation (best-effort, may need admin)
      try {{
        CollectHandles(pid, hProc, handles, notes);
      }} catch (Exception ex) {{
        notes.Add("Handle enumeration: " + ex.Message);
      }}
    }} finally {{
      CloseHandle(hProc);
    }}

    return new {{
      notes = notes.ToArray(),
      regions = regions.ToArray(),
      waits = waits.ToArray(),
      handles = handles.ToArray(),
      token = tokenInfo,
      elevated = elevated
    }};
  }}

  [StructLayout(LayoutKind.Sequential, Pack=1)]
  struct SYSTEM_HANDLE_TABLE_ENTRY_INFO_EX {{
    public IntPtr Object;
    public IntPtr UniqueProcessId;
    public IntPtr HandleValue;
    public uint GrantedAccess;
    public ushort CreatorBackTraceIndex;
    public ushort ObjectTypeIndex;
    public uint HandleAttributes;
    public uint Reserved;
  }}

  static void CollectHandles(int pid, IntPtr hProc, List<object> handles, List<string> notes) {{
    // NtQuerySystemInformation(SystemExtendedHandleInformation = 64)
    int size = 1024 * 1024;
    int retLen;
    IntPtr buf = IntPtr.Zero;
    try {{
      for (int attempt = 0; attempt < 4; attempt++) {{
        buf = Marshal.AllocHGlobal(size);
        int status = NtQuerySystemInformation(64, buf, size, out retLen);
        if (status == 0) break;
        Marshal.FreeHGlobal(buf); buf = IntPtr.Zero;
        if (status != unchecked((int)0xC0000004)) {{ // STATUS_INFO_LENGTH_MISMATCH
          notes.Add("NtQuerySystemInformation handles status=0x" + status.ToString("X"));
          return;
        }}
        size = retLen + 64 * 1024;
      }}
      if (buf == IntPtr.Zero) return;
      long handleCount = Marshal.ReadInt64(buf);
      int entrySize = Marshal.SizeOf(typeof(SYSTEM_HANDLE_TABLE_ENTRY_INFO_EX));
      int offset = IntPtr.Size; // skip count (+pad on x64)
      if (IntPtr.Size == 8) offset = 16; // NumberOfHandles + Reserved
      int matched = 0;
      for (long i = 0; i < handleCount && matched < 120; i++) {{
        IntPtr entryPtr = new IntPtr(buf.ToInt64() + offset + i * entrySize);
        var entry = (SYSTEM_HANDLE_TABLE_ENTRY_INFO_EX)Marshal.PtrToStructure(entryPtr, typeof(SYSTEM_HANDLE_TABLE_ENTRY_INFO_EX));
        if (entry.UniqueProcessId.ToInt64() != pid) continue;
        matched++;
        string hName = null;
        string hType = "Handle";
        IntPtr dup;
        if (DuplicateHandle(hProc, entry.HandleValue, System.Diagnostics.Process.GetCurrentProcess().Handle, out dup, 0, false, 2)) {{
          try {{
            // ObjectNameInformation = 1
            int need = 0;
            NtQueryObject(dup, 1, IntPtr.Zero, 0, out need);
            if (need > 0 && need < 64*1024) {{
              IntPtr nbuf = Marshal.AllocHGlobal(need);
              if (NtQueryObject(dup, 1, nbuf, need, out need) == 0) {{
                // UNICODE_STRING
                short len = Marshal.ReadInt16(nbuf);
                IntPtr strPtr = Marshal.ReadIntPtr(nbuf, IntPtr.Size);
                if (strPtr != IntPtr.Zero && len > 0) {{
                  hName = Marshal.PtrToStringUni(strPtr, len / 2);
                }}
              }}
              Marshal.FreeHGlobal(nbuf);
            }}
            // ObjectTypeInformation = 2
            need = 0;
            NtQueryObject(dup, 2, IntPtr.Zero, 0, out need);
            if (need > 0 && need < 64*1024) {{
              IntPtr tbuf = Marshal.AllocHGlobal(need);
              if (NtQueryObject(dup, 2, tbuf, need, out need) == 0) {{
                short len = Marshal.ReadInt16(tbuf);
                IntPtr strPtr = Marshal.ReadIntPtr(tbuf, IntPtr.Size);
                if (strPtr != IntPtr.Zero && len > 0) {{
                  hType = Marshal.PtrToStringUni(strPtr, len / 2);
                }}
              }}
              Marshal.FreeHGlobal(tbuf);
            }}
          }} finally {{ CloseHandle(dup); }}
        }}
        handles.Add(new {{
          handle = "0x" + entry.HandleValue.ToInt64().ToString("X"),
          handleType = hType,
          name = hName,
          access = "0x" + entry.GrantedAccess.ToString("X")
        }});
      }}
      if (matched == 0) notes.Add("No handles matched for PID (may need elevation).");
    }} finally {{
      if (buf != IntPtr.Zero) Marshal.FreeHGlobal(buf);
    }}
  }}
}}
"@ -ErrorAction Stop

try {{
  $r = [DlProcDeep]::Collect($pidTarget)
  $r | ConvertTo-Json -Compress -Depth 8
}} catch {{
  [pscustomobject]@{{ notes = @($_.Exception.Message); regions = @(); waits = @(); handles = @(); token = $null; elevated = $false }} | ConvertTo-Json -Compress -Depth 5
}}
"#,
        pid = pid
    );

    let output = crate::process_win::silent_command("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .output();

    let mut notes = Vec::new();
    let mut memory_regions = Vec::new();
    let mut wait_chains = Vec::new();
    let mut handles = Vec::new();
    let mut token = None;
    let mut elevated = false;

    match output {
        Ok(out) => {
            let text = String::from_utf8_lossy(&out.stdout);
            let err = String::from_utf8_lossy(&out.stderr);
            if !err.trim().is_empty() {
                // Add-Type noise often goes to stderr; keep short.
                if err.len() < 400 {
                    notes.push(err.trim().to_string());
                }
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(text.trim()) {
                if let Some(arr) = v.get("notes").and_then(|n| n.as_array()) {
                    for n in arr {
                        if let Some(s) = n.as_str() {
                            notes.push(s.to_string());
                        }
                    }
                }
                if let Some(arr) = v.get("regions").and_then(|n| n.as_array()) {
                    for r in arr {
                        memory_regions.push(MemoryRegion {
                            base_address: r
                                .get("baseAddress")
                                .and_then(|x| x.as_str())
                                .unwrap_or("0x0")
                                .into(),
                            size_bytes: r.get("sizeBytes").and_then(|x| x.as_u64()).unwrap_or(0),
                            state: r
                                .get("state")
                                .and_then(|x| x.as_str())
                                .unwrap_or("?")
                                .into(),
                            protect: r
                                .get("protect")
                                .and_then(|x| x.as_str())
                                .unwrap_or("?")
                                .into(),
                            region_type: r
                                .get("regionType")
                                .and_then(|x| x.as_str())
                                .unwrap_or("?")
                                .into(),
                        });
                    }
                }
                if let Some(arr) = v.get("waits").and_then(|n| n.as_array()) {
                    for w in arr {
                        wait_chains.push(WaitChainNode {
                            thread_id: w.get("threadId").and_then(|x| x.as_u64()).unwrap_or(0)
                                as u32,
                            status: w
                                .get("status")
                                .and_then(|x| x.as_str())
                                .unwrap_or("?")
                                .into(),
                            wait_reason: w
                                .get("waitReason")
                                .and_then(|x| x.as_str())
                                .map(|s| s.into()),
                            detail: w.get("detail").and_then(|x| x.as_str()).map(|s| s.into()),
                        });
                    }
                }
                if let Some(arr) = v.get("handles").and_then(|n| n.as_array()) {
                    for h in arr {
                        handles.push(ProcessHandle {
                            handle: h
                                .get("handle")
                                .and_then(|x| x.as_str())
                                .unwrap_or("?")
                                .into(),
                            handle_type: h
                                .get("handleType")
                                .and_then(|x| x.as_str())
                                .unwrap_or("Handle")
                                .into(),
                            name: h.get("name").and_then(|x| x.as_str()).map(|s| s.into()),
                            access: h.get("access").and_then(|x| x.as_str()).map(|s| s.into()),
                        });
                    }
                }
                if let Some(t) = v.get("token") {
                    if !t.is_null() {
                        let mut privileges = Vec::new();
                        if let Some(parr) = t.get("privileges").and_then(|p| p.as_array()) {
                            for p in parr {
                                privileges.push(TokenPrivilege {
                                    name: p
                                        .get("name")
                                        .and_then(|x| x.as_str())
                                        .unwrap_or("?")
                                        .into(),
                                    enabled: p
                                        .get("enabled")
                                        .and_then(|x| x.as_bool())
                                        .unwrap_or(false),
                                    description: p
                                        .get("description")
                                        .and_then(|x| x.as_str())
                                        .map(|s| s.into()),
                                });
                            }
                        }
                        elevated = t.get("elevated").and_then(|x| x.as_bool()).unwrap_or(false);
                        token = Some(ProcessTokenInfo {
                            user: t.get("user").and_then(|x| x.as_str()).map(|s| s.into()),
                            integrity: t
                                .get("integrity")
                                .and_then(|x| x.as_str())
                                .map(|s| s.into()),
                            elevated,
                            privileges,
                        });
                    }
                }
                elevated = v
                    .get("elevated")
                    .and_then(|x| x.as_bool())
                    .unwrap_or(elevated);
            } else if !text.trim().is_empty() {
                notes.push("Failed to parse deep process JSON.".into());
            }
        }
        Err(e) => notes.push(format!("powershell failed: {e}")),
    }

    ProcessDeepDetail {
        process,
        memory_regions,
        wait_chains,
        token,
        handles,
        elevated,
        notes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deep_detail_missing_pid_errors() {
        // Impossibly high PID should not exist.
        let res = get_process_deep(u32::MAX - 7);
        assert!(res.is_err());
    }
}
