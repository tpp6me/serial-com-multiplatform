# MultiSerial v1.0 Implementation Plan

Review date: 2026-05-28
Reviewed source: `MultiSerial_Spec.md` v1.2
Target release: v1.0, Q3 2026
Implementation status: project scaffold not present yet

## 1. Review Summary

The specification is much closer to implementation-ready than the earlier review draft. It now has a tighter v1.0 boundary, a raw-byte canonical data model, Tauri v2 as the chosen stack, explicit session lifecycle states, logging failure modes, macro safety controls, config versioning, and a platform capability matrix.

The implementation should start with a short validation spike, then build the Rust core and frontend around the raw-byte session model. Logging and serial I/O must be treated as trust-critical paths. UI features should be layered on top of that model, not allowed to define storage or capture semantics.

## 2. Spec Issues To Resolve Before Coding

These are not blockers to all work, but they should be fixed before the main v1.0 implementation branch is opened.

| Issue | Spec location | Impact | Required action |
|---|---:|---|---|
| Stale Node.js reliability wording | line 392 | Contradicts the Tauri/Rust architecture | Replace with Rust serial read task / OS thread wording. |
| Duplicate architecture sections | lines 502-571 | Conflicting platform matrix and auto-update statements | Keep the first Tauri-specific `7.4`/`7.5`, remove or renumber the older duplicate section. |
| Version footer mismatch | line 919 | Says v1.1 while document header says v1.2 | Update footer to v1.2. |
| Linux auto-update conflict | lines 424, 517, 563 | First says Linux auto-update in v1.0; duplicate matrix says v1.1 | Resolve in favor of v1.0 only if Tauri updater is verified for AppImage/deb distribution. |
| Raw IPC wording | lines 442, 484-485, 494 | Tauri binary/raw event capabilities need proof in spike | Confirm exact Tauri v2 APIs and document any fallback before committing architecture. |
| Formal config schema still open | line 847 | Config persistence and migrations depend on it | Create `config.schema.json` before settings implementation. |
| Binary log format still open | line 840 | Affects logger, tests, docs, and future tooling | Decide JSON-lines-with-base64, chunked binary container, or PCAP-compatible converter strategy. |
| Hardware matrix open | line 846 | Release confidence depends on real adapters | Approve test adapters and OS versions before beta. |
| Signing infrastructure open | line 850 | Public release depends on certificates and CI secrets | Start procurement/setup during Phase 0, not near release. |

Recommended decisions:

- Keep v1.0 limited to app GUI, up to four sessions, serial I/O, terminal rendering, logging, filters, macros, settings, packaging, and tests.
- Do not implement scripting, plugins, packet framing, BLE UART, headless mode, or ANSI color in v1.0 except for non-invasive extension points.
- Treat Linux auto-update as a release gate: implement if the spike proves the signed update flow works; otherwise ship update-check-only on Linux and update the spec.

## 3. Architecture Baseline

### 3.1 Repository Layout

Create the application under `code/serial-com-multiplatform/`:

```text
code/serial-com-multiplatform/
  package.json
  pnpm-lock.yaml
  vite.config.ts
  tsconfig.json
  src/
    app/
    components/
    features/
    lib/
    styles/
    test/
  src-tauri/
    Cargo.toml
    tauri.conf.json
    capabilities/
    src/
      main.rs
      serial/
      logging/
      config/
      hotplug/
      commands/
      test_support/
  tests/
    e2e/
    fixtures/
  docs/
    self-test/
    release-checklists/
```

### 3.2 Core Design Rules

- The Rust backend owns serial port handles, hotplug detection, TX writes, logging, session state transitions, rate limits, and file-system operations.
- The React frontend owns view state, terminal rendering, search/filter UI, macros UI, settings UI, and user interactions.
- Session data is modeled as timestamped raw byte chunks. Text, hex, decimal, binary, search, filter, and terminal rows are derived from that source.
- Logging is decoupled from rendering. Renderer backpressure must not block serial RX.
- Main-process counters are authoritative for `rx_bytes`, `tx_bytes`, `logged_bytes`, `log_overrun_count`, and dropped automation sends.
- All Tauri commands must be listed in `src-tauri/capabilities/default.json`.

### 3.3 Key Data Types

