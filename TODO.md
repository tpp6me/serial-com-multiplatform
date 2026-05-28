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

- [ ] `SPEC-001` Replace stale Node.js reliability wording with Rust/Tauri wording in `MultiSerial_Spec.md`.
- [ ] `SPEC-002` Remove or renumber duplicate `7.4 Platform Capability Matrix` section.
- [ ] `SPEC-003` Remove or renumber duplicate `7.5 Platform-Specific USB Details` section.
- [ ] `SPEC-004` Resolve Linux auto-update conflict between v1.0 and v1.1 statements.
- [ ] `SPEC-005` Update footer from `v1.1` to `v1.2`.
- [ ] `SPEC-006` Verify all section references still point to the intended sections after cleanup.
- [ ] `SPEC-007` Add an engineering decision record for raw/binary Tauri IPC approach.
- [ ] `SPEC-008` Add an engineering decision record for binary log format.
- [ ] `SPEC-009` Add an engineering decision record for Linux updater support.
- [ ] `SPEC-010` Add approved hardware test matrix.
- [ ] `SPEC-011` Add formal config schema requirement details.

### 0.2 v1.0 Scope Lock

- [ ] `SCOPE-001` Confirm v1.0 includes serial GUI, up to four sessions, logging, display modes, search/filter, macros, settings, packaging, and automated tests.
- [ ] `SCOPE-002` Confirm Python scripting is not implemented in v1.0.
- [ ] `SCOPE-003` Confirm third-party plugins are not implemented in v1.0.
- [ ] `SCOPE-004` Confirm packet framing and protocol decoders are not implemented in v1.0.
- [ ] `SCOPE-005` Confirm BLE UART is not implemented in v1.0.
- [ ] `SCOPE-006` Confirm headless CLI mode is not implemented in v1.0.
- [ ] `SCOPE-007` Confirm ANSI color support is deferred unless explicitly pulled into v1.0.

## 1. Phase 0 - Spike And Architecture Validation

Goal: prove high-risk assumptions before production implementation.

### 1.1 Tauri Scaffold Spike

- [ ] `SPIKE-001` Create minimal Tauri v2 app with React 18 and TypeScript.
- [ ] `SPIKE-002` Confirm local dev startup works on macOS.
- [ ] `SPIKE-003` Confirm app can be built in release mode on macOS.
- [ ] `SPIKE-004` Add one Rust command callable from React.
- [ ] `SPIKE-005` Add initial `capabilities/default.json`.
- [ ] `SPIKE-006` Document exact Tauri command/event APIs used for binary payloads.

### 1.2 Serial I/O Spike

- [ ] `SPIKE-010` Evaluate `tauri-plugin-serialplugin` v2.8.x against required serial settings.
- [ ] `SPIKE-011` Evaluate direct `serialport-rs` fallback if plugin does not expose required controls.
- [ ] `SPIKE-012` List ports through the selected backend.
- [ ] `SPIKE-013` Open a serial port at 115200 8N1.
- [ ] `SPIKE-014` Read bytes from a loopback adapter.
- [ ] `SPIKE-015` Write bytes to a loopback adapter.
- [ ] `SPIKE-016` Verify custom baud error handling.
- [ ] `SPIKE-017` Verify DTR/RTS support availability.
- [ ] `SPIKE-018` Verify hot-unplug does not crash the spike app.

### 1.3 RX Throughput Spike

- [ ] `SPIKE-020` Implement Rust RX channel/ring buffer prototype.
- [ ] `SPIKE-021` Batch RX delivery to frontend every 16 ms.
- [ ] `SPIKE-022` Send `Uint8Array` or equivalent binary payload to React.
- [ ] `SPIKE-023` Benchmark synthetic 100,000 chars/sec feed for 60 seconds.
- [ ] `SPIKE-024` Verify frontend keeps terminal usable during synthetic feed.
- [ ] `SPIKE-025` Benchmark 10 MB hardware loopback at 921600 baud.
- [ ] `SPIKE-026` Compare TX/RX SHA-256 for hardware loopback.
- [ ] `SPIKE-027` Record throughput results in docs.

### 1.4 Hotplug Spike

- [ ] `SPIKE-030` Prototype macOS IOKit or polling hotplug detection.
- [ ] `SPIKE-031` Prototype Windows SetupDi or polling hotplug detection.
- [ ] `SPIKE-032` Prototype Linux `tokio-udev` or polling hotplug detection.
- [ ] `SPIKE-033` Verify insert detection is under 2 seconds after OS event.
- [ ] `SPIKE-034` Verify removal detection is under 2 seconds after OS event.
- [ ] `SPIKE-035` Verify no duplicate ports appear after repeated insert/remove.

### 1.5 Linux WebView Spike

- [ ] `SPIKE-040` Run Tauri app on Ubuntu 22.04.
- [ ] `SPIKE-041` Verify terminal virtual list rendering in WebKitGTK.
- [ ] `SPIKE-042` Verify font weight normalization strategy.
- [ ] `SPIKE-043` Verify CSS transition restrictions for terminal/status paths.
- [ ] `SPIKE-044` Capture Linux rendering notes and required CSS compatibility layer.

### 1.6 Packaging Spike

- [ ] `SPIKE-050` Build macOS `.dmg` development artifact.
- [ ] `SPIKE-051` Build Windows NSIS development artifact.
- [ ] `SPIKE-052` Build Linux AppImage development artifact.
- [ ] `SPIKE-053` Build Linux `.deb` development artifact.
- [ ] `SPIKE-054` Validate Tauri updater support for macOS.
- [ ] `SPIKE-055` Validate Tauri updater support for Windows.
- [ ] `SPIKE-056` Validate Tauri updater support for Linux packages.
- [ ] `SPIKE-057` Decide whether Linux auto-update stays in v1.0.

