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
  getTableCell,
  setTableCellText,
  addTableRow,
  addTableColumn,
  removeTableRow,
  removeTableColumn,
  applyFormat,
  reparseLine,
} from "./src/tree-mutations.js";

export {
  createPosition,
  createCollapsed,
  createSelection,
  isCollapsed,
  selectionSpans,
  containsPosition,
  getPathToCursor,
  setCursorFromPath,
} from "./src/tree-selection.js";

export { parseInlineContent } from "../parser/src/parse-inline-content.js";
export { tokenizeInline, findMatchedTokenIndices } from "../parser/src/inline-tokenizer.js";