Define these early and use them across Rust and TypeScript via generated bindings or mirrored schemas:

```text
SessionId
PortId
SerialPortInfo { path, display_name, vid, pid, serial_number, manufacturer }
SerialConfig { baud, data_bits, parity, stop_bits, flow_control }
SessionState { Disconnected, Connecting, Connected, Disconnecting, HotUnplugged, Reconnecting, Error }
RxChunk { session_id, sequence, timestamp_monotonic_ms, timestamp_wall_ms, bytes }
TxRecord { session_id, sequence, timestamp_wall_ms, bytes, source }
LogStatus { active, path, format, rx_bytes, logged_bytes, overrun_count, error }
FilterRule { id, name, pattern, mode, action, color }
Macro { id, name, steps, repeat_interval_ms, enabled }
AppConfig { schema_version, connection, display, logging, send, filters, updates, telemetry }
```

## 4. Delivery Phases

### Phase 0 - Spike And Decisions

Goal: prove or revise the riskiest architecture assumptions before feature work.

Tasks:

- Scaffold minimal Tauri v2 + React + TypeScript app.
- Add one Rust command to list ports through `tauri-plugin-serialplugin` or direct `serialport-rs`.
- Prototype one open/read/write session against a loopback serial adapter.
- Prototype RX batching from Rust to React at 16 ms intervals.
- Benchmark renderer at 100,000 chars/sec with synthetic chunks.
- Benchmark loopback at 921600 baud with 10 MB deterministic payload.
- Validate hotplug detection approach on macOS, Windows, and Linux.
- Validate Linux WebKitGTK terminal rendering with virtualization.
- Validate app signing/package skeleton for `.dmg`, NSIS `.exe`, AppImage, and `.deb`.
- Confirm whether Linux auto-update is practical for v1.0.
- Decide binary log format and formal config schema location.

Exit criteria:

- Zero byte loss in 10 MB hardware loopback at 921600 baud on at least one supported OS.
- Renderer maintains 60 fps or no visible jank at 100,000 chars/sec synthetic feed.
- Hotplug detection updates within 2 seconds after OS device event.
- Linux terminal view renders acceptably in Ubuntu 22.04 WebKitGTK.
- Engineering decision record written for raw IPC API, binary log format, updater support, and hardware matrix.

### Phase 1 - Project Foundation

Goal: create the production scaffold and CI spine.

Tasks:

- Initialize Tauri v2, Vite, React 18, TypeScript, Rust workspace, linting, formatting, and test runners.
- Define an isolated development environment so project dependencies and generated data do not clash with the computer's global environment.
- Add `Vitest`, React Testing Library, Playwright, Rust unit tests, and cargo formatting/clippy.
- Add GitHub Actions matrix for macOS, Windows, and Linux build/test.
- Add Tauri capabilities file with only initial commands.
- Add structured logging for backend diagnostics, separate from serial capture logs.
- Create `config.schema.json`, default config, and migration framework.
- Implement atomic config writes with backup-on-invalid behavior.
- Add app version, build metadata, and environment diagnostics command.

Deliverables:

- App starts on all three platforms.
- CI runs TypeScript checks, frontend unit tests, Rust tests, clippy, and packaging dry-run where possible.
- Local development uses pinned project tool versions and project-local dependency/cache paths where practical.
- Invalid config self-test proves reset-to-default and `.bak` behavior.

#### Isolated Development Environment

The project should not require global npm packages or write development/test artifacts into the user's normal MultiSerial config and log locations. The only global prerequisites should be OS-level build dependencies that cannot reasonably be vendored, such as Xcode Command Line Tools, Rust toolchain manager, WebKitGTK packages on Linux, or Windows build tools.

Required setup:

