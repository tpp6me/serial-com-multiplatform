# MultiSerial Spike Results

Date: 2026-05-28

## Tauri Scaffold

- Vite dev server starts on macOS at `http://127.0.0.1:1420/`.
- `tauri build --no-bundle` produces `src-tauri/target/release/multiSerial`.
- React uses Tauri commands for environment/config/serial calls and Tauri events for RX batches.

## Serial Backend

- Direct `serialport-rs` was selected over `tauri-plugin-serialplugin`.
- Current automated coverage verifies port-list sorting/deduplication, serial config validation, mock open/close, mock RX/TX, custom baud backend rejection, DTR/RTS control, hot-unplug state transitions, and reconnect.
- CP2102 loopback on `/dev/cu.SLAB_USBtoUART` passed at 115200 8N1 on macOS. The check wrote 289 bytes, including `00..FF`, and read back an exact match.
- After unplug/reconnect, CP2102 loopback on `/dev/cu.SLAB_USBtoUART` passed again at 115200 8N1 on 2026-05-28. The Rust hardware test wrote 289 bytes, received 289 bytes, and matched SHA-256 `1696f90eae74d17b61a467cc255b1213ca9f01906f629668480800cebee95136`.
- CP2102 loopback on `/dev/cu.SLAB_USBtoUART` passed 230400, 460800, and custom 250000 baud on 2026-05-28. Each run wrote 289 bytes, received 289 bytes, and matched SHA-256 `1696f90eae74d17b61a467cc255b1213ca9f01906f629668480800cebee95136`.
- CP2102 loopback on `/dev/cu.SLAB_USBtoUART` did not pass the 921600 baud 10 MB gate. The 2026-05-29 Rust hardware rerun wrote 10,485,760 bytes, received 10,483,862 bytes before the 180 s timeout, and the received SHA-256 did not match.

## RX Throughput

- The automated terminal performance test generates a synthetic 60-second feed at 100,000 chars/sec, totaling 6,000,000 bytes.
- The feed is converted into 75,000 terminal lines and a virtual viewport window, with an assertion that the model path completes under 2,000 ms.
- Playwright verifies browser interactivity during a live 60-second feed at 100,000 chars/sec. During the feed it toggles wrapping, focuses search via `Ctrl/Cmd+F`, searches the active line index, adds a highlight rule, and verifies the terminal status reaches `RX 6000000 B`.

## Packaging

- macOS DMG bundling passes on Apple Silicon with `node scripts/run-with-dev-env.mjs corepack pnpm exec tauri build --bundles dmg`.
- The generated artifact is `src-tauri/target/release/bundle/dmg/MultiSerial_0.1.0_aarch64.dmg`.
- `hdiutil` cannot create the DMG from inside the Codex sandbox (`Device not configured`); run the packaging command outside the sandbox or approve an escalated packaging command.
- Windows NSIS, Linux AppImage, and Linux `.deb` artifacts require native OS runners or CI. On macOS, `tauri build --help` only lists host-supported `ios`, `app`, and `dmg` bundle values. See [Linux Build, Launch, and Hardware Validation](#linux-build-launch-and-hardware-validation) below for the verified Linux build.

## Updater

- Tauri v2 updater support is validated for macOS, Windows, and Linux from the official updater plugin documentation and the local Tauri CLI version (`2.11.2`).
- Updater implementation is wired with `tauri-plugin-updater`, `@tauri-apps/plugin-updater`, `createUpdaterArtifacts`, a public key in `tauri.conf.json`, and frontend update-check controls. Release builds must provide the private signing key through `TAURI_SIGNING_PRIVATE_KEY`.
- Phase 9 still needs published signed release manifests, production update endpoints, and per-OS install/update smoke tests.
- Keep Linux updater behavior in v1.0 scope. If signed AppImage/`.deb` update validation fails in Phase 9, release Linux as update-check-only and document the limitation before RC.

## Linux Build, Launch, and Hardware Validation

Date: 2026-06-15, Ubuntu 24.04.4 LTS (x86_64).

- `corepack pnpm tauri:build` succeeds after installing `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libjavascriptcoregtk-4.1-dev`, `libsoup-3.0-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libudev-dev`, and `patchelf`. `libudev-dev` is the easy one to miss — its absence only surfaces as a `libudev-sys` build-script failure after most of the dependency tree has compiled.
- Produces `src-tauri/target/release/bundle/appimage/MultiSerial_0.1.0_amd64.AppImage` and `src-tauri/target/release/bundle/deb/MultiSerial_0.1.0_amd64.deb`.
- The overall `tauri:build` command exits non-zero because `createUpdaterArtifacts` is enabled and `TAURI_SIGNING_PRIVATE_KEY` is unset, but this happens after both bundles are written — the AppImage and `.deb` are valid and usable.
- The AppImage launches on a real Ubuntu 24.04 desktop session (GTK 3.24.41, WebKitGTK 2.52.3) and renders the full UI correctly: toolbar, port list, terminal, inspector panels, and status bar all match the macOS layout.
- Serial device permissions: `/dev/ttyUSB0` (and `/dev/ttyS*`) are `root:dialout`. A user not in the `dialout` group sees the port listed but cannot connect. Adding the user with `sudo usermod -aG dialout "$USER"` and starting a new login session resolves it, confirming the existing [Linux Permissions](linux-permissions.md) guidance is accurate.
- Hardware loopback: with `dialout` group active, a Silicon Labs CP2102 USB-UART adapter on `/dev/ttyUSB0` was selected, connected at 115200 8N1, and passed a manual send/receive loopback test from the packaged AppImage.

## Blocked Hardware/OS Checks

- CP2102 macOS hotplug timing did not meet the 2-second target in the interactive hardware test. The `/dev/cu.usbserial-0001` run detected removal in 11,919 ms and insertion in 22,330 ms. The same run found no duplicate serial port paths.
- FTDI, CH340/CH341, and CDC-ACM loopback checks require additional hardware. The current macOS USB inventory only identifies a Silicon Labs CP2102 adapter.
- `.deb` install/launch (`PKG-LINUX-004`/`005`, `TEST-PKG-008`), Ubuntu 22.04 verification, and ModemManager conflict scenarios remain unverified.
- Windows packaging/updater checks require a Windows 10/11 environment.
