/**
 * @fileoverview Public API for the syntax tree package.
 *
 * Exports the core data structures used to represent parsed markdown
 * as a syntax tree, plus the serializer for spec-file output.
 */

export { SyntaxNode, SyntaxTree } from "./src/syntax-tree.js";

export {
  findNodeById,
  findNodeAtPosition,
  getBlockParent,
  isInlineNode,
  toBareText,
  getPathToNode,
  getNodeAtPath,
} from "./src/tree-utils.js";

export {
  rebuildInlineChildren,
  mergeHints,
  splitNode,
  insertNodesAfter,
  changeNodeType,
  toggleListType,
  renumberOrderedList,
} from "./src/tree-mutations.js";

export { parseInlineContent } from "../parser/src/parse-inline-content.js";
export { tokenizeInline } from "../parser/src/inline-tokenizer.js";