- Pin Node, pnpm, and Rust versions in repository files such as `.node-version` or `.nvmrc`, `packageManager` in `package.json`, `rust-toolchain.toml`, and `Cargo.lock`.
- Use repository-local npm/pnpm execution through `corepack` and package scripts. Do not require `npm install -g`.
- Keep JavaScript dependencies in the project `node_modules/` and Rust dependencies in normal Cargo cache or a documented project-local `CARGO_HOME` option for hermetic builds.
- Provide `.env.example` and allow `.env.local` for developer overrides. Do not commit real `.env.local` values.
- Provide scripts that set dev/test app data paths under the repository, for example `.dev-data/config`, `.dev-data/logs`, and `.dev-data/tmp`, so local runs do not touch `~/.multiSerial/` or `~/MultiSerial/logs/`.
- Ensure automated tests use temporary directories or `.dev-data/test-*` directories and clean them between runs.
- Ensure Playwright browser downloads, if used, are controlled by project scripts and documented.
- Add a `doctor` or `check:env` script that reports tool versions and warns when the active shell is not using the pinned versions.
- Document the environment setup in `docs/development.md`.

### Phase 2 - Serial Core

Goal: reliable single-session serial I/O with well-defined lifecycle.

Tasks:

- Implement serial port list and refresh.
- Implement friendly port metadata mapping.
- Implement serial open/close with all v1.0 parameters.
- Implement custom baud validation and driver error propagation.
- Implement session state machine in Rust.
- Implement RX ring buffer/channel, sequence numbers, timestamps, and batching.
- Implement TX command with byte count, timestamp, and error result.
- Implement hot-unplug detection and transition to `HotUnplugged`.
- Implement reconnect retry/backoff.
- Implement DTR/RTS set support if available through selected serial crate/plugin.
- Add serial mock backend for automated tests.

Deliverables:

- One session can connect, receive, transmit, disconnect, and recover from simulated unplug.
- Serial state machine has unit tests for all documented transitions.
- Mock serial backend can inject bytes, write errors, hotplug events, and permission failures.

### Phase 3 - Logging Core

Goal: byte-accurate, failure-aware logging independent of UI rendering.

Tasks:

- Implement log writer task with bounded queue and non-blocking RX path.
- Implement plain text, timestamped text, and binary log formats.
- Implement metadata header for all log formats.
- Implement binary segment byte count or CRC.
- Implement auto-log-on-connect, manual start/stop, append/overwrite, filename templates, and log directory creation.
- Implement rotation by size and time.
- Implement `fsync` on rotation and session close.
- Implement disk-full/path-unavailable/permission error behavior.
- Implement `rx_bytes`, `logged_bytes`, `overrun_count`, current path, and current size status.
- Implement log error markers for hot-unplug and partial TX/file-send failures.

Deliverables:

- Logger unit tests cover format, rotation, counters, and failure paths.
- Stress test proves serial RX continues when logging fails or falls behind.
- Timestamped logs distinguish RX and TX if LOG-10 is retained for v1.0.

### Phase 4 - Terminal Data Model And Renderer

Goal: render all v1.0 views from the canonical raw buffer.

Tasks:

- Implement frontend session store for timestamped chunks and bounded scrollback.
- Implement derived line index with configurable CR/LF/CRLF/raw modes.
- Implement invalid UTF-8 replacement and null-byte display behavior.
- Implement partial-line timeout and close-time flush.
- Implement very-long-line wrapping/truncation marker while retaining raw data.
- Implement ASCII, hex, mixed, decimal, and binary renderers.
- Implement virtualized terminal list with stable row heights or measured virtualization.
- Implement auto-scroll, pause-on-scroll-up, resume-at-bottom.
- Implement clear terminal display without truncating log or backend counters.
- Implement status bar byte count, character count, data rate, and log counters.

Deliverables:

- Unit tests prove mode switching does not mutate raw chunks.
- UI tests cover auto-scroll, clear display, and long-line behavior.
- Performance test covers 100k-line display and 100,000 chars/sec feed.

### Phase 5 - Send Path, Files, History, And Macros

Goal: complete all v1.0 transmission workflows with safety controls.

Tasks:

- Implement send bar with text mode, hex mode, line ending options, and validation.
- Implement command history per session with configurable max size and persistence.
- Implement TX echo with distinct visual style and backend timestamp.
- Implement send-file flow with 512-byte default chunks, configurable pacing, progress, and cancel.
- Implement disconnect-during-file-send abort behavior and log marker.
- Implement macro storage, macro editor, macro execution, and per-session macro list.
- Implement timed macro scheduling in backend or backend-authoritative scheduler.
- Implement automation banner, stop-all toolbar action, and Escape shortcut behavior.
- Implement confirmation for repeat interval under 100 ms.
- Implement 1,000 sends/minute rate limit and dropped-send counter.
- Implement optional sidecar automation log if retained for v1.0.

