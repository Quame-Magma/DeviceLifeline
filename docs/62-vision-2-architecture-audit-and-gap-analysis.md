# 62. Vision 2.0 — Architecture Audit & Gap Analysis

> Bridging the **DeviceLifeline Vision 2.0** (PC Intelligence Platform) with the **existing local-first MVP**.
>
> **Status:** Active strategic baseline  
> **Date:** 2026-07-16  
> **Scope:** Architecture review, gap analysis, redesign proposal, expansion roadmap  
> **Related:** [61. Local-First MVP Plan](61-local-first-mvp-plan.md), [30. System Architecture](30-system-architecture.md), [60. Final Implementation Roadmap](60-final-implementation-roadmap.md)

---

## 1. Executive verdict

| Dimension | Assessment |
|-----------|------------|
| **MVP quality** | Strong for a local-first Windows slice — real collectors, SQLite, Tauri IPC, restore safety, tests |
| **Product identity** | Still closer to “device memory + recovery + basic health” than “AI systems engineer for the PC” |
| **Architecture fitness** | Solid foundation to *extend*; not adequate yet for continuous multi-engine observability |
| **Biggest risk** | Expanding feature surface without a shared **intelligence bus** → utility-suite fragmentation |
| **Recommended posture** | **Evolve, do not rewrite.** Introduce a domain-engine + event-bus spine; deepen engines module-by-module |

**One-line positioning gap**

| Today | Vision 2.0 target |
|-------|-------------------|
| The operating *memory* of a computer | The operating *intelligence* of a computer |

Memory is necessary. Intelligence requires continuous observation, causal ranking, safe automation, and a copilot that *executes* — not only explains.

---

## 2. Current MVP inventory (as implemented)

### 2.1 Stack (confirmed)

| Layer | Choice | Notes |
|-------|--------|-------|
| Shell | Tauri 2 | Correct ADR; keep |
| Core | Rust | ~6.9k LOC under `src-tauri/src` |
| UI | React 18 + TS + Tailwind + Zustand | ~7.2k LOC under `src` |
| Local DB | SQLite + SQL migrations | 10 migrations, 15 tables |
| Cloud | Supabase scaffold only | Sync queue is placeholder |
| AI | Offline `HeuristicProvider` | No cloud LLM; rule-based |
| Install | WinGet + dry-run default | Safe simulation-first |

### 2.2 Implemented product surfaces

| Surface | Backend | UI | Maturity |
|---------|---------|----|----------|
| Device DNA snapshots | Registry software + filtered config | Device Baseline | **Good** for MVP |
| Software inventory | Uninstall registry, noise filters | Table + search | **Good** |
| Config inventory | Tasks, browser ext, dev tools, HW/power/net basics | Table | **Partial** (startup/services collected code exists but deferred from default collect) |
| Timeline | Snapshot diffs | Change Timeline | **Basic** (no correlation scores) |
| Recovery | Plan + dry-run/install WinGet | Recovery Plans | **Good safety**; limited package resolution |
| Health | CPU/mem/disk via sysinfo, score, alerts | Health | **Basic** (no temps, GPU, SMART) |
| Crash Intelligence | Event log scan + classify | Crash Analysis | **Basic** |
| AI Detective | Heuristic findings from local context | Diagnosis | **Early** (query largely unused) |
| Sync | Local queue status | Dashboard badge | **Stub** |

### 2.3 IPC command surface (today)

~30 Tauri commands: DNA, restore, health, crash, setup import/export, diagnosis, sync status.

There is **no** process/handle/driver/service live monitor, storage scanner, security engine, universal search, or action executor beyond restore/install.

### 2.4 Database entities (today)

`devices`, `device_dna_snapshots`, `software_inventory_items`, `config_items`, `timeline_events`, `restore_*`, `health_samples`, `health_alerts`, `crash_events`, `diagnosis_*`, `sync_queue`.

Missing for Vision 2.0: process samples, hardware telemetry time series, storage scan jobs, security findings, drivers inventory, search index metadata, action audit log, agent/run plans.

---

## 3. Architecture review

### 3.1 Strengths (keep and build on)

