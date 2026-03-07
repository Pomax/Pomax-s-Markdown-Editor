// ── Tree Selection ───────────────────────────────────────────────────
// Pure-function utilities for cursor and selection state.
// All data structures are plain objects — no mutations to SyntaxTree.

/**
 * @typedef {object} TreePosition
 * @property {string} nodeId       — ID of the node the cursor is in
 * @property {number} offset       — character offset within content
 * @property {string} [blockNodeId] — enclosing block-level node ID (when nodeId is inline)
 * @property {'opening'|'closing'} [tagPart] — for html-element tag editing
 * @property {number} [cellRow]    — table cell row (0 = header)
 * @property {number} [cellCol]    — table cell column
 */

/**
 * @typedef {object} TreeSelection
 * @property {TreePosition} anchor
 * @property {TreePosition} focus
 */

/**
 * Create a TreePosition.
 *
 * @param {string} nodeId
 * @param {number} offset
 * @param {{ blockNodeId?: string, tagPart?: 'opening'|'closing', cellRow?: number, cellCol?: number }} [extras]
 * @returns {TreePosition}
 */
export function createPosition(nodeId, offset, extras) {
  const pos = { nodeId, offset };
  if (extras) {
    if (extras.blockNodeId !== undefined) pos.blockNodeId = extras.blockNodeId;
    if (extras.tagPart !== undefined) pos.tagPart = extras.tagPart;
    if (extras.cellRow !== undefined) pos.cellRow = extras.cellRow;
    if (extras.cellCol !== undefined) pos.cellCol = extras.cellCol;
  }
  return pos;
}

/**
 * Create a collapsed TreeSelection (anchor === focus).
 *
 * @param {string} nodeId
 * @param {number} offset
 * @param {{ blockNodeId?: string, tagPart?: 'opening'|'closing', cellRow?: number, cellCol?: number }} [extras]
 * @returns {TreeSelection}
 */
export function createCollapsed(nodeId, offset, extras) {
  const pos = createPosition(nodeId, offset, extras);
  return { anchor: pos, focus: pos };
}

/**
 * Create a TreeSelection from two positions.
 *
 * @param {TreePosition} anchor
 * @param {TreePosition} focus
 * @returns {TreeSelection}
 */
export function createSelection(anchor, focus) {
  return { anchor, focus };
}

/**
 * Is the selection collapsed (anchor and focus at the same position)?
 *
 * @param {TreeSelection} selection
 * @returns {boolean}
 */
export function isCollapsed(selection) {
  return (
    selection.anchor.nodeId === selection.focus.nodeId &&
    selection.anchor.offset === selection.focus.offset
  );
}

/**
 * Does the selection span (touch) the given node?
 * Returns true if the anchor or focus nodeId matches.
 *
 * @param {TreeSelection} selection
 * @param {string} nodeId
 * @param {import("./syntax-tree.js").SyntaxTree} tree — unused for now, reserved for cross-node range checks
 * @returns {boolean}
 */
export function selectionSpans(selection, nodeId, tree) {
  return selection.anchor.nodeId === nodeId || selection.focus.nodeId === nodeId;
}

/**
 * Is a position within the selection?
 *
 * For same-node selections, checks offset range.
 * For cross-node selections, only checks if the position's nodeId
 * matches either endpoint (without document-order knowledge).
 *
 * @param {TreeSelection} selection
 * @param {TreePosition} position
 * @returns {boolean}
 */
export function containsPosition(selection, position) {
  const aId = selection.anchor.nodeId;
  const fId = selection.focus.nodeId;
  const pId = position.nodeId;

  // Same-node selection
  if (aId === fId && aId === pId) {
    const lo = Math.min(selection.anchor.offset, selection.focus.offset);
    const hi = Math.max(selection.anchor.offset, selection.focus.offset);
    return position.offset >= lo && position.offset <= hi;
  }

  // Cross-node: position matches one of the endpoints
  if (pId === aId) return position.offset >= selection.anchor.offset;
  if (pId === fId) return position.offset <= selection.focus.offset;

  return false;
}

/**
 * Serialize a cursor position as an index path for session save/restore.
 * Each element except the last is a child index to descend into the tree;
 * the last element is the character offset.
 *
 * @param {import("./syntax-tree.js").SyntaxTree} tree
 * @param {TreePosition} cursor
 * @returns {number[] | null}
 */
export function getPathToCursor(tree, cursor) {
  const path = [];

  const search = (children) => {
    for (let i = 0; i < children.length; i++) {
      if (children[i].id === cursor.nodeId) {
        path.push(i);
        return true;
      }
      if (children[i].children.length > 0) {
        path.push(i);
        if (search(children[i].children)) return true;
        path.pop();
      }
    }
    return false;
  };

  if (!search(tree.children)) return null;

  path.push(cursor.offset);
  return path;
}

/**
 * Restore a cursor from an index path previously produced by
 * `getPathToCursor`. Returns a TreePosition or null if the path
 * is invalid.
 *
 * @param {import("./syntax-tree.js").SyntaxTree} tree
 * @param {number[] | null} cursorPath
 * @returns {TreePosition | null}
 */
export function setCursorFromPath(tree, cursorPath) {
  if (!cursorPath) return null;
  if (cursorPath.length < 2) return null;

  let children = tree.children;
  for (let i = 0; i < cursorPath.length - 1; i++) {
    const index = cursorPath[i];
    if (index < 0 || index >= children.length) return null;
    const node = children[index];
    if (i === cursorPath.length - 2) {
      return createPosition(node.id, cursorPath[cursorPath.length - 1]);
    }
    children = node.children;
  }
  return null;
}