Deliverables:

- Mock serial tests verify exact bytes for text, line endings, hex, file chunks, and macros.
- Rate-limit tests prove frontend cannot bypass backend enforcement.
- UI tests cover macro start/stop and confirmation behavior.

### Phase 6 - Search, Filters, Highlights

Goal: non-destructive text-mode filtering and search over the line index.

Tasks:

- Choose safe regex implementation for frontend and/or backend. Prefer RE2-compatible behavior.
- Enforce max pattern length of 512 chars.
- Enforce match timeout or use a regex engine that avoids catastrophic backtracking.
- Implement highlight rules with up to 16 concurrent rules.
- Implement show-only and suppress filters.
- Implement named filter profiles if included in v1.0.
- Implement Ctrl/Cmd+F search with next/previous navigation.
- Ensure filters affect terminal view only and never log output or raw buffer.

Deliverables:

- Tests prove filters do not alter logs or raw chunks.
- Regex safety tests reject overlong patterns and disable timed-out rules.
- Performance test covers 100k lines x 80 chars under target.

### Phase 7 - Multi-Session UI

Goal: up to four independent connection tabs.

Tasks:

- Implement tab model and active session routing.
- Scope serial config, terminal buffer, log state, macros, automation, filters, command history, and shortcuts per session.
- Enforce max four open connections.
- Add confirmation before closing a connected tab.
- Ensure global settings remain global: theme, font, settings window, update settings.
- Ensure all backend commands require explicit session ID.

Deliverables:

- Tests prove data from one session cannot appear in another session.
- E2E test opens two mock sessions, sends/receives on both, and verifies independent logs and filters.

### Phase 8 - Settings, Accessibility, And Polish

Goal: make the core tool usable and release-quality.

Tasks:

- Implement settings UI backed by formal schema.
- Implement keyboard shortcut configuration and conflict detection.
- Implement theme handling with OS default.
- Implement font family and font size settings.
- Add tooltips for serial signal abbreviations.
- Validate WCAG 2.1 AA contrast for light and dark themes.
- Add empty, error, reconnecting, and hot-unplug banners.
- Add Linux-specific CSS compatibility layer.
- Add open log file/directory command through Tauri shell/file APIs.
- Add export terminal buffer to plain text and HTML if retained for v1.0.

Deliverables:

- Playwright accessibility smoke tests pass.
- Screenshot regression tests cover macOS/Windows/Linux visual differences where CI supports it.

### Phase 9 - Packaging, Signing, Updater, Documentation

Goal: produce installable, documented v1.0 artifacts.

Tasks:

- Configure Tauri bundle metadata, app icon, app identifiers, and process/binary naming.
- Configure macOS `.dmg`, universal binary, signing, and notarization.
- Configure Windows NSIS installer and EV signing.
- Configure Linux AppImage x64/arm64 and `.deb` x64.
- Configure updater and signing keys if Phase 0 approves it.
- Add user docs for Linux permissions, ModemManager, drivers, logging durability, and crash-report privacy.
- Add release checklist and manual hardware test checklist.
- Add license notices for bundled dependencies.

Deliverables:

- Installers build from CI for all target platforms.
- Unsigned local/dev packages are clearly marked.
- Release candidate passes self-test procedure below.

## 5. Work Breakdown By Requirement Area

| Area | Primary modules | Test level |
|---|---|---|
| CON-01 to CON-15 | Rust `serial`, `hotplug`, Tauri commands, connection toolbar | Rust unit, mock integration, hardware manual |
| TRM-01 to TRM-12 | React session store, derived views, terminal virtual list | TS unit, Playwright, perf |
| SND-01 to SND-13 | send bar, backend write, file sender, macro scheduler | TS unit, Rust unit, mock integration, E2E |
| LOG-01 to LOG-16 | Rust logger, rotation, metadata, counters | Rust unit, filesystem integration, stress |
| FLT-01 to FLT-07 | line index, regex engine, rules UI | TS unit, perf, E2E |
| Config | schema, migrations, store adapter, settings UI | TS/Rust unit, filesystem integration |
| Packaging | Tauri bundle config, CI signing jobs | CI, manual install |

