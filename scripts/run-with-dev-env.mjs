import { existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { homedir } from "node:os";

const [, , command, ...args] = process.argv;

if (!command) {
  console.error("Usage: node scripts/run-with-dev-env.mjs <command> [...args]");
  process.exit(2);
}

const devDataRoot = resolve(".dev-data");
const configDir = resolve(devDataRoot, "config");
const logDir = resolve(devDataRoot, "logs");
const tempDir = resolve(devDataRoot, "tmp");
const cargoBin = resolve(homedir(), ".cargo/bin");
const pathWithRustup = existsSync(cargoBin)
  ? `${cargoBin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`
  : process.env.PATH;

for (const path of [configDir, logDir, tempDir]) {
  mkdirSync(path, { recursive: true });
}

const child = spawn(command, args, {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    PATH: pathWithRustup,
    MULTISERIAL_ENV: process.env.MULTISERIAL_ENV ?? "development",
    MULTISERIAL_CONFIG_DIR: process.env.MULTISERIAL_CONFIG_DIR ?? configDir,
    MULTISERIAL_LOG_DIR: process.env.MULTISERIAL_LOG_DIR ?? logDir,
    MULTISERIAL_TEMP_DIR: process.env.MULTISERIAL_TEMP_DIR ?? tempDir
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});
