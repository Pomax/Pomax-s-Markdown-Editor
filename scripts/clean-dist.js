/**
 * @fileoverview Post-build cleanup for electron-builder.
 * Removes intermediate build artifacts so that only the standalone
 * executable(s) remain in the dist/ directory.
 *
 * Used as the `afterAllArtifactBuild` hook in the build config.
 */

import { readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, '..', 'dist');

for (const entry of readdirSync(dist)) {
    const full = join(dist, entry);
    const isDir = statSync(full).isDirectory();
    const isArtifact =
        entry.endsWith('.yml') || entry.endsWith('.yaml') || entry.endsWith('.blockmap') || isDir;

    if (isArtifact) {
        rmSync(full, { recursive: true, force: true });
        console.log(`  removed ${entry}`);
    }
}
