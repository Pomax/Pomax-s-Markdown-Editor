// ── Tree Mutations ──────────────────────────────────────────────────
// Functions that mutate SyntaxTree / SyntaxNode structures.
// Each mutation is synchronous and side-effect-free beyond the tree.

import { parseInlineContent } from "../../parser/src/parse-inline-content.js";

// Block types whose `content` should be parsed into inline children.
const INLINE_CONTENT_TYPES = new Set([
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "heading5",
  "heading6",
  "blockquote",
  "list-item",
  "cell",
]);

/**
 * Re-parse `node.content` and reconcile the resulting inline nodes against
 * the existing `node.children`.  Where old and new children structurally
 * match (same type at the same position), the existing node is kept and its
 * content is updated in place — preserving node identity (and thus DOM nodes
 * and cursor position). Only where the structure genuinely changes are nodes
 * added or removed.
 *
 * No-op if the node's type is not in `INLINE_CONTENT_TYPES`.
 *
 * @param {import("./syntax-tree.js").SyntaxNode} node
 * @returns {void}
 */
export function rebuildInlineChildren(node) {
  if (!INLINE_CONTENT_TYPES.has(node.type)) return;

  const newChildren = parseInlineContent(node.content);

  reconcileChildren(node, newChildren);
}

/**
 * Reconcile `parent.children` against `newChildren`.
 * Walk both arrays in parallel:
 *   - Same type at same index → update content in place, recurse.
 *   - Different type or length mismatch → replace from that point on.
 *
 * @param {import("./syntax-tree.js").SyntaxNode} parent
 * @param {import("./syntax-tree.js").SyntaxNode[]} newChildren
 */
function reconcileChildren(parent, newChildren) {
  const oldChildren = parent.children;
  const minLen = Math.min(oldChildren.length, newChildren.length);
  let divergeIndex = minLen; // assume they match up to minLen

  for (let i = 0; i < minLen; i++) {
    const old = oldChildren[i];
    const fresh = newChildren[i];

    if (old.type === fresh.type) {
      // Structure matches — update content in place, recurse into children
      old.content = fresh.content;
      // Copy attributes that parsing may set (e.g. link href, image src)
      old.attributes = fresh.attributes;
      reconcileChildren(old, fresh.children);
    } else {
      // Structure diverged — replace everything from here on
      divergeIndex = i;
      break;
    }
  }

  // Remove excess old children (from the end to avoid index shifting)
  while (oldChildren.length > divergeIndex) {
    parent.removeChild(oldChildren[oldChildren.length - 1]);
  }

  // Append new children beyond the matched range
  for (let i = divergeIndex; i < newChildren.length; i++) {
    parent.appendChild(newChildren[i]);
  }
}

// ── Block-Level Mutations ───────────────────────────────────────────

/**
 * Split a block node at `offset` within its `content`. The two resulting
 * markdown strings are each passed to `parseFn` to determine the correct
 * block type, then inserted into the tree in place of the original node.
 * `rebuildInlineChildren` is called on each resulting node.
 *
 * @param {import("./syntax-tree.js").SyntaxTree} tree
 * @param {import("./syntax-tree.js").SyntaxNode} node
 * @param {number} offset — character offset within `node.content`
 * @param {(markdown: string) => import("./syntax-tree.js").SyntaxNode} parseFn
 * @returns {{ renderHints: { updated: string[], added: string[], removed: string[] }, selection: any }}
 */
export function splitNode(tree, node, offset, parseFn) {
  const firstContent = node.content.slice(0, offset);
  const secondContent = node.content.slice(offset);

  const firstNode = parseFn(firstContent);
  const secondNode = parseFn(secondContent);

  // Find the parent that holds this node (tree or a container node)
  const parent = node.parent ?? tree;
  const idx = parent.children.indexOf(node);

  // Remove original, insert the two halves
  parent.removeChild(node);
  parent.insertChild(firstNode, idx);
  parent.insertChild(secondNode, idx + 1);

  // Rebuild inline children for both
  rebuildInlineChildren(firstNode);
  rebuildInlineChildren(secondNode);

  return {
    renderHints: {
      updated: [],
      added: [firstNode.id, secondNode.id],
      removed: [node.id],
    },
    selection: { nodeId: secondNode.id, offset: 0 },
  };
}