### 1.7 Phase 0 Exit Gate

- [ ] `GATE-000` Zero byte loss in 10 MB hardware loopback at 921600 baud on at least one supported OS.
- [ ] `GATE-001` Synthetic renderer feed passes 100,000 chars/sec target.
- [ ] `GATE-002` Hotplug updates under 2 seconds after OS event.
- [ ] `GATE-003` Linux WebKitGTK rendering is acceptable.
- [ ] `GATE-004` Packaging skeleton exists for macOS, Windows, AppImage, and `.deb`.
- [ ] `GATE-005` Raw IPC, binary log format, updater, and hardware matrix decisions are documented.

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
- [ ] `ENVISO-014` Ensure tests use temporary directories or `.dev-data/test-*`.
- [ ] `ENVISO-015` Ensure test cleanup removes generated test config/log/temp data.
- [ ] `ENVISO-016` Document optional project-local `CARGO_HOME` for hermetic builds.
- [ ] `ENVISO-017` Document Playwright browser download/cache behavior.
- [x] `ENVISO-018` Add `check:env` or `doctor` script to report active tool versions. Completed 2026-05-28.
- [x] `ENVISO-019` Make `check:env` warn when active versions differ from pinned versions. Completed 2026-05-28.
- [x] `ENVISO-020` Write `docs/development.md` with isolated environment setup steps. Completed 2026-05-28.
- [x] `ENVISO-021` Verify local dev runs do not write to `~/.multiSerial/`. Completed 2026-05-28.
- [x] `ENVISO-022` Verify local dev runs do not write to `~/MultiSerial/logs/`. Completed 2026-05-28.
- [ ] `ENVISO-023` Verify automated tests do not write to user config or log directories.
- [x] `ENVISO-024` Document unavoidable global OS prerequisites separately from project dependencies. Completed 2026-05-28.

### 2.2 Test Framework

- [x] `FOUND-020` Add Vitest. Completed 2026-05-28.
- [x] `FOUND-021` Add React Testing Library. Completed 2026-05-28.
- [ ] `FOUND-022` Add Playwright.
- [x] `FOUND-023` Add Rust unit test setup. Completed 2026-05-28.
- [ ] `FOUND-024` Add Rust integration test setup.
- [ ] `FOUND-025` Add mock serial test feature flag.
- [ ] `FOUND-026` Add test fixtures directory.
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

- [ ] `GATE-010` App launches on macOS, Windows, and Linux.
- [ ] `GATE-011` CI passes frontend, Rust, lint, and formatting checks.
- [x] `GATE-012` Invalid config recovery test passes. Completed 2026-05-28.
- [ ] `GATE-013` All exposed Tauri commands are listed in capabilities file.
- [ ] `GATE-014` Isolated dev/test environment does not touch user-level MultiSerial config or log paths.
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
- [ ] `SER-011` Implement manual refresh.
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
- [~] `SER-024` Support parity none, even, odd, mark, space. API accepts all values; current backend supports none/even/odd and returns explicit unsupported errors for mark/space.
- [~] `SER-025` Support stop bits 1, 1.5, 2. API accepts all values; current backend supports 1/2 and returns explicit unsupported error for 1.5.
- [x] `SER-026` Support flow control none. Completed 2026-05-28.
- [x] `SER-027` Support RTS/CTS where available. Completed 2026-05-28 via current backend mapping.
- [x] `SER-028` Support XON/XOFF where available. Completed 2026-05-28 via current backend mapping.
- [~] `SER-029` Support DTR/DSR where available or provide clear unsupported error. Current backend returns explicit unsupported error.

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
- [ ] `SER-065` Log partial TX marker when appropriate.
- [x] `SER-066` Maintain authoritative TX byte counter. Completed 2026-05-28.
- [x] `SER-067` Add TX unit and integration tests. Completed 2026-05-28 for mock backend.

### 3.7 Hotplug And Signals

- [ ] `SER-070` Implement macOS hotplug source.
- [ ] `SER-071` Implement Windows hotplug source.
- [ ] `SER-072` Implement Linux hotplug source.
- [x] `SER-073` Implement polling fallback. Completed 2026-05-28 with backend poll worker.
- [x] `SER-074` Update port list after insertion. Completed 2026-05-28 through `serial-port-list-changed` event payload.
- [x] `SER-075` Update port list after removal. Completed 2026-05-28 through `serial-port-list-changed` event payload.
- [x] `SER-076` Transition active session to Hot-unplugged on removal. Completed 2026-05-28.
- [ ] `SER-077` Implement manual DTR toggle.
- [ ] `SER-078` Implement manual RTS toggle.
- [ ] `SER-079` Add best-effort CTS/DSR/DCD/RI read only if v1.1/could scope is pulled forward.

### 3.8 Phase 2 Exit Gate

- [x] `GATE-020` Single session can connect, receive, transmit, disconnect, and reconnect with mock backend. Completed 2026-05-28.
- [x] `GATE-021` State machine tests cover all documented states. Completed 2026-05-28.
- [x] `GATE-022` Hot-unplug mock test passes. Completed 2026-05-28.
- [ ] `GATE-023` Real loopback smoke test passes on at least one adapter.

## 4. Phase 3 - Logging Core

