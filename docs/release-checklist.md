# Release Checklist

## Local Gates

Run these before packaging:

```bash
corepack pnpm check:env
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm rust:fmt
corepack pnpm rust:clippy
corepack pnpm rust:test
corepack pnpm build
```

## Packaging Gates

- Generate icons with `corepack pnpm icons:generate`.
- Generate notices with `corepack pnpm notices:generate`.
- Build macOS app and DMG artifacts.
- Build Windows NSIS artifacts on Windows.
- Build Linux AppImage and `.deb` artifacts on Linux.
- Verify bundled `LICENSE` and `THIRD_PARTY_NOTICES.md`.

## Signing Gates

- Updater: set `TAURI_SIGNING_PRIVATE_KEY` in the release environment. Keep the private key out of git.
- macOS: Apple Developer signing identity, hardened runtime, notarization, and Gatekeeper launch.
- Windows: EV certificate/signing command, timestamp server, and installer reputation path.
- Linux: package install and serial permissions behavior.

## Updater Gates

- Publish a signed updater manifest for each release channel.
- Verify `stable`, `beta`, and `nightly` targets route to the intended manifest.
- Verify auto-check reports current, available, and error states.
- Verify auto-download downloads but does not install without an explicit install action.

## Hardware Gates

Run loopback and hotplug tests for each adapter in the approved hardware matrix before release.
