import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(".");
const npmPackages = readNpmPackages();
const cargoPackages = readCargoPackages();
const generatedAt = new Date().toISOString().slice(0, 10);

const lines = [
  "# Third-Party Notices",
  "",
  `Generated from local dependency metadata on ${generatedAt}.`,
  "",
  "This file summarizes dependency names, versions, and license identifiers for the current lockfiles.",
  "The project license is provided separately in `LICENSE`.",
  "",
  "## npm Dependencies",
  "",
  "| Package | Version | License |",
  "| --- | --- | --- |",
  ...npmPackages.map(
    (pkg) => `| ${escapeCell(pkg.name)} | ${escapeCell(pkg.version)} | ${escapeCell(pkg.license)} |`
  ),
  "",
  "## Rust Dependencies",
  "",
  "| Package | Version | License |",
  "| --- | --- | --- |",
  ...cargoPackages.map(
    (pkg) => `| ${escapeCell(pkg.name)} | ${escapeCell(pkg.version)} | ${escapeCell(pkg.license)} |`
  ),
  ""
];

writeFileSync(resolve(root, "THIRD_PARTY_NOTICES.md"), `${lines.join("\n")}\n`);

function readNpmPackages() {
  const packages = new Map();
  const storeDir = resolve(root, "node_modules/.pnpm");

  if (!existsSync(storeDir)) {
    return [];
  }

  for (const entry of readdirSync(storeDir)) {
    const packageRoot = join(storeDir, entry, "node_modules");
    if (!existsSync(packageRoot)) {
      continue;
    }

    for (const packageName of walkPackageNames(packageRoot)) {
      const packageJsonPath = join(packageRoot, packageName, "package.json");
      if (!existsSync(packageJsonPath)) {
        continue;
      }

      const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      if (parsed.name && parsed.version) {
        packages.set(`${parsed.name}@${parsed.version}`, {
          name: parsed.name,
          version: parsed.version,
          license: normalizeLicense(parsed.license)
        });
      }
    }
  }

  return [...packages.values()].sort(comparePackages);
}

function walkPackageNames(packageRoot) {
  const names = [];

  for (const entry of readdirSync(packageRoot)) {
    if (entry.startsWith(".")) {
      continue;
    }

    if (entry.startsWith("@")) {
      for (const scopedEntry of readdirSync(join(packageRoot, entry))) {
        names.push(`${entry}/${scopedEntry}`);
      }
    } else {
      names.push(entry);
    }
  }

  return names;
}

function readCargoPackages() {
  try {
    const hostTriple = cargoHostTriple();
    const metadata = JSON.parse(
      execFileSync(
        "cargo",
        [
          "metadata",
          "--locked",
          "--offline",
          "--filter-platform",
          hostTriple,
          "--format-version",
          "1",
          "--manifest-path",
          "src-tauri/Cargo.toml"
        ],
        { cwd: root, encoding: "utf8", env: { ...process.env, CARGO_NET_OFFLINE: "true" } }
      )
    );
    const workspaceMembers = new Set(metadata.workspace_members);
    const resolvedIds = new Set(metadata.resolve?.nodes.map((node) => node.id) ?? []);

    return metadata.packages
      .filter((pkg) => resolvedIds.has(pkg.id) && !workspaceMembers.has(pkg.id))
      .map((pkg) => ({
        name: pkg.name,
        version: pkg.version,
        license: normalizeLicense(pkg.license ?? pkg.license_file)
      }))
      .sort(comparePackages);
  } catch {
    return readCargoLockPackages();
  }
}

function cargoHostTriple() {
  const versionOutput = execFileSync("rustc", ["-vV"], {
    cwd: root,
    encoding: "utf8"
  });
  const host = versionOutput.match(/^host: (.+)$/m)?.[1];

  if (!host) {
    throw new Error("rustc -vV did not report a host triple");
  }

  return host;
}

function readCargoLockPackages() {
  const lockPath = resolve(root, "src-tauri/Cargo.lock");
  if (!existsSync(lockPath)) {
    return [];
  }

  const packages = [];
  const packageBlocks = readFileSync(lockPath, "utf8").split(/\n(?=\[\[package\]\]\n)/u);

  for (const block of packageBlocks) {
    const name = block.match(/^name = "(.+)"$/m)?.[1];
    const version = block.match(/^version = "(.+)"$/m)?.[1];
    if (!name || !version || name === "multiSerial") {
      continue;
    }

    packages.push({
      name,
      version,
      license: licenseFromCargoRegistry(name, version)
    });
  }

  return packages.sort(comparePackages);
}

function licenseFromCargoRegistry(name, version) {
  const registrySrc = resolve(homedir(), ".cargo/registry/src");
  if (!existsSync(registrySrc)) {
    return "UNKNOWN";
  }

  for (const registry of readdirSync(registrySrc)) {
    const manifestPath = join(registrySrc, registry, `${name}-${version}`, "Cargo.toml");
    if (!existsSync(manifestPath)) {
      continue;
    }

    const manifest = readFileSync(manifestPath, "utf8");
    return normalizeLicense(manifest.match(/^license = "(.+)"$/m)?.[1]);
  }

  return "UNKNOWN";
}

function normalizeLicense(value) {
  if (!value) {
    return "UNKNOWN";
  }
  if (typeof value === "string") {
    return value.replace(/\s+/g, " ").trim();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeLicense).join(" OR ");
  }
  if (typeof value === "object" && value.type) {
    return normalizeLicense(value.type);
  }
  return "SEE PACKAGE METADATA";
}

function comparePackages(left, right) {
  return left.name.localeCompare(right.name) || left.version.localeCompare(right.version);
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}