/**
 * Insert an array of new nodes after `refNode` in its parent's children.
 * Used for multi-line paste and similar operations.
 *
 * @param {import("./syntax-tree.js").SyntaxTree} tree
 * @param {import("./syntax-tree.js").SyntaxNode} refNode
 * @param {import("./syntax-tree.js").SyntaxNode[]} newNodes
 * @returns {{ renderHints: { updated: string[], added: string[], removed: string[] }, selection: any }}
 */
export function insertNodesAfter(tree, refNode, newNodes) {
  if (newNodes.length === 0) {
    return {
      renderHints: { updated: [], added: [], removed: [] },
      selection: null,
    };
  }

  const parent = refNode.parent ?? tree;
  const refIdx = parent.children.indexOf(refNode);

  for (let i = 0; i < newNodes.length; i++) {
    parent.insertChild(newNodes[i], refIdx + 1 + i);
  }

  const lastNode = newNodes[newNodes.length - 1];

  return {
    renderHints: {
      updated: [],
      added: newNodes.map((n) => n.id),
      removed: [],
    },
    selection: { nodeId: lastNode.id, offset: lastNode.content.length },
  };
}

/**
 * Change a node's type. That's it — no content manipulation.
 * The caller is responsible for editing markdown content and reparsing.
 *
 * @param {import("./syntax-tree.js").SyntaxNode} node
 * @param {string} newType
 * @returns {void}
 */
export function changeNodeType(node, newType) {
  node.type = newType;
}

// ── List Mutations ──────────────────────────────────────────────────

/**
 * Toggle a list node between "unordered", "ordered", and "checklist".
 * Mutates the list and its children in place — preserving node identity.
 *
 * @param {import("./syntax-tree.js").SyntaxNode} list — a node with type "list"
 * @param {"unordered" | "ordered" | "checklist"} kind
 * @returns {void}
 */
export function toggleListType(list, kind) {
  switch (kind) {
    case "unordered": {
      list.attributes.ordered = false;
      delete list.attributes.number;
      delete list.attributes.checked;
      for (const item of list.children) {
        delete item.attributes.checked;
      }
      break;
    }
    case "ordered": {
      list.attributes.ordered = true;
      list.attributes.number = 1;
      delete list.attributes.checked;
      for (const item of list.children) {
        delete item.attributes.checked;
      }
      break;
    }
    case "checklist": {
      list.attributes.ordered = false;
      delete list.attributes.number;
      list.attributes.checked = true;
      for (const item of list.children) {
        if (item.attributes.checked === undefined) {
          item.attributes.checked = false;
        }
      }
      break;
    }
  }
}

/**
 * Reset an ordered list's starting number to 1.
 * No-op if the list is not ordered.
 *
 * @param {import("./syntax-tree.js").SyntaxNode} list — a node with type "list"
 * @returns {void}
 */
export function renumberOrderedList(list) {
  if (!list.attributes.ordered) return;
  list.attributes.number = 1;
}

// ── Table Mutations ─────────────────────────────────────────────────

import { SyntaxNode } from "./syntax-tree.js";

/**
 * Return the cell node at `(row, col)` within a table.
 * Row 0 = the header row; row 1+ = body rows.
 *
 * @param {SyntaxNode} tableNode
 * @param {number} row
 * @param {number} col
 * @returns {SyntaxNode|null}
 */
export function getTableCell(tableNode, row, col) {
  if (row < 0 || col < 0) return null;
  const rowNode = tableNode.children[row];
  if (!rowNode) return null;
  const cell = rowNode.children[col];
  return cell ?? null;
}

/**
 * Update a table cell's text content and rebuild its inline children.
 *
 * @param {SyntaxNode} tableNode
 * @param {number} row
 * @param {number} col
 * @param {string} text
 * @returns {{ renderHints: { updated: string[], added: string[], removed: string[] }, selection: any }}
 */
export function setTableCellText(tableNode, row, col, text) {
  const cell = getTableCell(tableNode, row, col);
  cell.content = text;
  rebuildInlineChildren(cell);
  return {
    renderHints: { updated: [cell.id], added: [], removed: [] },
    selection: { nodeId: cell.id, offset: text.length },
  };
}