## 6. Milestones And Gates

| Milestone | Scope | Gate |
|---|---|---|
| M0 Spike complete | Tauri, serial loopback, rendering, hotplug, packaging proof | All Phase 0 exit criteria met or spec revised. |
| M1 Core alpha | Single-session connect/RX/TX/log/text/hex | Mock tests pass; one adapter loopback passes on developer machine. |
| M2 Feature alpha | file send, macros, filters, settings | E2E tests pass with mock backend. |
| M3 Multi-session beta | up to four sessions, independent logs/state | Cross-session isolation tests pass. |
| M4 Platform beta | packages for macOS/Windows/Linux | Install/uninstall smoke tests pass. |
| M5 Release candidate | full v1.0 scope | Automated tests green plus manual hardware matrix pass. |

## 7. Self-Test Procedures

These procedures are intended for developers and QA to run before merging major features and before release candidates.

### 7.1 Environment Self-Test

Purpose: verify local prerequisites and app startup.

Steps:

1. Install Node LTS, pnpm, Rust stable, platform build prerequisites, and Tauri prerequisites.
2. From `code/serial-com-multiplatform/`, run dependency install.
3. Run frontend typecheck, lint, unit tests, Rust tests, and Tauri dev startup.
4. Confirm app launches with no connected device.
5. Confirm empty state says no port is connected.
6. Confirm config directory and default config are created.

Pass criteria:

- All test commands pass.
- App launches without panic or renderer console errors.
- Invalid or missing config is recovered to defaults with a backup only when needed.

### 7.2 Mock Serial Self-Test

Purpose: validate behavior without hardware.

Fixture:

- Mock serial backend with scripted ports: `MOCK_A`, `MOCK_B`, `MOCK_ERROR`, `MOCK_HOTUNPLUG`.

Steps:

1. Start app with mock backend enabled.
2. Verify mock ports appear on launch and after refresh.
3. Connect to `MOCK_A` at 115200 8N1.
4. Inject `Hello\r\n` from backend; verify terminal displays one RX line.
5. Switch ASCII to hex to mixed to decimal to binary; verify raw data remains present.
6. Send text `AT` with CRLF; verify mock backend receives `41 54 0D 0A`.
7. Send hex `0A 1B FF`; verify exact bytes.
8. Trigger `MOCK_HOTUNPLUG`; verify session transitions to Hot-unplugged and log flush is requested.
9. Connect to `MOCK_B` in a second tab; verify buffers and settings remain separate.

Pass criteria:

- No duplicate ports.
- State transitions match spec.
- TX/RX bytes match exactly.
- No cross-session data leakage.

### 7.3 Hardware Loopback Self-Test

Purpose: prove real serial byte integrity.

Required hardware:

- At least one FTDI FT232R or FT2232 adapter.
- At least one CP2102 adapter.
- At least one CH340 adapter.
- Jumper wire connecting TX to RX on each adapter.
- Optional CDC-ACM microcontroller echo sketch.

Steps:

1. Connect adapter with TX and RX looped.
2. Open MultiSerial and connect at 115200 8N1.
3. Send text and verify echoed RX bytes.
4. Send binary fixture containing all byte values `00` through `FF`; verify displayed/logged bytes match.
5. Send 10 MB deterministic payload at 921600 baud.
6. Export or inspect received raw capture and compare SHA-256 with transmitted payload.
7. Repeat at 230400, 460800, 921600, and one adapter-supported custom baud.
8. During a transfer, unplug the adapter and verify no crash, Hot-unplugged state, log marker, and clean reconnect behavior.

Pass criteria:

- Zero byte mismatch for completed loopback transfers.
- Hot-unplug does not crash or hang.
- Reconnect works without restarting the app.
- Unsupported baud or signal controls produce clear errors, not silent failure.

### 7.4 Logging Self-Test

Purpose: validate log correctness and failure behavior.

Steps:

1. Enable auto-log and connect to mock or loopback port.
2. Verify logging starts before first injected RX byte.
3. Capture mixed RX/TX traffic.
4. Verify metadata header includes port, baud, timestamp, app version, and format.
5. Rotate logs by setting a small threshold such as 64 KB.
6. Verify old segment is closed and fsynced, new segment opens, counters remain monotonic.
7. Switch to raw binary format and capture bytes `00` through `FF`.
8. Verify binary log has header and segment byte count or CRC.
9. Set log path to a read-only or removed directory and continue RX.
10. Verify persistent error banner, logging paused, serial connection remains active.
11. Simulate slow log writer with mock backend and verify `log_overrun_count` increments while RX loop continues.

Pass criteria:

- `rx_bytes == logged_bytes` for healthy logging cases.
- Counter mismatch is visible when logging fails.
- No serial disconnection occurs solely because logging fails.
- Binary data is not corrupted by text decoding.

### 7.5 Terminal Renderer Self-Test

Purpose: prove data model and rendering behavior.

Steps:

1. Inject UTF-8 text, invalid UTF-8, null bytes, long lines, and partial lines.
2. Verify invalid UTF-8 renders as replacement characters and raw log remains unchanged.
3. Verify null bytes render visibly.
4. Verify partial line appears pending and flushes after timeout or connection close.
5. Verify a line over 10,000 bytes is visually wrapped/truncated with marker while raw log is complete.
6. Load 100,000 lines x 80 chars and run search/filter.
7. Feed 100,000 chars/sec synthetic stream for 60 seconds.
8. Scroll up during feed and verify auto-scroll pauses.
9. Scroll to bottom and verify auto-scroll resumes.
10. Clear terminal display and verify log continues and counters are unaffected.

Pass criteria:

- Mode switching never drops or mutates data.
- Search/filter over benchmark fixture completes under target.
- No visible UI jank under target feed on reference hardware.

### 7.6 Send, File, Macro, And Automation Self-Test

Purpose: verify transmission correctness and safety limits.

Steps:

1. Send text with each line ending mode: none, CR, LF, CRLF.
2. Send valid and invalid hex; verify invalid input blocks send with inline error.
3. Navigate command history with Up/Down and restart app to verify persistence.
4. Send a binary file fixture and verify 512-byte chunks and configured pacing.
5. Cancel file send mid-transfer and verify no further chunks are written.
6. Disconnect during file send and verify error notification and partial TX log marker.
7. Create text and hex macros with delays; verify exact byte sequence and timing tolerance.
8. Start a repeating macro and verify automation banner.
9. Press Escape outside send bar and verify automation stops.
10. Try repeat interval under 100 ms and verify confirmation dialog.
11. Attempt to exceed 1,000 sends/minute and verify backend drops excess sends and increments counter.

Pass criteria:

- All transmitted bytes match fixture expectations.
- Automation cannot bypass backend rate limit.
- Stop-all automation works even if UI panel is closed.

### 7.7 Filters And Search Self-Test

Purpose: verify non-destructive line-index features.

Steps:

1. Inject lines with known keywords and structured patterns.
2. Add highlight rule and verify visual highlight only.
3. Add show-only rule and verify nonmatching lines are hidden, not deleted.
4. Add suppress rule and verify matching lines are hidden, not deleted.
5. Disable all filters and verify all lines return.
6. Verify log file still contains complete unfiltered stream.
7. Add 17th rule and verify app prevents it or explains the 16-rule limit.
8. Add pattern longer than 512 chars and verify rejection.
9. Add pathological regex if the engine permits it and verify timeout/disable behavior.
10. Search forward/backward through matches with keyboard shortcuts.

Pass criteria:

- Filters affect display only.
- Regex safety rules are enforced.
- Search navigation remains correct after new data arrives.

### 7.8 Multi-Session Self-Test

Purpose: verify up to four independent sessions.

Steps:

1. Open four tabs with four mock ports or two mock plus two disconnected tabs.
2. Configure different baud, view mode, log format, filters, macros, and histories per tab.
3. Inject unique RX payload into each mock port.
4. Send unique TX payload from each tab.
5. Verify status bars, logs, counters, histories, and filters remain per-session.
6. Attempt to open a fifth connected session and verify defined limit behavior.
7. Close a connected tab and verify confirmation dialog.
8. Confirm closing one tab does not disconnect or mutate others.

Pass criteria:

- No session state crosses tab boundaries.
- Max-session limit is enforced gracefully.

### 7.9 Platform Packaging Self-Test

