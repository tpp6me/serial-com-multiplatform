import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const expectedNode = readFileSync(new URL(".node-version", root), "utf8").trim().replace(/^v/, "");
const expectedPnpm = packageJson.packageManager.split("@")[1];
const rustToolchain = readFileSync(new URL("rust-toolchain.toml", root), "utf8");
const expectedRust = rustToolchain.match(/channel = "([^"]+)"/)?.[1];
const rustupRun = (tool, args) =>
  execFileSync("rustup", ["run", expectedRust, tool, ...args], { encoding: "utf8" }).trim();

const checks = [
  {
    name: "node",
    expected: expectedNode,
    actual: () => process.version.replace(/^v/, "")
  },
  {
    name: "corepack",
    expected: "available",
    actual: () => execFileSync("corepack", ["--version"], { encoding: "utf8" }).trim()
  },
  {
    name: "pnpm",
    expected: expectedPnpm,
    actual: () => {
      try {
        return execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim();
      } catch {
        return execFileSync("corepack", ["pnpm", "--version"], { encoding: "utf8" }).trim();
      }
    }
  },
  {
    name: "rustc",
    expected: expectedRust,
    actual: () => rustupRun("rustc", ["--version"])
  },
  {
    name: "cargo",
    expected: "available",
    actual: () => rustupRun("cargo", ["--version"])
  }
];

let failed = false;

for (const check of checks) {
  try {
    const actual = check.actual();
    const ok =
      check.name === "rustc"
        ? actual.includes(check.expected)
        : check.expected === "available" || actual === check.expected;

    if (ok) {
      console.log(`[ok] ${check.name}: ${actual}`);
    } else {
      failed = true;
      console.warn(`[warn] ${check.name}: expected ${check.expected}, found ${actual}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (check.optional) {
      console.warn(
        `[warn] ${check.name}: not available (${message}). Run through corepack/pnpm before install.`
      );
    } else {
      failed = true;
      console.error(`[error] ${check.name}: ${message}`);
    }
  }
}

if (failed) {
  process.exitCode = 1;
}
