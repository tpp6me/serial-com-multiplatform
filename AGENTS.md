# Repository Guidelines

## Project Structure & Module Organization

This is a Tauri v2 desktop app for MultiSerial. Frontend code lives in `src/`: React entry points are `src/main.tsx` and `src/app/App.tsx`, styles are in `src/styles/`, and frontend tests are colocated as `*.test.tsx`. Rust backend code is in `src-tauri/src/`, with modules for `serial`, `logging`, and `config`. Tauri configuration, capabilities, icons, and Cargo metadata are under `src-tauri/`. Scripts are in `scripts/`, docs are in `docs/`, and implementation tracking is in `TODO.md`.

## Build, Test, and Development Commands

Use Corepack and the pinned package manager; do not install global pnpm packages.

- `corepack pnpm check:env`: report pinned tool versions.
- `corepack pnpm dev`: run the Vite frontend with repository-local dev paths.
- `corepack pnpm tauri:dev`: run the desktop app locally.
- `corepack pnpm build`: type-check and build the frontend.
- `corepack pnpm tauri:build`: build the Tauri application.
- `corepack pnpm test`: run Vitest frontend tests.
- `corepack pnpm rust:test`: run Rust unit tests.
- `corepack pnpm rust:fmt` and `corepack pnpm rust:clippy`: check Rust style and warnings.
- `corepack pnpm lint` and `corepack pnpm format:check`: validate ESLint and Prettier.

## Coding Style & Naming Conventions

TypeScript uses strict mode, ESLint, and Prettier. React components use PascalCase; hooks and helpers use camelCase. Rust uses `cargo fmt`, clippy, snake_case functions, PascalCase types, and focused modules with explicit error types. Keep Tauri payloads serializable with `serde` and `camelCase` JSON fields.

## Testing Guidelines

Frontend tests use Vitest and React Testing Library with setup in `src/test/setup.ts`. Rust tests are standard `#[test]` unit tests near module logic. Add focused tests for state transitions, serial/logging counters, error paths, and command contract changes. Before handoff, run relevant checks plus the full gate when possible: `rust:fmt`, `rust:test`, `rust:clippy`, `typecheck`, `lint`, `test`, `format:check`, and `git diff --check`.

## Commit & Pull Request Guidelines

Recent commits use concise imperative messages, for example `Add serial logging core`. Keep commits scoped to one logical change. Pull requests should include a summary, validation commands run, linked issue or TODO IDs when applicable, and screenshots only for UI changes.

## Security & Configuration Tips

Use the isolated development environment. Dev config, logs, and temp files should stay under `.dev-data/` via `scripts/run-with-dev-env.mjs`; avoid writing to user-level MultiSerial paths. Never include serial payload data, personal device paths, credentials, or generated logs in commits.
