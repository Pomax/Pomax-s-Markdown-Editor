// ── Tree Query Utilities ─────────────────────────────────────────────
// Pure functions that query a SyntaxTree / SyntaxNode without mutating it.

const INLINE_TYPES = new Set([
  "text",
  "bold",
  "italic",
  "bold-italic",
  "strikethrough",
  "inline-code",
  "link",
  "image",
  "inline-image",
  "html-inline",
]);

/**
 * Return `true` when the node's type is an inline element.
 * @param {import("./syntax-tree.js").SyntaxNode} node
 * @returns {boolean}
 */
export function isInlineNode(node) {
  return INLINE_TYPES.has(node.type);
}

/**
 * Depth-first search for a node whose `id` matches.
 * Works on both SyntaxTree and SyntaxNode roots.
 * @param {import("./syntax-tree.js").SyntaxTree | import("./syntax-tree.js").SyntaxNode} root
 * @param {string} id
 * @returns {import("./syntax-tree.js").SyntaxNode | null}
 */
export function findNodeById(root, id) {
  for (const child of root.children) {
    if (child.id === id) return child;
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * Find the deepest block-level node whose line range contains the given line.
 * Descends into block children only (not inline nodes).
 * @param {import("./syntax-tree.js").SyntaxTree | import("./syntax-tree.js").SyntaxNode} root
 * @param {number} line  – 0-based line number
 * @param {number} _col  – reserved for future column-level resolution
 * @returns {import("./syntax-tree.js").SyntaxNode | null}
 */
export function findNodeAtPosition(root, line, _col) {
  for (const child of root.children) {
    if (isInlineNode(child)) continue;
    if (child.startLine != null && child.endLine != null &&
        child.startLine <= line && line <= child.endLine) {
      const deeper = findNodeAtPosition(child, line, _col);
      return deeper ?? child;
    }
  }
  return null;
}

/**
 * Walk up from `node` to find the nearest block-level ancestor.
 * Returns `null` when the node is already a top-level block (parent is tree or null).
 * @param {import("./syntax-tree.js").SyntaxNode} node
 * @returns {import("./syntax-tree.js").SyntaxNode | null}
 */
export function getBlockParent(node) {
  let current = node.parent;
  while (current != null) {
    // If current is a SyntaxTree, the node is top-level — return null.
    if (current.constructor.name === "SyntaxTree") return null;
    // If current is a block node, it's the block parent.
    if (!isInlineNode(current)) return current;
    current = current.parent;
  }
  return null;
}

/**
 * Concatenate all leaf text content under a node, depth-first.
 * If a node has no children, its own `content` is used.
 * @param {import("./syntax-tree.js").SyntaxTree | import("./syntax-tree.js").SyntaxNode} node
 * @returns {string}
 */
export function toBareText(node) {
  if (!node.children || node.children.length === 0) {
    return node.content ?? "";
  }
  let result = "";
  for (const child of node.children) {
    result += toBareText(child);
  }
  return result;
}

/**
 * Return the index path from `root` to the node with the given `id`.
 * E.g. `[2, 1, 0]` means `root.children[2].children[1].children[0]`.
 * @param {import("./syntax-tree.js").SyntaxTree | import("./syntax-tree.js").SyntaxNode} root
 * @param {string} id
 * @returns {number[] | null}
 */
export function getPathToNode(root, id) {
  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i];
    if (child.id === id) return [i];
    const subPath = getPathToNode(child, id);
    if (subPath) return [i, ...subPath];
  }
  return null;
}

/**
 * Follow an index path to retrieve the node at that position.
 * @param {import("./syntax-tree.js").SyntaxTree | import("./syntax-tree.js").SyntaxNode} root
 * @param {number[]} path
 * @returns {import("./syntax-tree.js").SyntaxNode | null}
 */
export function getNodeAtPath(root, path) {
  if (!path || path.length === 0) return null;
  let current = root;
  for (const index of path) {
    if (!current.children || index < 0 || index >= current.children.length) {
      return null;
    }
    current = current.children[index];
  }
  return current;
}
