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
- CP2102 loopback on `/dev/cu.SLAB_USBtoUART` did not pass the 921600 baud 10 MB gate. The Rust `serialport-rs` hardware test wrote 10,485,760 bytes, received 5,038,589 bytes before the 180 s timeout, and the received SHA-256 did not match.

## RX Throughput

- The automated terminal performance test generates a synthetic 60-second feed at 100,000 chars/sec, totaling 6,000,000 bytes.
- The feed is converted into 75,000 terminal lines and a virtual viewport window, with an assertion that the model path completes under 2,000 ms.
- Playwright verifies browser interactivity during a live 60-second feed at 100,000 chars/sec. During the feed it toggles wrapping, focuses search via `Ctrl/Cmd+F`, searches the active line index, adds a highlight rule, and verifies the terminal status reaches `RX 6000000 B`.

## Packaging

- macOS DMG bundling passes on Apple Silicon with `node scripts/run-with-dev-env.mjs corepack pnpm exec tauri build --bundles dmg`.
- The generated artifact is `src-tauri/target/release/bundle/dmg/MultiSerial_0.1.0_aarch64.dmg`.
- `hdiutil` cannot create the DMG from inside the Codex sandbox (`Device not configured`); run the packaging command outside the sandbox or approve an escalated packaging command.
- Windows NSIS, Linux AppImage, and Linux `.deb` artifacts require native OS runners or CI. On macOS, `tauri build --help` only lists host-supported `ios`, `app`, and `dmg` bundle values.

## Updater

- Tauri v2 updater support is validated for macOS, Windows, and Linux from the official updater plugin documentation and the local Tauri CLI version (`2.11.2`).
- Updater implementation is wired with `tauri-plugin-updater`, `@tauri-apps/plugin-updater`, `createUpdaterArtifacts`, a public key in `tauri.conf.json`, and frontend update-check controls. Release builds must provide the private signing key through `TAURI_SIGNING_PRIVATE_KEY`.
- Phase 9 still needs published signed release manifests, production update endpoints, and per-OS install/update smoke tests.
- Keep Linux updater behavior in v1.0 scope. If signed AppImage/`.deb` update validation fails in Phase 9, release Linux as update-check-only and document the limitation before RC.

## Blocked Hardware/OS Checks

- CP2102 macOS hotplug timing did not meet the 2-second target in the interactive hardware test. The `/dev/cu.usbserial-0001` run detected removal in 11,919 ms and insertion in 22,330 ms. The same run found no duplicate serial port paths.
- FTDI, CH340/CH341, and CDC-ACM loopback checks require additional hardware. The current macOS USB inventory only identifies a Silicon Labs CP2102 adapter.
- Linux WebKitGTK checks require an Ubuntu 22.04/24.04 environment.
- Windows packaging/updater checks require a Windows 10/11 environment.
