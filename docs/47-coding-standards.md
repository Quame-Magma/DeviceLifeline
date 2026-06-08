# 47. Coding Standards

> Defines the coding conventions, tooling, naming rules, commit discipline, code review standards, and secure-coding requirements that all DeviceLifeline engineers follow. Part of the DeviceLifeline documentation suite — see [Documentation Index](README.md).

**Status:** Draft v1 · **Authoring role:** Staff Engineer · **Last updated:** 2026-06-07
**Related:** [48. Folder Structure Specification](48-folder-structure-specification.md), [46. Technical Debt Strategy](46-technical-debt-strategy.md), [43. Testing Strategy](43-testing-strategy.md), [17. Security Requirements](17-security-requirements.md), [38. DevOps Architecture](38-devops-architecture.md)

---

## 1. Purpose & Scope

Consistent code is easier to read, review, debug, and hand off. This document defines the enforceable standards for the three primary language ecosystems in DeviceLifeline — Rust, TypeScript/React, and SQL — plus cross-cutting conventions for commits, branching, documentation, code review, and secure coding.

**In scope:**
- Rust formatting, linting, error handling, module layout, `unsafe` policy
- TypeScript/React formatting, linting, component patterns, state management, typing rules
- SQL and migration standards
- Naming conventions (files, variables, modules)
- Git commit and branching conventions
- Code documentation expectations
- Code review process and norms
- Secure coding rules

**Out of scope:**
- Product architecture decisions (see [30. System Architecture](30-system-architecture.md))
- Folder structure (see [48. Folder Structure Specification](48-folder-structure-specification.md))
- Test authoring standards (see [43. Testing Strategy](43-testing-strategy.md))
- Design system / UI conventions (see [49. Design System Specification](49-design-system-specification.md))

---

## 2. Assumptions

- **A-01:** Rust toolchain version is pinned in `rust-toolchain.toml` (e.g., `stable` channel with a specific date pin).
- **A-02:** Node.js version is pinned in `.nvmrc` and `.tool-versions` (e.g., 20 LTS).
- **A-03:** `pnpm` is the package manager for the JavaScript workspace; `npm` and `yarn` are not used.
- **A-04:** All tooling configuration lives in version-controlled config files; IDE-specific settings are not enforced.
- **A-05:** Pre-commit hooks (via `husky` or `cargo-husky`) enforce formatting and lint on staged files before every commit.
- **A-06:** These standards apply to all code merged to `main`; prototype/spike branches are exempt from non-critical rules but must be cleaned up before merge.

---

## 3. Rust Standards

### 3.1 Formatting

- All Rust code is formatted with `rustfmt` using the project's `rustfmt.toml`. No manual exceptions.
- `rustfmt.toml` settings:
  - `edition = "2021"`
  - `max_width = 100`
  - `use_small_heuristics = "Default"`
- CI fails if any Rust file is not `rustfmt`-clean (`cargo fmt --check`).

### 3.2 Linting

- `cargo clippy -- -D warnings` runs on every PR and must pass with zero warnings.
- All `clippy::pedantic` and `clippy::nursery` lints are enabled but configured as warnings (not errors) during MVP; a subset will be promoted to errors post-MVP.
- `clippy::all` is always errors.
- `#[allow(clippy::...)]` suppressions are permitted only with a comment explaining the justification and a corresponding `TODO(debt)` if a proper fix is deferred.

### 3.3 Error Handling

- All fallible functions return `Result<T, E>` — never panic on recoverable errors.
- Error types use `thiserror` derive macros. The error enum for each module is defined in a `mod error` sub-module.
- Errors must be contextually enriched before propagating upward (use `map_err` or `?` with context via `anyhow::Context` where `anyhow` is used in application code).
- `unwrap()` and `expect()` are forbidden in library code. In application entry points (`main`, Tauri command handlers), `expect()` is permitted only for conditions that represent unrecoverable programming errors (not user data errors).
- `panic!()` is forbidden outside of `#[test]` blocks and explicit invariant assertions documented with a comment.

**Error hierarchy convention:**

```
crate::error::CoreError         ← top-level application error
  ↳ CollectorError              ← errors from OS collectors
  ↳ StorageError                ← SQLite + file I/O errors
  ↳ InstallError                ← WinGet + installer errors
  ↳ RestoreError                ← restore engine errors
  ↳ SyncError                   ← Supabase sync errors
```

