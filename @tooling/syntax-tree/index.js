/**
 * @fileoverview Public API for the syntax tree package.
 *
 * Exports the core data structures used to represent parsed markdown
 * as a syntax tree, plus the serializer for spec-file output.
 */

export { SyntaxNode, SyntaxTree } from './src/syntax-tree.js';
export { serializeTree } from './src/serialize-tree.js';
export { tokenizeInline, buildInlineTree } from './src/inline-tokenizer.js';
