# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

MultiSerial is a Tauri v2 desktop serial-communication terminal (macOS/Windows/Linux). The frontend is React 18 + TypeScript; the backend is Rust using the `serialport` crate. See `AGENTS.md` for the contributor-facing summary and the product spec lives one level up in `MultiSerial_Spec.md`.

## Toolchain is pinned — always go through Corepack and the wrapper scripts

Do **not** use a global `pnpm`, `node`, or `cargo`. Versions are pinned (pnpm 10.11.0, node 23.11.0, Rust 1.89.0) and the npm scripts wrap every command:

- `corepack pnpm dev` — Vite frontend only (browser preview, no native serial).
- `corepack pnpm tauri:dev` — full desktop app.
- `corepack pnpm build` — `tsc --noEmit && vite build`.
- `corepack pnpm test` — Vitest (single file: `corepack pnpm test src/send/sendModel.test.ts`).
- `corepack pnpm test:e2e` — Playwright e2e.
- `corepack pnpm rust:test` — Rust unit tests (compiled with the `mock-serial` feature; single test: append `-- <test_name>`).
- `corepack pnpm rust:fmt` / `corepack pnpm rust:clippy` — Rust style/lint (clippy runs with `-D warnings`).
- `corepack pnpm lint` / `corepack pnpm format:check` — ESLint / Prettier.

`rust:*` scripts pin the toolchain via `scripts/run-rust.mjs` (`rustup run 1.89.0 …`); calling `cargo` directly may use the wrong toolchain.

Full pre-handoff gate: `rust:fmt`, `rust:test`, `rust:clippy`, `typecheck`, `lint`, `test`, `format:check`, and `git diff --check`.

## Environment isolation (critical)

The app reads `MULTISERIAL_CONFIG_DIR`, `MULTISERIAL_LOG_DIR`, and `MULTISERIAL_TEMP_DIR`. The wrapper scripts force these to live under `.dev-data/`, so dev/test runs never touch the real user-level `~/.multiSerial/` or `~/MultiSerial/logs/`:

- `scripts/run-with-dev-env.mjs` (used by `dev`/`tauri:dev`/`tauri:build`) points paths at `.dev-data/{config,logs,tmp}` and prepends `~/.cargo/bin` to PATH.
- `scripts/run-with-test-env.mjs` (used by `test`/`test:e2e`/`rust:test`) uses `.dev-data/test-*` dirs and **wipes them before and after** each run.

Always run commands through these scripts. Never write config/logs/temp to user-level paths from code.

## Architecture: the IPC boundary

The whole app revolves around the React ↔ Rust seam. Frontend calls Rust via `invoke()` (`src/app/App.tsx`); Rust pushes data back via Tauri events.

**Commands** are defined in `src-tauri/src/lib.rs` (each `#[tauri::command]`) and registered in `generate_handler!` inside `run()`. Notable groups: session lifecycle (`open_serial_session`, `close_serial_session`, `reconnect_serial_session`), I/O (`serial_write`, `serial_automated_write`, `serial_set_dtr/rts`, `serial_drain_rx`), logging (`serial_start_log`, `serial_stop_log`, `serial_log_status`), config (`load_config`, `save_config`, `default_config`), and introspection (`environment_info`, `build_metadata`, `list_serial_ports`, `validate_serial_settings`).

**Events** flow Rust → frontend and are the high-throughput path. RX data is *not* request/response: a background worker batches incoming bytes and emits `serial-rx-batch` every `RX_BATCH_INTERVAL_MS` (16ms). A hotplug worker polls every `HOTPLUG_POLL_INTERVAL_MS` (1000ms) and emits `serial-port-list-changed` and `serial-session-hot-unplugged`. The frontend subscribes with `listen()` in `App.tsx`. When changing RX/logging/hotplug behavior, keep the batching contract intact — the UI relies on batch intervals and counters.

## Rust backend structure (`src-tauri/src/`)

- `serial/mod.rs` — the core. `SessionManager<B: SerialBackend>` owns all session state and is wrapped in `Arc<Mutex<…>>` and `manage`d by Tauri. The `SerialBackend` trait abstracts the port; `RealSerialBackend` is production. Pure functions (`validate_serial_config`, `transition`, `diff_port_lists`) are unit-tested directly. Session state changes go through the `transition(state, event)` state machine — keep transitions there, not scattered in commands.
- `serial/hotplug.rs` — the polling worker.
- `logging.rs` — session logging core (records, counters, log workers).
- `config.rs` — config load/save and schema versioning.
- `lib.rs` — Tauri commands, event emission, worker startup, plugin setup. `main.rs` just calls `multi_serial_lib::run()`.

The `mock-serial` cargo feature (and `cfg(test)`) swaps in a mock `SerialBackend` so Rust tests and hardware-free CI never touch real ports.

## Frontend structure (`src/`)

Feature folders, each with the same shape: pure logic in a `*Model.ts` (heavily unit-tested), a React component, and an `index.ts` barrel. Folders: `app` (orchestration + IPC), `terminal` (session buffers, derived hex/binary/decimal views, perf), `send` (text/hex/macro/file/automation sends), `filter` (search + highlight), `settings`, `shortcuts`, `updates`, `privacy` (crash-report scrubbing). Keep business logic in the model files (testable without React); components stay thin.

`App.tsx` is large (~2600 lines) and is the single owner of IPC and cross-feature state — most behavior changes start here.

### Browser vs. desktop dual-mode

The frontend runs both inside Tauri and as a plain browser preview. `browserMockSerialEnabled()` (`src/app/browserMockSerial.ts`) returns true only when `import.meta.env.MULTISERIAL_E2E_MOCK_SERIAL === "1"`. Throughout `App.tsx` every serial operation branches: mock implementation in the browser, real `invoke()` in Tauri. When adding a serial-touching command, handle **both** branches or browser/e2e mode breaks. Playwright e2e drives the app through `window.__MULTISERIAL_E2E_*` hooks installed by `App.tsx` in mock mode.

## Conventions

- Tauri payloads use `serde` with `camelCase` JSON fields; the TS-side types in `App.tsx` must match the Rust structs exactly.
- React components PascalCase; hooks/helpers camelCase. Rust: snake_case fns, PascalCase types, explicit error enums (`SerialError`).
- Product name is `MultiSerial`; binary/process/config-dir name is `multiSerial` — this casing is enforced and a mismatch is treated as a packaging error.
- Never commit serial payload data, personal device paths, credentials, or generated logs.