Goal: byte-accurate logging with explicit failure behavior.

### 4.1 Logger Architecture

- [ ] `LOG-001` Implement logger task per session.
- [ ] `LOG-002` Use bounded queue between RX path and logger.
- [ ] `LOG-003` Ensure logger cannot block serial RX loop.
- [ ] `LOG-004` Maintain `rx_bytes`.
- [ ] `LOG-005` Maintain `logged_bytes`.
- [ ] `LOG-006` Maintain `log_overrun_count`.
- [ ] `LOG-007` Expose current log path.
- [ ] `LOG-008` Expose current log size.

### 4.2 Log Start/Stop

- [ ] `LOG-010` Implement auto-log-on-connect option.
- [ ] `LOG-011` Ensure auto-log starts before first byte is received.
- [ ] `LOG-012` Implement manual start without disconnect.
- [ ] `LOG-013` Implement manual stop without disconnect.
- [ ] `LOG-014` Implement append mode.
- [ ] `LOG-015` Implement overwrite mode.
- [ ] `LOG-016` Create log directory if missing.
- [ ] `LOG-017` Reject unsafe or unsupported log paths.

### 4.3 Formats

- [ ] `LOG-020` Implement plain text ASCII log format.
- [ ] `LOG-021` Implement timestamped text log format.
- [ ] `LOG-022` Implement raw binary log format.
- [ ] `LOG-023` Write session metadata header.
- [ ] `LOG-024` Prefix RX in timestamped logs if LOG-10 remains in scope.
- [ ] `LOG-025` Prefix TX in timestamped logs if LOG-10 remains in scope.
- [ ] `LOG-026` Preserve raw bytes in binary logs.
- [ ] `LOG-027` Include segment byte count or CRC for binary logs.

### 4.4 Rotation

- [ ] `LOG-030` Implement filename template tokens.
- [ ] `LOG-031` Sanitize port names for filenames.
- [ ] `LOG-032` Implement size-based rotation.
- [ ] `LOG-033` Implement time-based rotation.
- [ ] `LOG-034` Implement max files retention.
- [ ] `LOG-035` `fsync` on rotation boundary.
- [ ] `LOG-036` `fsync` on session close.
- [ ] `LOG-037` Add rotation tests.

### 4.5 Failure Modes

- [ ] `LOG-040` Handle disk full.
- [ ] `LOG-041` Handle log path unavailable.
- [ ] `LOG-042` Handle permission denied after logging starts.
- [ ] `LOG-043` Pause logging on unrecoverable write error.
- [ ] `LOG-044` Keep serial session connected after logging failure.
- [ ] `LOG-045` Show persistent error status to UI.
- [ ] `LOG-046` Allow choose-new-path recovery.
- [ ] `LOG-047` Allow stop-logging recovery.
- [ ] `LOG-048` Increment overrun counter when logger falls behind.
- [ ] `LOG-049` Add failure-mode tests.

### 4.6 Phase 3 Exit Gate

- [ ] `GATE-030` Healthy logging has matching RX/logged counters.
- [ ] `GATE-031` Disk/path failures do not disconnect serial session.
- [ ] `GATE-032` Binary fixture `00..FF` round-trips through binary log.
- [ ] `GATE-033` Rotation tests pass with metadata and counters intact.

## 5. Phase 4 - Terminal Data Model And Renderer

Goal: render every v1.0 display mode from canonical raw chunks.

### 5.1 Frontend Session Store

- [ ] `TERM-001` Define frontend `RxChunk` model.
- [ ] `TERM-002` Store chunks by session ID.
- [ ] `TERM-003` Enforce scrollback bounds.
- [ ] `TERM-004` Preserve raw bytes for all derived views.
- [ ] `TERM-005` Track per-session view mode.
- [ ] `TERM-006` Add chunk store tests.

### 5.2 Derived Views

- [ ] `TERM-010` Implement ASCII/UTF-8 decoder.
- [ ] `TERM-011` Replace invalid UTF-8 with U+FFFD.
- [ ] `TERM-012` Render null bytes visibly.
- [ ] `TERM-013` Implement hexadecimal view.
- [ ] `TERM-014` Implement mixed ASCII+hex view.
- [ ] `TERM-015` Implement decimal view.
- [ ] `TERM-016` Implement binary view.
- [ ] `TERM-017` Implement CR newline mode.
- [ ] `TERM-018` Implement LF newline mode.
- [ ] `TERM-019` Implement CRLF newline mode.
- [ ] `TERM-020` Implement raw chunk mode.
- [ ] `TERM-021` Implement partial-line timeout.
- [ ] `TERM-022` Flush partial line on close.
- [ ] `TERM-023` Mark visual line truncation over 10,000 bytes.
- [ ] `TERM-024` Verify full data remains in log after visual truncation.

### 5.3 Terminal UI

- [ ] `TERM-030` Implement virtualized terminal list.
- [ ] `TERM-031` Implement timestamp display toggle.
- [ ] `TERM-032` Implement configurable timestamp format.
- [ ] `TERM-033` Implement line wrap toggle.
- [ ] `TERM-034` Implement horizontal scroll mode.
- [ ] `TERM-035` Implement auto-scroll to bottom.
- [ ] `TERM-036` Pause auto-scroll when user scrolls up.
- [ ] `TERM-037` Resume auto-scroll at bottom.
- [ ] `TERM-038` Implement clear terminal display.
- [ ] `TERM-039` Ensure clear display does not truncate logs.
- [ ] `TERM-040` Implement status bar byte count.
- [ ] `TERM-041` Implement status bar character count.
- [ ] `TERM-042` Implement status bar data rate.
- [ ] `TERM-043` Implement log counter display.

