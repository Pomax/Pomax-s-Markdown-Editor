/**
 * @fileoverview Copies the Lucide SVG icons we need into src/renderer/icons/.
 * Run with: node scripts/copy-icons.js
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'node_modules', 'lucide-static', 'icons');
const dest = join(root, 'src', 'renderer', 'icons');

mkdirSync(dest, { recursive: true });

const icons = [
    'heading-1',
    'heading-2',
    'heading-3',
    'pilcrow',
    'quote',
    'square-code',
    'bold',
    'italic',
    'strikethrough',
    'code',
    'link',
    'image',
    'table',
    'list',
    'list-ordered',
];

for (const name of icons) {
    const file = `${name}.svg`;
    copyFileSync(join(src, file), join(dest, file));
    console.log(`  copied ${file}`);
}

console.log(`\n✔ ${icons.length} icons copied to src/renderer/icons/`);