/**
 * Append a new body row to a table, with empty cells matching the column count
 * (derived from the header row).
 *
 * @param {SyntaxNode} tableNode
 * @returns {{ renderHints: { updated: string[], added: string[], removed: string[] }, selection: any }}
 */
export function addTableRow(tableNode) {
  const colCount = tableNode.children[0].children.length;
  const row = new SyntaxNode("row", "");
  const addedIds = [row.id];

  for (let i = 0; i < colCount; i++) {
    const cell = new SyntaxNode("cell", "");
    row.appendChild(cell);
    addedIds.push(cell.id);
  }

  tableNode.appendChild(row);

  return {
    renderHints: { updated: [], added: addedIds, removed: [] },
    selection: { nodeId: row.children[0].id, offset: 0 },
  };
}

/**
 * Append a new column to every row (header + body) in a table.
 *
 * @param {SyntaxNode} tableNode
 * @returns {{ renderHints: { updated: string[], added: string[], removed: string[] }, selection: any }}
 */
export function addTableColumn(tableNode) {
  const addedIds = [];
  let headerCell = null;

  for (const rowNode of tableNode.children) {
    const cell = new SyntaxNode("cell", "");
    rowNode.appendChild(cell);
    addedIds.push(cell.id);
    if (!headerCell) headerCell = cell;
  }

  return {
    renderHints: { updated: [], added: addedIds, removed: [] },
    selection: { nodeId: headerCell.id, offset: 0 },
  };
}

/**
 * Remove a body row from a table. Cannot remove the header (row 0).
 * No-op if the index is out of bounds.
 *
 * @param {SyntaxNode} tableNode
 * @param {number} rowIndex — 0 = header (protected), 1+ = body rows
 * @returns {{ renderHints: { updated: string[], added: string[], removed: string[] }, selection: any }}
 */
export function removeTableRow(tableNode, rowIndex) {
  const noOp = { renderHints: { updated: [], added: [], removed: [] }, selection: null };
  if (rowIndex === 0) return noOp; // cannot remove header
  const rowNode = tableNode.children[rowIndex];
  if (!rowNode) return noOp;

  const removedIds = [rowNode.id, ...rowNode.children.map((c) => c.id)];
  tableNode.removeChild(rowNode);

  return {
    renderHints: { updated: [], added: [], removed: removedIds },
    selection: null,
  };
}

/**
 * Remove a column from every row in a table. Cannot remove the last column.
 * No-op if the index is out of bounds.
 *
 * @param {SyntaxNode} tableNode
 * @param {number} colIndex
 * @returns {{ renderHints: { updated: string[], added: string[], removed: string[] }, selection: any }}
 */
export function removeTableColumn(tableNode, colIndex) {
  const noOp = { renderHints: { updated: [], added: [], removed: [] }, selection: null };
  const headerCells = tableNode.children[0].children;
  if (colIndex < 0 || colIndex >= headerCells.length) return noOp;
  if (headerCells.length <= 1) return noOp; // cannot remove last column

  const removedIds = [];
  for (const rowNode of tableNode.children) {
    const cell = rowNode.children[colIndex];
    if (cell) {
      removedIds.push(cell.id);
      rowNode.removeChild(cell);
    }
  }

  return {
    renderHints: { updated: [], added: [], removed: removedIds },
    selection: null,
  };
}

// ── Hint Utilities ──────────────────────────────────────────────────

/**
 * Merge two render-hint objects. Unions each ID array and picks `b.selection`
 * (falling back to `a.selection` when `b.selection` is null).
 *
 * @param {{ renderHints: { updated: string[], added: string[], removed: string[] }, selection: any }} a
 * @param {{ renderHints: { updated: string[], added: string[], removed: string[] }, selection: any }} b
 * @returns {{ renderHints: { updated: string[], added: string[], removed: string[] }, selection: any }}
 */
export function mergeHints(a, b) {
  return {
    renderHints: {
      updated: [...new Set([...a.renderHints.updated, ...b.renderHints.updated])],
      added: [...new Set([...a.renderHints.added, ...b.renderHints.added])],
      removed: [...new Set([...a.renderHints.removed, ...b.renderHints.removed])],
    },
    selection: b.selection ?? a.selection,
  };
}