### 3.4 Module Layout

Each Rust module follows this file layout convention:

```
src/
  module_name/
    mod.rs          ← public API surface only; re-exports
    types.rs        ← data types, enums, structs
    error.rs        ← error enum for this module
    impl.rs         ← implementation (or split into logical sub-files)
    tests.rs        ← unit tests (#[cfg(test)])
```

Modules exceeding ~400 lines of logic are split into additional sub-files. `mod.rs` must not contain implementation logic — only `use` declarations, `pub use` re-exports, and module declarations.

### 3.5 `unsafe` Policy

- `unsafe` blocks are forbidden in application code unless there is no safe alternative and the rationale is documented.
- Any `unsafe` block must be accompanied by:
  - A `// SAFETY:` comment explaining precisely why the operation is sound.
  - A review note in the PR pointing the reviewer to the safety argument.
  - A `TODO(debt):` comment if a safe alternative should be sought later.
- `unsafe` in third-party crate internals is acceptable; use `cargo-geiger` in CI to track the `unsafe` surface of the dependency graph and alert on increases.

### 3.6 Async Rust

- The async runtime is `tokio` (multi-threaded by default).
- `block_on` and `spawn_blocking` are used only when interfacing with synchronous APIs (e.g., certain SQLite calls). Document the reason.
- `async fn` in Tauri command handlers follows Tauri's `async_runtime::spawn` pattern.
- Avoid holding locks (`Mutex`) across `.await` points. Use `tokio::sync::Mutex` where async locking is required.

---

## 4. TypeScript and React Standards

### 4.1 Formatting

- All TypeScript/JavaScript/TSX/CSS code is formatted with `Prettier`. Configuration is in `.prettierrc`:
  - `printWidth: 100`
  - `singleQuote: true`
  - `trailingComma: "all"`
  - `semi: true`
  - `tabWidth: 2`
- CI fails if any file is not Prettier-clean (`pnpm prettier --check .`).

### 4.2 Linting

- ESLint with the following rulesets:
  - `eslint:recommended`
  - `@typescript-eslint/recommended-type-checked`
  - `react/recommended` + `react-hooks/recommended`
  - Custom DeviceLifeline rules defined in `.eslintrc.cjs`
- Zero ESLint errors on merge to `main`; warnings are tracked and reviewed weekly.
- `eslint-plugin-security` is included and all high-confidence rules are set to `error`.
- `complexity` rule is set to `["error", { max: 10 }]`.

### 4.3 TypeScript Typing Rules

- `strict: true` in `tsconfig.json` — no exceptions.
- `noImplicitAny: true`, `strictNullChecks: true`, `noUncheckedIndexedAccess: true`.
- `any` type is forbidden. Use `unknown` and narrow with type guards.
- All Tauri `invoke` calls are wrapped in typed functions that assert the return type against the shared command schema. See [48. Folder Structure Specification](48-folder-structure-specification.md) for the `src/api/` layer.
- External API responses (Supabase, AI APIs) are parsed with `zod` schemas at the boundary — never assume the type.

### 4.4 Component Patterns

- Components are function components with TypeScript types. Class components are not used.
- Props interfaces are defined explicitly with a `Props` suffix: `interface HealthScoreDialProps { ... }`.
- Components are small and single-purpose. A component exceeding ~150 lines of JSX/TSX is a refactoring signal.
- Side effects are isolated in custom hooks. No `useEffect` containing complex logic — extract to a named hook.
- Components do not call Tauri `invoke` directly. All IPC calls go through the `src/api/` service layer.
- Components do not contain business logic. Data transformation belongs in hooks or utility modules.

**File naming for React:**
- Component files: `PascalCase.tsx` (e.g., `HealthScoreDial.tsx`)
- Hook files: `use-camelCase.ts` (e.g., `use-diagnosis-session.ts`)
- Utility files: `camelCase.ts` (e.g., `formatHealthScore.ts`)
- Type definition files: `types.ts` or `[module].types.ts`

### 4.5 State Management

- **Local component state:** `useState` / `useReducer` for UI state that does not cross component boundaries.
- **Cross-component shared state:** Zustand stores (`src/store/`). One store per domain (e.g., `device.store.ts`, `diagnosis.store.ts`).
- **Server state (Supabase data):** React Query (TanStack Query) for all data fetching, caching, and invalidation.
- **No `useContext` for complex state.** Context is used only for dependency injection (e.g., theme provider, feature flags).
- **No Redux.** Zustand + React Query covers the state surface for this application.

