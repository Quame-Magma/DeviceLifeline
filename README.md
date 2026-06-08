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

## MVP scope (V1)

Device DNA Engine · Software Inventory · Setup Export · Setup Restore · Performance Timeline ·
Basic Health Monitoring · Basic AI Diagnosis. *Everything else is post-MVP and labeled as such in the docs.*

## Repository status

🚧 **Increment 1 — Foundation + first vertical slice.**
The repo contains a runnable scaffold plus the first feature slice: **Device DNA snapshot capture
for installed software → SQLite → Tauri IPC → a Snapshots UI.** See [CONTRIBUTING.md](CONTRIBUTING.md)
to build and run it locally (Windows-first; non-Windows runs use a mock software collector). The full
build sequence is in the [Final Implementation Roadmap](docs/60-final-implementation-roadmap.md).

**What works in Increment 1:**
- Capture a snapshot of installed software (real Windows registry collector; deterministic mock elsewhere)
- Persist snapshots + inventory to a local SQLite database with versioned migrations
- Browse snapshots and search the software inventory in the desktop UI
- Tauri v2 IPC between the React UI and the Rust core; CI for the frontend and the Rust core (Linux + Windows)

**Layout:** `src-tauri/` (Rust core + Tauri), `src/` (React UI), `supabase/` (cloud scaffold for later),
`docs/` (the 60-document suite). See [48. Folder Structure](docs/48-folder-structure-specification.md).

## License

Proprietary — © 2026 DeviceLifeline. All rights reserved. (Placeholder; confirm before any public release.)
