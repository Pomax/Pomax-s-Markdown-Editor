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
