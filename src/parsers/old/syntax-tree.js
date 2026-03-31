import { distance } from 'fastest-levenshtein';
import { tokenizeInline } from './inline-tokenizer.js';
import { SyntaxNode } from './syntax-node.js';

/**
 * Computes the Levenshtein distance between two arrays using a
 * full DP matrix.  Elements are compared with strict equality.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number}
 */
function arrayLevenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Returns a 0–1 similarity score between two strings.  1 means
 * identical, 0 means completely different.  For strings both
 * exceeding 10 000 characters, falls back to a cheaper line-level
 * comparison instead of character-level Levenshtein.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function contentSimilarity(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length > 10_000 && b.length > 10_000) {
    const aLines = a.split(`\n`);
    const bLines = b.split(`\n`);
    const maxLen = Math.max(aLines.length, bLines.length);
    if (maxLen === 0) return 1;
    return 1 - arrayLevenshtein(aLines, bLines) / maxLen;
  }
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance(a, b) / maxLen;
}

/**
 * Matches children from an old node list to children from a new node
 * list.  Returns a Map where each key is a new child that was matched
 * and each value is the corresponding original child.
 *
 * Pass 1 finds exact matches (same type + identical toMarkdown()).
 * Pass 2 finds fuzzy matches among remaining same-type candidates
 * using contentSimilarity, with tiebreakers for html-block tagName
 * and list-item indent.
 *
 * @param {SyntaxNode[]} oldChildren
 * @param {SyntaxNode[]} newChildren
 * @returns {Map<SyntaxNode, SyntaxNode>}
 */
export function matchChildren(oldChildren, newChildren) {
  /** @type {Map<SyntaxNode, SyntaxNode>} */
  const matches = new Map();
  /** @type {Set<number>} */
  const claimedOld = new Set();
  /** @type {Set<number>} */
  const matchedNew = new Set();

  for (let ni = 0; ni < newChildren.length; ni++) {
    const nc = newChildren[ni];
    const ncMd = nc.toMarkdown();
    for (let oi = 0; oi < oldChildren.length; oi++) {
      if (claimedOld.has(oi)) continue;
      const oc = oldChildren[oi];
      if (oc.type === nc.type && oc.toMarkdown() === ncMd) {
        matches.set(nc, oc);
        claimedOld.add(oi);
        matchedNew.add(ni);
        break;
      }
    }
  }

  for (let ni = 0; ni < newChildren.length; ni++) {
    if (matchedNew.has(ni)) continue;
    const nc = newChildren[ni];
    const ncMd = nc.toMarkdown();
    let bestOi = -1;
    let bestScore = -1;
    let bestTiebreak = false;
    for (let oi = 0; oi < oldChildren.length; oi++) {
      if (claimedOld.has(oi)) continue;
      const oc = oldChildren[oi];
      if (oc.type !== nc.type) continue;
      const score = contentSimilarity(oc.toMarkdown(), ncMd);
      let tiebreak = false;
      if (nc.type === `html-block`) {
        tiebreak = oc.attributes.tagName === nc.attributes.tagName;
      } else if (nc.type === `list-item`) {
        tiebreak = oc.attributes.indent === nc.attributes.indent;
      }
      if (
        score > bestScore ||
        (score === bestScore && tiebreak && !bestTiebreak)
      ) {
        bestOi = oi;
        bestScore = score;
        bestTiebreak = tiebreak;
      }
    }
    if (bestOi !== -1) {
      matches.set(nc, oldChildren[bestOi]);
      claimedOld.add(bestOi);
    }
  }

  return matches;
}

/**
 * Node types whose content contains inline formatting and should be
 * modelled as inline child nodes (text, bold, italic, link, etc.).
 * @type {Set<string>}
 */
const INLINE_CONTENT_TYPES = new Set([
  `paragraph`,
  `heading1`,
  `heading2`,
  `heading3`,
  `heading4`,
  `heading5`,
  `heading6`,
  `blockquote`,
  `list-item`,
]);

/**
 * Represents the root of a syntax tree.
 */
export class SyntaxTree {
  constructor() {
    /**
     * Root children nodes.
     * @type {SyntaxNode[]}
     */
    this.children = [];

    /**
     * Tree-based cursor position.
     * @type {TreeCursor|null}
     */
    this.treeCursor = null;
  }

  /**
   * Adds a child node to the tree.
   * @param {SyntaxNode} node - The node to add
   */
  appendChild(node) {
    node.parent = null;
    this.children.push(node);
  }