1. **Local-first, privacy-aware design** — diagnosis context is structured summaries, not raw files/secrets.
2. **Clean collector → domain → storage → command layering** in Rust.
3. **Trait-based platform ports** (`SoftwareCollector`, `ConfigCollector`, `CrashCollector`, `Installer`, `DiagnosisProvider`) enable real/mock swaps.
4. **Restore safety culture** — dry-run default, explicit install opt-in, unresolved package IDs surfaced.
5. **Versioned SQLite migrations** — incremental schema evolution is working.
6. **UI discipline** — shell, design tokens direction, nav groups (Operate / Investigate / Assist), component tests.
7. **Docs depth** — unusual and valuable; Vision 2.0 must *align* docs rather than abandon them.

### 3.2 Weaknesses & technical debt

| ID | Issue | Severity | Impact |
|----|-------|----------|--------|
| TD-01 | **Single `Mutex<Connection>`** for all IPC + background sampler | High | Contends health sampling with UI; blocks multi-engine growth |
| TD-02 | **No event bus / domain events** | High | Modules cannot correlate; AI cannot subscribe to live signals |
| TD-03 | **No always-on agent service** | High | Intelligence only while UI process runs |
| TD-04 | **Synchronous restore execution** on command thread | Med | UI freezes on real multi-app installs |
| TD-05 | **Health sampler recreates `System` + sleeps** on sample path | Med | Unnecessary cost; not continuous series |
| TD-06 | **AI ignores natural-language query** (`_query`) | High | Copilot cannot answer “why slow” specifically |
| TD-07 | **WinGet ID resolution is hard-coded map** | Med | Restore real-install success rate limited |
| TD-08 | **No package identity on software items** | Med | Blocks update detection, vuln scoring, reliable reinstall |
| TD-09 | **No action/audit ledger** | High | Vision requires safe auto-fix + explainability |
| TD-10 | **No modular capability registry** | Med | Adding engines will bloat `lib.rs` invoke list |
| TD-11 | **Frontend is view-state only** (no router, no command palette) | Med | Blocks Raycast-class UX and universal search |
| TD-12 | **Cloud/auth/signing/observability deferred** | Expected | OK for local MVP; block public launch |
| TD-13 | **Documentation drift** (60-doc suite vs implemented local MVP) | Med | New Vision 2.0 must be single source of truth for next phase |
| TD-14 | **Startup/services collectors present but not in default config path** | Low–Med | Gap vs System Intelligence and DNA depth |

### 3.3 Scalability bottlenecks

1. **SQLite write serialization** under one mutex — fine for MVP, not for multi-collector fan-in.
2. **Snapshot model is full-inventory** — deep process/hardware sampling needs **time-series + retention**, not DNA-style full copies every minute.
3. **IPC is request/response only** — Vision needs push events (alerts, process anomalies, scan progress).
4. **No search index** — Everything-class search cannot scan SQL tables at runtime alone.
5. **Monolithic command registration** — will not scale to 100+ commands without module facades.

### 3.4 Architecture principle for Vision 2.0

```
┌─────────────────────────────────────────────────────────────────┐
│  UI Shell (React) — Ops Center + Command Palette + Copilot     │
└────────────────────────────▲────────────────────────────────────┘
                             │ typed IPC + event stream
┌────────────────────────────┴────────────────────────────────────┐
│  Orchestration Layer (Rust)                                     │
│  • Capability registry  • Job scheduler  • Policy / consent      │
│  • Action executor + audit log  • AI context assembler           │
└──────────▲─────────────────▲──────────────────▲─────────────────┘
           │                 │                  │
   ┌───────┴──────┐  ┌───────┴──────┐  ┌────────┴────────┐
   │ Domain Engines│  │ Intelligence │  │ Persistence    │
   │ (10 product   │  │ Bus / Events │  │ SQLite + FTS   │
   │  domains)     │  │ + Time series│  │ + file caches  │
   └───────┬──────┘  └───────┬──────┘  └────────┬────────┘
           │                 │                  │
   ┌───────┴────────────────────────────────────┴────────┐
   │  Collectors / OS adapters (WMI, ETW, registry,       │
   │  Event Log, SMART, WinGet, SetupAPI, …)              │
   └─────────────────────────────────────────────────────┘
```

**Rule:** Engines never talk UI↔UI. They publish **facts, findings, and proposed actions** onto the bus. The Copilot and Dashboard only consume aggregated intelligence.

---