### 5.4 Renderer Tests

- [ ] `TERM-050` Test mode switching preserves raw chunks.
- [ ] `TERM-051` Test invalid UTF-8 behavior.
- [ ] `TERM-052` Test null-byte display.
- [ ] `TERM-053` Test partial line timeout.
- [ ] `TERM-054` Test long-line marker.
- [ ] `TERM-055` Test auto-scroll pause/resume.
- [ ] `TERM-056` Test clear display behavior.
- [ ] `TERM-057` Benchmark 100,000 lines x 80 chars.
- [ ] `TERM-058` Benchmark 100,000 chars/sec feed.

### 5.5 Phase 4 Exit Gate

- [ ] `GATE-040` All display modes render from same raw buffer.
- [ ] `GATE-041` Mode switching does not lose data.
- [ ] `GATE-042` Terminal performance targets pass on reference machine.
- [ ] `GATE-043` Clear display leaves logs and counters intact.

## 6. Phase 5 - Send, File, History, And Macros

Goal: complete v1.0 transmission workflows with safety controls.

### 6.1 Send Bar

- [ ] `SEND-001` Implement send input.
- [ ] `SEND-002` Enter sends.
- [ ] `SEND-003` Shift+Enter inserts newline.
- [ ] `SEND-004` Implement line ending none.
- [ ] `SEND-005` Implement line ending CR.
- [ ] `SEND-006` Implement line ending LF.
- [ ] `SEND-007` Implement line ending CRLF.
- [ ] `SEND-008` Implement hex mode toggle.
- [ ] `SEND-009` Validate hex input.
- [ ] `SEND-010` Show inline error for invalid hex.
- [ ] `SEND-011` Echo TX in terminal if enabled.
- [ ] `SEND-012` Style TX distinctly from RX.

### 6.2 Command History

- [ ] `SEND-020` Store command history per session.
- [ ] `SEND-021` Enforce configurable history size.
- [ ] `SEND-022` Persist command history.
- [ ] `SEND-023` Implement Up navigation.
- [ ] `SEND-024` Implement Down navigation.
- [ ] `SEND-025` Add history tests.

### 6.3 Send File

- [ ] `SEND-030` Implement file picker.
- [ ] `SEND-031` Read file as binary.
- [ ] `SEND-032` Send default 512-byte chunks.
- [ ] `SEND-033` Apply configurable pacing delay.
- [ ] `SEND-034` Show progress bar.
- [ ] `SEND-035` Implement cancel.
- [ ] `SEND-036` Abort cleanly on disconnect.
- [ ] `SEND-037` Write partial-send marker to log.
- [ ] `SEND-038` Add file-send tests.

### 6.4 Macros

- [ ] `SEND-040` Implement macro data model.
- [ ] `SEND-041` Implement macro list UI.
- [ ] `SEND-042` Implement create macro.
- [ ] `SEND-043` Implement edit macro.
- [ ] `SEND-044` Implement delete macro.
- [ ] `SEND-045` Implement text macro step.
- [ ] `SEND-046` Implement hex macro step.
- [ ] `SEND-047` Implement inter-packet delay.
- [ ] `SEND-048` Persist macros in config.
- [ ] `SEND-049` Scope macros per session.
- [ ] `SEND-050` Add macro byte-sequence tests.

### 6.5 Automation Safety

- [ ] `AUTO-001` Implement timed macro scheduler.
- [ ] `AUTO-002` Enforce minimum interval 50 ms.
- [ ] `AUTO-003` Show persistent automation banner.
- [ ] `AUTO-004` Add stop-all toolbar button.
- [ ] `AUTO-005` Implement Escape stop-all when send bar is not focused.
- [ ] `AUTO-006` Confirm macro intervals under 100 ms.
- [ ] `AUTO-007` Enforce 1,000 sends/minute in backend.
- [ ] `AUTO-008` Count dropped automated sends.
- [ ] `AUTO-009` Show dropped-send counter.
- [ ] `AUTO-010` Implement automation sidecar log if retained for v1.0.
- [ ] `AUTO-011` Add rate-limit bypass tests.

### 6.6 Phase 5 Exit Gate

- [ ] `GATE-050` Text, hex, line endings, file send, and macros transmit exact expected bytes.
- [ ] `GATE-051` Cancel and disconnect during file send are handled cleanly.
- [ ] `GATE-052` Automation banner and stop-all behavior pass E2E.
- [ ] `GATE-053` Backend rate limit cannot be bypassed from frontend.

## 7. Phase 6 - Search, Filters, Highlights

Goal: non-destructive search and filtering over the line index.

### 7.1 Regex And Rule Engine

- [ ] `FLT-001` Select safe regex implementation.
- [ ] `FLT-002` Enforce 512-character pattern limit.
- [ ] `FLT-003` Enforce timeout or no-catastrophic-backtracking engine behavior.
- [ ] `FLT-004` Disable offending rule on timeout.
- [ ] `FLT-005` Show warning when rule is disabled.
- [ ] `FLT-006` Add regex safety tests.

### 7.2 Highlight Rules

- [ ] `FLT-010` Implement highlight rule data model.
- [ ] `FLT-011` Implement highlight by keyword.
- [ ] `FLT-012` Implement highlight by regex.
- [ ] `FLT-013` Implement configurable highlight colors.
- [ ] `FLT-014` Enforce maximum 16 rules.
- [ ] `FLT-015` Add highlight tests.

