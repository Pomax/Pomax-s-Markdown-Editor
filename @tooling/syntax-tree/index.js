/**
 * @fileoverview Public API for the syntax tree package.
 *
 * Exports the core data structures used to represent parsed markdown
 * as a syntax tree, plus the serializer for spec-file output.
 */

export { SyntaxNode, SyntaxTree } from './src/syntax-tree.js';
export { parseInlineContent } from '../parser/src/parse-inline-content.js';
export { serializeTree } from './src/serialize-tree.js';
export { serializeTreeMarkdown, serializeNodeMarkdown } from './src/render-tree-as-markdown.js';
export { renderTreeToDOM, renderNodeToDOM } from './src/render-tree-as-dom.js';
export { tokenizeInline } from '../parser/src/inline-tokenizer.js';