## 4. Gap analysis — Vision 2.0 domains vs MVP

Legend: **●** exists · **◐** partial · **○** missing

| # | Vision domain | MVP | Gap summary |
|---|---------------|-----|-------------|
| 1 | System Intelligence Engine | ◐ | DNA config + crash only; no process/thread/handle/DLL/live service explorer, risk scores |
| 2 | Hardware Intelligence Engine | ◐ | CPU/mem/disk % only; no clocks, temps, GPU, VRM, SMART, prediction |
| 3 | Storage Intelligence Engine | ○ | Disk % only; no tree maps, dupes, orphan analysis, cleanup workflows |
| 4 | Software Lifecycle Manager | ◐ | Inventory + restore; no updates, vulns, licenses, dependency graph |
| 5 | Security Intelligence Engine | ○ | No persistence/behavior threat scoring (by design offline-MVP) |
| 6 | Recovery & Resilience Engine | ◐ | Software restore + setup bundle; no imaging, VSS, full config rollback |
| 7 | Driver Intelligence Engine | ○ | Not present (drivers not first-class) |
| 8 | Event & Diagnostics Engine | ◐ | Crash scan + classify; no RCA timeline, BSOD minidump analysis, correlation graph |
| 9 | Universal Search Engine | ○ | Per-table filters only |
| 10 | AI Copilot Engine | ◐ | Offline heuristics; no multi-engine context, no safe action execution, query unused |

### 4.1 Philosophy compliance (7 questions)

| Question | MVP today |
|----------|-----------|
| What is happening? | Partial (health %, alerts, crashes, inventory) |
| Why? | Weak (rules, no process attribution) |
| What caused it? | Weak (timeline titles, not causal ranking) |
| How severe? | Partial (alert severity, crash severity) |
| What if ignored? | Missing |
| How to fix? | Partial (suggested_action text only) |
| Auto-fix? | Missing (except manual restore/install) |

---

## 5. System redesign proposal (evolutionary)

### 5.1 Do not rebuild

Preserve:

- Tauri + Rust + SQLite + React stack  
- Device DNA, timeline, restore dry-run, health samples, crash, diagnosis tables  
- Migration history and IPC naming where possible  
- Local-first privacy rules  

### 5.2 Introduce structural upgrades (Phase V2-0 Foundation)

| Upgrade | Description |
|---------|-------------|
| **Capability modules** | Each engine owns `commands`, `collectors`, `models`, `repo` under a stable module path |
| **Event bus** | In-process bus: `Observation`, `Finding`, `Alert`, `ActionProposed`, `ActionCompleted` |
| **Dual storage** | (A) relational truth (entities) (B) time-series samples with retention policies |
| **Jobs API** | Long-running work (scan, restore, cleanup) as jobs with progress events |
| **Action framework** | Every mutation is an `Action` with risk tier, preview, consent, rollback hook, audit row |
| **Context assembler** | Single `IntelligenceContext` builder for Copilot (replaces ad-hoc DiagnosisContext growth) |
| **DB access** | Connection pool or `r2d2` / write queue; never hold lock across OS I/O |
| **Search** | SQLite FTS5 initially; later optional native indexer service |
| **UI shell** | Command palette (⌘K), engine routes, finding-first dashboard |

### 5.3 Database redesign (additive migrations — no big-bang rewrite)

Proposed next migrations (illustrative):

| Migration | Tables / features |
|-----------|-------------------|
| 0011 | `system_events` (bus durability), `action_audit` |
| 0012 | `process_samples`, `process_findings` |
| 0013 | `hardware_samples` (temps/clocks/power JSON columns + typed keys) |
| 0014 | `storage_scans`, `storage_items`, `storage_findings` |
| 0015 | `software_package_ids`, `software_updates` |
| 0016 | `drivers`, `driver_findings` |
| 0017 | `security_findings` |
| 0018 | FTS virtual tables for search |
| 0019 | `agent_runs`, `agent_steps` (copilot execution) |

**Principle:** Prefer append-only samples + findings over mutating giant snapshots for high-frequency telemetry.

### 5.4 API redesign principles

