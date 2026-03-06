/**
 * @fileoverview Public API for the standalone markdown parser.
 *
 * Exposes a singleton `Parser` object with a `parse(markdown)` method
 * that returns a `SyntaxTree`.
 *
 * Usage:
 *
 *   import { Parser } from '@tooling/parser';
 *   const tree = await Parser.parse('# Hello\n\nWorld');
 *   console.log(tree.toMarkdown());
 *   console.log(tree.toHTML());
 */

import { DFAParser } from "./src/dfa-parser.js";

const parser = new DFAParser();

export async function parse(markdown) {
  return parser.parse(markdown);
}
