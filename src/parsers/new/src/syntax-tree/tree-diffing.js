import { renderNodeToMarkdown } from '../renderers/markdown.js';
import { rebuildInlineChildren } from './tree-mutations.js';

/**
 * Shallow-compares two attribute objects for equality.
 * @param {NodeAttributes} a
 * @param {NodeAttributes} b
 * @returns {boolean}
 */
function attributesEqual(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Matches children from an old node list to children from a new node
 * list.  Returns a Map where each key is a new child that was matched
 * and each value is the corresponding original child.
 *
 * Pass 1 finds exact matches (same type + identical renderNodeToMarkdown()).
 * Pass 2 pairs remaining unmatched nodes by type in positional order.
 *
 * @param {import('./syntax-node.js').SyntaxNode[]} oldChildren
 * @param {import('./syntax-node.js').SyntaxNode[]} newChildren
 * @returns {Map<import('./syntax-node.js').SyntaxNode, import('./syntax-node.js').SyntaxNode>}
 */
export function matchChildren(oldChildren, newChildren) {
  /** @type {Map<import('./syntax-node.js').SyntaxNode, import('./syntax-node.js').SyntaxNode>} */
  const matches = new Map();
  /** @type {Set<number>} */
  const claimedOld = new Set();
  /** @type {Set<number>} */
  const matchedNew = new Set();

  // Pass 1: exact match — same type + identical markdown output.
  for (let ni = 0; ni < newChildren.length; ni++) {
    const nc = newChildren[ni];
    const ncMd = renderNodeToMarkdown(nc);
    for (let oi = 0; oi < oldChildren.length; oi++) {
      if (claimedOld.has(oi)) continue;
      const oc = oldChildren[oi];
      if (oc.type === nc.type && renderNodeToMarkdown(oc) === ncMd) {
        matches.set(nc, oc);
        claimedOld.add(oi);
        matchedNew.add(ni);
        break;
      }
    }
  }

  // Pass 2: same-type positional — pair remaining unmatched by type in order.
  for (let ni = 0; ni < newChildren.length; ni++) {
    if (matchedNew.has(ni)) continue;
    const nc = newChildren[ni];
    for (let oi = 0; oi < oldChildren.length; oi++) {
      if (claimedOld.has(oi)) continue;
      if (oldChildren[oi].type === nc.type) {
        matches.set(nc, oldChildren[oi]);
        claimedOld.add(oi);
        break;
      }
    }
  }

  return matches;
}

/**
 * Copies state from `newNode` to `oldNode` while preserving `oldNode.id`.
 * For inline-containing types, calls `rebuildInlineChildren()` after
 * updating content.  For `html-element` nodes with block-level children,
 * recursively matches and updates children.
 *
 * @param {import('./syntax-node.js').SyntaxNode} oldNode
 * @param {import('./syntax-node.js').SyntaxNode} newNode
 */
export function updateMatchedNode(oldNode, newNode) {
  const contentChanged = oldNode.content !== newNode.content;
  if (contentChanged) {
    oldNode.content = newNode.content;
  }

  if (!attributesEqual(oldNode.attributes, newNode.attributes)) {
    const savedDetailsOpen = oldNode.attributes.detailsOpen;
    oldNode.attributes = { ...newNode.attributes };
    if (savedDetailsOpen !== undefined) {
      oldNode.attributes.detailsOpen = savedDetailsOpen;
    }
  }

  if (oldNode.startLine !== newNode.startLine) {
    oldNode.startLine = newNode.startLine;
  }
  if (oldNode.endLine !== newNode.endLine) {
    oldNode.endLine = newNode.endLine;
  }

  if (oldNode.tagName !== newNode.tagName) {
    oldNode.tagName = newNode.tagName;
  }
  if (oldNode.raw !== newNode.raw) {
    oldNode.raw = newNode.raw;
  }

  // Runtime properties: merge new values onto existing runtime.
  const newRuntimeKeys = Object.keys(newNode.runtime);
  if (newRuntimeKeys.length > 0) {
    for (const key of newRuntimeKeys) {
      oldNode.runtime[key] = newNode.runtime[key];
    }
  }

  if (contentChanged) {
    rebuildInlineChildren(oldNode);
  }

  if (oldNode.type === `html-element`) {
    if (newNode.children.length > 0) {
      const childMatches = matchChildren(oldNode.children, newNode.children);
      const result = [];
      let changed = false;
      for (const nc of newNode.children) {
        const matched = childMatches.get(nc);
        if (matched) {
          updateMatchedNode(matched, nc);
          if (matched.parent !== oldNode) {
            matched.parent = oldNode;
          }
          result.push(matched);
          if (!changed && matched !== oldNode.children[result.length - 1]) {
            changed = true;
          }
        } else {
          if (nc.parent !== oldNode) {
            nc.parent = oldNode;
          }
          result.push(nc);
          changed = true;
        }
      }
      if (changed || result.length !== oldNode.children.length) {
        oldNode.children = result;
      }
    } else if (oldNode.children.length > 0) {
      oldNode.children = [];
    }
  }
}
