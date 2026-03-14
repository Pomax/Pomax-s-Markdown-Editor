/**
 * @fileoverview Cursor management for the syntax tree.
 *
 * Provides an OffsetPoint primitive (a position within a node's markdown
 * form) and a CursorManager that tracks cursors, selections, and editing
 * mode for a SyntaxTree.
 */

/**
 * Inline node types that offset resolution can traverse.
 * @type {Set<string>}
 */
const INLINE_NODE_TYPES = new Set([
  `text`, `bold`, `italic`, `bold-italic`, `strikethrough`,
  `inline-code`, `inline-image`, `link`,
]);

/**
 * Returns the prefix and suffix lengths (in characters) for node types
 * whose content region maps to inline children.  Returns null for types
 * that should not be recursed into during offset resolution.
 *
 * @param {import('./syntax-tree/syntax-node.js').SyntaxNode} node
 * @returns {{ prefix: number, suffix: number } | null}
 */
function getDelimiters(node) {
  switch (node.type) {
    case `paragraph`:
      return { prefix: 0, suffix: 0 };
    case `heading1`:
      return { prefix: 2, suffix: 0 };
    case `heading2`:
      return { prefix: 3, suffix: 0 };
    case `heading3`:
      return { prefix: 4, suffix: 0 };
    case `heading4`:
      return { prefix: 5, suffix: 0 };
    case `heading5`:
      return { prefix: 6, suffix: 0 };
    case `heading6`:
      return { prefix: 7, suffix: 0 };
    case `bold`:
      return { prefix: 2, suffix: 2 };
    case `italic`:
      return { prefix: 1, suffix: 1 };
    case `bold-italic`:
      return { prefix: 3, suffix: 3 };
    case `strikethrough`:
      return { prefix: 2, suffix: 2 };
    case `link`:
      return { prefix: 1, suffix: 2 + (node.attributes.href || ``).length + 1 };
    default:
      return null;
  }
}

/**
 * Resolves a markdown-form offset within a node to the deepest inline
 * child that contains that offset.
 *
 * When the offset falls inside a delimiter (e.g. the `**` of a bold node)
 * the cursor stays on the container node.  When it falls inside the
 * content region, the function recurses into the inline child.
 *
 * @param {import('./syntax-tree/syntax-node.js').SyntaxNode} node
 * @param {number} offset
 * @returns {OffsetPoint}
 */
function resolveOffset(node, offset) {
  if (!node.children || node.children.length === 0) {
    return new OffsetPoint(node.id, offset);
  }

  const delimiters = getDelimiters(node);
  if (!delimiters) {
    return new OffsetPoint(node.id, offset);
  }

  const { prefix, suffix } = delimiters;
  const totalLen = node.toMarkdown().length;

  if (offset < prefix || (suffix > 0 && offset >= totalLen - suffix)) {
    return new OffsetPoint(node.id, offset);
  }

  let contentOffset = offset - prefix;

  for (const child of node.children) {
    if (!INLINE_NODE_TYPES.has(child.type)) break;
    const childMdLen = child.toMarkdown().length;
    if (contentOffset < childMdLen) {
      return resolveOffset(child, contentOffset);
    }
    contentOffset -= childMdLen;
  }

  return new OffsetPoint(node.id, offset);
}

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
    this.mode = `text`;
  }

  /**
   * Navigates the tree by child indices and resolves a markdown-offset
   * into the deepest applicable inline child.
   *
   * All arguments except the last are child indices that walk the tree
   * from the root (e.g. `tree.children[i].children[j]…`).  The last
   * argument is the character offset into that node's markdown form.
   *
   * @param  {...number} args - Child indices followed by the offset.
   * @returns {OffsetPoint}
   */
  resolvePath(...args) {
    if (args.length < 2) {
      throw new Error(`resolvePath requires at least one child index and an offset`);
    }
    const offset = args[args.length - 1];
    const path = args.slice(0, -1);

    let node = /** @type {any} */ (this.tree);
    for (let i = 0; i < path.length; i++) {
      const idx = path[i];
      if (!node.children || idx < 0 || idx >= node.children.length) {
        throw new RangeError(
          `Invalid child index ${idx} at path position ${i} (node has ${node.children?.length ?? 0} children)`,
        );
      }
      node = node.children[idx];
    }

    return resolveOffset(node, offset);
  }

  /**
   * Sets a single cursor via child-path navigation, clearing any
   * existing cursors.
   *
   * @param {...number} args - Child indices followed by the offset.
   */
  setCursor(...args) {
    this.cursors = [this.resolvePath(...args)];
  }

  /**
   * Adds an additional cursor via child-path navigation.
   *
   * @param {...number} args - Child indices followed by the offset.
   */
  addCursor(...args) {
    this.cursors.push(this.resolvePath(...args));
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