### 4.6 Imports and Module Boundaries

- Use absolute imports via `tsconfig.json` path aliases (e.g., `@/components/...`, `@/api/...`).
- No circular imports — enforced by `eslint-plugin-import/no-cycle`.
- Third-party imports are grouped above local imports; `prettier-plugin-organize-imports` enforces ordering.

---

## 5. SQL and Migration Standards

### 5.1 SQLite (On-Device)

- All SQLite interactions in Rust use the `sqlx` crate with compile-time-verified queries (`sqlx::query_as!` / `sqlx::query!`).
- No string-concatenated SQL. All parameters are bound, never interpolated.
- Migrations live in `src-tauri/migrations/` as numbered SQL files: `YYYYMMDD_NNN_description.sql`.
- Migrations are applied at app startup by the `sqlx::migrate!` macro. Migrations are never applied manually.
- Every migration is reversible (includes a `-- Down:` section) where structurally possible.

### 5.2 Supabase (Postgres)

- All Supabase table and column names are `snake_case`.
- Foreign keys are always named `<table>_<referenced_table>_fkey`.
- Every table has a primary key of type `uuid` with `DEFAULT gen_random_uuid()`.
- Every table has `created_at timestamptz DEFAULT now()` and `updated_at timestamptz DEFAULT now()` columns.
- Indexes are added for all foreign keys and all columns used in `WHERE` clauses in known query patterns.
- RLS is enabled on every user-data table. No table may have RLS disabled unless it is a public lookup table (e.g., `plans`).
- Migrations in `supabase/migrations/` follow the Supabase CLI naming convention: `YYYYMMDDHHMMSS_description.sql`.

### 5.3 Migration Review Rules

- Every migration PR must include:
  - The forward migration SQL
  - The reverse migration SQL (or explanation of why it is not reversible)
  - RLS policy additions/changes if the table's access model changes
  - Query plan analysis (via `EXPLAIN ANALYZE`) for any new `SELECT` that touches large tables

---

## 6. Naming Conventions

### 6.1 Rust

| Item | Convention | Example |
|---|---|---|
| Types, enums, traits | `PascalCase` | `DeviceDNASnapshot`, `CollectorError` |
| Functions, methods | `snake_case` | `collect_software_inventory` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| Modules | `snake_case` | `software_collector` |
| File names | `snake_case.rs` | `software_collector.rs` |
| Tauri command names | `kebab-case` (frontend) / `snake_case` (handler fn) | `invoke("collect-dna-snapshot")` / `collect_dna_snapshot()` |

### 6.2 TypeScript / React

| Item | Convention | Example |
|---|---|---|
| React components | `PascalCase` | `HealthScoreDial` |
| Hooks | `useCamelCase` | `useDiagnosisSession` |
| Zustand stores | `camelCase.store.ts` | `device.store.ts` |
| Types / interfaces | `PascalCase` | `DeviceDNASnapshot`, `HealthScoreDialProps` |
| Enum values | `SCREAMING_SNAKE_CASE` | `SeverityLevel.HIGH` |
| Utility functions | `camelCase` | `formatHealthScore` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_RESTORE_RETRIES` |
| CSS classes (Tailwind) | Not custom-named; use Tailwind utilities directly |

### 6.3 Database

| Item | Convention | Example |
|---|---|---|
| Table names | `snake_case`, plural | `device_dna_snapshots` |
| Column names | `snake_case` | `collected_at` |
| Index names | `idx_<table>_<column(s)>` | `idx_timeline_events_device_id` |
| Foreign key constraints | `<table>_<ref_table>_fkey` | `timeline_events_devices_fkey` |
| Migration files (Supabase) | `YYYYMMDDHHMMSS_description.sql` | `20260607120000_add_health_index.sql` |

---

## 7. Git Commit and Branching Conventions

### 7.1 Commit Messages

Commits follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <short description>

[optional body]

[optional footer(s)]
```

**Types:**

| Type | When to use |
|---|---|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `perf` | Performance improvement |
| `refactor` | Code restructuring without behavior change |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Build, CI, dependency updates, tooling |
| `security` | Security fix |
| `debt` | Technical debt resolution |