### 7.3 Filters

- [ ] `FLT-020` Implement show-only keyword filter.
- [ ] `FLT-021` Implement show-only regex filter.
- [ ] `FLT-022` Implement suppress keyword filter.
- [ ] `FLT-023` Implement suppress regex filter.
- [ ] `FLT-024` Ensure filters operate on line index only.
- [ ] `FLT-025` Ensure filters never mutate logs.
- [ ] `FLT-026` Implement filter profiles if retained for v1.0.
- [ ] `FLT-027` Add non-destructive filter tests.

### 7.4 Search

- [ ] `SEARCH-001` Implement Ctrl/Cmd+F search bar.
- [ ] `SEARCH-002` Search current line index.
- [ ] `SEARCH-003` Navigate next match.
- [ ] `SEARCH-004` Navigate previous match.
- [ ] `SEARCH-005` Update match count as new data arrives.
- [ ] `SEARCH-006` Preserve search state across view refresh.
- [ ] `SEARCH-007` Add search tests.

### 7.5 Phase 6 Exit Gate

- [ ] `GATE-060` Filters and highlights do not alter raw buffer or log output.
- [ ] `GATE-061` Regex safety behavior passes tests.
- [ ] `GATE-062` Search/filter benchmark for 100k lines completes under target.

## 8. Phase 7 - Multi-Session UI

Goal: support up to four independent connection tabs.

### 8.1 Tab Model

- [ ] `TAB-001` Implement session tab model.
- [ ] `TAB-002` Implement new connection tab.
- [ ] `TAB-003` Enforce maximum four sessions.
- [ ] `TAB-004` Implement active session routing.
- [ ] `TAB-005` Require session ID for every backend command.
- [ ] `TAB-006` Add connected-tab close confirmation.
- [ ] `TAB-007` Close disconnected tab without confirmation.

### 8.2 Per-Session State

- [ ] `TAB-010` Scope serial port per session.
- [ ] `TAB-011` Scope connection settings per session.
- [ ] `TAB-012` Scope terminal buffer per session.
- [ ] `TAB-013` Scope view mode per session.
- [ ] `TAB-014` Scope log file and logging state per session.
- [ ] `TAB-015` Scope macros and automation per session.
- [ ] `TAB-016` Scope filters and highlights per session.
- [ ] `TAB-017` Scope command history per session.
- [ ] `TAB-018` Scope terminal shortcuts to active session.

### 8.3 Global State

- [ ] `TAB-020` Keep theme global.
- [ ] `TAB-021` Keep font size global.
- [ ] `TAB-022` Keep font family global.
- [ ] `TAB-023` Keep settings window global.
- [ ] `TAB-024` Keep update settings global.

### 8.4 Multi-Session Tests

- [ ] `TAB-030` Test two mock sessions with independent RX.
- [ ] `TAB-031` Test two mock sessions with independent TX.
- [ ] `TAB-032` Test independent logs.
- [ ] `TAB-033` Test independent filters.
- [ ] `TAB-034` Test independent macros.
- [ ] `TAB-035` Test closing one tab does not affect others.
- [ ] `TAB-036` Test max-session limit.

### 8.5 Phase 7 Exit Gate

- [ ] `GATE-070` Four-session mock E2E passes.
- [ ] `GATE-071` Cross-session isolation tests pass.
- [ ] `GATE-072` Closing active connected tab requires confirmation.

## 9. Phase 8 - Settings, Accessibility, And Polish

Goal: complete user-facing settings and release-quality UI behavior.

### 9.1 Settings UI

- [ ] `SET-001` Implement settings window.
- [ ] `SET-002` Implement connection settings.
- [ ] `SET-003` Implement display settings.
- [ ] `SET-004` Implement logging settings.
- [ ] `SET-005` Implement send settings.
- [ ] `SET-006` Implement filter limits settings if user-configurable.
- [ ] `SET-007` Implement update settings.
- [ ] `SET-008` Implement telemetry/crash-reporting setting default OFF.
- [ ] `SET-009` Validate settings against schema before save.
- [ ] `SET-010` Persist settings atomically.

### 9.2 Keyboard Shortcuts

- [ ] `KEY-001` Implement Ctrl/Cmd+K connect/disconnect.
- [ ] `KEY-002` Implement Ctrl/Cmd+L clear terminal.
- [ ] `KEY-003` Implement Ctrl/Cmd+F search.
- [ ] `KEY-004` Implement Ctrl/Cmd+Shift+S save/export buffer.
- [ ] `KEY-005` Implement Ctrl/Cmd+T new tab.
- [ ] `KEY-006` Implement Ctrl/Cmd+W close tab.
- [ ] `KEY-007` Implement Ctrl/Cmd+Shift+M toggle macros panel.
- [ ] `KEY-008` Implement Ctrl/Cmd+Shift+F toggle filter panel.
- [ ] `KEY-009` Implement Ctrl/Cmd+, settings.
- [ ] `KEY-010` Implement F5 refresh ports.
- [ ] `KEY-011` Implement shortcut customization.
- [ ] `KEY-012` Detect shortcut conflicts.
- [ ] `KEY-013` Flag OS-reserved conflicts at save time.

### 9.3 UI States

