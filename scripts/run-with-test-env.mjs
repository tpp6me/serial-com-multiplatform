import { mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve, relative } from "node:path";

const [, , command, ...args] = process.argv;

if (!command) {
  console.error("Usage: node scripts/run-with-test-env.mjs <command> [...args]");
  process.exit(2);
}

const devDataRoot = resolve(".dev-data");
const testConfigDir = resolve(devDataRoot, "test-config");
const testLogDir = resolve(devDataRoot, "test-logs");
const testTempDir = resolve(devDataRoot, "test-tmp");
const testDirs = [testConfigDir, testLogDir, testTempDir];

function assertInsideDevData(path) {
  const pathRelativeToDevData = relative(devDataRoot, path);
  if (pathRelativeToDevData.startsWith("..") || pathRelativeToDevData === "") {
    throw new Error(`Refusing to clean non-test path: ${path}`);
  }
}

function cleanTestDirs() {
  for (const path of testDirs) {
    assertInsideDevData(path);
    rmSync(path, { recursive: true, force: true });
  }
}

cleanTestDirs();

for (const path of testDirs) {
  mkdirSync(path, { recursive: true });
}

const child = spawn(command, args, {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    MULTISERIAL_ENV: process.env.MULTISERIAL_ENV ?? "test",
    MULTISERIAL_CONFIG_DIR: process.env.MULTISERIAL_CONFIG_DIR ?? testConfigDir,
    MULTISERIAL_LOG_DIR: process.env.MULTISERIAL_LOG_DIR ?? testLogDir,
    MULTISERIAL_TEMP_DIR: process.env.MULTISERIAL_TEMP_DIR ?? testTempDir,
    PLAYWRIGHT_BROWSERS_PATH:
      process.env.PLAYWRIGHT_BROWSERS_PATH ?? resolve(devDataRoot, "playwright-browsers")
  }
});

child.on("exit", (code, signal) => {
  cleanTestDirs();

  if (signal) {
    process.kill(process.pid, signal);
  }

  process.exit(code ?? 1);
});
