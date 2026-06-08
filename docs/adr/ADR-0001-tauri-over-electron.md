# ADR-0001: Tauri over Electron for the desktop shell

**Date:** 2026-06-07
**Status:** Accepted
**Deciders:** Founding engineering team

## Context

DeviceLifeline is a desktop application that must run a privileged, low-overhead background agent
on consumer and business machines while presenting a modern UI. The two mainstream options for a
web-tech UI desktop app are **Electron** (bundled Chromium + Node) and **Tauri** (system WebView +
Rust core). Resource footprint matters: the agent runs continuously and must be light
(see [07. Non-Functional Requirements](../07-non-functional-requirements.md)).

## Decision

Use **Tauri v2** with a **Rust** core and a **React + TypeScript + Tailwind** UI.

## Rationale

- **Footprint:** Tauri uses the OS WebView (WebView2 on Windows) instead of bundling Chromium,
  yielding dramatically smaller binaries and lower idle RAM — critical for an always-present agent.
- **Native/system access:** The Rust core gives first-class, memory-safe access to Windows APIs
  (registry, WMI, Event Log, performance counters, WinGet) needed by the collectors and engines.
- **Security:** Smaller attack surface, capability-based permissions, no bundled Node runtime.
- **Performance:** Rust is well-suited to the correlation engine, diffing, and collectors.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Electron | Heavy footprint (bundled Chromium), higher idle resource use, less natural native OS access |
| Native (WinUI/C++/C#) | Faster native access but slower UI iteration, weaker cross-platform path to future macOS/Linux |

## Consequences

- We depend on the WebView2 runtime on Windows (preinstalled on Windows 11; bootstrapper for Windows 10).
- The team needs Rust proficiency for the core.
- Cross-platform expansion (macOS/Linux) is feasible later via Tauri + platform-conditional collectors.