1. **Read models** for UI: `get_dashboard_intelligence`, `get_engine_summary(engine)`.
2. **Commands** for mutations: `propose_action`, `confirm_action`, `cancel_job`.
3. **Events** for live UI: Tauri events `intelligence://finding`, `job://progress`.
4. **Versioned payloads** with `schemaVersion` on all new aggregates.
5. Keep existing commands working (compat layer) until UI migrates.

### 5.5 UI/UX redesign direction

| From | To |
|------|----|
| Module pages that list raw data | Finding-first ops center |
| Static sidebar only | Sidebar + command palette + global search |
| Health gauge as vanity metric | Health with **cause breakdown** and next actions |
| Diagnosis as chat-ish form | Copilot with evidence cards + **Run safe fix** |
| Utility tables | Explorers (Process, Service, Driver, Storage) with risk badges |

Design language remains: Linear / Raycast / Windows 11 — already directionally correct; elevate density of *insight*, not widgets.

---

## 6. Feature expansion roadmap (Vision 2.0)

Aligned to product philosophy and engineering risk. Each phase must ship **explain + act** loops, not just collectors.

| Phase | Name | Engines focus | Exit criteria |
|-------|------|---------------|---------------|
| **V2-0** | Intelligence Spine | Bus, jobs, actions audit, context assembler, DB access, command palette shell | New finding can flow bus → UI; actions are auditable |
| **V2-1** | System Intelligence v1 | Processes, services, startup impact scoring | “Why slow?” cites top processes + startup cost |
| **V2-2** | Hardware + Health v2 | Temps, GPU, SMART basics, degradation trends | Predictive alert prototype for disk/thermal |
| **V2-3** | Storage Intelligence v1 | Usage map, large files, temp/cache, safe cleanup actions | One-click cleanup with preview + rollback of *file list* |
| **V2-4** | Software Lifecycle v2 | Package IDs, update detection, winget match quality | ≥80% of common apps resolve to package IDs |
| **V2-5** | Diagnostics + Drivers | Event correlation, driver inventory, BSOD enrichment | Incident timeline for last crash |
| **V2-6** | Security Intelligence v1 | Persistence & privilege anomaly scoring (behavioral) | Top persistence findings with severity |
| **V2-7** | Universal Search | FTS across DNA, processes, events, findings | Sub-100ms local queries for typical DB size |
| **V2-8** | Copilot v2 | Query understanding, multi-engine RCA, safe action plans | End-to-end: ask → ranked causes → optional auto-fix |
| **V2-9** | Recovery Vault v2 | Restore points, selective rollback, imaging integration strategy | Config/software rollback beyond WinGet reinstall |
| **V2-10** | Always-on Agent | Windows service, low-footprint sampling | Monitoring continues when UI closed |

**Cloud / monetization / fleet** remain after local intelligence is undeniably excellent (preserves doc 61 discipline).

---

## 7. Module-by-module implementation plan (first 4 phases)

### V2-0 — Intelligence Spine

- [ ] `intelligence` module: events, findings, severity, confidence
- [ ] `actions` module: risk tiers (`read`, `safe`, `privileged`, `destructive`), preview, confirm, audit
- [ ] `jobs` module: long-running task state machine
- [ ] Refactor DB access off long-held mutex across OS waits
- [ ] UI: command palette stub + “Intelligence” feed on dashboard
- [ ] Extend diagnosis context builder to consume findings (not only raw metrics)

### V2-1 — System Intelligence

- [ ] Process collector (sysinfo → later ETW/WMI for handles/modules)
- [ ] Process risk heuristics (unsigned path, weird parent, high resource, persistence link)
- [ ] Service + startup re-enable in DNA with impact scoring
- [ ] UI: Process Explorer + Startup Intelligence Center

### V2-2 — Hardware Intelligence

- [ ] Expand health samples schema (JSON metrics bag or typed columns)
- [ ] Windows adapters for thermal/SMART (fallback gracefully)
- [ ] Trend + anomaly detection on time series
- [ ] UI: Hardware Health Center + timeline sparklines

### V2-3 — Storage Intelligence

- [ ] Async disk walk job with exclude rules + privacy paths
- [ ] Large/dupe/temp classifiers
- [ ] Cleanup actions through Action framework only
- [ ] UI: Storage Command Center

---

## 8. Observability strategy (product + engineering)

### 8.1 Product observability (user-facing)

- Continuous **signals** (samples)
- Derived **findings** (scored)
- **Incidents** (correlated findings)
- **Actions** (what we did)

