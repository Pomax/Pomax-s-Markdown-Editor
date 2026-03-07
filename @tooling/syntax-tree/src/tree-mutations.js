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