Purpose: validate installable artifacts.

macOS:

1. Build arm64 and x64 artifacts.
2. Merge or package as decided.
3. Sign and notarize.
4. Install from `.dmg`.
5. Launch from Applications.
6. Verify serial port access, config path, log path, and updater behavior.

Windows:

1. Build NSIS installer.
2. Sign installer and app binary.
3. Install on Windows 10 and Windows 11.
4. Verify WebView2 handling, COM port listing, uninstall, and reinstall.

Linux:

1. Build AppImage x64/arm64 and `.deb` x64.
2. Install on Ubuntu 22.04 and 24.04.
3. Verify `dialout` guidance, WebKitGTK dependencies, port listing, and log path.
4. Verify ModemManager retry messaging with a USB serial adapter.

Pass criteria:

- Fresh install, launch, connect, log, and uninstall work on each target.
- Package names and paths match the naming conventions.
- Updater behavior matches the final v1.0 decision.

### 7.10 Release Candidate Self-Test

Purpose: final pre-release confidence check.

Steps:

1. Run full automated test suite on CI for macOS, Windows, and Linux.
2. Run hardware loopback matrix for approved adapters and OS versions.
3. Run 8-hour soak test at 115200 baud with logging enabled and rotation active.
4. Run 1-hour high-rate test at 921600 baud with raw binary logging.
5. Verify crash reporting is off by default.
6. Verify crash report scrubber excludes serial data, logs, and usernames in paths.
7. Verify no v1.1-only UI is visible unless explicitly disabled or marked unavailable.
8. Verify docs match implemented behavior.
9. Verify license notices and MIT license are included.

Pass criteria:

- Zero known P0/P1 bugs.
- No byte loss in hardware tests.
- No unhandled panic/crash in soak tests.
- Installer artifacts are signed or explicitly marked development-only.

## 8. Automated Test Inventory

Required before v1.0:

- Rust unit tests for session state machine, serial config validation, logger rotation, log format encoding, counters, filename templates, and rate limiter.
- Rust integration tests for mock serial backend, log writer failure modes, and config migration.
- TypeScript unit tests for derived views, line indexing, display mode renderers, search/filter logic, command history, settings validation, and shortcut conflict detection.
- React component tests for send bar, macro panel, filter panel, terminal status bar, and connection toolbar.
- Playwright E2E tests for connect/send/receive/log/filter/macro/multi-tab flows using mock backend.
- Performance tests for 100k lines, 100,000 chars/sec feed, and search/filter target.
- Manual hardware tests for byte integrity, hotplug, high baud, adapter metadata, DTR/RTS, and platform permissions.

## 9. Risks And Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tauri binary IPC path differs from spec | Medium | High | Phase 0 proof; fallback to efficient chunked JSON/base64 only if benchmark passes. |
| `tauri-plugin-serialplugin` cannot expose required controls | Medium | High | Isolate serial backend behind trait; use direct `serialport-rs` implementation if needed. |
| WebKitGTK terminal rendering misses performance target | Medium | Medium | Keep Linux CSS compatibility layer and virtualization benchmark mandatory. |
| Hardware-specific baud/control behavior varies | High | Medium | Mark driver-dependent capabilities as best-effort and expose clear user errors. |
| Logging backpressure creates memory growth | Medium | High | Bounded queues, overrun counter, clear durability language. |
| Multi-tab implementation leaks session state | Medium | High | Session ID required on every command and test cross-session isolation. |
| Signing/cert procurement delays release | Medium | High | Start in Phase 0, allow unsigned internal RC builds only. |
| Scope creep from v1.1 features | High | High | Enforce milestone gates and hide scripting/plugin UI in v1.0. |

## 10. Immediate Next Actions

1. Patch `MultiSerial_Spec.md` for stale Node.js wording, duplicate architecture sections, footer version, and Linux updater contradiction.
2. Create decision records for binary log format, config schema, raw IPC implementation, hardware matrix, and updater support.
3. Scaffold the Tauri app under `code/serial-com-multiplatform/`.
4. Implement Phase 0 spike with loopback, synthetic rendering benchmark, hotplug proof, and packaging skeleton.
5. Review Phase 0 results before committing to Phase 1 production implementation.
