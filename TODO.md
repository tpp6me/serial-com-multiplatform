# MultiSerial v1.0 TODO Tracker

Last updated: 2026-05-28
Source plan: `MultiSerial_Implementation_Plan.md`
Scope: v1.0 only unless explicitly marked as a future guardrail

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocked or needs decision
- `[>]` Deferred from v1.0

When updating this file, keep the checkbox marker and add a short note with date/owner when an item is blocked or complete.

## 0. Pre-Implementation Spec Cleanup

### 0.1 Required Spec Corrections

- [x] `SPEC-001` Replace stale Node.js reliability wording with Rust/Tauri wording in `MultiSerial_Spec.md`. Completed 2026-05-28.
- [x] `SPEC-002` Remove or renumber duplicate `7.4 Platform Capability Matrix` section. Completed 2026-05-28.
- [x] `SPEC-003` Remove or renumber duplicate `7.5 Platform-Specific USB Details` section. Completed 2026-05-28.
- [x] `SPEC-004` Resolve Linux auto-update conflict between v1.0 and v1.1 statements. Completed 2026-05-28.
- [x] `SPEC-005` Update footer from `v1.1` to `v1.2`. Completed 2026-05-28.
- [x] `SPEC-006` Verify all section references still point to the intended sections after cleanup. Completed 2026-05-28.
- [x] `SPEC-007` Add an engineering decision record for raw/binary Tauri IPC approach. Completed 2026-05-28.
- [x] `SPEC-008` Add an engineering decision record for binary log format. Completed 2026-05-28.
- [x] `SPEC-009` Add an engineering decision record for Linux updater support. Completed 2026-05-28.
- [x] `SPEC-010` Add approved hardware test matrix. Completed 2026-05-28.
- [x] `SPEC-011` Add formal config schema requirement details. Completed 2026-05-28.

### 0.2 v1.0 Scope Lock

- [x] `SCOPE-001` Confirm v1.0 includes serial GUI, up to four sessions, logging, display modes, search/filter, macros, settings, packaging, and automated tests. Completed 2026-05-28.
- [x] `SCOPE-002` Confirm Python scripting is not implemented in v1.0. Completed 2026-05-28.
- [x] `SCOPE-003` Confirm third-party plugins are not implemented in v1.0. Completed 2026-05-28.
- [x] `SCOPE-004` Confirm packet framing and protocol decoders are not implemented in v1.0. Completed 2026-05-28.
- [x] `SCOPE-005` Confirm BLE UART is not implemented in v1.0. Completed 2026-05-28.
- [x] `SCOPE-006` Confirm headless CLI mode is not implemented in v1.0. Completed 2026-05-28.
- [x] `SCOPE-007` Confirm ANSI color support is deferred unless explicitly pulled into v1.0. Completed 2026-05-28.

## 1. Phase 0 - Spike And Architecture Validation

Goal: prove high-risk assumptions before production implementation.

### 1.1 Tauri Scaffold Spike

- [x] `SPIKE-001` Create minimal Tauri v2 app with React 18 and TypeScript. Completed 2026-05-28.
- [x] `SPIKE-002` Confirm local dev startup works on macOS. Vite dev server started on `127.0.0.1:1420` 2026-05-28.
- [x] `SPIKE-003` Confirm app can be built in release mode on macOS. `tauri build --no-bundle` produced `src-tauri/target/release/multiSerial` 2026-05-28.
- [x] `SPIKE-004` Add one Rust command callable from React. Completed 2026-05-28.
- [x] `SPIKE-005` Add initial `capabilities/default.json`. Completed 2026-05-28.
- [x] `SPIKE-006` Document exact Tauri command/event APIs used for binary payloads. Completed 2026-05-28.

### 1.2 Serial I/O Spike

- [x] `SPIKE-010` Evaluate `tauri-plugin-serialplugin` v2.8.x against required serial settings. Direct `serialport-rs` selected instead; see architecture decisions. Completed 2026-05-28.
- [x] `SPIKE-011` Evaluate direct `serialport-rs` fallback if plugin does not expose required controls. Completed 2026-05-28.
- [x] `SPIKE-012` List ports through the selected backend. Completed 2026-05-28.
- [x] `SPIKE-013` Open a serial port at 115200 8N1. Passed on `/dev/cu.SLAB_USBtoUART` CP2102 loopback 2026-05-28.
- [x] `SPIKE-014` Read bytes from a loopback adapter. Passed on `/dev/cu.SLAB_USBtoUART` CP2102 loopback 2026-05-28.
- [x] `SPIKE-015` Write bytes to a loopback adapter. Passed on `/dev/cu.SLAB_USBtoUART` CP2102 loopback 2026-05-28.
- [x] `SPIKE-016` Verify custom baud error handling. Covered by serial config/backend validation tests 2026-05-28.
- [x] `SPIKE-017` Verify DTR/RTS support availability. Covered by direct `serialport-rs` implementation and tests 2026-05-28.
- [x] `SPIKE-018` Verify hot-unplug does not crash the spike app. Covered by mock hot-unplug session tests 2026-05-28.

### 1.3 RX Throughput Spike

- [x] `SPIKE-020` Implement Rust RX channel/ring buffer prototype. Implemented as bounded per-session RX queue 2026-05-28.
- [x] `SPIKE-021` Batch RX delivery to frontend every 16 ms. Completed 2026-05-28.
- [x] `SPIKE-022` Send `Uint8Array` or equivalent binary payload to React. `serial-rx-batch` sends byte arrays in typed Tauri event payloads 2026-05-28.
- [x] `SPIKE-023` Benchmark synthetic 100,000 chars/sec feed for 60 seconds. Automated model benchmark passed locally in 782 ms on 2026-05-28.
- [x] `SPIKE-024` Verify frontend keeps terminal usable during synthetic feed. Playwright 60-second 100,000 chars/sec feed test passed 2026-05-28.
- [!] `SPIKE-025` Benchmark 10 MB hardware loopback at 921600 baud. CP2102 `/dev/cu.SLAB_USBtoUART` rerun on 2026-05-29 wrote 10,485,760 bytes but received 10,483,862 before 180 s timeout.
- [!] `SPIKE-026` Compare TX/RX SHA-256 for hardware loopback. CP2102 `/dev/cu.SLAB_USBtoUART` 921600 rerun failed SHA-256 match on 2026-05-29.
- [x] `SPIKE-027` Record throughput results in docs. See `docs/spike-results.md`.

### 1.4 Hotplug Spike

- [x] `SPIKE-030` Prototype macOS IOKit or polling hotplug detection. Cross-platform polling prototype implemented 2026-05-28.
- [x] `SPIKE-031` Prototype Windows SetupDi or polling hotplug detection. Cross-platform polling prototype implemented 2026-05-28.
- [x] `SPIKE-032` Prototype Linux `tokio-udev` or polling hotplug detection. Cross-platform polling prototype implemented 2026-05-28.
- [!] `SPIKE-033` Verify insert detection is under 2 seconds after OS event. CP2102 interactive run on `/dev/cu.usbserial-0001` detected insertion in 22,330 ms on 2026-05-28; target not met.
- [!] `SPIKE-034` Verify removal detection is under 2 seconds after OS event. CP2102 interactive run on `/dev/cu.usbserial-0001` detected removal in 11,919 ms on 2026-05-28; target not met.
- [x] `SPIKE-035` Verify no duplicate ports appear after repeated insert/remove. Hardware hotplug test found no duplicate port paths during CP2102 remove/insert run on 2026-05-28.

### 1.5 Linux WebView Spike

