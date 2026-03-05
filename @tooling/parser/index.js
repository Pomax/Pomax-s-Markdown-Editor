/**
 * @fileoverview Public API for the standalone markdown parser.
 *
 * Exposes a singleton `Parser` object with a `parse(markdown)` method
 * that returns a `SyntaxTree`.
 *
 * Usage:
 *
 *   import { Parser } from '@tooling/parser';
 *   const tree = Parser.parse('# Hello\n\nWorld');
 *   console.log(tree.toMarkdown());
 *   console.log(tree.toHTML(document));
 */

import { DFAParser } from './src/dfa-parser.js';
import { SyntaxNode, SyntaxTree } from './src/syntax-tree.js';

const parser = new DFAParser();

/**
 * Singleton parser instance.
 */
export const Parser = {
    /**
     * Parse a markdown string into a syntax tree.
     *
     * @param {string} markdown - The markdown source text.
     * @returns {SyntaxTree}
     */
    parse(markdown) {
        return parser.parse(markdown);
    },
};

export { SyntaxNode, SyntaxTree };
