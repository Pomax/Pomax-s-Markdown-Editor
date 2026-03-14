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

import { DFAParser } from './src/parser/dfa-parser.js';
import { SyntaxTree } from './src/syntax-tree/index.js';

const parser = new DFAParser();

/**
 * Singleton parser instance.
 */
export const Parser = {
    /**
     * Parse a markdown string into a syntax tree.
     *
     * @param {string} markdown - The markdown source text.
     * @returns {Promise<SyntaxTree>}
     */
    async parse(markdown) {
        let doc = globalThis.document;
        if (!doc) {
            const { JSDOM } = await import(`jsdom`);
            const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
            doc = dom.window.document;
        }
        return parser.parse(markdown, doc);
    },
};