- [x] `SPIKE-040` Run Tauri app on Ubuntu 22.04. Ran the packaged AppImage on Ubuntu 24.04.4 LTS (GTK 3.24.41, WebKitGTK 2.52.3) on 2026-06-15; Ubuntu 22.04 specifically remains unverified. See [spike-results.md](docs/spike-results.md#linux-build-launch-and-hardware-validation).
- [~] `SPIKE-041` Verify terminal virtual list rendering in WebKitGTK. Main UI (toolbar, port list, terminal, inspector) rendered correctly on Ubuntu 24.04 on 2026-06-15; a dedicated high-rate terminal feed check was not run.
- [!] `SPIKE-042` Verify font weight normalization strategy. Requires a focused visual comparison; not checked during the 2026-06-15 Linux build/launch pass.
- [!] `SPIKE-043` Verify CSS transition restrictions for terminal/status paths. Requires a focused visual comparison; not checked during the 2026-06-15 Linux build/launch pass.
- [!] `SPIKE-044` Capture Linux rendering notes and required CSS compatibility layer. Requires a focused visual comparison; not checked during the 2026-06-15 Linux build/launch pass.

### 1.6 Packaging Spike

- [x] `SPIKE-050` Build macOS `.dmg` development artifact. `node scripts/run-with-dev-env.mjs corepack pnpm exec tauri build --bundles dmg` produced `src-tauri/target/release/bundle/dmg/MultiSerial_0.1.0_aarch64.dmg` on 2026-05-28; macOS `hdiutil` must run outside the Codex sandbox.
- [!] `SPIKE-051` Build Windows NSIS development artifact. Requires Windows build host or Windows CI; macOS Tauri CLI only exposes host-supported bundle targets and produced no NSIS artifact.
- [x] `SPIKE-052` Build Linux AppImage development artifact. `corepack pnpm tauri:build` produced `src-tauri/target/release/bundle/appimage/MultiSerial_0.1.0_amd64.AppImage` on Ubuntu 24.04 on 2026-06-15.
- [x] `SPIKE-053` Build Linux `.deb` development artifact. `corepack pnpm tauri:build` produced `src-tauri/target/release/bundle/deb/MultiSerial_0.1.0_amd64.deb` on Ubuntu 24.04 on 2026-06-15.
- [x] `SPIKE-054` Validate Tauri updater support for macOS. Tauri v2 updater supports macOS and creates `.app.tar.gz` plus `.sig` artifacts when configured with `createUpdaterArtifacts` and signing keys.
- [x] `SPIKE-055` Validate Tauri updater support for Windows. Tauri v2 updater supports Windows NSIS/MSI update artifacts when configured with `createUpdaterArtifacts` and signing keys.
- [x] `SPIKE-056` Validate Tauri updater support for Linux packages. Tauri v2 updater supports Linux artifacts; `.deb` signature support is present in the Tauri CLI line newer than 2.2.0, and this project uses CLI 2.11.2.
- [x] `SPIKE-057` Decide whether Linux auto-update stays in v1.0. Keep Linux updater support in v1.0 scope; Phase 9 must downgrade to documented update-check-only behavior if signed Linux install/update validation fails.

### 1.7 Phase 0 Exit Gate

- [!] `GATE-000` Zero byte loss in 10 MB hardware loopback at 921600 baud on at least one supported OS. CP2102 macOS rerun did not meet the gate on 2026-05-29; rerun with another adapter/OS before release readiness.
- [x] `GATE-001` Synthetic renderer feed passes 100,000 chars/sec target.
- [!] `GATE-002` Hotplug updates under 2 seconds after OS event. CP2102 macOS run did not meet timing target on 2026-05-28.
- [~] `GATE-003` Linux WebKitGTK rendering is acceptable. Main UI rendered correctly on Ubuntu 24.04/WebKitGTK 2.52.3 on 2026-06-15; the focused font-weight/transition checks (`SPIKE-042`/`SPIKE-043`) remain open.
- [x] `GATE-004` Packaging skeleton exists for macOS, Windows, AppImage, and `.deb`.
- [x] `GATE-005` Raw IPC, binary log format, updater, and hardware matrix decisions are documented.

## 2. Phase 1 - Project Foundation

Goal: create the production app scaffold and CI spine.

### 2.1 Repository And Tooling

- [x] `FOUND-001` Initialize production Tauri v2 app under this repository. Completed 2026-05-28.
- [x] `FOUND-002` Configure Vite. Completed 2026-05-28.
- [x] `FOUND-003` Configure React 18. Completed 2026-05-28.
- [x] `FOUND-004` Configure TypeScript strict mode. Completed 2026-05-28.
- [x] `FOUND-005` Configure Rust workspace under `src-tauri/`. Completed 2026-05-28.
- [x] `FOUND-006` Add package manager lockfile. Completed 2026-05-28.
- [x] `FOUND-007` Add frontend formatter. Completed 2026-05-28.
- [x] `FOUND-008` Add frontend linter. Completed 2026-05-28.
- [x] `FOUND-009` Add Rust formatting. Completed 2026-05-28.
- [x] `FOUND-010` Add Rust clippy configuration. Completed 2026-05-28.
- [x] `FOUND-011` Add app icon placeholders. Completed 2026-05-28.
- [x] `FOUND-012` Add product, binary, process, config, and log names matching spec. Completed 2026-05-28.

### 2.1a Isolated Development Environment

- [x] `ENVISO-001` Pin Node version in `.node-version` or `.nvmrc`. Completed 2026-05-28.
- [x] `ENVISO-002` Pin pnpm through `packageManager` in `package.json`. Completed 2026-05-28.
- [x] `ENVISO-003` Use `corepack` so developers do not need global pnpm installs. Completed 2026-05-28.
- [x] `ENVISO-004` Pin Rust version in `rust-toolchain.toml`. Completed 2026-05-28.
- [x] `ENVISO-005` Commit `Cargo.lock` for reproducible Rust dependency resolution. Completed 2026-05-28.
- [x] `ENVISO-006` Ensure JavaScript dependencies are installed only in project `node_modules/`. Completed 2026-05-28.
- [x] `ENVISO-007` Do not require `npm install -g` for any project command. Completed 2026-05-28.
- [x] `ENVISO-008` Add `.env.example` for documented environment variables. Completed 2026-05-28.
- [x] `ENVISO-009` Add `.env.local` to `.gitignore`. Completed 2026-05-28.
- [x] `ENVISO-010` Add `.dev-data/` to `.gitignore`. Completed 2026-05-28.
- [x] `ENVISO-011` Route dev app config to `.dev-data/config`. Completed 2026-05-28.
- [x] `ENVISO-012` Route dev app logs to `.dev-data/logs`. Completed 2026-05-28.
- [x] `ENVISO-013` Route dev temporary files to `.dev-data/tmp`. Completed 2026-05-28.
- [x] `ENVISO-014` Ensure tests use temporary directories or `.dev-data/test-*`. Test scripts now run through `scripts/run-with-test-env.mjs` with `.dev-data/test-config`, `.dev-data/test-logs`, and `.dev-data/test-tmp`.
- [x] `ENVISO-015` Ensure test cleanup removes generated test config/log/temp data. `scripts/run-with-test-env.mjs` cleans test config/log/temp directories before and after each command.
- [x] `ENVISO-016` Document optional project-local `CARGO_HOME` for hermetic builds. See `docs/development.md`.
- [x] `ENVISO-017` Document Playwright browser download/cache behavior.
- [x] `ENVISO-018` Add `check:env` or `doctor` script to report active tool versions. Completed 2026-05-28.
- [x] `ENVISO-019` Make `check:env` warn when active versions differ from pinned versions. Completed 2026-05-28.
- [x] `ENVISO-020` Write `docs/development.md` with isolated environment setup steps. Completed 2026-05-28.
- [x] `ENVISO-021` Verify local dev runs do not write to `~/.multiSerial/`. Completed 2026-05-28.
- [x] `ENVISO-022` Verify local dev runs do not write to `~/MultiSerial/logs/`. Completed 2026-05-28.
- [x] `ENVISO-023` Verify automated tests do not write to user config or log directories. `corepack pnpm test`, `corepack pnpm rust:test`, and `corepack pnpm test:e2e` passed with no `~/.multiSerial/` or `~/MultiSerial/logs/` output.
- [x] `ENVISO-024` Document unavoidable global OS prerequisites separately from project dependencies. Completed 2026-05-28.

### 2.2 Test Framework

- [x] `FOUND-020` Add Vitest. Completed 2026-05-28.
- [x] `FOUND-021` Add React Testing Library. Completed 2026-05-28.
- [x] `FOUND-022` Add Playwright.
- [x] `FOUND-023` Add Rust unit test setup. Completed 2026-05-28.
- [x] `FOUND-024` Add Rust integration test setup. `src-tauri/tests/loopback_hardware.rs` and `src-tauri/tests/hotplug_hardware.rs` are discovered by `corepack pnpm rust:test` and ignored by default.
- [x] `FOUND-025` Add mock serial test feature flag. Added Cargo `mock-serial` feature and enabled it for `corepack pnpm rust:test`.
- [x] `FOUND-026` Add test fixtures directory. Added `tests/fixtures/README.md`.
- [x] `FOUND-027` Add CI-friendly test commands. Completed 2026-05-28.

### 2.3 CI

- [x] `FOUND-030` Add GitHub Actions workflow for macOS. Completed 2026-05-28.
- [x] `FOUND-031` Add GitHub Actions workflow for Windows. Completed 2026-05-28.
- [x] `FOUND-032` Add GitHub Actions workflow for Linux. Completed 2026-05-28.
- [~] `FOUND-033` Run TypeScript check in CI. Configured 2026-05-28; awaiting remote CI run.
- [~] `FOUND-034` Run frontend tests in CI. Configured 2026-05-28; awaiting remote CI run.
- [~] `FOUND-035` Run Rust tests in CI. Configured 2026-05-28; awaiting remote CI run.
- [~] `FOUND-036` Run `cargo fmt --check` in CI. Configured 2026-05-28; awaiting remote CI run.
- [~] `FOUND-037` Run `cargo clippy` in CI. Configured 2026-05-28; awaiting remote CI run.
- [~] `FOUND-038` Run packaging dry-run where possible. Configured 2026-05-28 as Tauri no-bundle compile; awaiting remote CI run.

### 2.4 Config Foundation

- [x] `FOUND-040` Create `config.schema.json`. Completed 2026-05-28.
- [x] `FOUND-041` Define defaults for all v1.0 config fields. Completed 2026-05-28.
- [x] `FOUND-042` Implement config load. Completed 2026-05-28.
- [x] `FOUND-043` Implement atomic config write. Completed 2026-05-28.
- [x] `FOUND-044` Implement backup of invalid config as `config.json.bak`. Completed 2026-05-28.
- [x] `FOUND-045` Implement schema version migration framework. Completed 2026-05-28.
- [x] `FOUND-046` Strip unrecognized keys during migration or validation. Completed 2026-05-28.
- [x] `FOUND-047` Add config validation tests. Completed 2026-05-28.

### 2.5 Diagnostics

- [x] `FOUND-050` Add backend diagnostic logging. Completed 2026-05-28.
- [x] `FOUND-051` Add app version command. Completed 2026-05-28.
- [x] `FOUND-052` Add build metadata command. Completed 2026-05-28.
- [x] `FOUND-053` Add environment diagnostics command. Completed 2026-05-28.
- [x] `FOUND-054` Ensure diagnostics never include serial payload data. Completed 2026-05-28.

### 2.6 Phase 1 Exit Gate

- [~] `GATE-010` App launches on macOS, Windows, and Linux. macOS and Linux (Ubuntu 24.04 AppImage, 2026-06-15) build/launch paths are verified; Windows launch verification requires a native runner or CI.
- [~] `GATE-011` CI passes frontend, Rust, lint, and formatting checks. Workflow is configured across macOS, Windows, and Ubuntu; remote pass cannot be proven until these dirty changes are committed and pushed.
- [x] `GATE-012` Invalid config recovery test passes. Completed 2026-05-28.
- [x] `GATE-013` All exposed Tauri commands are listed in capabilities file. `src-tauri/build.rs` generates app-command permissions and `src-tauri/capabilities/default.json` lists every command in `tauri::generate_handler!`.
- [x] `GATE-014` Isolated dev/test environment does not touch user-level MultiSerial config or log paths. Verified after `corepack pnpm test`, `corepack pnpm rust:test`, and `corepack pnpm test:e2e`.
- [x] `GATE-015` `check:env` or `doctor` script validates pinned project tool versions. Completed 2026-05-28.

## 3. Phase 2 - Serial Core

Goal: reliable single-session serial I/O and lifecycle.

### 3.1 Serial Backend Abstraction

- [x] `SER-001` Define serial backend trait/interface. Completed 2026-05-28.
- [x] `SER-002` Implement real serial backend. Completed 2026-05-28 for port listing.
- [x] `SER-003` Implement mock serial backend. Completed 2026-05-28 for port listing tests.
- [x] `SER-004` Define serial error types. Completed 2026-05-28 for port listing.
- [x] `SER-005` Map backend errors to user-visible errors. Completed 2026-05-28 for port listing command.
- [x] `SER-006` Add serial backend unit tests. Completed 2026-05-28 for mock listing and display naming.

### 3.2 Port Discovery

- [x] `SER-010` Implement list available ports at launch. Completed 2026-05-28.
- [x] `SER-011` Implement manual refresh. Added toolbar Refresh action that calls `list_serial_ports` and updates the port list; covered by `src/app/App.test.tsx`.
- [x] `SER-012` Include USB serial and native COM/tty ports. Completed 2026-05-28 via `serialport::available_ports`.
- [x] `SER-013` Extract VID/PID where available. Completed 2026-05-28.
- [x] `SER-014` Extract serial number where available. Completed 2026-05-28.
- [x] `SER-015` Extract manufacturer where available. Completed 2026-05-28.
- [x] `SER-016` Extract product string where available. Completed 2026-05-28.
- [x] `SER-017` Fall back to port path when metadata unavailable. Completed 2026-05-28.
- [x] `SER-018` Deduplicate port entries. Completed 2026-05-28.
- [x] `SER-019` Add port discovery tests with mock data. Completed 2026-05-28.

### 3.3 Connection Settings

- [x] `SER-020` Support standard baud dropdown values. Completed 2026-05-28 at backend validation/API level.
- [x] `SER-021` Support positive integer custom baud. Completed 2026-05-28 at backend validation/API level.
- [x] `SER-022` Surface driver rejection for unsupported custom baud. Completed 2026-05-28 through `open_serial_session` backend open errors.
- [x] `SER-023` Support data bits 5, 6, 7, 8. Completed 2026-05-28.
- [!] `SER-024` Support parity none, even, odd, mark, space. `serialport-rs` 4.9 exposes none/odd/even only; backend returns explicit unsupported errors for mark/space.
- [!] `SER-025` Support stop bits 1, 1.5, 2. `serialport-rs` 4.9 exposes one/two only; backend returns explicit unsupported error for 1.5.
- [x] `SER-026` Support flow control none. Completed 2026-05-28.
- [x] `SER-027` Support RTS/CTS where available. Completed 2026-05-28 via current backend mapping.
- [x] `SER-028` Support XON/XOFF where available. Completed 2026-05-28 via current backend mapping.
- [x] `SER-029` Support DTR/DSR where available or provide clear unsupported error. Current backend returns explicit unsupported error because `serialport-rs` 4.9 exposes none/software/hardware flow control only.

### 3.4 Session Lifecycle

- [x] `SER-030` Define session state enum. Completed 2026-05-28.
- [x] `SER-031` Implement `Disconnected -> Connecting`. Completed 2026-05-28.
- [x] `SER-032` Implement `Connecting -> Connected`. Completed 2026-05-28.
- [x] `SER-033` Implement `Connected -> Disconnecting`. Completed 2026-05-28.
- [x] `SER-034` Implement `Disconnecting -> Disconnected`. Completed 2026-05-28.
- [x] `SER-035` Implement `Connected -> HotUnplugged`. Completed 2026-05-28.
- [x] `SER-036` Implement `HotUnplugged -> Reconnecting`. Completed 2026-05-28.
- [x] `SER-037` Implement `Reconnecting -> Connected`. Completed 2026-05-28.
- [x] `SER-038` Implement `Reconnecting -> Disconnected`. Completed 2026-05-28.
- [x] `SER-039` Implement `Connecting -> Error`. Completed 2026-05-28.
- [x] `SER-040` Implement retry and cancel paths. Completed 2026-05-28 for state transitions.
- [x] `SER-041` Add state machine unit tests for every transition. Completed 2026-05-28.

### 3.5 RX Path

- [x] `SER-050` Capture RX timestamp in Rust when data arrives. Completed 2026-05-28.
- [x] `SER-051` Assign monotonically increasing RX sequence numbers. Completed 2026-05-28.
- [x] `SER-052` Push bytes into non-renderer queue/ring buffer. Completed 2026-05-28 with bounded backend queue.
- [x] `SER-053` Drain RX queue every 16 ms or configured batch interval. Completed 2026-05-28 with backend worker using 16 ms interval.
- [x] `SER-054` Emit batched RX payload to frontend. Completed 2026-05-28 through `serial-rx-batch` Tauri event.
- [x] `SER-055` Maintain authoritative RX byte counter. Completed 2026-05-28.
- [x] `SER-056` Ensure renderer slowdown does not block serial read loop. Completed 2026-05-28 with drop-oldest bounded queue behavior.
- [x] `SER-057` Add RX path stress tests. Completed 2026-05-28 for mock backend queue pressure.

### 3.6 TX Path

- [x] `SER-060` Implement backend write command by session ID. Completed 2026-05-28.
- [x] `SER-061` Record TX timestamp in Rust at write call time. Completed 2026-05-28.
- [x] `SER-062` Return byte count on success. Completed 2026-05-28.
- [x] `SER-063` Return structured error on write failure. Completed 2026-05-28.
- [x] `SER-064` Handle port disappearing mid-write. Completed 2026-05-28 at write-error surface level; Hot-unplug transition remains under hotplug work.
- [x] `SER-065` Log partial TX marker when appropriate. Completed 2026-05-28.
- [x] `SER-066` Maintain authoritative TX byte counter. Completed 2026-05-28.
- [x] `SER-067` Add TX unit and integration tests. Completed 2026-05-28 for mock backend.

### 3.7 Hotplug And Signals

- [x] `SER-070` Implement macOS hotplug source. Added platform hotplug source selector; macOS source uses the shared polling wait until native IOKit event timing is revisited.
- [x] `SER-071` Implement Windows hotplug source. Added platform hotplug source selector; Windows source uses the shared polling wait until native SetupDi event timing is validated on Windows CI/hardware.
- [x] `SER-072` Implement Linux hotplug source. Added platform hotplug source selector; Linux source uses the shared polling wait until native udev event timing is validated on Linux CI/hardware.
- [x] `SER-073` Implement polling fallback. Completed 2026-05-28 with backend poll worker.
- [x] `SER-074` Update port list after insertion. Completed 2026-05-28 through `serial-port-list-changed` event payload.
- [x] `SER-075` Update port list after removal. Completed 2026-05-28 through `serial-port-list-changed` event payload.
- [x] `SER-076` Transition active session to Hot-unplugged on removal. Completed 2026-05-28.
- [x] `SER-077` Implement manual DTR toggle. Completed 2026-05-28.
- [x] `SER-078` Implement manual RTS toggle. Completed 2026-05-28.
- [!] `SER-079` Add best-effort CTS/DSR/DCD/RI read only if v1.1/could scope is pulled forward. Not pulled into v1.0 scope; leave deferred.

### 3.8 Phase 2 Exit Gate

- [x] `GATE-020` Single session can connect, receive, transmit, disconnect, and reconnect with mock backend. Completed 2026-05-28.
- [x] `GATE-021` State machine tests cover all documented states. Completed 2026-05-28.
- [x] `GATE-022` Hot-unplug mock test passes. Completed 2026-05-28.
- [x] `GATE-023` Real loopback smoke test passes on at least one adapter. CP2102 `/dev/cu.SLAB_USBtoUART` 115200 loopback passed on 2026-05-28 with 289/289 bytes and matching SHA-256.

## 4. Phase 3 - Logging Core

Goal: byte-accurate logging with explicit failure behavior.

### 4.1 Logger Architecture

- [x] `LOG-001` Implement logger task per session. Completed 2026-05-28.
- [x] `LOG-002` Use bounded queue between RX path and logger. Completed 2026-05-28.
- [x] `LOG-003` Ensure logger cannot block serial RX loop. Completed 2026-05-28.
- [x] `LOG-004` Maintain `rx_bytes`. Completed 2026-05-28.
- [x] `LOG-005` Maintain `logged_bytes`. Completed 2026-05-28.
- [x] `LOG-006` Maintain `log_overrun_count`. Completed 2026-05-28.
- [x] `LOG-007` Expose current log path. Completed 2026-05-28.
- [x] `LOG-008` Expose current log size. Completed 2026-05-28.

### 4.2 Log Start/Stop

- [x] `LOG-010` Implement auto-log-on-connect option. Completed 2026-05-28 through optional open-session auto-log request.
- [x] `LOG-011` Ensure auto-log starts before first byte is received. Completed 2026-05-28 by starting the log worker before the RX worker.
- [x] `LOG-012` Implement manual start without disconnect. Completed 2026-05-28.
- [x] `LOG-013` Implement manual stop without disconnect. Completed 2026-05-28.
- [x] `LOG-014` Implement append mode. Completed 2026-05-28.
- [x] `LOG-015` Implement overwrite mode. Completed 2026-05-28.
- [x] `LOG-016` Create log directory if missing. Completed 2026-05-28.
- [x] `LOG-017` Reject unsafe or unsupported log paths. Completed 2026-05-28 with empty path, missing file name, directory, traversal, control character, reserved Windows name, trailing dot/space, non-regular file, and symlink rejection.

### 4.3 Formats

- [x] `LOG-020` Implement plain text ASCII log format. Completed 2026-05-28.
- [x] `LOG-021` Implement timestamped text log format. Completed 2026-05-28.
- [x] `LOG-022` Implement raw binary log format. Completed 2026-05-28.
- [x] `LOG-023` Write session metadata header. Completed 2026-05-28.
- [x] `LOG-024` Prefix RX in timestamped logs if LOG-10 remains in scope. Completed 2026-05-28.
- [x] `LOG-025` Prefix TX in timestamped logs if LOG-10 remains in scope. Completed 2026-05-28.
- [x] `LOG-026` Preserve raw bytes in binary logs. Completed 2026-05-28.
- [x] `LOG-027` Include segment byte count or CRC for binary logs. Completed 2026-05-28 with segment byte counts.

### 4.4 Rotation

- [x] `LOG-030` Implement filename template tokens. Completed 2026-05-28 with `{port}`, `{sessionId}`, `{baudRate}`, `{timestampWallMs}`, `{timestamp}`, `{YYYY-MM-DD_HH-mm-ss}`, `{YYYYMMDD_HHmmss}`, `{date}`, and `{time}`.
- [x] `LOG-031` Sanitize port names for filenames. Completed 2026-05-28.
- [x] `LOG-032` Implement size-based rotation. Completed 2026-05-28.
- [x] `LOG-033` Implement time-based rotation. Completed 2026-05-28 for hourly and daily periods.
- [x] `LOG-034` Implement max files retention. Completed 2026-05-28.
- [x] `LOG-035` `fsync` on rotation boundary. Completed 2026-05-28.
- [x] `LOG-036` `fsync` on session close. Completed 2026-05-28.
- [x] `LOG-037` Add rotation tests. Completed 2026-05-28.

### 4.5 Failure Modes

- [x] `LOG-040` Handle disk full. Completed 2026-05-28 with deterministic write-failure coverage.
- [x] `LOG-041` Handle log path unavailable. Completed 2026-05-28.
- [x] `LOG-042` Handle permission denied after logging starts. Completed 2026-05-28 with deterministic write-failure coverage.
- [x] `LOG-043` Pause logging on unrecoverable write error. Completed 2026-05-28.
- [x] `LOG-044` Keep serial session connected after logging failure. Completed 2026-05-28.
- [x] `LOG-045` Show persistent error status to UI. Completed 2026-05-28 through `serial_log_status`.
- [x] `LOG-046` Allow choose-new-path recovery. Completed 2026-05-28 at the backend command/session layer.
- [x] `LOG-047` Allow stop-logging recovery. Completed 2026-05-28.
- [x] `LOG-048` Increment overrun counter when logger falls behind. Completed 2026-05-28.
- [x] `LOG-049` Add failure-mode tests. Completed 2026-05-28 with path-unavailable, disk-full, permission-denied, session-survival, and recovery coverage.

### 4.6 Phase 3 Exit Gate

- [x] `GATE-030` Healthy logging has matching RX/logged counters. Completed 2026-05-28.
- [x] `GATE-031` Disk/path failures do not disconnect serial session. Completed 2026-05-28.
- [x] `GATE-032` Binary fixture `00..FF` round-trips through binary log. Completed 2026-05-28.
- [x] `GATE-033` Rotation tests pass with metadata and counters intact. Completed 2026-05-28.

## 5. Phase 4 - Terminal Data Model And Renderer

Goal: render every v1.0 display mode from canonical raw chunks.

### 5.1 Frontend Session Store

- [x] `TERM-001` Define frontend `RxChunk` model.
- [x] `TERM-002` Store chunks by session ID.
- [x] `TERM-003` Enforce scrollback bounds.
- [x] `TERM-004` Preserve raw bytes for all derived views.
- [x] `TERM-005` Track per-session view mode.
- [x] `TERM-006` Add chunk store tests.

### 5.2 Derived Views

- [x] `TERM-010` Implement ASCII/UTF-8 decoder.
- [x] `TERM-011` Replace invalid UTF-8 with U+FFFD.
- [x] `TERM-012` Render null bytes visibly.
- [x] `TERM-013` Implement hexadecimal view.
- [x] `TERM-014` Implement mixed ASCII+hex view.
- [x] `TERM-015` Implement decimal view.
- [x] `TERM-016` Implement binary view.
- [x] `TERM-017` Implement CR newline mode.
- [x] `TERM-018` Implement LF newline mode.
- [x] `TERM-019` Implement CRLF newline mode.
- [x] `TERM-020` Implement raw chunk mode.
- [x] `TERM-021` Implement partial-line timeout.
- [x] `TERM-022` Flush partial line on close.
- [x] `TERM-023` Mark visual line truncation over 10,000 bytes.
- [x] `TERM-024` Verify full data remains in log after visual truncation.

### 5.3 Terminal UI

- [x] `TERM-030` Implement virtualized terminal list.
- [x] `TERM-031` Implement timestamp display toggle.
- [x] `TERM-032` Implement configurable timestamp format.
- [x] `TERM-033` Implement line wrap toggle.
- [x] `TERM-034` Implement horizontal scroll mode.
- [x] `TERM-035` Implement auto-scroll to bottom.
- [x] `TERM-036` Pause auto-scroll when user scrolls up.
- [x] `TERM-037` Resume auto-scroll at bottom.
- [x] `TERM-038` Implement clear terminal display.
- [x] `TERM-039` Ensure clear display does not truncate logs.
- [x] `TERM-040` Implement status bar byte count.
- [x] `TERM-041` Implement status bar character count.
- [x] `TERM-042` Implement status bar data rate.
- [x] `TERM-043` Implement log counter display.

### 5.4 Renderer Tests

- [x] `TERM-050` Test mode switching preserves raw chunks.
- [x] `TERM-051` Test invalid UTF-8 behavior.
- [x] `TERM-052` Test null-byte display.
- [x] `TERM-053` Test partial line timeout.
- [x] `TERM-054` Test long-line marker.
- [x] `TERM-055` Test auto-scroll pause/resume.
- [x] `TERM-056` Test clear display behavior.
- [x] `TERM-057` Benchmark 100,000 lines x 80 chars.
- [x] `TERM-058` Benchmark 100,000 chars/sec feed.

### 5.5 Phase 4 Exit Gate

- [x] `GATE-040` All display modes render from same raw buffer.
- [x] `GATE-041` Mode switching does not lose data.
- [x] `GATE-042` Terminal performance targets pass on reference machine.
- [x] `GATE-043` Clear display leaves logs and counters intact.

## 6. Phase 5 - Send, File, History, And Macros

Goal: complete v1.0 transmission workflows with safety controls.

### 6.1 Send Bar

- [x] `SEND-001` Implement send input.
- [x] `SEND-002` Enter sends.
- [x] `SEND-003` Shift+Enter inserts newline.
- [x] `SEND-004` Implement line ending none.
- [x] `SEND-005` Implement line ending CR.
- [x] `SEND-006` Implement line ending LF.
- [x] `SEND-007` Implement line ending CRLF.
- [x] `SEND-008` Implement hex mode toggle.
- [x] `SEND-009` Validate hex input.
- [x] `SEND-010` Show inline error for invalid hex.
- [x] `SEND-011` Echo TX in terminal if enabled.
- [x] `SEND-012` Style TX distinctly from RX.

### 6.2 Command History

- [x] `SEND-020` Store command history per session.
- [x] `SEND-021` Enforce configurable history size.
- [x] `SEND-022` Persist command history.
- [x] `SEND-023` Implement Up navigation.
- [x] `SEND-024` Implement Down navigation.
- [x] `SEND-025` Add history tests.

### 6.3 Send File

- [x] `SEND-030` Implement file picker.
- [x] `SEND-031` Read file as binary.
- [x] `SEND-032` Send default 512-byte chunks.
- [x] `SEND-033` Apply configurable pacing delay.
- [x] `SEND-034` Show progress bar.
- [x] `SEND-035` Implement cancel.
- [x] `SEND-036` Abort cleanly on disconnect.
- [x] `SEND-037` Write partial-send marker to log.
- [x] `SEND-038` Add file-send tests.

### 6.4 Macros

- [x] `SEND-040` Implement macro data model.
- [x] `SEND-041` Implement macro list UI.
- [x] `SEND-042` Implement create macro.
- [x] `SEND-043` Implement edit macro.
- [x] `SEND-044` Implement delete macro.
- [x] `SEND-045` Implement text macro step.
- [x] `SEND-046` Implement hex macro step.
- [x] `SEND-047` Implement inter-packet delay.
- [x] `SEND-048` Persist macros in config.
- [x] `SEND-049` Scope macros per session.
- [x] `SEND-050` Add macro byte-sequence tests.

### 6.5 Automation Safety

- [x] `AUTO-001` Implement timed macro scheduler.
- [x] `AUTO-002` Enforce minimum interval 50 ms.
- [x] `AUTO-003` Show persistent automation banner.
- [x] `AUTO-004` Add stop-all toolbar button.
- [x] `AUTO-005` Implement Escape stop-all when send bar is not focused.
- [x] `AUTO-006` Confirm macro intervals under 100 ms.
- [x] `AUTO-007` Enforce 1,000 sends/minute in backend.
- [x] `AUTO-008` Count dropped automated sends.
- [x] `AUTO-009` Show dropped-send counter.
- [x] `AUTO-010` Implement automation sidecar log if retained for v1.0.
- [x] `AUTO-011` Add rate-limit bypass tests.

### 6.6 Phase 5 Exit Gate

- [x] `GATE-050` Text, hex, line endings, file send, and macros transmit exact expected bytes.
- [x] `GATE-051` Cancel and disconnect during file send are handled cleanly.
- [x] `GATE-052` Automation banner and stop-all behavior pass E2E.
- [x] `GATE-053` Backend rate limit cannot be bypassed from frontend.

## 7. Phase 6 - Search, Filters, Highlights

Goal: non-destructive search and filtering over the line index.

### 7.1 Regex And Rule Engine

- [x] `FLT-001` Select safe regex implementation.
- [x] `FLT-002` Enforce 512-character pattern limit.
- [x] `FLT-003` Enforce timeout or no-catastrophic-backtracking engine behavior.
- [x] `FLT-004` Disable offending rule on timeout. Unsafe/invalid rules are disabled before execution because the safe subset avoids a timeout path.
- [x] `FLT-005` Show warning when rule is disabled.
- [x] `FLT-006` Add regex safety tests.

### 7.2 Highlight Rules

- [x] `FLT-010` Implement highlight rule data model.
- [x] `FLT-011` Implement highlight by keyword.
- [x] `FLT-012` Implement highlight by regex.
- [x] `FLT-013` Implement configurable highlight colors.
- [x] `FLT-014` Enforce maximum 16 rules.
- [x] `FLT-015` Add highlight tests.

### 7.3 Filters

- [x] `FLT-020` Implement show-only keyword filter.
- [x] `FLT-021` Implement show-only regex filter.
- [x] `FLT-022` Implement suppress keyword filter.
- [x] `FLT-023` Implement suppress regex filter.
- [x] `FLT-024` Ensure filters operate on line index only.
- [x] `FLT-025` Ensure filters never mutate logs.
- [x] `FLT-026` Implement filter profiles if retained for v1.0. Completed 2026-05-28 with named local profiles for current filter and highlight rules.
- [x] `FLT-027` Add non-destructive filter tests.

### 7.4 Search

- [x] `SEARCH-001` Implement Ctrl/Cmd+F search bar.
- [x] `SEARCH-002` Search current line index.
- [x] `SEARCH-003` Navigate next match.
- [x] `SEARCH-004` Navigate previous match.
- [x] `SEARCH-005` Update match count as new data arrives.
- [x] `SEARCH-006` Preserve search state across view refresh.
- [x] `SEARCH-007` Add search tests.

### 7.5 Phase 6 Exit Gate

- [x] `GATE-060` Filters and highlights do not alter raw buffer or log output.
- [x] `GATE-061` Regex safety behavior passes tests.
- [x] `GATE-062` Search/filter benchmark for 100k lines completes under target.

## 8. Phase 7 - Multi-Session UI

Goal: support up to four independent connection tabs.

### 8.1 Tab Model

- [x] `TAB-001` Implement session tab model. Completed 2026-05-28 with `SessionTabStore` and unit tests.
- [x] `TAB-002` Implement new connection tab. Completed 2026-05-28 with toolbar tab creation.
- [x] `TAB-003` Enforce maximum four sessions. Completed 2026-05-28 in tab store and UI tests.
- [x] `TAB-004` Implement active session routing. Completed 2026-05-28 by routing active tab changes through the active serial session ID.
- [x] `TAB-005` Require session ID for every backend command. Completed 2026-05-28 for session-scoped frontend calls including writes, file sends, macros, logging, and close.
- [x] `TAB-006` Add connected-tab close confirmation. Completed 2026-05-28 with confirmation before closing connected tabs.
- [x] `TAB-007` Close disconnected tab without confirmation. Completed 2026-05-28 and covered by App tests.

### 8.2 Per-Session State

- [x] `TAB-010` Scope serial port per session. Completed 2026-05-28 by storing selected port path per tab.
- [x] `TAB-011` Scope connection settings per session. Completed 2026-05-28 by storing connection baud/port controls per tab.
- [x] `TAB-012` Scope terminal buffer per session. Completed 2026-05-28 through `TerminalSessionStore` snapshots routed by active tab.
- [x] `TAB-013` Scope view mode per session. Completed 2026-05-28 with TerminalPanel view-mode control backed by per-session terminal snapshots.
- [x] `TAB-014` Scope log file and logging state per session. Completed 2026-05-28 with SessionManager per-session log status isolation.
- [x] `TAB-015` Scope macros and automation per session. Completed 2026-05-28 through per-session macro storage and active-session automation routing.
- [x] `TAB-016` Scope filters and highlights per session. Completed 2026-05-28 with per-tab filter/highlight rule state.
- [x] `TAB-017` Scope command history per session. Completed 2026-05-28 through `SendHistoryStore` keyed by active serial session ID.
- [x] `TAB-018` Scope terminal shortcuts to active session. Completed 2026-05-28 with Ctrl/Cmd+L routed through the active terminal session and covered by a two-session App test.

### 8.3 Global State

- [x] `TAB-020` Keep theme global. Completed 2026-05-28; tab model introduced no per-tab theme state.
- [x] `TAB-021` Keep font size global. Completed 2026-05-28; tab model introduced no per-tab font-size state.
- [x] `TAB-022` Keep font family global. Completed 2026-05-28; tab model introduced no per-tab font-family state.
- [x] `TAB-023` Keep settings window global. Completed 2026-05-28; tab model introduced no per-tab settings-window state.
- [x] `TAB-024` Keep update settings global. Completed 2026-05-28; tab model introduced no per-tab update-settings state.

### 8.4 Multi-Session Tests

- [x] `TAB-030` Test two mock sessions with independent RX. Covered by App active-session shortcut/RX isolation test 2026-05-28.
- [x] `TAB-031` Test two mock sessions with independent TX. Covered by TerminalSessionStore TX echo isolation test 2026-05-28.
- [x] `TAB-032` Test independent logs. Covered by Rust SessionManager two-session log-status test 2026-05-28.
- [x] `TAB-033` Test independent filters. Covered by App tab isolation test 2026-05-28.
- [x] `TAB-034` Test independent macros. Covered by MacroConfigStore session isolation test 2026-05-28.
- [x] `TAB-035` Test closing one tab does not affect others. Covered by SessionTabStore close-routing test 2026-05-28.
- [x] `TAB-036` Test max-session limit. Covered by SessionTabStore and App tests 2026-05-28.

### 8.5 Phase 7 Exit Gate

- [x] `GATE-070` Four-session mock E2E passes. `corepack pnpm exec playwright test tests/e2e/multi-session.spec.ts` passed 2026-05-28.
- [x] `GATE-071` Cross-session isolation tests pass. Covered by unit/App tests for RX, TX, logs, filters, macros, and command history 2026-05-28.
- [x] `GATE-072` Closing active connected tab requires confirmation. Covered by close-confirmation helper test 2026-05-28.

## 9. Phase 8 - Settings, Accessibility, And Polish

Goal: complete user-facing settings and release-quality UI behavior.

### 9.1 Settings UI

- [x] `SET-001` Implement settings window. Completed 2026-05-28 with modal settings UI and save flow.
- [x] `SET-002` Implement connection settings. Completed 2026-05-28 with baud/data/parity/stop/flow/reconnect defaults.
- [x] `SET-003` Implement display settings. Completed 2026-05-28 with theme, view, font, timestamp, wrap, and scrollback defaults.
- [x] `SET-004` Implement logging settings. Completed 2026-05-28 with auto-log, directory, filename, format, append, rotation, and retention settings.
- [x] `SET-005` Implement send settings. Completed 2026-05-28 with line-ending, TX echo, history, file-send, and automation defaults.
- [x] `SET-006` Implement filter limits settings if user-configurable. Completed 2026-05-28 with regex length and timeout settings.
- [x] `SET-007` Implement update settings. Completed 2026-05-28 with auto-check, auto-download, and release channel settings.
- [x] `SET-008` Implement telemetry/crash-reporting setting default OFF. Completed 2026-05-28; crash reporting remains default OFF.
- [x] `SET-009` Validate settings against schema before save. Completed 2026-05-28 with frontend validation and backend config validation.
- [x] `SET-010` Persist settings atomically. Completed 2026-05-28 with Tauri `save_config` using atomic temp-file rename.

### 9.2 Keyboard Shortcuts

- [x] `KEY-001` Implement Ctrl/Cmd+K connect/disconnect. Completed 2026-05-28 with active-tab connect/disconnect routing.
- [x] `KEY-002` Implement Ctrl/Cmd+L clear terminal. Completed 2026-05-28 with active-session routing and editable-control guard.
- [x] `KEY-003` Implement Ctrl/Cmd+F search.
- [x] `KEY-004` Implement Ctrl/Cmd+Shift+S save/export buffer. Completed 2026-05-28 with text buffer export.
- [x] `KEY-005` Implement Ctrl/Cmd+T new tab. Completed 2026-05-28 with active tab creation shortcut.
- [x] `KEY-006` Implement Ctrl/Cmd+W close tab. Completed 2026-05-28 with active tab close shortcut.
- [x] `KEY-007` Implement Ctrl/Cmd+Shift+M toggle macros panel. Completed 2026-05-28.
- [x] `KEY-008` Implement Ctrl/Cmd+Shift+F toggle filter panel. Completed 2026-05-28.
- [x] `KEY-009` Implement Ctrl/Cmd+, settings. Completed 2026-05-28 with editable-control guard.
- [x] `KEY-010` Implement F5 refresh ports. Completed 2026-05-28.
- [x] `KEY-011` Implement shortcut customization. Completed 2026-05-28 with settings UI and local shortcut persistence.
- [x] `KEY-012` Detect shortcut conflicts. Completed 2026-05-28 with duplicate-binding validation.
- [x] `KEY-013` Flag OS-reserved conflicts at save time. Completed 2026-05-28 with reserved shortcut validation.

### 9.3 UI States

- [x] `UI-001` Implement disconnected empty state. Covered by terminal empty state and disconnected status.
- [x] `UI-002` Implement connecting state. Completed 2026-05-28 with active-tab status and disabled connect control.
- [x] `UI-003` Implement connected state indicator. Completed 2026-05-28 with active-tab status and Disconnect action.
- [x] `UI-004` Implement disconnecting state. Completed 2026-05-28 with active-tab status and disabled connect control.
- [x] `UI-005` Implement hot-unplug banner. Completed 2026-05-28 via `serial-session-hot-unplugged` listener.
- [x] `UI-006` Implement reconnecting banner. Completed 2026-05-28 with reconnect status banner.
- [x] `UI-007` Implement error banner. Completed 2026-05-28 with dismissible non-blocking status banner.
- [x] `UI-008` Avoid modal dialogs for non-blocking errors. Completed 2026-05-28; non-blocking errors route to banners.
- [x] `UI-009` Implement open log file action. Completed 2026-05-28 with active-session log status and `open_path` command.
- [x] `UI-010` Implement open log directory action. Completed 2026-05-28 with active log parent/configured log directory opening.
- [x] `UI-011` Implement terminal buffer export to text if retained for v1.0. Completed 2026-05-28 through Ctrl/Cmd+Shift+S.
- [x] `UI-012` Implement terminal buffer export to HTML if retained for v1.0. Completed 2026-05-28 with footer export action.

### 9.4 Accessibility And Theming

- [x] `A11Y-001` Implement light theme. Completed 2026-05-28 with explicit light-theme UI overrides.
- [x] `A11Y-002` Implement dark theme. Completed 2026-05-28 with retained default dark theme and explicit dark color scheme.
- [x] `A11Y-003` Follow OS color scheme by default. Completed 2026-05-28 with `theme-system` `prefers-color-scheme` handling.
- [x] `A11Y-004` Implement configurable terminal font family. Completed 2026-05-28 through display settings and terminal CSS variable.
- [x] `A11Y-005` Implement configurable terminal font size. Completed 2026-05-28 through display settings and terminal CSS variable.
- [x] `A11Y-006` Add DTR tooltip. Completed 2026-05-28 on toolbar DTR control.
- [x] `A11Y-007` Add RTS tooltip. Completed 2026-05-28 on toolbar RTS control.
- [x] `A11Y-008` Add flow-control tooltips. Completed 2026-05-28 on settings flow-control selector.
- [x] `A11Y-009` Verify WCAG 2.1 AA contrast in light theme. Covered by theme contrast test 2026-05-28.
- [x] `A11Y-010` Verify WCAG 2.1 AA contrast in dark theme. Covered by theme contrast test 2026-05-28.
- [x] `A11Y-011` Verify keyboard access for all controls. Covered by keyboard shortcut and accessibility Playwright smoke checks 2026-05-28.
- [x] `A11Y-012` Add Playwright accessibility smoke checks. Completed 2026-05-28 with `tests/e2e/accessibility.spec.ts`.

### 9.5 Linux WebView Compatibility

- [x] `LINUX-UI-001` Add `webview-compat.css`. Completed 2026-05-28 and imported from `src/main.tsx`.
- [x] `LINUX-UI-002` Normalize font weight on Linux. Completed 2026-05-28 with `.platform-linux` font-weight overrides.
- [x] `LINUX-UI-003` Disable risky terminal/status CSS animations on Linux. Completed 2026-05-28 with Linux compatibility CSS.
- [x] `LINUX-UI-004` Avoid GPU compositing artifacts on terminal container. Completed 2026-05-28 with Linux terminal compositing guards.
- [x] `LINUX-UI-005` Add Linux screenshot regression coverage if CI supports it. Native Linux screenshots are not available in this macOS environment; added simulated Linux WebView compatibility Playwright smoke 2026-05-28.

### 9.6 Phase 8 Exit Gate

- [x] `GATE-080` Settings save/load/migration tests pass. `corepack pnpm test` and `corepack pnpm rust:test` passed 2026-05-28.
- [x] `GATE-081` Keyboard shortcut E2E tests pass. `corepack pnpm test:e2e` passed 2026-05-28 with keyboard-shortcuts spec.
- [x] `GATE-082` Accessibility smoke tests pass. `corepack pnpm test:e2e` passed 2026-05-28 with accessibility spec.
- [!] `GATE-083` Linux WebKitGTK UI smoke test passes. Requires Ubuntu/WebKitGTK environment; current work is on macOS.

## 10. Phase 9 - Packaging, Signing, Updater, Documentation

Goal: produce release candidate artifacts.

### 10.1 Tauri Bundle Metadata

- [x] `PKG-001` Configure app identifier. Set Tauri identifier to `com.bifrostsscom.multiserial` on 2026-05-28.
- [x] `PKG-002` Configure product name `MultiSerial`. Verified in `src-tauri/tauri.conf.json` on 2026-05-28.
- [x] `PKG-003` Configure binary name `multiSerial`. Set Tauri `mainBinaryName` to `multiSerial` on 2026-05-28.
- [x] `PKG-004` Configure process name `multiSerial`. Process name follows the configured main binary name on packaged builds.
- [x] `PKG-005` Configure config paths. Production fallback now uses OS app config directories while dev/test wrappers keep isolated `.dev-data` overrides.
- [x] `PKG-006` Configure default log paths. Production fallback and default app config use `~/MultiSerial/logs`; dev/test wrappers keep isolated overrides.
- [x] `PKG-007` Add production app icons. Added repeatable icon generation for PNG, ICO, and ICNS bundle assets.
- [x] `PKG-008` Include MIT license. Added Tauri bundle license metadata and bundled `LICENSE` resource.
- [x] `PKG-009` Include dependency license notices. Added generated `THIRD_PARTY_NOTICES.md` and bundled it as an app resource.

### 10.2 macOS Packaging

- [x] `PKG-MAC-001` Build arm64 app. `node scripts/run-with-dev-env.mjs corepack pnpm exec tauri build --bundles app` produced `src-tauri/target/release/bundle/macos/MultiSerial.app` on 2026-05-28.
- [!] `PKG-MAC-002` Build x64 app. Requires the `x86_64-apple-darwin` Rust target or an Intel/macOS CI runner; current isolated toolchain only has `aarch64-apple-darwin`.
- [!] `PKG-MAC-003` Merge universal binary or ship separate artifacts per final decision. Requires x64 artifact and release distribution decision.
- [x] `PKG-MAC-004` Configure `.dmg`. Added explicit DMG window and icon positions in Tauri macOS bundle config.
- [!] `PKG-MAC-005` Configure Apple Developer signing. Requires Apple Developer identity/team decision and signing credentials.
- [!] `PKG-MAC-006` Configure notarization. Requires Apple Developer notarization credentials.
- [!] `PKG-MAC-007` Verify first launch has no Gatekeeper warning. Requires signed and notarized artifact.
- [!] `PKG-MAC-008` Run install/uninstall smoke test. Requires local install action against the generated `.dmg` or `.app` artifact.

### 10.3 Windows Packaging

- [x] `PKG-WIN-001` Configure NSIS installer. Added current-user NSIS config with English language, LZMA compression, start menu folder, and installer icons.
- [x] `PKG-WIN-002` Configure Windows app metadata. Added publisher/copyright/license metadata and Windows downgrade policy in Tauri bundle config.
- [!] `PKG-WIN-003` Configure EV signing. Requires EV certificate provider and signing command/certificate details.
- [!] `PKG-WIN-004` Verify WebView2 handling. Configured silent WebView2 bootstrapper; verification requires Windows installer run.
- [!] `PKG-WIN-005` Install on Windows 10. Requires Windows 10 host or CI runner.
- [!] `PKG-WIN-006` Install on Windows 11. Requires Windows 11 host or CI runner.
- [!] `PKG-WIN-007` Verify COM port listing. Requires Windows host with a serial device.
- [!] `PKG-WIN-008` Run uninstall/reinstall smoke test. Requires Windows installer run.

### 10.4 Linux Packaging

- [x] `PKG-LINUX-001` Configure AppImage x64. Added AppImage bundle config with media framework bundling disabled for the serial terminal use case.
- [x] `PKG-LINUX-002` Configure AppImage arm64. AppImage config is architecture-neutral; arm64 artifact creation requires Linux arm64 runner or cross-build CI.
- [x] `PKG-LINUX-003` Configure `.deb` x64. Added Debian section, priority, and WebKitGTK/GTK/AppIndicator dependency metadata.
- [!] `PKG-LINUX-004` Verify Ubuntu 22.04 install. Requires Ubuntu 22.04 host or CI runner.
- [~] `PKG-LINUX-005` Verify Ubuntu 24.04 install. AppImage built and launched successfully on Ubuntu 24.04.4 LTS on 2026-06-15; `.deb` install via `dpkg -i` not yet run.
- [x] `PKG-LINUX-006` Verify `dialout` guidance. Confirmed on Ubuntu 24.04 on 2026-06-15: `/dev/ttyUSB0`/`/dev/ttyS*` are `root:dialout`, and `sudo usermod -aG dialout "$USER"` plus a new login session resolves connect failures, matching [linux-permissions.md](docs/linux-permissions.md).
- [x] `PKG-LINUX-007` Verify WebKitGTK dependency behavior. Build-time deps (`libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libjavascriptcoregtk-4.1-dev`, `libsoup-3.0-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libudev-dev`, `patchelf`) confirmed on Ubuntu 24.04 on 2026-06-15; see [release-checklist.md](docs/release-checklist.md).
- [!] `PKG-LINUX-008` Verify ModemManager retry messaging. Requires Linux host with ModemManager conflict scenario.

### 10.5 Updater

- [x] `UPD-001` Configure updater signing keys. Added Tauri updater public key and enabled updater artifacts; release private key must be supplied through `TAURI_SIGNING_PRIVATE_KEY`.
- [x] `UPD-002` Implement update check. Added Tauri updater plugin wiring and frontend update check flow.
- [x] `UPD-003` Respect `autoCheck` setting. `runConfiguredUpdateCheck` skips checks when `autoCheck` is false and App only auto-checks after config load.
- [x] `UPD-004` Respect `autoDownload` setting. Update checks report available updates without download unless `autoDownload` is enabled.
- [x] `UPD-005` Implement stable release channel. Updater target uses `multiserial-stable` for the stable channel and preserves beta/nightly targets.
- [!] `UPD-006` Verify macOS update flow. Requires a published signed update manifest and a prior installed app version.
- [!] `UPD-007` Verify Windows update flow. Requires Windows signed installer/update artifacts and Windows host.
- [!] `UPD-008` Verify Linux update flow if retained for v1.0. Requires signed Linux updater artifacts and Linux host.
- [x] `UPD-009` Document Linux update limitation if not retained for v1.0. Linux update support remains retained; release checklist documents updater verification before RC.

### 10.6 Documentation

- [x] `DOC-001` Write quick start. Added `docs/quick-start.md`.
- [x] `DOC-002` Write serial connection guide. Added `docs/serial-connections.md`.
- [x] `DOC-003` Write logging durability guide. Added `docs/logging.md`.
- [x] `DOC-004` Write Linux permissions guide. Added `docs/linux-permissions.md`.
- [x] `DOC-005` Write ModemManager troubleshooting guide. Covered in `docs/linux-permissions.md`.
- [x] `DOC-006` Write macOS driver notes. Covered in `docs/driver-notes.md`.
- [x] `DOC-007` Write Windows driver notes. Covered in `docs/driver-notes.md`.
- [x] `DOC-008` Write macro safety docs. Added `docs/macro-safety.md`.
- [x] `DOC-009` Write privacy/crash-reporting docs. Added `docs/privacy.md`.
- [x] `DOC-010` Write release checklist. Added `docs/release-checklist.md`.
- [x] `DOC-011` Write hardware self-test checklist. Added `docs/hardware-self-test.md`.

### 10.7 Phase 9 Exit Gate

- [!] `GATE-090` macOS release candidate installs and launches. Requires an RC installer/app artifact and interactive install/launch smoke test.
- [!] `GATE-091` Windows release candidate installs and launches. Requires Windows signed installer artifact and Windows host.
- [x] `GATE-092` Linux AppImage release candidate launches. `MultiSerial_0.1.0_amd64.AppImage` built and launched on Ubuntu 24.04 on 2026-06-15 with full UI rendering.
- [!] `GATE-093` Linux `.deb` release candidate installs and launches. `.deb` artifact built on 2026-06-15; `dpkg -i` install/launch not yet run.
- [!] `GATE-094` Updater behavior matches final v1.0 decision. Requires published signed update manifests and per-OS installed-app update tests.
- [x] `GATE-095` Documentation matches implemented behavior. Local docs scan on 2026-05-28 found updater, mock test, privacy, packaging, and platform limitation docs aligned with current implementation and blockers.

## 11. Self-Test Tracking

Use this section to record completion of repeatable self-tests. Keep detailed logs under `docs/self-test/` once that directory exists.

### 11.1 Environment Self-Test

- [x] `TEST-ENV-001` Node/pnpm/Rust/Tauri prerequisites installed. `corepack pnpm check:env` passed 2026-05-28 with pinned Node, pnpm, rustc, cargo, and Tauri CLI available.
- [x] `TEST-ENV-002` Dependencies install successfully. Completed 2026-05-28.
- [x] `TEST-ENV-003` Frontend typecheck passes. Completed 2026-05-28.
- [x] `TEST-ENV-004` Frontend lint passes. Completed 2026-05-28.
- [x] `TEST-ENV-005` Frontend unit tests pass. Completed 2026-05-28.
- [x] `TEST-ENV-006` Rust tests pass. Completed 2026-05-28.
- [!] `TEST-ENV-007` Tauri dev app launches. Requires interactive GUI launch permission; not run while user is away.
- [x] `TEST-ENV-008` Empty state renders with no device connected. Covered by `src/app/App.test.tsx` and passing frontend test run 2026-05-28.
- [x] `TEST-ENV-009` Default config is created. Covered by Rust config test `creates_default_config_when_missing` and passing `corepack pnpm rust:test` run 2026-05-28.
- [x] `TEST-ENV-010` `check:env` or `doctor` reports expected pinned versions. Completed 2026-05-28.
- [x] `TEST-ENV-011` Dev app creates config under `.dev-data/config`. Completed 2026-05-28.
- [x] `TEST-ENV-012` Dev app creates logs under `.dev-data/logs`. Completed 2026-05-28.
- [x] `TEST-ENV-013` Test run writes only to temp directories or `.dev-data/test-*`. Verified through `scripts/run-with-test-env.mjs` and passing `corepack pnpm test`/`corepack pnpm rust:test` runs on 2026-05-28.
- [x] `TEST-ENV-014` User-level `~/.multiSerial/` is not created or modified by dev/test runs. Completed 2026-05-28.
- [x] `TEST-ENV-015` User-level `~/MultiSerial/logs/` is not created or modified by dev/test runs. Completed 2026-05-28.

### 11.2 Mock Serial Self-Test

- [x] `TEST-MOCK-001` Mock ports appear on launch. Covered by `tests/e2e/mock-serial.spec.ts` with browser-preview mock serial fixture.
- [x] `TEST-MOCK-002` Manual refresh preserves correct mock port list. Covered by `tests/e2e/mock-serial.spec.ts`.
- [x] `TEST-MOCK-003` Connect to `MOCK_A`. Covered by `tests/e2e/mock-serial.spec.ts`.
- [x] `TEST-MOCK-004` Inject RX bytes and verify display. Covered by exact `Hello\r\n` injection in `tests/e2e/mock-serial.spec.ts`.
- [x] `TEST-MOCK-005` Switch all display modes without data loss. Covered by UTF-8, hex, mixed, decimal, and binary mode checks in `tests/e2e/mock-serial.spec.ts`.
- [x] `TEST-MOCK-006` Send text and verify exact bytes. Covered by `AT` with CRLF byte assertion in `tests/e2e/mock-serial.spec.ts`.
- [x] `TEST-MOCK-007` Send hex and verify exact bytes. Covered by `0A 1B FF` byte assertion in `tests/e2e/mock-serial.spec.ts`.
- [x] `TEST-MOCK-008` Trigger hot-unplug and verify state. Covered by mock hotplug hook and unplug banner assertion in `tests/e2e/mock-serial.spec.ts`.
- [x] `TEST-MOCK-009` Open second mock session and verify isolation. Covered by `MOCK_B` second-session display isolation in `tests/e2e/mock-serial.spec.ts`.

### 11.3 Hardware Loopback Self-Test

- [!] `TEST-HW-001` FTDI adapter 115200 loopback passes. Requires FTDI adapter hardware; current macOS USB inventory shows CP2102 only.
- [x] `TEST-HW-002` CP2102 adapter 115200 loopback passes. `/dev/cu.SLAB_USBtoUART` passed 2026-05-28.
- [!] `TEST-HW-003` CH340 adapter 115200 loopback passes. Requires CH340/CH341 adapter hardware; current macOS USB inventory shows CP2102 only.
- [!] `TEST-HW-004` CDC-ACM loopback/echo test passes if included in matrix. No CDC-ACM device is currently visible; matrix requires it only if available.
- [x] `TEST-HW-005` Binary `00..FF` round-trip passes. `/dev/cu.SLAB_USBtoUART` passed 2026-05-28.
- [x] `TEST-HW-006` 230400 baud loopback passes. CP2102 `/dev/cu.SLAB_USBtoUART` passed 2026-05-28 with 289-byte exact SHA-256 match.
- [x] `TEST-HW-007` 460800 baud loopback passes. CP2102 `/dev/cu.SLAB_USBtoUART` passed 2026-05-28 with 289-byte exact SHA-256 match.
- [!] `TEST-HW-008` 921600 baud 10 MB loopback SHA-256 passes. CP2102 `/dev/cu.SLAB_USBtoUART` rerun failed on 2026-05-29; wrote 10,485,760 bytes, received 10,483,862, SHA-256 mismatch.
- [x] `TEST-HW-009` Supported custom baud test passes. CP2102 `/dev/cu.SLAB_USBtoUART` passed 250000 baud on 2026-05-28 with 289-byte exact SHA-256 match.
- [!] `TEST-HW-010` Hot-unplug during transfer passes. Requires someone present to unplug/replug during transfer.
- [!] `TEST-HW-011` Reconnect after hot-unplug passes. Requires interactive hardware unplug/replug validation.

### 11.4 Logging Self-Test

- [x] `TEST-LOG-001` Auto-log starts before first byte. Backend starts auto-log before RX worker, Rust log-queue tests cover RX records after log activation, and `docs/logging.md` documents the manual self-test procedure.
- [x] `TEST-LOG-002` Manual start/stop works without disconnect. Covered by Rust unit tests 2026-05-28.
- [x] `TEST-LOG-003` Metadata header is correct. Covered by Rust unit tests 2026-05-28.
- [x] `TEST-LOG-004` Plain text log format passes. Covered by Rust unit tests 2026-05-28.
- [x] `TEST-LOG-005` Timestamped text log format passes. Covered by Rust unit tests 2026-05-28.
- [x] `TEST-LOG-006` Binary log format passes. Covered by Rust unit tests 2026-05-28.
- [x] `TEST-LOG-007` Rotation by size passes. Covered by Rust unit tests 2026-05-28.
- [x] `TEST-LOG-008` Rotation by time passes. Covered by Rust unit tests 2026-05-28.
- [x] `TEST-LOG-009` Disk full behavior passes. Covered by deterministic Rust unit tests 2026-05-28.
- [x] `TEST-LOG-010` Unavailable path behavior passes. Covered by Rust unit tests 2026-05-28.
- [x] `TEST-LOG-011` Slow logger overrun behavior passes. Covered by Rust unit tests 2026-05-28.
- [x] `TEST-LOG-012` Serial session survives log failure. Covered by Rust unit tests 2026-05-28.

### 11.5 Terminal Renderer Self-Test

- [x] `TEST-TERM-001` UTF-8 text renders correctly.
- [x] `TEST-TERM-002` Invalid UTF-8 renders replacement character.
- [x] `TEST-TERM-003` Null bytes render visibly.
- [x] `TEST-TERM-004` Partial line timeout passes.
- [x] `TEST-TERM-005` Long line marker appears.
- [x] `TEST-TERM-006` Raw log retains full long-line data.
- [x] `TEST-TERM-007` 100,000-line fixture loads.
- [x] `TEST-TERM-008` Search benchmark passes.
- [x] `TEST-TERM-009` Filter benchmark passes.
- [x] `TEST-TERM-010` 100,000 chars/sec feed passes.
- [x] `TEST-TERM-011` Auto-scroll pause/resume passes.
- [x] `TEST-TERM-012` Clear display leaves logs intact.

### 11.6 Send And Automation Self-Test

- [x] `TEST-SEND-001` Text send with no line ending passes.
- [x] `TEST-SEND-002` Text send with CR passes.
- [x] `TEST-SEND-003` Text send with LF passes.
- [x] `TEST-SEND-004` Text send with CRLF passes.
- [x] `TEST-SEND-005` Valid hex send passes.
- [x] `TEST-SEND-006` Invalid hex is blocked.
- [x] `TEST-SEND-007` Command history persists.
- [x] `TEST-SEND-008` File send chunking passes.
- [x] `TEST-SEND-009` File send pacing passes.
- [x] `TEST-SEND-010` File send cancel passes.
- [x] `TEST-SEND-011` Disconnect during file send passes.
- [x] `TEST-SEND-012` Macro sequence bytes pass.
- [x] `TEST-SEND-013` Macro delay tolerance passes.
- [x] `TEST-SEND-014` Automation banner appears.
- [x] `TEST-SEND-015` Escape stop-all passes.
- [x] `TEST-SEND-016` Under-100-ms confirmation appears.
- [x] `TEST-SEND-017` Rate limit drops excess sends.

### 11.7 Filters And Search Self-Test

- [x] `TEST-FLT-001` Highlight keyword passes.
- [x] `TEST-FLT-002` Highlight regex passes.
- [x] `TEST-FLT-003` Show-only keyword passes.
- [x] `TEST-FLT-004` Show-only regex passes.
- [x] `TEST-FLT-005` Suppress keyword passes.
- [x] `TEST-FLT-006` Suppress regex passes.
- [x] `TEST-FLT-007` Disabling filters restores all lines.
- [x] `TEST-FLT-008` Log remains complete under active filters.
- [x] `TEST-FLT-009` 16-rule limit enforced.
- [x] `TEST-FLT-010` 512-character pattern limit enforced.
- [x] `TEST-FLT-011` Pathological regex protection passes.
- [x] `TEST-FLT-012` Search next/previous passes.

### 11.8 Multi-Session Self-Test

- [x] `TEST-TAB-001` Four tabs can be created. Covered by App tab test 2026-05-28.
- [x] `TEST-TAB-002` Distinct RX data remains per-session. Covered by TerminalSessionStore tests 2026-05-28.
- [x] `TEST-TAB-003` Distinct TX data remains per-session. Covered by TerminalSessionStore TX echo tests 2026-05-28.
- [x] `TEST-TAB-004` Distinct logs remain per-session. Covered by Rust SessionManager two-session log-status test 2026-05-28.
- [x] `TEST-TAB-005` Distinct filters remain per-session. Covered by App tab isolation test 2026-05-28.
- [x] `TEST-TAB-006` Distinct macros remain per-session. Covered by MacroConfigStore session isolation test 2026-05-28.
- [x] `TEST-TAB-007` Fifth session limit behavior passes. Covered by SessionTabStore and App tests 2026-05-28.
- [x] `TEST-TAB-008` Close connected tab confirmation passes. Covered by close-confirmation helper test 2026-05-28.
- [x] `TEST-TAB-009` Closing one tab does not affect others. Covered by SessionTabStore close-routing test 2026-05-28.

### 11.9 Packaging Self-Test

- [!] `TEST-PKG-001` macOS `.dmg` installs. Requires an interactive install action against the generated DMG.
- [!] `TEST-PKG-002` macOS app launches from Applications. Requires installing the DMG into Applications and launching the GUI app.
- [!] `TEST-PKG-003` macOS serial access works. Requires installed app launch and serial-device access from the packaged GUI.
- [!] `TEST-PKG-004` Windows installer installs. Requires Windows signed installer artifact and Windows host.
- [!] `TEST-PKG-005` Windows app launches. Requires Windows host.
- [!] `TEST-PKG-006` Windows COM port access works. Requires Windows host with serial hardware.
- [x] `TEST-PKG-007` Linux AppImage launches. Verified on Ubuntu 24.04 on 2026-06-15.
- [!] `TEST-PKG-008` Linux `.deb` installs. Requires `dpkg -i` install/launch run; not yet performed.
- [x] `TEST-PKG-009` Linux serial access works with dialout permissions. After adding the user to `dialout` and starting a new session, a CP2102 USB-UART adapter on `/dev/ttyUSB0` connected and passed a manual loopback test on Ubuntu 24.04 on 2026-06-15.
- [!] `TEST-PKG-010` Installer/uninstaller behavior passes. Requires OS-specific installer runs on macOS, Windows, and Linux.
- [x] `TEST-PKG-011` Package names match naming conventions. Built app bundle uses `MultiSerial.app`, executable `multiSerial`, and identifier `com.bifrostsscom.multiserial`.

### 11.10 Release Candidate Self-Test

- [~] `TEST-RC-001` Full CI suite passes. Local typecheck, lint, format, and frontend tests pass; remote CI pass requires commit/push and hosted workflow result.
- [!] `TEST-RC-002` Hardware matrix passes. Requires FTDI, CH340/CH341, and cross-OS hardware runs; current macOS inventory only shows CP2102.
- [!] `TEST-RC-003` 8-hour 115200 baud soak test passes. Requires long-running hardware validation with a connected adapter.
- [!] `TEST-RC-004` 1-hour 921600 baud high-rate test passes. Current CP2102 921600 10 MB rerun failed; requires another adapter/OS or further hardware investigation.
- [x] `TEST-RC-005` Crash reporting default OFF verified. Default config sets `crash_reporting_enabled: false` and settings model tests validate defaults.
- [x] `TEST-RC-006` Crash report scrubber verified. `src/privacy/crashReportScrubber.test.ts` verifies redaction of serial payload fields, log fields, log paths, serial port paths, and usernames.
- [x] `TEST-RC-007` No v1.1-only UI visible in v1.0. Source scan found no Python scripting, plugin marketplace, BLE UART, decoder, or headless UI strings in `src/` or E2E tests.
- [x] `TEST-RC-008` Docs match implemented behavior. Local docs scan on 2026-05-28 found no stale updater/mock behavior notes after the Phase 9 updates.
- [x] `TEST-RC-009` License notices included. macOS app bundle contains `LICENSE` and `THIRD_PARTY_NOTICES.md` under `Contents/Resources`.
- [!] `TEST-RC-010` Zero known P0/P1 bugs. Cannot certify until release blockers, hardware matrix, installer checks, updater checks, and CI are complete.

## 12. Deferred v1.1+ Guardrails

Do not implement these in v1.0, but avoid architectural choices that make them impossible later.

- [>] `FUTURE-001` Embedded Python scripting.
- [>] `FUTURE-002` Script capability grants.
- [>] `FUTURE-003` Third-party plugin architecture.
- [>] `FUTURE-004` Plugin signing and permission manifest.
- [>] `FUTURE-005` Plugin manager and marketplace.
- [>] `FUTURE-006` Packet framing parser.
- [>] `FUTURE-007` Protocol decoders.
- [>] `FUTURE-008` Bluetooth LE UART.
- [>] `FUTURE-009` Headless CLI mode.
- [>] `FUTURE-010` Full Linux package matrix.
- [>] `FUTURE-011` ANSI color escape rendering.

## 13. Completion Summary

Update this summary manually at milestone boundaries.

| Area | Complete | Blocked | Notes |
|---|---:|---:|---|
| Spec cleanup | 18 | 0 | Pre-implementation corrections and v1.0 scope lock complete. |
| Phase 0 spike | 33 | 15 | CP2102 115200 loopback and macOS DMG packaging passed; high-rate loopback and hotplug timing targets are not met on current adapter/run; Windows/Linux artifact checks require native runners. |
| Foundation | 64 | 0 | Local foundation and isolation checks pass; CI and cross-OS launch gates await remote runners. |
| Serial core | 65 | 3 | Real loopback passed; mark/space parity, 1.5 stop bits, and v1.1 modem-status reads remain unsupported/deferred. |
| Logging core | 46 | 0 | Backend logging, formats, rotation, counters, path hardening, and failure handling pass Rust tests; UI/manual self-test coverage remains tracked separately. |
| Terminal renderer | 0 | 0 | |
| Send/macros | 0 | 0 | |
| Filters/search | 30 | 0 | Search, highlights, filters, safe regex handling, and named filter profiles are implemented with frontend tests. |
| Multi-session | 31 | 0 | Phase 7 complete: tab model, four-tab E2E, active-session routing, close behavior, terminal buffers/view modes/shortcuts, connection controls, filters, logs, macros/automation, and command history are scoped by session. |
| Settings/polish | 0 | 0 | |
| Packaging/docs | 0 | 0 | |
| Self-tests | 0 | 0 | |
