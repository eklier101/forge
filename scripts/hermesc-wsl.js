/**
 * Device Guard blocks win64 hermesc.exe. Run the Linux hermesc via WSL instead.
 * Usage: node scripts/hermesc-wsl.js <hermesc args...>
 *
 * Keep hermesc path anchored to the repo (not __dirname) so this script can live
 * under %LOCALAPPDATA%\forge-build (path without spaces for Gradle on Windows).
 */
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function toWslPath(p) {
  if (!p || typeof p !== "string") return p;
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (m) {
    return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}`;
  }
  return p.replace(/\\/g, "/");
}

const repoHermesc = path.join(
  "C:",
  "Android Studio",
  "node_modules",
  "hermes-compiler",
  "hermesc",
  "linux64-bin",
  "hermesc",
);
const localHermesc = path.join(
  __dirname,
  "..",
  "node_modules",
  "hermes-compiler",
  "hermesc",
  "linux64-bin",
  "hermesc",
);
const hermescWin = fs.existsSync(repoHermesc) ? repoHermesc : localHermesc;
const hermesc = toWslPath(hermescWin);

const args = process.argv.slice(2).map((a) => {
  if (/^[A-Za-z]:[\\/]/.test(a) || a.includes("\\")) return toWslPath(a);
  return a;
});

const result = spawnSync("wsl", ["-e", hermesc, ...args], {
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status == null ? 1 : result.status);
