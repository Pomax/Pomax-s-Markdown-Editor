/**
 * @fileoverview Post-build cleanup for electron-builder.
 * Removes intermediate build artifacts, renames platform directories,
 * and zips them so the dist/ folder contains only final deliverables.
 */

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, statSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, `..`);
const dist = join(root, `dist`);
const pkg = JSON.parse(readFileSync(join(root, `package.json`), `utf-8`));
const version = pkg.version;

for (const entry of readdirSync(dist)) {
  const full = join(dist, entry);
  const isDir = statSync(full).isDirectory();

  if (isDir) {
    const platform = entry.replace(/-unpacked$/, ``);
    const folderName = `Markdown Editor`;
    const renamed = join(dist, folderName);
    renameSync(full, renamed);
    const zipName = `Markdown-Editor-${version}-${platform}.zip`;
    execSync(`7z a -mx=9 "${zipName}" "${folderName}"`, { cwd: dist });
    rmSync(renamed, { recursive: true, force: true });
    console.log(`  created ${zipName}`);
    continue;
  }

  const isArtifact =
    entry.endsWith(`.yml`) || entry.endsWith(`.yaml`) || entry.endsWith(`.blockmap`);

  if (isArtifact) {
    rmSync(full, { recursive: true, force: true });
    console.log(`  removed ${entry}`);
  }
}
