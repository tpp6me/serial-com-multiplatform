# Development Environment

MultiSerial development is configured to avoid clashes with user-level tools and user-level app data.

## Pinned Tools

- Node is pinned in `.node-version`.
- pnpm is pinned through `packageManager` in `package.json`.
- Rust is pinned in `rust-toolchain.toml`. The project currently uses Rust 1.89.0 because current Tauri 2 crates require Rust 1.88 or newer.
- Rust dependencies are locked through `Cargo.lock` after the first dependency resolution.

Use `corepack` instead of installing pnpm globally:

```bash
corepack enable
corepack prepare pnpm@10.11.0 --activate
corepack pnpm install
```

Then verify the active environment:

```bash
corepack pnpm check:env
```

## Local App Data

Development commands run with these project-local paths:

- Config: `.dev-data/config`
- Logs: `.dev-data/logs`
- Temp files: `.dev-data/tmp`

This prevents development and test runs from writing to the normal user paths:

- `~/.multiSerial/`
- `~/MultiSerial/logs/`

## Commands

```bash
corepack pnpm dev
corepack pnpm tauri:dev
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:e2e
corepack pnpm rust:test
```

## Test Isolation

Test scripts run through `scripts/run-with-test-env.mjs`.

- Config: `.dev-data/test-config`
- Logs: `.dev-data/test-logs`
- Temp files: `.dev-data/test-tmp`
- Playwright reports: `.dev-data/test-results/playwright` and `.dev-data/playwright-report`

The wrapper removes the test config, log, and temp directories before and after each test command. Rust tests that need ad hoc scratch space use the OS temporary directory and do not write to user MultiSerial paths.

For fully hermetic Rust dependency caches, set project-local Cargo paths before running Rust commands:

```bash
CARGO_HOME="$PWD/.dev-data/cargo-home" CARGO_TARGET_DIR="$PWD/.dev-data/cargo-target" corepack pnpm rust:test
```

## Playwright Browser Cache

Playwright is a project dev dependency. Browser binaries must stay outside global caches:

```bash
PLAYWRIGHT_BROWSERS_PATH=.dev-data/playwright-browsers corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

`playwright.config.ts` sets `PLAYWRIGHT_BROWSERS_PATH` to `.dev-data/playwright-browsers` by default and writes reports under `.dev-data/`.

## Global Prerequisites

Some OS-level build dependencies are unavoidable:

- macOS: Xcode Command Line Tools and WebKit provided by the OS.
- Windows: Microsoft C++ Build Tools and WebView2 runtime.
- Linux: WebKitGTK and standard Tauri Linux build packages. Verified on Ubuntu 24.04:

  ```bash
  sudo apt-get update && sudo apt-get install -y \
    libgtk-3-dev libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev \
    libsoup-3.0-dev libayatana-appindicator3-dev librsvg2-dev \
    libudev-dev patchelf
  ```

  `libudev-dev` is required by the `serialport` crate's `libudev-sys` dependency; the rest are required by `tauri-build`/`wry`/`tray-icon`.

Do not install project JavaScript tools globally. If a command requires a global package, treat that as a project bug and add it to `package.json`.
