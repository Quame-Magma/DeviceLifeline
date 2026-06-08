# ADR-0002: On-device SQLite as the local source of truth

**Date:** 2026-06-07
**Status:** Accepted
**Deciders:** Founding engineering team

## Context

DeviceLifeline captures Device DNA Snapshots, a Performance Timeline, and health samples that must
persist locally, work fully offline, and remain the authoritative on-device record even when cloud
sync is unavailable (see [30. System Architecture](../30-system-architecture.md) and
[32. Database Design](../32-database-design.md)). The cloud backend is **Supabase (Postgres)**.

## Decision

Use **SQLite** (via `rusqlite`, bundled engine) as the embedded on-device store and **local source
of truth**. The Rust core owns all SQLite access behind a `storage/` module. Cloud sync to Supabase
is additive and eventually-consistent, layered on top in a later increment.

## Rationale

- **Offline-first & resilient:** The app must function with no network; local SQLite guarantees this.
- **Zero-ops embedded DB:** No separate service to install or manage on the user's machine.
- **Bundled build:** `rusqlite` with the `bundled` feature compiles SQLite from source — no system
  dependency, consistent across Windows/macOS/Linux.
- **Migrations:** A small, dependency-free migration runner keyed on `PRAGMA user_version` keeps the
  schema versioned without heavyweight tooling at MVP.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| `sqlx` (compile-time checked) | Heavier build + async runtime; revisit post-MVP if async DB access is needed |
| Cloud-only (Supabase as source of truth) | Breaks the offline-first requirement; unacceptable latency for local reads |
| Embedded key-value (sled/redb) | Weaker ad-hoc query story for the timeline and inventory than SQL |

## Consequences

- A documented local↔cloud sync/merge strategy is required when sync lands (later increment).
- The local SQLite schema and the Supabase Postgres schema must be kept deliberately aligned.
- `bundled` SQLite requires a C compiler in the build toolchain (MSVC on Windows; present in CI).