- [ ] `UI-001` Implement disconnected empty state.
- [ ] `UI-002` Implement connecting state.
- [ ] `UI-003` Implement connected state indicator.
- [ ] `UI-004` Implement disconnecting state.
- [ ] `UI-005` Implement hot-unplug banner.
- [ ] `UI-006` Implement reconnecting banner.
- [ ] `UI-007` Implement error banner.
- [ ] `UI-008` Avoid modal dialogs for non-blocking errors.
- [ ] `UI-009` Implement open log file action.
- [ ] `UI-010` Implement open log directory action.
- [ ] `UI-011` Implement terminal buffer export to text if retained for v1.0.
- [ ] `UI-012` Implement terminal buffer export to HTML if retained for v1.0.

### 9.4 Accessibility And Theming

- [ ] `A11Y-001` Implement light theme.
- [ ] `A11Y-002` Implement dark theme.
- [ ] `A11Y-003` Follow OS color scheme by default.
- [ ] `A11Y-004` Implement configurable terminal font family.
- [ ] `A11Y-005` Implement configurable terminal font size.
- [ ] `A11Y-006` Add DTR tooltip.
- [ ] `A11Y-007` Add RTS tooltip.
- [ ] `A11Y-008` Add flow-control tooltips.
- [ ] `A11Y-009` Verify WCAG 2.1 AA contrast in light theme.
- [ ] `A11Y-010` Verify WCAG 2.1 AA contrast in dark theme.
- [ ] `A11Y-011` Verify keyboard access for all controls.
- [ ] `A11Y-012` Add Playwright accessibility smoke checks.

### 9.5 Linux WebView Compatibility

- [ ] `LINUX-UI-001` Add `webview-compat.css`.
- [ ] `LINUX-UI-002` Normalize font weight on Linux.
- [ ] `LINUX-UI-003` Disable risky terminal/status CSS animations on Linux.
- [ ] `LINUX-UI-004` Avoid GPU compositing artifacts on terminal container.
- [ ] `LINUX-UI-005` Add Linux screenshot regression coverage if CI supports it.

### 9.6 Phase 8 Exit Gate

- [ ] `GATE-080` Settings save/load/migration tests pass.
- [ ] `GATE-081` Keyboard shortcut E2E tests pass.
- [ ] `GATE-082` Accessibility smoke tests pass.
- [ ] `GATE-083` Linux WebKitGTK UI smoke test passes.

## 10. Phase 9 - Packaging, Signing, Updater, Documentation

Goal: produce release candidate artifacts.

### 10.1 Tauri Bundle Metadata

- [ ] `PKG-001` Configure app identifier.
- [ ] `PKG-002` Configure product name `MultiSerial`.
- [ ] `PKG-003` Configure binary name `multiSerial`.
- [ ] `PKG-004` Configure process name `multiSerial`.
- [ ] `PKG-005` Configure config paths.
- [ ] `PKG-006` Configure default log paths.
- [ ] `PKG-007` Add production app icons.
- [ ] `PKG-008` Include MIT license.
- [ ] `PKG-009` Include dependency license notices.

### 10.2 macOS Packaging

- [ ] `PKG-MAC-001` Build arm64 app.
- [ ] `PKG-MAC-002` Build x64 app.
- [ ] `PKG-MAC-003` Merge universal binary or ship separate artifacts per final decision.
- [ ] `PKG-MAC-004` Configure `.dmg`.
- [ ] `PKG-MAC-005` Configure Apple Developer signing.
- [ ] `PKG-MAC-006` Configure notarization.
- [ ] `PKG-MAC-007` Verify first launch has no Gatekeeper warning.
- [ ] `PKG-MAC-008` Run install/uninstall smoke test.

### 10.3 Windows Packaging

- [ ] `PKG-WIN-001` Configure NSIS installer.
- [ ] `PKG-WIN-002` Configure Windows app metadata.
- [ ] `PKG-WIN-003` Configure EV signing.
- [ ] `PKG-WIN-004` Verify WebView2 handling.
- [ ] `PKG-WIN-005` Install on Windows 10.
- [ ] `PKG-WIN-006` Install on Windows 11.
- [ ] `PKG-WIN-007` Verify COM port listing.
- [ ] `PKG-WIN-008` Run uninstall/reinstall smoke test.

### 10.4 Linux Packaging

- [ ] `PKG-LINUX-001` Configure AppImage x64.
- [ ] `PKG-LINUX-002` Configure AppImage arm64.
- [ ] `PKG-LINUX-003` Configure `.deb` x64.
- [ ] `PKG-LINUX-004` Verify Ubuntu 22.04 install.
- [ ] `PKG-LINUX-005` Verify Ubuntu 24.04 install.
- [ ] `PKG-LINUX-006` Verify `dialout` guidance.
- [ ] `PKG-LINUX-007` Verify WebKitGTK dependency behavior.
- [ ] `PKG-LINUX-008` Verify ModemManager retry messaging.

### 10.5 Updater

- [ ] `UPD-001` Configure updater signing keys.
- [ ] `UPD-002` Implement update check.
- [ ] `UPD-003` Respect `autoCheck` setting.
- [ ] `UPD-004` Respect `autoDownload` setting.
- [ ] `UPD-005` Implement stable release channel.
- [ ] `UPD-006` Verify macOS update flow.
- [ ] `UPD-007` Verify Windows update flow.
- [ ] `UPD-008` Verify Linux update flow if retained for v1.0.
- [ ] `UPD-009` Document Linux update limitation if not retained for v1.0.

### 10.6 Documentation

