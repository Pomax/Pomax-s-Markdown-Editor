/**
 * @fileoverview Cursor management for the syntax tree.
 *
 * Provides an OffsetPoint primitive (a position within a node's markdown
 * form) and a CursorManager that tracks cursors, selections, and editing
 * mode for a SyntaxTree.
 */

/**
 * A position within a syntax node, expressed as a character offset into
 * the node's markdown representation.
 */
export class OffsetPoint {
  /**
   * @param {string} nodeId - ID of the SyntaxNode this point is inside.
   * @param {number} offset - Character offset into the node's markdown form.
   */
  constructor(nodeId, offset) {
    /** @type {string} */
    this.nodeId = nodeId;
    /** @type {number} */
    this.offset = offset;
  }
}

/**
 * A contiguous span of selected content, defined by two OffsetPoints.
 * `start` is always the earlier position in document order;
 * `end` is always the later position.
 *
 * @typedef {Object} Selection
 * @property {OffsetPoint} start
 * @property {OffsetPoint} end
 */

/**
 * Manages cursor positions and selections for a SyntaxTree.
 *
 * - `cursors` holds zero or more caret positions (multi-cursor editing).
 * - `selections` holds zero or more highlighted spans (multi-selection).
 * - `mode` indicates whether the editor is in plain-text (`'text'`) or
 *   DOM (`'dom'`) mode.
 */
export class CursorManager {
  /**
   * @param {import('./syntax-tree/syntax-tree.js').SyntaxTree} tree
   */
  constructor(tree) {
    /** @type {import('./syntax-tree/syntax-tree.js').SyntaxTree} */
    this.tree = tree;

    /** @type {OffsetPoint[]} */
    this.cursors = [];

    /** @type {Selection[]} */
    this.selections = [];

    /** @type {'text' | 'dom'} */
    this.mode = 'text';
  }

  // -- Cursor operations --------------------------------------------------

  /**
   * Sets a single cursor, clearing any existing cursors.
   * @param {string} nodeId
   * @param {number} offset
   */
  setCursor(nodeId, offset) {
    this.cursors = [new OffsetPoint(nodeId, offset)];
  }

  /**
   * Adds an additional cursor (for multi-cursor editing).
   * @param {string} nodeId
   * @param {number} offset
   */
  addCursor(nodeId, offset) {
    this.cursors.push(new OffsetPoint(nodeId, offset));
  }

  /**
   * Removes the cursor at the given index.
   * @param {number} index
   */
  removeCursor(index) {
    this.cursors.splice(index, 1);
  }

  /** Removes all cursors. */
  clearCursors() {
    this.cursors = [];
  }

  // -- Selection operations -----------------------------------------------

  /**
   * Sets a single selection, clearing any existing selections.
   * @param {string} startNodeId
   * @param {number} startOffset
   * @param {string} endNodeId
   * @param {number} endOffset
   */
  setSelection(startNodeId, startOffset, endNodeId, endOffset) {
    this.selections = [{
      start: new OffsetPoint(startNodeId, startOffset),
      end: new OffsetPoint(endNodeId, endOffset),
    }];
  }

  /**
   * Adds an additional selection (for multi-selection editing).
   * @param {string} startNodeId
   * @param {number} startOffset
   * @param {string} endNodeId
   * @param {number} endOffset
   */
  addSelection(startNodeId, startOffset, endNodeId, endOffset) {
    this.selections.push({
      start: new OffsetPoint(startNodeId, startOffset),
      end: new OffsetPoint(endNodeId, endOffset),
    });
  }

  /**
   * Removes the selection at the given index.
   * @param {number} index
   */
  removeSelection(index) {
    this.selections.splice(index, 1);
  }

  /** Removes all selections. */
  clearSelections() {
    this.selections = [];
  }
}
