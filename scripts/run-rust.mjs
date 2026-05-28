import { execFileSync, spawn } from "node:child_process";
import { dirname } from "node:path";

const [, , tool, ...args] = process.argv;
const toolchain = "1.89.0";

if (!tool) {
  console.error("Usage: node scripts/run-rust.mjs <tool> [...args]");
  process.exit(2);
}

const rustc = execFileSync("rustup", ["which", "--toolchain", toolchain, "rustc"], {
  encoding: "utf8"
}).trim();
const rustdoc = execFileSync("rustup", ["which", "--toolchain", toolchain, "rustdoc"], {
  encoding: "utf8"
}).trim();
const toolchainBin = dirname(rustc);

const child = spawn("rustup", ["run", toolchain, tool, ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    PATH: `${toolchainBin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
    RUSTC: rustc,
    RUSTDOC: rustdoc
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});