**Scopes** (suggested): `rust-core`, `tauri-bridge`, `react-ui`, `supabase`, `ci`, `db`, `installer`, `restore`, `collector`, `ai`.

**Examples:**
- `feat(rust-core): add GPU health collector for NVIDIA cards`
- `fix(react-ui): fix HealthScoreDial not rendering on zero score`
- `chore(ci): update cargo tarpaulin to 0.28.0`

Commits that include breaking changes must append `!` after the type/scope and include a `BREAKING CHANGE:` footer.

### 7.2 Branching Strategy

| Branch | Purpose | Merges into |
|---|---|---|
| `main` | Always-deployable; source for canary releases | — |
| `feature/<issue-id>-short-description` | Feature work | `main` via PR |
| `fix/<issue-id>-short-description` | Bug fixes | `main` via PR |
| `hotfix/v<version>` | Production hotfix | `main` + release tag |
| `release/v<version>` | Release preparation | `main` + tag |
| `debt/<issue-id>-short-description` | Technical debt work | `main` via PR |
| `docs/<description>` | Documentation only | `main` via PR |

`main` is protected: no direct pushes; all changes go through PRs with at least one review approval.

---

## 8. Code Documentation Expectations

### 8.1 Rust Documentation

- All `pub` items (functions, types, traits, constants) must have doc comments (`///`).
- Doc comments must include: a one-line summary, a description of parameters and return values for non-obvious functions, and an example if the API is non-trivial.
- Module-level doc comments (`//!`) are required for every module.
- `cargo doc` must build without warnings.

### 8.2 TypeScript Documentation

- All exported functions and types must have JSDoc comments.
- JSDoc must include `@param` and `@returns` for functions with non-obvious signatures.
- Complex hooks must document their state machine or side-effect behavior in a block comment above the hook.

### 8.3 Inline Comments

- Inline comments (`//`) explain _why_, not _what_. Code explains what; comments explain why.
- `TODO(debt): DEBT-XXX` format for all deferred work (see [46. Technical Debt Strategy](46-technical-debt-strategy.md)).
- `FIXME:` comments are not committed to `main`; they must be resolved or converted to a debt item before merge.
- `SAFETY:` comments are mandatory on all `unsafe` blocks (see §3.5).

---

## 9. Code Review Standards

### 9.1 Review Requirements

- Every PR to `main` requires at least **one approving review** from an engineer who did not author the PR.
- PRs touching security-sensitive code (RLS policies, Edge Function auth, Rust Core privilege operations) require approval from the **QA Lead or Staff Engineer specifically**.
- PRs modifying the database schema require approval from the engineer who owns the data model.
- Self-reviews are not permitted.

### 9.2 Reviewer Checklist

Reviewers should explicitly check for:
- [ ] Logic correctness and edge case coverage
- [ ] Error handling completeness (all `Result` paths handled)
- [ ] New technical debt registered (if any deliberate shortcuts taken)
- [ ] Test coverage is adequate (no new logic without tests)
- [ ] Naming follows conventions (§6)
- [ ] No security anti-patterns (§10)
- [ ] No new `panic!` / `unwrap()` without justification
- [ ] Doc comments present on all new public items

### 9.3 Review SLAs

| PR Type | Target first review | Target merge |
|---|---|---|
| Feature | ≤ 1 business day | ≤ 2 business days |
| Bug fix | ≤ 4 hours | ≤ 1 business day |
| Hotfix (P0) | ≤ 1 hour | ≤ 2 hours |
| Documentation only | ≤ 1 business day | ≤ 1 business day |

### 9.4 PR Size Guidelines

- PRs should be small and focused: aim for ≤ 400 lines changed.
- PRs exceeding 800 lines require a justification comment from the author explaining why a split was not feasible.
- Large feature branches use stacked PRs (each layer reviewable independently).

---

## 10. Secure Coding Rules

These rules apply to all layers. See [17. Security Requirements](17-security-requirements.md) for the full security requirements.

### 10.1 Input Validation

- All data entering the Rust Core from external sources (OS APIs, WinGet output, file reads, Tauri IPC payloads) must be validated and sanitized before use.
- All data entering Supabase Edge Functions from the client must be validated with `zod` schemas at the function boundary.
- Never use raw string construction to build SQL, file paths, or shell commands.