  /**
   * Removes a node from the tree.
   * @param {SyntaxNode} node - The node to remove
   * @returns {boolean} Whether the node was found and removed
   */
  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index !== -1) {
      this.children.splice(index, 1);
      node.parent = null;
      return true;
    }
    return false;
  }

  /**
   * Finds a node by its ID.
   * @param {string} id - The node ID
   * @returns {SyntaxNode|null}
   */
  findNodeById(id) {
    for (const child of this.children) {
      if (child.id === id) {
        return child;
      }
      const found = this.findNodeByIdRecursive(child, id);
      if (found) {
        return found;
      }
    }
    return null;
  }

  /**
   * Recursively finds a node by ID.
   * @param {SyntaxNode} node - The node to search in
   * @param {string} id - The ID to find
   * @returns {SyntaxNode|null}
   */
  findNodeByIdRecursive(node, id) {
    for (const child of node.children) {
      if (child.id === id) {
        return child;
      }
      const found = this.findNodeByIdRecursive(child, id);
      if (found) {
        return found;
      }
    }
    return null;
  }

  /**
   * Finds the node at a given position.
   * Recurses into container nodes (e.g. html-block) to find the
   * deepest (leaf) node that contains the position.
   * @param {number} line - The line number (0-based)
   * @param {number} column - The column number (0-based)
   * @returns {SyntaxNode|null}
   */
  findNodeAtPosition(line, column) {
    for (const child of this.children) {
      if (line >= child.startLine && line <= child.endLine) {
        return this.findDeepestNodeAtPosition(child, line, column);
      }
    }
    return null;
  }

  /**
   * Recursively descends into a node's children to find the deepest
   * node that contains the given line position.
   * @param {SyntaxNode} node
   * @param {number} line
   * @param {number} column
   * @returns {SyntaxNode}
   */
  findDeepestNodeAtPosition(node, line, column) {
    // Only descend into block-level children (e.g. html-block
    // containers).  Inline children (text, bold, italic, etc.)
    // share the parent's line range and should not be traversed.
    if (!INLINE_CONTENT_TYPES.has(node.type) && node.children.length > 0) {
      for (const child of node.children) {
        if (line >= child.startLine && line <= child.endLine) {
          return this.findDeepestNodeAtPosition(child, line, column);
        }
      }
    }
    return node;
  }

  /**
   * Changes the type of a node.
   * @param {SyntaxNode} node - The node to change
   * @param {string} newType - The new type
   */
  changeNodeType(node, newType) {
    const wasInline = INLINE_CONTENT_TYPES.has(node.type);
    node.type = newType;
    const isInline = INLINE_CONTENT_TYPES.has(newType);

    // If transitioning between inline-containing and non-inline types,
    // rebuild or clear the inline children accordingly.
    if (isInline && !wasInline) {
      node.buildInlineChildren();
    } else if (!isInline && wasInline) {
      node.children = [];
    }

    // Reset type-specific attributes
    switch (newType) {
      case `list-item`:
        node.attributes = {
          ordered: !!node.attributes.ordered,
          indent: node.attributes.indent || 0,
          ...(node.attributes.ordered ? { number: node.attributes.number || 1 } : {}),
          ...(typeof node.attributes.checked === `boolean`
            ? { checked: node.attributes.checked }
            : {}),
        };
        break;
      case `code-block`:
        if (!node.attributes.language) {
          node.attributes = {
            language: ``,
            fenceCount: node.attributes.fenceCount || 3,
          };
        } else {
          node.attributes.fenceCount = node.attributes.fenceCount || 3;
        }
        break;
      default:
        node.attributes = {};
    }
  }

  /**
   * Applies formatting to a selection within a node.  If the selection
   * start falls inside an existing span of the same format, the format
   * is toggled off (delimiters removed) instead.
   *
   * @param {SyntaxNode} node - The node containing the selection
   * @param {number} startOffset - Start offset within node.content (raw)
   * @param {number} endOffset - End offset within node.content (raw)
   * @param {string} format - The format to apply
   * @returns {number} The raw offset where the cursor should be placed
   *                   after the operation (end of the affected text).
   */
  applyFormat(node, startOffset, endOffset, format) {
    const content = node.content;
    let selStart = startOffset;
    let selEnd = endOffset;

    // Collapsed cursor (no selection): infer the target
    if (selStart === selEnd) {
      // If inside an existing format span, toggle it off.
      const span = this.findFormatSpan(content, selStart, selStart, format);
      if (span) {
        const withoutClose =
          content.substring(0, span.closeStart) + content.substring(span.closeEnd);
        node.content =
          withoutClose.substring(0, span.openStart) + withoutClose.substring(span.openEnd);
        const contentLen = span.closeStart - span.openEnd;
        return span.openStart + contentLen;
      }
      // Otherwise, find the word around the cursor and bold it.
      const bounds = this.findWordBoundaries(content, startOffset);
      if (bounds.start === bounds.end) return startOffset; // no word
      selStart = bounds.start;
      selEnd = bounds.end;
    }

    // Toggle-off: check if the selection overlaps an existing span ─
    const span = this.findFormatSpan(content, selStart, selEnd, format);
    if (span) {
      // Remove closing delimiter first (higher offset) then opening,
      // so that removing the first doesn't shift the second's position.
      const withoutClose = content.substring(0, span.closeStart) + content.substring(span.closeEnd);
      node.content =
        withoutClose.substring(0, span.openStart) + withoutClose.substring(span.openEnd);
      // Cursor goes to end of the now-unformatted text.
      const contentLen = span.closeStart - span.openEnd;
      return span.openStart + contentLen;
    }

    // Mutual exclusion: sub ↔ sup — strip the opposite first
    if (format === `subscript` || format === `superscript`) {
      const opposite = format === `subscript` ? `superscript` : `subscript`;
      const oppositeSpan = this.findFormatSpan(node.content, selStart, selEnd, opposite);
      if (oppositeSpan) {
        // Remove the opposite wrapper, then re-wrap with the new format.
        const withoutClose =
          node.content.substring(0, oppositeSpan.closeStart) +
          node.content.substring(oppositeSpan.closeEnd);
        node.content =
          withoutClose.substring(0, oppositeSpan.openStart) +
          withoutClose.substring(oppositeSpan.openEnd);
        // Adjust selection to the now-unwrapped content region.
        selStart = oppositeSpan.openStart;
        selEnd = oppositeSpan.openStart + (oppositeSpan.closeStart - oppositeSpan.openEnd);
      }
    }

    // Toggle-on: wrap the selected text in format markers
    const before = node.content.substring(0, selStart);
    let selected = node.content.substring(selStart, selEnd);
    const after = node.content.substring(selEnd);

    // Trim trailing whitespace so markers hug the text
    // (e.g. **word** not **word **).
    const trimmed = selected.replace(/\s+$/, ``);
    const trailingWS = selected.substring(trimmed.length);
    selected = trimmed;

    let formatted;
    switch (format) {
      case `bold`:
        formatted = `**${selected}**`;
        break;
      case `italic`:
        formatted = `*${selected}*`;
        break;
      case `code`:
        formatted = `\`${selected}\``;
        break;
      case `strikethrough`:
        formatted = `~~${selected}~~`;
        break;
      case `subscript`:
        formatted = `<sub>${selected}</sub>`;
        break;
      case `superscript`:
        formatted = `<sup>${selected}</sup>`;
        break;
      case `link`:
        formatted = `[${selected}](url)`;
        break;
      default:
        formatted = selected;
    }

    node.content = before + formatted + trailingWS + after;
    // Cursor goes right after the closing delimiter.
    return selStart + formatted.length;
  }

  /**
   * Searches for an existing format span whose content region overlaps
   * the selection [selStart, selEnd].  Returns the raw positions of the
   * open/close delimiters, or `null` if no matching span is found.
   *
   * The overlap check is:
   *   selStart <= contentEnd  AND  selEnd >= contentStart
   *
   * This handles the common case where `renderedOffsetToRawOffset` maps
   * the selection start to *before* the opening delimiter (raw offset 0)
   * while the selection end lands at the closing delimiter boundary.
   *
   * @param {string} content  - The raw node content
   * @param {number} selStart - Selection start (raw offset)
   * @param {number} selEnd   - Selection end (raw offset)
   * @param {string} format   - 'bold' | 'italic' | 'strikethrough' | 'code'
   * @returns {{ openStart: number, openEnd: number,
   *             closeStart: number, closeEnd: number } | null}
   */
  findFormatSpan(content, selStart, selEnd, format) {
    const tokens = tokenizeInline(content);

    // Code is a single token, not a paired open/close
    if (format === `code`) {
      let rawPos = 0;
      for (const token of tokens) {
        const tokenStart = rawPos;
        rawPos += token.raw.length;
        if (token.type === `code`) {
          const contentStart = tokenStart + 1; // after opening `
          const contentEnd = rawPos - 1; // before closing `
          if (selStart <= contentEnd && selEnd >= contentStart) {
            return {
              openStart: tokenStart,
              openEnd: contentStart,
              closeStart: contentEnd,
              closeEnd: rawPos,
            };
          }
        }
      }
      return null;
    }

    // Paired delimiters: bold / italic / strikethrough
    /** @type {Record<string, { open: string, close: string, htmlTags?: string[] }>} */
    const typeMap = {
      bold: {
        open: `bold-open`,
        close: `bold-close`,
        htmlTags: [`strong`, `b`],
      },
      italic: {
        open: `italic-open`,
        close: `italic-close`,
        htmlTags: [`em`, `i`],
      },
      strikethrough: {
        open: `strikethrough-open`,
        close: `strikethrough-close`,
        htmlTags: [`del`, `s`],
      },
    };
    const spec = typeMap[format];

    // HTML-tag formats: subscript / superscript
    if (!spec) {
      /** @type {Record<string, string>} */
      const htmlTagMap = {
        subscript: `sub`,
        superscript: `sup`,
      };
      const tagName = htmlTagMap[format];
      if (!tagName) return null; // link — no toggle

      let rawPos = 0;
      /** @type {{ rawStart: number, rawEnd: number }[]} */
      const htmlOpens = [];

      for (const token of tokens) {
        const tokenStart = rawPos;
        rawPos += token.raw.length;

        if (token.type === `html-open` && token.tag === tagName) {
          htmlOpens.push({ rawStart: tokenStart, rawEnd: rawPos });
        } else if (token.type === `html-close` && token.tag === tagName && htmlOpens.length > 0) {
          const open = /** @type {{ rawStart: number, rawEnd: number }} */ (htmlOpens.pop());
          if (selStart <= tokenStart && selEnd >= open.rawEnd) {
            return {
              openStart: open.rawStart,
              openEnd: open.rawEnd,
              closeStart: tokenStart,
              closeEnd: rawPos,
            };
          }
        }
      }
      return null;
    }

    let rawPos = 0;
    /** @type {{ rawStart: number, rawEnd: number }[]} */
    const opens = [];

    for (const token of tokens) {
      const tokenStart = rawPos;
      rawPos += token.raw.length;

      if (token.type === spec.open) {
        opens.push({ rawStart: tokenStart, rawEnd: rawPos });
      } else if (token.type === spec.close && opens.length > 0) {
        const open = /** @type {{ rawStart: number, rawEnd: number }} */ (opens.pop());
        // Content region is between open-end (open.rawEnd) and
        // close-start (tokenStart).  Check overlap with selection.
        if (selStart <= tokenStart && selEnd >= open.rawEnd) {
          return {
            openStart: open.rawStart,
            openEnd: open.rawEnd,
            closeStart: tokenStart,
            closeEnd: rawPos,
          };
        }
      }
    }

    // Fall back to HTML-tag equivalents (e.g. <strong> for bold)
    if (spec.htmlTags) {
      for (const tagName of spec.htmlTags) {
        let htmlPos = 0;
        /** @type {{ rawStart: number, rawEnd: number }[]} */
        const htmlOpens = [];

        for (const token of tokens) {
          const tokenStart = htmlPos;
          htmlPos += token.raw.length;

          if (token.type === `html-open` && token.tag === tagName) {
            htmlOpens.push({ rawStart: tokenStart, rawEnd: htmlPos });
          } else if (token.type === `html-close` && token.tag === tagName && htmlOpens.length > 0) {
            const open = /** @type {{ rawStart: number, rawEnd: number }} */ (htmlOpens.pop());
            if (selStart <= tokenStart && selEnd >= open.rawEnd) {
              return {
                openStart: open.rawStart,
                openEnd: open.rawEnd,
                closeStart: tokenStart,
                closeEnd: htmlPos,
              };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Finds the word boundaries around a raw offset in the content string.
   * A "word" is a contiguous run of non-whitespace characters.
   *
   * @param {string} content - The raw node content
   * @param {number} offset  - A raw offset within content
   * @returns {{ start: number, end: number }}
   */
  findWordBoundaries(content, offset) {
    const pos = Math.min(offset, content.length);

    // Scan backwards for start of word.
    let start = pos;
    while (start > 0 && !/\s/.test(content[start - 1])) {
      start--;
    }

    // Scan forwards for end of word.
    let end = pos;
    while (end < content.length && !/\s/.test(content[end])) {
      end++;
    }

    return { start, end };
  }

  /**
   * Gets the offset within a node for a line/column position.
   * @param {SyntaxNode} node - The node
   * @param {number} line - The line number (0-based)
   * @param {number} column - The column number (0-based)
   * @returns {number}
   */
  getOffsetInNode(node, line, column) {
    const nodeStartLine = node.startLine;
    const relativeLine = line - nodeStartLine;

    const lines = node.content.split(`\n`);
    let offset = 0;

    for (let i = 0; i < relativeLine && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }

    return offset + Math.min(column, lines[relativeLine]?.length ?? 0);
  }

  /**
   * Converts the tree to markdown.
   * @returns {string}
   */
  toMarkdown() {
    const lines = [];

    for (const child of this.children) {
      lines.push(child.toMarkdown());
    }

    return lines.join(`\n\n`);
  }

  /**
   * Returns the plain visible text of the entire document with all
   * formatting and syntax stripped.  Used by the search system for
   * writing-view matching.
   *
   * @returns {string}
   */
  toBareText() {
    const parts = [];

    for (const child of this.children) {
      const text = child.toBareText();
      if (text !== ``) parts.push(text);
    }

    return parts.join(`\n\n`);
  }

  /**
   * Creates a deep clone of the tree.
   * @returns {SyntaxTree}
   */
  clone() {
    const cloned = new SyntaxTree();

    for (const child of this.children) {
      cloned.appendChild(child.clone());
    }

    return cloned;
  }

  /**
   * Gets the total number of nodes in the tree.
   * @returns {number}
   */
  getNodeCount() {
    let count = 0;

    /**
     * @param {SyntaxNode[]} nodes
     */
    const countRecursive = (nodes) => {
      for (const node of nodes) {
        count++;
        countRecursive(node.children);
      }
    };

    countRecursive(this.children);
    return count;
  }

  /**
   * Returns the path from the tree root to the node that currently has the
   * cursor, with the cursor's character offset appended as the final element.
   *
   * Every element except the last is a zero-based child index at that level
   * of the tree.  The last element is `treeCursor.offset` (the character
   * position within the node's content).
   *
   * Returns `null` when there is no active cursor or the cursor's node
   * cannot be found in the tree.
   *
   * @returns {number[]|null}
   *
   * @example
   * // Cursor at offset 5 in the 3rd child of the 1st top-level node:
   * tree.getPathToCursor(); // → [0, 2, 5]
   */
  getPathToCursor() {
    if (!this.treeCursor) return null;

    /** @type {number[]} */
    const path = [];
    const treeCursor = this.treeCursor;

    /**
     * @param {SyntaxNode[]} children
     * @returns {boolean}
     */
    const search = (children) => {
      for (let i = 0; i < children.length; i++) {
        if (children[i].id === treeCursor.nodeId) {
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

    if (!search(this.children)) return null;

    path.push(treeCursor.offset);
    return path;
  }

  /**
   * Restores the cursor from a path previously produced by
   * {@link getPathToCursor}.  Each element except the last is a
   * zero-based child index used to descend into the tree; the last
   * element is the character offset within the target node's content.
   *
   * Does nothing if `cursorPath` is `null`, empty, or any index is
   * out of bounds.
   *
   * @param {number[]|null} cursorPath
   */
  setCursorPath(cursorPath) {
    if (!cursorPath) return;
    if (cursorPath.length < 2) return;

    let children = this.children;
    for (let i = 0; i < cursorPath.length - 1; i++) {
      const index = cursorPath[i];
      if (index < 0 || index >= children.length) return;
      const node = children[index];
      if (i === cursorPath.length - 2) {
        this.treeCursor = {
          nodeId: node.id,
          offset: cursorPath[cursorPath.length - 1],
        };
        return;
      }
      children = node.children;
    }
  }

  /**
   * Returns the index path from the tree root to the node with the
   * given ID.  Each element is a zero-based child index at that level.
   *
   * Returns `null` when the node cannot be found.
   *
   * @param {string} nodeId
   * @returns {number[]|null}
   */
  getPathToNode(nodeId) {
    /** @type {number[]} */
    const path = [];

    /**
     * @param {SyntaxNode[]} children
     * @returns {boolean}
     */
    const search = (children) => {
      for (let i = 0; i < children.length; i++) {
        if (children[i].id === nodeId) {
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

    return search(this.children) ? path : null;
  }

  /**
   * Resolves an index path (produced by {@link getPathToNode}) back
   * to the node at that position in the tree.
   *
   * Returns `null` when any index is out of bounds.
   *
   * @param {number[]|null} nodePath
   * @returns {SyntaxNode|null}
   */
  getNodeAtPath(nodePath) {
    if (!nodePath || nodePath.length === 0) return null;

    let children = this.children;
    for (let i = 0; i < nodePath.length; i++) {
      const index = nodePath[i];
      if (index < 0 || index >= children.length) return null;
      if (i === nodePath.length - 1) return children[index];
      children = children[index].children;
    }
    return null;
  }
}