### 8.2 Engineering observability

| Concern | Approach |
|---------|----------|
| Logging | Structured `tracing` in Rust; ring buffer for support export |
| Perf budgets | Sampler CPU < 1% average; RAM budget documented per engine |
| Crash | Keep local error types; Sentry only when cloud phase returns |
| Metrics | Internal counters: collect latency, job duration, lock wait |

---

## 9. Testing strategy

| Layer | Focus |
|-------|-------|
| Unit | Scoring, heuristics, classifiers, pure plan builders |
| Integration | SQLite migrations + repos + jobs |
| Platform | `#[cfg(windows)]` collectors with fixtures / golden outputs |
| Safety | Every destructive action has dry-run test; install mode never default in CI |
| UI | Component tests for findings/actions; later e2e smoke |
| Property | Retention policies don’t grow DB unbounded |

Keep existing Vitest + `cargo test` green as gate on every phase.

---

## 10. Deployment strategy (near-term)

| Stage | Delivery |
|-------|----------|
| Now | Local unpackaged / `tauri dev` + CI typecheck/lint/test |
| V2-1+ | Signed MSI/MSIX optional internal; still local-first |
| Public | Code signing, auto-update, privacy policy, least-privilege manifests |
| Agent | Separate Windows service installer with tighter ACL |

Do **not** block intelligence work on store packaging.

---

## 11. Production-ready code improvements (priority backlog)

### P0 — must before multi-engine expansion

1. Split long OS I/O from DB lock (sample, winget, event log).
2. Action audit table + API for any future auto-fix.
3. Make diagnosis use the user query (keyword/intent routing minimum).
4. Job progress events for restore (stop blocking UX).

### P1 — quality

5. Software package identity column + improved WinGet matching.
6. Re-enable startup/services in config collect with noise filters.
7. Health sample retention + aggregation.
8. Command palette + global findings feed.

### P2 — depth

9. Process explorer engine.
10. Hardware metrics expansion.
11. Storage scanner.
12. FTS search.

---

## 12. Competitive positioning (honest)

| Competitor class | What they win today | How DeviceLifeline wins later |
|------------------|---------------------|-------------------------------|
| Sysinternals / Process Hacker | Live process depth | Cross-domain RCA + history + safe fix |
| HWiNFO / CrystalDisk / AIDA | Sensor breadth | Explanation + prediction + actions |
| CCleaner / Glary | Cleanup UX | Evidence-based cleanup, no dark patterns |
| Malwarebytes | AV signatures | Behavioral persistence intelligence (not AV replacement) |
| Patch My PC / winget UIs | Update scale | Lifecycle + restore + timeline correlation |
| PowerToys / Everything | Speed utilities | Unified ops center + copilot |
| Macrium | Imaging | Recovery as one engine inside full intelligence |

**Do not claim parity** until engines exist. Market as “AI PC engineer” only when Copilot can cite multi-engine evidence and execute safe actions.

---

## 13. Non-goals (guardrails)

- Not a full antivirus signature engine  
- Not a clone of Sysinternals overnight  
- Not cloud-mandatory for core value  
- Not a noisy “optimizer” that kills processes by default  
- Not a rewrite of Tauri/React/SQLite stack  

---

## 14. Immediate next implementation recommendation

**Start V2-0 Intelligence Spine + P0 diagnosis/query fix**, then **V2-1 System Intelligence (processes)** — this is the highest leverage path to the flagship “Why is my computer slow?” experience.

Success signal for the next milestone:

> User asks “Why is my computer slow?” → ranked causes with confidence, citing **top processes, memory/disk pressure, recent changes, crashes**, each with a **safe suggested action** (and dry-run where applicable).

---

## 15. Decision log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rewrite vs evolve | **Evolve** | MVP quality and safety culture are worth keeping |
| First engine after spine | **System Intelligence (process)** | Unlocks real RCA for slowdowns |
| AI provider | Offline first, LLM optional later | Matches privacy + local MVP; improve heuristics now |
| Storage for telemetry | SQLite + retention | Avoid new infra before product proof |
| Auto-fix | Action framework with consent | Trust is the product |

---

*This document is the working baseline for Vision 2.0 engineering. Update it when phase exits land or architecture decisions change.*
