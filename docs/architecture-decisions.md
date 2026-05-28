# MultiSerial Architecture Decisions

Date: 2026-05-28

## ADR-001: Tauri IPC For Serial Bytes

Use Tauri commands for request/response operations and Tauri events for RX batches. The Rust backend emits `serial-rx-batch` payloads as typed structs containing `Vec<u8>` chunks, and React treats the received arrays as canonical bytes before deriving terminal views. Batches drain every 16 ms from the Rust RX queue. If hardware throughput testing shows serialization overhead at 921600 baud or above, replace only the hot path with a raw binary transport while keeping the same `RxBatch` semantics.

## ADR-002: Binary Log Format

Use the custom `MSLOG1` binary container implemented by the Rust logger. Each file starts with `MSLOG1\n`, a JSON metadata object, and a newline. Each record is:

- 1 byte direction: `1` RX, `2` TX, `3` marker
- 16 byte little-endian wall-clock timestamp in milliseconds
- 8 byte little-endian payload length
- payload bytes

The per-record length field satisfies the v1.0 truncation-detection requirement. Rotation starts a new `MSLOG1` segment with its own metadata header.

## ADR-003: Linux Updater Support

Keep Linux updater support in v1.0 scope for AppImage and `.deb` artifacts, using Tauri updater signing metadata when packaging work reaches Phase 9. If packaging validation cannot prove a reliable signed Linux update flow, v1.0 must ship Linux update-check-only behavior and update the roadmap before release.

## ADR-004: Serial Backend Selection

Use direct `serialport-rs` through the Rust backend instead of `tauri-plugin-serialplugin` for v1.0. The backend must own serial handles, RX polling, TX writes, DTR/RTS control, logging fan-out, counters, hot-unplug state transitions, and automation rate limiting. A direct Rust trait (`SerialBackend` / `SerialPortHandle`) also keeps the mock backend small and deterministic for unit tests.

The plugin remains a reference implementation, but it is not selected for production because the application needs tighter ownership of session state and logging behavior than a frontend-facing serial plugin API provides.

## Hardware Test Matrix

Approved v1.0 adapter matrix:

| Adapter             | macOS 13/14/15        | Windows 10/11         | Ubuntu 22.04/24.04    |
| ------------------- | --------------------- | --------------------- | --------------------- |
| FTDI FT232R         | Required              | Required              | Required              |
| Silicon Labs CP2102 | Required              | Required              | Required              |
| WCH CH340/CH341     | Required              | Required              | Required              |
| CDC-ACM device      | Required if available | Required if available | Required if available |

Loopback tests must cover 115200 baud on every approved adapter and one 921600 baud 10 MB SHA-256 round trip on at least one supported OS.

## Config Schema Requirements

The formal `config.schema.json` must describe the persisted `AppConfig` object exactly:

- `schemaVersion` integer, currently `1`
- required top-level objects: `connection`, `display`, `logging`, `send`, `filters`, `updates`, `telemetry`
- enum constraints for parity, stop bits, flow control, view mode, theme, timestamp format, newline mode, log format, rotation period, release channel
- numeric ranges for baud rate, font size, scrollback lines, reconnect retry/backoff, history size, file-send chunk/pacing, automation limits, regex limits, rotation size, retention count
- defaults matching `AppConfig::default_v1()` in `src-tauri/src/config.rs`
- `additionalProperties: false` at every object level

Config load must validate before use, migrate older schema versions, atomically rewrite normalized config, and back up invalid files before replacing them with defaults.