- [ ] `DOC-001` Write quick start.
- [ ] `DOC-002` Write serial connection guide.
- [ ] `DOC-003` Write logging durability guide.
- [ ] `DOC-004` Write Linux permissions guide.
- [ ] `DOC-005` Write ModemManager troubleshooting guide.
- [ ] `DOC-006` Write macOS driver notes.
- [ ] `DOC-007` Write Windows driver notes.
- [ ] `DOC-008` Write macro safety docs.
- [ ] `DOC-009` Write privacy/crash-reporting docs.
- [ ] `DOC-010` Write release checklist.
- [ ] `DOC-011` Write hardware self-test checklist.

### 10.7 Phase 9 Exit Gate

- [ ] `GATE-090` macOS release candidate installs and launches.
- [ ] `GATE-091` Windows release candidate installs and launches.
- [ ] `GATE-092` Linux AppImage release candidate launches.
- [ ] `GATE-093` Linux `.deb` release candidate installs and launches.
- [ ] `GATE-094` Updater behavior matches final v1.0 decision.
- [ ] `GATE-095` Documentation matches implemented behavior.

## 11. Self-Test Tracking

Use this section to record completion of repeatable self-tests. Keep detailed logs under `docs/self-test/` once that directory exists.

### 11.1 Environment Self-Test

- [ ] `TEST-ENV-001` Node/pnpm/Rust/Tauri prerequisites installed.
- [x] `TEST-ENV-002` Dependencies install successfully. Completed 2026-05-28.
- [x] `TEST-ENV-003` Frontend typecheck passes. Completed 2026-05-28.
- [x] `TEST-ENV-004` Frontend lint passes. Completed 2026-05-28.
- [x] `TEST-ENV-005` Frontend unit tests pass. Completed 2026-05-28.
- [x] `TEST-ENV-006` Rust tests pass. Completed 2026-05-28.
- [ ] `TEST-ENV-007` Tauri dev app launches.
- [ ] `TEST-ENV-008` Empty state renders with no device connected.
- [ ] `TEST-ENV-009` Default config is created.
- [x] `TEST-ENV-010` `check:env` or `doctor` reports expected pinned versions. Completed 2026-05-28.
- [x] `TEST-ENV-011` Dev app creates config under `.dev-data/config`. Completed 2026-05-28.
- [x] `TEST-ENV-012` Dev app creates logs under `.dev-data/logs`. Completed 2026-05-28.
- [ ] `TEST-ENV-013` Test run writes only to temp directories or `.dev-data/test-*`.
- [x] `TEST-ENV-014` User-level `~/.multiSerial/` is not created or modified by dev/test runs. Completed 2026-05-28.
- [x] `TEST-ENV-015` User-level `~/MultiSerial/logs/` is not created or modified by dev/test runs. Completed 2026-05-28.

### 11.2 Mock Serial Self-Test

- [ ] `TEST-MOCK-001` Mock ports appear on launch.
- [ ] `TEST-MOCK-002` Manual refresh preserves correct mock port list.
- [ ] `TEST-MOCK-003` Connect to `MOCK_A`.
- [ ] `TEST-MOCK-004` Inject RX bytes and verify display.
- [ ] `TEST-MOCK-005` Switch all display modes without data loss.
- [ ] `TEST-MOCK-006` Send text and verify exact bytes.
- [ ] `TEST-MOCK-007` Send hex and verify exact bytes.
- [ ] `TEST-MOCK-008` Trigger hot-unplug and verify state.
- [ ] `TEST-MOCK-009` Open second mock session and verify isolation.

### 11.3 Hardware Loopback Self-Test

- [ ] `TEST-HW-001` FTDI adapter 115200 loopback passes.
- [ ] `TEST-HW-002` CP2102 adapter 115200 loopback passes.
- [ ] `TEST-HW-003` CH340 adapter 115200 loopback passes.
- [ ] `TEST-HW-004` CDC-ACM loopback/echo test passes if included in matrix.
- [ ] `TEST-HW-005` Binary `00..FF` round-trip passes.
- [ ] `TEST-HW-006` 230400 baud loopback passes.
- [ ] `TEST-HW-007` 460800 baud loopback passes.
- [ ] `TEST-HW-008` 921600 baud 10 MB loopback SHA-256 passes.
- [ ] `TEST-HW-009` Supported custom baud test passes.
- [ ] `TEST-HW-010` Hot-unplug during transfer passes.
- [ ] `TEST-HW-011` Reconnect after hot-unplug passes.

### 11.4 Logging Self-Test

- [ ] `TEST-LOG-001` Auto-log starts before first byte.
- [ ] `TEST-LOG-002` Manual start/stop works without disconnect.
- [ ] `TEST-LOG-003` Metadata header is correct.
- [ ] `TEST-LOG-004` Plain text log format passes.
- [ ] `TEST-LOG-005` Timestamped text log format passes.
- [ ] `TEST-LOG-006` Binary log format passes.
- [ ] `TEST-LOG-007` Rotation by size passes.
- [ ] `TEST-LOG-008` Rotation by time passes.
- [ ] `TEST-LOG-009` Disk full behavior passes.
- [ ] `TEST-LOG-010` Unavailable path behavior passes.
- [ ] `TEST-LOG-011` Slow logger overrun behavior passes.
- [ ] `TEST-LOG-012` Serial session survives log failure.

### 11.5 Terminal Renderer Self-Test

