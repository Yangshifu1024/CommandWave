#!/usr/bin/env node
/**
 * Optional Starship bundling: downloads the starship binary for the
 * current platform into src-tauri/resources/ so `pnpm tauri build`
 * ships it as an app resource. CommandWave then uses the bundled binary
 * even when the user has no starship on PATH.
 *
 *   node scripts/fetch-starship.mjs          # latest release
 *   node scripts/fetch-starship.mjs v1.21.1  # pinned version
 *
 * Delete src-tauri/resources/starship* to fall back to PATH lookup.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = process.argv[2] ?? "latest";

function platformInfo() {
  const arch = process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : process.arch;
  switch (process.platform) {
    case "win32": return { triple: `${arch}-pc-windows-msvc`, exe: ".exe", archive: false };
    case "darwin": return { triple: `${arch}-apple-darwin`, exe: "", archive: true };
    case "linux": return { triple: `${arch}-unknown-linux-gnu`, exe: "", archive: true };
    default: throw new Error(`unsupported platform ${process.platform}`);
  }
}

const { triple, exe, archive } = platformInfo();
const tag = VERSION === "latest" ? "latest" : `v${VERSION.replace(/^v/, "")}`;
const base = `https://github.com/starship/starship/releases/${tag}/download`;
const url = archive ? `${base}/starship-${triple}.tar.gz` : `${base}/starship-${triple}.exe`;

const outDir = fileURLToPath(new URL("../src-tauri/resources/", import.meta.url));
mkdirSync(outDir, { recursive: true });
const dest = join(outDir, `starship${exe}`);
const tmp = join(tmpdir(), `cw-starship-${Date.now()}${archive ? ".tar.gz" : exe}`);

console.log(`downloading ${url} → ${dest}`);
if (archive) {
  // Extract the single `starship` member straight to stdout.
  execFileSync("curl", ["-fsSL", "-o", tmp, url], { stdio: "inherit" });
  rmSync(dest, { force: true });
  execFileSync("tar", ["-xzOf", tmp, "starship"], { stdio: ["ignore", "inherit", "inherit"] });
  // Redirect stdout to the destination via the shell for cross-tool compat.
  execFileSync(process.platform === "win32" ? "cmd" : "sh", [
    process.platform === "win32" ? "/c" : "-c",
    `tar -xzOf "${tmp}" starship > "${dest}"`,
  ], { stdio: "inherit" });
} else {
  execFileSync("curl", ["-fsSL", "-o", dest, url], { stdio: "inherit" });
}
if (!existsSync(dest)) throw new Error("download failed");

// Register the binary as a bundled resource (safe no-op when already set).
const confPath = fileURLToPath(new URL("../src-tauri/tauri.conf.json", import.meta.url));
const conf = JSON.parse(readFileSync(confPath, "utf8"));
conf.bundle ??= {};
if (!Array.isArray(conf.bundle.resources) || !conf.bundle.resources.includes("resources/starship*")) {
  conf.bundle.resources = ["resources/starship*"];
  writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");
  console.log("registered resources/starship* in tauri.conf.json");
}
console.log("done");
