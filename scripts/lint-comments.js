/**
 * @fileoverview Flags section-separator comments in .js files.
 *
 * Matches comment lines that use repeated dashes, box-drawing
 * characters, or equals signs as visual dividers, e.g.:
 *
 *   // -- Cursor operations --
 *   // ── Parser ──────────────
 *   // ══════════════════════
 *   // ────────────────────────
 *
 * Exits with code 1 if any are found.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), `..`);

const SCAN_DIRS = [`src`, `scripts`, `new-parser/src`, `new-parser/tests`, `test`];

/**
 * Matches a comment line whose body is primarily a section separator:
 * two or more repeated separator characters (-, ─, ═, =), optionally
 * with label text between them.
 */
const SEPARATOR_RE = /^\s*\/\/\s*[-─═]{2,}/;

/** @type {{ file: string, line: number, text: string }[]} */
const violations = [];

/**
 * Recursively scans a directory for .js files containing
 * section-separator comments, appending any matches to `violations`.
 *
 * @param {string} dir - Absolute path to the directory to scan.
 */
function scan(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === `node_modules`) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      scan(full);
      continue;
    }
    if (!entry.endsWith(`.js`)) continue;
    const lines = readFileSync(full, `utf-8`).split(`\n`);
    for (let i = 0; i < lines.length; i++) {
      if (SEPARATOR_RE.test(lines[i])) {
        violations.push({ file: relative(root, full), line: i + 1, text: lines[i].trimEnd() });
      }
    }
  }
}

for (const dir of SCAN_DIRS) {
  const full = join(root, dir);
  try {
    statSync(full);
  } catch {
    continue;
  }
  scan(full);
}

const errors = violations.length;
if (errors > 0) {
  console.error(`\nSection-separator comments found (${violations.length}):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.text}`);
  }
  console.error(`\n${errors} pointless comments found.\n`);
}
