# 61. Local-First MVP Plan

> Implementation alignment note for the current repository. This document narrows the original cloud-backed MVP
> into a Windows-first local MVP that can be tested before cloud sync, auth, and payment systems are introduced.

**Status:** Active implementation target  
**Last updated:** 2026-06-21  
**Related:** [03. PRD](03-product-requirements-document.md), [11. MVP Definition](11-mvp-definition.md), [24. Device DNA Design](24-device-dna-design.md), [25. Restore Engine Design](25-restore-engine-design.md), [60. Final Implementation Roadmap](60-final-implementation-roadmap.md)

---

## Scope

The local MVP must be useful on a single Windows PC without accounts, cloud sync, subscriptions, or payment.

In scope:

- Device DNA snapshots stored in local SQLite.
- Restore-relevant software inventory from Windows sources, with package identity where available.
- Filtered configuration inventory: vendor scheduled tasks, browser extensions, dev tools, hardware, power, and active network basics. Startup entries and services are deferred to a future advanced environment view.
- Local setup export/import using `.dlsetup` bundles with checksum validation.
- Restore plans generated from snapshots.
- Simulation-first restore execution with explicit confirmation before any real WinGet install.
- Performance Timeline events from snapshot diffs, health samples, crash events, and restore jobs.
- Basic health sampling and alerts.
- Basic crash/stability event collection from Windows Event Log.
- Offline diagnosis that explains likely causes from local Device DNA, timeline, health, and crash context.
- Local QA checklist and automated tests for risky flows.

Out of scope until after the local MVP:

- Supabase cloud sync.
- Auth, accounts, organizations, RLS, and device sharing.
- Stripe, Paystack, subscriptions, and entitlement gates.
- Cloud LLM calls, Edge Functions, and server-side AI orchestration.
- Technician, Business, fleet, and multi-device management.
- Public release packaging, signing, and auto-update.

---

## Exit Criteria

The local MVP is ready for hands-on testing when all of the following are true:

- The app builds and launches on a Windows 11 machine.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `cargo fmt`, `cargo clippy`, and `cargo test` pass.
- A user can capture at least two snapshots and see software/config changes reflected in the timeline.
- Snapshot counts are dominated by user/restoration-relevant entries, not Windows inbox apps, framework packages, system services, servicing updates, or Microsoft Windows scheduled tasks.
- Setup export/import round-trips a snapshot and verifies checksum integrity.
- Restore simulation produces a per-step result for every planned app without changing the OS.
- Real install mode is gated behind explicit confirmation and clearly identifies unresolved package IDs.
- Health sampling records CPU, memory, disk usage, and alerts when thresholds are crossed.
- Crash collection returns recent Windows stability events or a clear empty state.
- Offline diagnosis cites local evidence rather than generic advice.
- Manual QA has been completed on at least one non-critical Windows test machine.

---

## Safety Rules

- Restore simulation is the default execution mode.
- Real WinGet installation requires explicit user opt-in in the UI and must not be triggered by tests.
- Unresolved package IDs must be visible in the restore plan before install mode is enabled.
- Collectors must avoid file contents, secrets, credentials, browser history, and personal documents.
- Collectors must suppress Windows system noise by default so snapshots stay useful for recovery planning.
- Cloud/auth/payment placeholders must be labeled as deferred until implemented end to end.

---

## Implementation Phases

1. Validation baseline and restore safety.
2. Device DNA depth: package IDs, Store apps, browser extensions, dev tools, hardware/power/network basics.
3. Timeline depth: restore, health, crash, and richer change event categories.
4. Diagnosis quality: local evidence scoring, clearer suggested actions, and test fixtures.
5. Windows QA pass: clean test machine, restore simulation, selected real WinGet install tests, and regression fixes.

This document should be updated whenever the local MVP boundary changes.
