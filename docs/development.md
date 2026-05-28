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
corepack pnpm rust:test
```

## Global Prerequisites

Some OS-level build dependencies are unavoidable:

- macOS: Xcode Command Line Tools and WebKit provided by the OS.
- Windows: Microsoft C++ Build Tools and WebView2 runtime.
- Linux: WebKitGTK and standard Tauri Linux build packages.

Do not install project JavaScript tools globally. If a command requires a global package, treat that as a project bug and add it to `package.json`.
