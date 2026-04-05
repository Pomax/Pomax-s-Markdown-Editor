/**
 * @fileoverview Public API for the standalone markdown parser.
 *
 * Exposes a `parse(markdown)` function that returns a `SyntaxTree`.
 *
 * Usage:
 *
 *   import { parse } from '@tooling/parser';
 *   const tree = await parse('# Hello\n\nWorld');
 *   console.log(tree.toMarkdown());
 *   console.log(tree.toHTML());
 */

import { DFAParser } from './src/parser/dfa-parser.js';

const parser = new DFAParser();

/**
 * @param {string} markdown
 */
export async function parse(markdown) {
  return parser.parse(markdown);
}

export { parseLine } from './src/parser/parse-line.js';
export { SyntaxNode } from './src/syntax-tree/syntax-node.js';
export { SyntaxTree } from './src/syntax-tree/syntax-tree.js';
export { matchChildren, updateMatchedNode } from './src/syntax-tree/tree-diffing.js';
