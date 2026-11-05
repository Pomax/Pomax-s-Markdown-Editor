/**
 * @fileoverview Builds a single-file executable: a self-contained .exe on
 * Windows that unpacks itself into the user's local app data on first launch
 * (see scripts/launcher.nsi), an AppImage on Linux, and a .dmg on macOS.
 * The platform is given as --win, --mac or --linux and defaults to the one
 * the script runs on. The result lands in dist/ as
 * Markdown-Editor-<version>-<platform>.<ext>.
 * Run with: npm run build, or npm run dist:win / dist:mac / dist:linux
 */

import { readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Platform, build } from 'electron-builder';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, `..`);
const dist = join(root, `dist`);

/** @type {Object<string, {platform: Platform, target: string}>} */
const PLATFORMS = {
  '--win': { platform: Platform.WINDOWS, target: `nsis` },
  '--mac': { platform: Platform.MAC, target: `dmg` },
  '--linux': { platform: Platform.LINUX, target: `AppImage` },
};

/** @type {Object<string, string>} */
const CURRENT_PLATFORM_FLAG = {
  win32: `--win`,
  darwin: `--mac`,
  linux: `--linux`,
};

const flag =
  process.argv.find((arg) => arg in PLATFORMS) ?? CURRENT_PLATFORM_FLAG[process.platform];
const selected = PLATFORMS[flag];
if (!selected) {
  console.error(`No single-file target for platform ${process.platform}`);
  process.exit(1);
}

await build({
  targets: selected.platform.createTarget(selected.target),
  publish: `never`,
  config: {
    artifactName: `Markdown-Editor-\${version}-\${os}.\${ext}`,
  },
});

for (const entry of readdirSync(dist)) {
  const full = join(dist, entry);
  const isIntermediate =
    statSync(full).isDirectory() ||
    entry.endsWith(`.yml`) ||
    entry.endsWith(`.yaml`) ||
    entry.endsWith(`.blockmap`);
  if (isIntermediate) {
    rmSync(full, { recursive: true, force: true });
    console.log(`  removed ${entry}`);
  }
}