- [ ] `TEST-TERM-001` UTF-8 text renders correctly.
- [ ] `TEST-TERM-002` Invalid UTF-8 renders replacement character.
- [ ] `TEST-TERM-003` Null bytes render visibly.
- [ ] `TEST-TERM-004` Partial line timeout passes.
- [ ] `TEST-TERM-005` Long line marker appears.
- [ ] `TEST-TERM-006` Raw log retains full long-line data.
- [ ] `TEST-TERM-007` 100,000-line fixture loads.
- [ ] `TEST-TERM-008` Search benchmark passes.
- [ ] `TEST-TERM-009` Filter benchmark passes.
- [ ] `TEST-TERM-010` 100,000 chars/sec feed passes.
- [ ] `TEST-TERM-011` Auto-scroll pause/resume passes.
- [ ] `TEST-TERM-012` Clear display leaves logs intact.

### 11.6 Send And Automation Self-Test

- [ ] `TEST-SEND-001` Text send with no line ending passes.
- [ ] `TEST-SEND-002` Text send with CR passes.
- [ ] `TEST-SEND-003` Text send with LF passes.
- [ ] `TEST-SEND-004` Text send with CRLF passes.
- [ ] `TEST-SEND-005` Valid hex send passes.
- [ ] `TEST-SEND-006` Invalid hex is blocked.
- [ ] `TEST-SEND-007` Command history persists.
- [ ] `TEST-SEND-008` File send chunking passes.
- [ ] `TEST-SEND-009` File send pacing passes.
- [ ] `TEST-SEND-010` File send cancel passes.
- [ ] `TEST-SEND-011` Disconnect during file send passes.
- [ ] `TEST-SEND-012` Macro sequence bytes pass.
- [ ] `TEST-SEND-013` Macro delay tolerance passes.
- [ ] `TEST-SEND-014` Automation banner appears.
- [ ] `TEST-SEND-015` Escape stop-all passes.
- [ ] `TEST-SEND-016` Under-100-ms confirmation appears.
- [ ] `TEST-SEND-017` Rate limit drops excess sends.

### 11.7 Filters And Search Self-Test

- [ ] `TEST-FLT-001` Highlight keyword passes.
- [ ] `TEST-FLT-002` Highlight regex passes.
- [ ] `TEST-FLT-003` Show-only keyword passes.
- [ ] `TEST-FLT-004` Show-only regex passes.
- [ ] `TEST-FLT-005` Suppress keyword passes.
- [ ] `TEST-FLT-006` Suppress regex passes.
- [ ] `TEST-FLT-007` Disabling filters restores all lines.
- [ ] `TEST-FLT-008` Log remains complete under active filters.
- [ ] `TEST-FLT-009` 16-rule limit enforced.
- [ ] `TEST-FLT-010` 512-character pattern limit enforced.
- [ ] `TEST-FLT-011` Pathological regex protection passes.
- [ ] `TEST-FLT-012` Search next/previous passes.

### 11.8 Multi-Session Self-Test

- [ ] `TEST-TAB-001` Four tabs can be created.
- [ ] `TEST-TAB-002` Distinct RX data remains per-session.
- [ ] `TEST-TAB-003` Distinct TX data remains per-session.
- [ ] `TEST-TAB-004` Distinct logs remain per-session.
- [ ] `TEST-TAB-005` Distinct filters remain per-session.
- [ ] `TEST-TAB-006` Distinct macros remain per-session.
- [ ] `TEST-TAB-007` Fifth session limit behavior passes.
- [ ] `TEST-TAB-008` Close connected tab confirmation passes.
- [ ] `TEST-TAB-009` Closing one tab does not affect others.

### 11.9 Packaging Self-Test

- [ ] `TEST-PKG-001` macOS `.dmg` installs.
- [ ] `TEST-PKG-002` macOS app launches from Applications.
- [ ] `TEST-PKG-003` macOS serial access works.
- [ ] `TEST-PKG-004` Windows installer installs.
- [ ] `TEST-PKG-005` Windows app launches.
- [ ] `TEST-PKG-006` Windows COM port access works.
- [ ] `TEST-PKG-007` Linux AppImage launches.
- [ ] `TEST-PKG-008` Linux `.deb` installs.
- [ ] `TEST-PKG-009` Linux serial access works with dialout permissions.
- [ ] `TEST-PKG-010` Installer/uninstaller behavior passes.
- [ ] `TEST-PKG-011` Package names match naming conventions.

### 11.10 Release Candidate Self-Test

- [ ] `TEST-RC-001` Full CI suite passes.
- [ ] `TEST-RC-002` Hardware matrix passes.
- [ ] `TEST-RC-003` 8-hour 115200 baud soak test passes.
- [ ] `TEST-RC-004` 1-hour 921600 baud high-rate test passes.
- [ ] `TEST-RC-005` Crash reporting default OFF verified.
- [ ] `TEST-RC-006` Crash report scrubber verified.
- [ ] `TEST-RC-007` No v1.1-only UI visible in v1.0.
- [ ] `TEST-RC-008` Docs match implemented behavior.
- [ ] `TEST-RC-009` License notices included.
- [ ] `TEST-RC-010` Zero known P0/P1 bugs.

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
| Spec cleanup | 0 | 0 | |
| Phase 0 spike | 0 | 0 | |
| Foundation | 0 | 0 | |
| Serial core | 0 | 0 | |
| Logging core | 0 | 0 | |
| Terminal renderer | 0 | 0 | |
| Send/macros | 0 | 0 | |
| Filters/search | 0 | 0 | |
| Multi-session | 0 | 0 | |
| Settings/polish | 0 | 0 | |
| Packaging/docs | 0 | 0 | |
| Self-tests | 0 | 0 | |
