# DeviceLifeline

> **The operating memory of a computer.**

**DeviceLifeline** is a **Computer Operating Intelligence Platform** that helps users understand, restore,
optimize, and manage the complete lifecycle of their computers. Unlike traditional utilities that only show a
computer's *current* state, DeviceLifeline continuously captures the machine's setup, configuration, software
environment, performance changes, hardware health, and system events to build a **living digital history** of
the device — so it always knows *what changed, when, why, what impact it had, and how to recover.*

---

## Why

Computers slow down, crash, and drift. Configurations get lost, dev environments take days to rebuild, and
repair technicians and IT teams have little visibility into a device's history. Existing tools are fragmented
and rarely explain *root causes*. DeviceLifeline gives every computer a memory.

## The product — 9 pillars

| Pillar | In one line |
|---|---|
| **Device DNA Engine** | A complete snapshot of apps, configuration, browser, and dev environment. |
| **One-Click Setup Restore** | Recreate a previous setup on any machine in minutes. |
| **Performance Timeline** | A historical timeline of changes with correlation (e.g., *"Docker installed → startup +35%"*). |
| **AI Detective** | Natural-language troubleshooting with confidence-scored likely causes. |
| **Health Intelligence** | Health scores and predictive failure alerts across CPU/RAM/SSD/GPU/battery/network. |
| **Crash Intelligence** | Event Viewer / BSOD / driver & app crashes translated into plain English. |
| **Recovery Center** | Restore configurations, settings, and environments with rollback. |
| **Technician Edition** | A professional diagnostic toolkit for repair shops and MSPs. |
| **Business Edition** | Device fleet management for IT teams. |

## Technology

Desktop **Tauri** · UI **React + TypeScript + Tailwind CSS** · System core **Rust** · Local DB **SQLite** ·
Cloud **Supabase** · AI **OpenAI / Anthropic** · Installs **WinGet** (Windows) / **Homebrew** (future macOS) ·
Payments **Stripe + Paystack** · Analytics **PostHog** · Crash reporting **Sentry**.

> **Windows is the first-class target.** macOS and Linux are documented as future architecture plans.

---

## 📚 Documentation

This repository currently contains the **complete pre-implementation documentation suite** — 60 documents
covering product, architecture, design, security, operations, and delivery, detailed enough for a senior
engineering team to begin building.

➡️ **Start here: [`docs/README.md`](docs/README.md)** — the full documentation index.

Highlights:
- [Executive Summary](docs/01-executive-summary.md) · [Product Vision](docs/02-product-vision.md) · [MVP Definition](docs/11-mvp-definition.md)
- [System Architecture](docs/30-system-architecture.md) · [Database Design](docs/32-database-design.md) · [API Specification](docs/34-api-specification.md)
- [Performance Timeline Design](docs/23-performance-timeline-design.md) · [AI Diagnostics Design](docs/22-ai-diagnostics-design.md) · [Device DNA Design](docs/24-device-dna-design.md)
- [Final Implementation Roadmap](docs/60-final-implementation-roadmap.md) — the capstone build plan.

## Local MVP scope

The active implementation target is a **Windows-first, local-first MVP**:
Device DNA Engine, software inventory, setup export/import, restore planning with safe simulation-first
execution, Performance Timeline, basic health monitoring, crash event collection, and offline diagnosis.

Cloud sync, auth, payments, subscriptions, fleet management, and paid edition gating are intentionally deferred
until the local MVP is stable enough to test on real Windows devices. See
[Local-First MVP Plan](docs/61-local-first-mvp-plan.md).

## Repository status

🚧 **Local MVP hardening.**
The repo contains the Tauri app, local SQLite schema, Rust collectors, restore/diagnosis/health/crash slices,
and a React UI for the core workflows. See [CONTRIBUTING.md](CONTRIBUTING.md) to build and run it locally
(Windows-first; non-Windows runs use deterministic mock collectors where OS access is unavailable). The broader
cloud-backed product sequence remains documented in the
[Final Implementation Roadmap](docs/60-final-implementation-roadmap.md).

**What is testable locally:**
- Capture a filtered snapshot of restore-relevant installed software (real Windows collectors; deterministic mock elsewhere)
- Persist snapshots + inventory to a local SQLite database with versioned migrations
- Browse snapshots and search the software inventory in the desktop UI
- Capture restore-relevant browser, developer-tool, scheduled-task, hardware, power, and network configuration basics and diff snapshots into timeline events
- Export/import local `.dlsetup` setup bundles with checksum verification
- Create restore plans, simulate restore jobs safely by default, and opt into real WinGet installs explicitly
- Capture basic health samples, crash events, and offline diagnosis findings
- Tauri v2 IPC between the React UI and the Rust core; CI definitions for the frontend and Rust core

**Layout:** `src-tauri/` (Rust core + Tauri), `src/` (React UI), `supabase/` (cloud scaffold for later),
`docs/` (the 60-document suite). See [48. Folder Structure](docs/48-folder-structure-specification.md).

## License

Proprietary — © 2026 DeviceLifeline. All rights reserved. (Placeholder; confirm before any public release.)