### 10.2 Secrets Management

- **No secrets in code.** No API keys, tokens, connection strings, or credentials may appear in source files — not even in comments.
- Secrets are loaded from environment variables at runtime (Rust: `std::env::var`; Edge Functions: Deno `Deno.env.get`).
- The `.env` file is in `.gitignore` and must never be committed.
- AI API keys (OpenAI, Anthropic) are never shipped in the client binary. All LLM calls go through Supabase Edge Functions (see [22. AI Diagnostics Design](22-ai-diagnostics-design.md)).
- Code-signing certificates live in GitHub Actions secrets only.

### 10.3 Tauri IPC Security

- Every Tauri command handler validates that the calling context has the necessary Entitlement before executing privileged operations.
- The Tauri `allowlist` (CSP for IPC) is configured to allow only the minimum required commands.
- The webview does not have access to the Node.js API (`nodeIntegration: false`).

### 10.4 Dependency Security

- `cargo deny` is configured with a license allowlist (MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause).
- `cargo audit` and `npm audit` run on every PR; CVSS ≥ 7.0 blocks merge.
- No new direct dependencies are added without a review comment explaining the justification.

### 10.5 Logging and Telemetry

- No personally identifiable information (PII) or user file contents appear in log output.
- No secrets or tokens are logged, even at debug level.
- See [36. Logging Strategy](36-logging-strategy.md) and [19. Privacy Requirements](19-privacy-requirements.md) for full rules.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| RISK-CS-01: Standards drift as the team grows and new engineers join | High | Medium | Standards are enforced by tooling (not humans); onboarding includes standards walkthrough |
| RISK-CS-02: Pre-commit hooks are bypassed with `--no-verify` | Medium | Medium | CI duplicates all pre-commit checks; `--no-verify` bypasses only slow the engineer; CI still gates merge |
| RISK-CS-03: Overly strict standards slow down prototyping | Medium | Low | Spike/prototype branches are exempt; standards apply only at merge to main |
| RISK-CS-04: `async` Rust complexity leads to subtle data races | Medium | High | `tokio::sync` primitives mandated; `clippy::await_holding_lock` lint enabled |
| RISK-CS-05: Secret accidentally committed to repo history | Low | Critical | `git-secrets` pre-commit hook; GitHub secret scanning enabled; incident response plan if triggered |

---

## Future Considerations

- **Rust edition upgrade:** When Rust 2024 edition stabilizes, plan a coordinated upgrade (update `rust-toolchain.toml` + `Cargo.toml` edition).
- **ESLint flat config:** Migrate from `.eslintrc.cjs` to ESLint's flat config format when the team is comfortable with it.
- **Shared type generation:** Post-MVP, investigate generating TypeScript types from Rust `serde` types (e.g., via `ts-rs` or `specta`) to eliminate the manual type-synchronization burden between Rust and TypeScript.
- **Storybook integration:** When the component library matures, add Storybook with automated accessibility and interaction tests per component.
- **Commit signing:** Require GPG-signed commits for `main` branch once the team has a key-management process.

---

## Acceptance Criteria

- [ ] AC-CS-01: `rustfmt.toml`, `.prettierrc`, `.eslintrc.cjs`, and `rustfmt.toml` are checked into the root of the monorepo and match the settings documented here.
- [ ] AC-CS-02: CI fails on any `rustfmt` or Prettier formatting violation on every PR.
- [ ] AC-CS-03: `cargo clippy -- -D warnings` passes with zero warnings on the main branch.
- [ ] AC-CS-04: TypeScript `strict: true` is set and zero `any` usages exist in non-generated code on main.
- [ ] AC-CS-05: All Supabase tables have RLS enabled; absence of RLS causes a migration review block.
- [ ] AC-CS-06: `cargo audit` and `npm audit` run on every PR with CVSS ≥ 7.0 blocking merge.
- [ ] AC-CS-07: No secrets appear in the repo (verified by GitHub secret scanning + `git-secrets` hook).
- [ ] AC-CS-08: All `pub` Rust items and exported TypeScript functions have doc comments.
- [ ] AC-CS-09: Every PR to `main` has at least one approving review before merge.
- [ ] AC-CS-10: Pre-commit hooks are configured and documented in `CONTRIBUTING.md`.
