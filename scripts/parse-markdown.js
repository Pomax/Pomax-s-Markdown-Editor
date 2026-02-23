/**
 * CLI script that parses markdown input using the DFA tokenizer/parser
 * and prints the resulting syntax tree.
 *
 * Usage:
 *   node scripts/parse-markdown.js "# Hello\n\nSome text"
 *   node scripts/parse-markdown.js --file path/to/file.md
 */

import { existsSync, readFileSync } from 'node:fs';
import { DFAParser } from '../src/renderer/scripts/parser/dfa-parser.js';

const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Usage:');
    console.log('  node scripts/parse-markdown.js "# Hello\\n\\nSome text"');
    console.log('  node scripts/parse-markdown.js --file path/to/file.md');
    process.exit(1);
}

let input;
if (args[0] === '--file') {
    if (!args[1]) {
        console.error('Error: --file requires a path argument');
        process.exit(1);
    }
    if (!existsSync(args[1])) {
        console.error(`Error: file not found: ${args[1]}`);
        process.exit(1);
    }
    input = readFileSync(args[1], 'utf-8');
} else {
    input = args.join(' ').replace(/\\n/g, '\n');
}

console.log('=== Input ===');
console.log(input);
console.log();

console.log('=== Syntax Tree ===');
const parser = new DFAParser();
const tree = parser.parse(input);

function printNode(/** @type {any} */ node, /** @type {string} */ indent) {
    const attrs =
        Object.keys(node.attributes).length > 0 ? ` ${JSON.stringify(node.attributes)}` : '';
    // Skip content on the parent line when inline children already represent it
    const hasInlineChildren =
        node.children.length > 0 &&
        node.children.some((/** @type {any} */ c) => c.type !== 'html-block');
    const content =
        node.content && !hasInlineChildren
            ? ` "${node.content.length > 60 ? `${node.content.slice(0, 60)}...` : node.content}"`
            : '';
    console.log(`${indent}${node.type}${content}${attrs}  [L${node.startLine}-${node.endLine}]`);
    for (const child of node.children) {
        printNode(child, `${indent}  `);
    }
}

for (const child of tree.children) {
    printNode(child, '  ');
}

console.log();
console.log('=== Round-trip ===');
console.log(tree.toMarkdown());
