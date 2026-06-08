# Contributing to DeviceLifeline

DeviceLifeline is a Windows-first Tauri desktop app (Rust core + React/TypeScript UI) with a
Supabase cloud backend (later increments). This guide covers local development. For the full
design, see the [documentation suite](docs/README.md) — especially
[48. Folder Structure](docs/48-folder-structure-specification.md) and
[47. Coding Standards](docs/47-coding-standards.md).

## Prerequisites

- **Node.js 20** (see `.nvmrc`) and **pnpm 10** (`npm i -g pnpm`)
- **Rust** (stable) via [rustup](https://rustup.rs/)
- **Platform toolchain for Tauri v2:**
  - **Windows (primary):** Microsoft C++ Build Tools (MSVC) + the WebView2 runtime (preinstalled on Windows 11)
  - **Linux (dev/CI of the cross-platform code):** `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`
- The Tauri CLI is provided locally via `pnpm` (`pnpm tauri ...`)

## Install

```bash
pnpm install
```

## Generate app icons (first build only)

App icons are **generated, not committed** (binary assets are regenerated deterministically).
Before your first `pnpm tauri dev` or `pnpm tauri build`, generate them once:

```bash
python3 scripts/generate-app-icon.py   # writes app-icon-source.png (pure stdlib, no deps)
pnpm tauri icon app-icon-source.png     # writes the full set into src-tauri/icons/
```

CI does this automatically (see the `icons` job in `.github/workflows/ci.yml`).

## Run (development)

```bash
pnpm tauri dev      # launches the desktop app (Vite dev server + Rust core)
pnpm dev            # frontend only, in a browser (Tauri APIs unavailable)
```

> On **non-Windows** machines the software collector returns deterministic **mock** data, so the UI
> is fully explorable. The **real** Windows registry collector only compiles/runs on Windows.

## Build

```bash
pnpm build          # build the frontend (dist/)
pnpm tauri build    # build the full desktop bundle (Windows: MSI/NSIS) — requires icons
```

## Quality gates (match CI)

```bash
pnpm run typecheck                                   # tsc --noEmit
pnpm run lint                                        # eslint
pnpm run test                                        # vitest
cargo fmt   --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test  --manifest-path src-tauri/Cargo.toml
```

## Conventions

- **Branching:** commit directly to `main` for now (small team / early stage).
- **Layout & boundaries:** follow [doc 48](docs/48-folder-structure-specification.md). Notably:
  Tauri command handlers stay thin (no SQL), components never call `invoke` directly (use
  `src/api/tauri/`), and all SQLite access lives in `src-tauri/src/storage/`.
- **Style:** Rust is `rustfmt` + `clippy`-clean with no `unwrap()` outside tests; TypeScript is
  strict-mode and ESLint-clean. See [doc 47](docs/47-coding-standards.md).

## Current status

**Increment 1** delivers the foundation plus the first vertical slice: Device DNA snapshot capture
for installed software → SQLite → Tauri IPC → a Snapshots view. See
[60. Final Implementation Roadmap](docs/60-final-implementation-roadmap.md) for what comes next.
