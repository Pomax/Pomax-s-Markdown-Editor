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
 * Clear `node.children` and re-parse `node.content` via `parseInlineContent`,
 * appending the resulting inline nodes as new children.
 *
 * No-op if the node's type is not in `INLINE_CONTENT_TYPES`.
 *
 * @param {import("./syntax-tree.js").SyntaxNode} node
 * @returns {void}
 */
export function rebuildInlineChildren(node) {
  if (!INLINE_CONTENT_TYPES.has(node.type)) return;

  // Remove existing children
  while (node.children.length > 0) {
    node.removeChild(node.children[node.children.length - 1]);
  }

  // Parse and append new inline children
  const newChildren = parseInlineContent(node.content);
  for (const child of newChildren) {
    node.appendChild(child);
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
