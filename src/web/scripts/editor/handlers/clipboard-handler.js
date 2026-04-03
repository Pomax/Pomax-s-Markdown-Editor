/**
 * @fileoverview Clipboard operations: cut, copy, and the helper that
 * extracts raw markdown from the current selection.
 */

/// <reference path="../../../../types.d.ts" />

/**
 * Regex that matches an opening HTML inline tag: `<tag>` or `<tag attr="…">`.
 * Captures the tag name in group 1.
 * @type {RegExp}
 */
const HTML_OPEN_RE = /<([a-z][a-z0-9]*)\b[^>]*>/gi;

/**
 * Regex that matches a closing HTML inline tag: `</tag>`.
 * Captures the tag name in group 1.
 * @type {RegExp}
 */
const HTML_CLOSE_RE = /<\/([a-z][a-z0-9]*)\s*>/gi;

/**
 * Handles clipboard operations (cut, copy) for the editor.
 */
export class ClipboardHandler {
  /**
   * @param {Editor} editor
   */
  constructor(editor) {
    /** @type {Editor} */
    this.editor = editor;
  }

  /**
   * Returns the raw markdown text for the current selection range.
   *
   * Resolves start / end positions to the parse tree,
   * trims the first and last nodes' content to the selection boundaries,
   * repairs any HTML inline tags that were sliced open, and wraps every
   * node in its block-level markdown prefix so that the clipboard text
   * is valid markdown.
   *
   * @returns {string} The markdown text of the selection, or empty string.
   */
  getSelectedMarkdown() {
    this.editor.syncCursorFromDOM();
    if (!this.editor.treeRange || !this.editor.syntaxTree) return ``;

    return this.getSelectedMarkdownWriting();
  }

  /**
   * Writing-view copy: produces valid markdown for the selected region
   * by trimming start/end node content, repairing sliced HTML inline
   * tags, and re-applying block-level prefixes.
   * @returns {string}
   */
  getSelectedMarkdownWriting() {
    const { startNodeId, startOffset, endNodeId, endOffset } = /** @type {TreeRange} */ (
      this.editor.treeRange
    );
    const tree = /** @type {SyntaxTree} */ (this.editor.syntaxTree);

    const startNode = tree.findNodeById(startNodeId);
    const endNode = tree.findNodeById(endNodeId);
    if (!startNode || !endNode) return ``;

    // Same node — trim content, fix tags, apply prefix.
    if (startNodeId === endNodeId) {
      const slice = startNode.content.substring(startOffset, endOffset);
      const fixed = ClipboardHandler.fixHtmlTags(slice);
      return ClipboardHandler.nodeToPartialMarkdown(startNode, fixed);
    }

    // Cross-node: walk all block nodes in document order.
    const nodes = this.editor.getNodesInRange(startNodeId, endNodeId);
    if (nodes.length === 0) return ``;

    const parts = [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === startNodeId) {
        // First node: take from startOffset to end of content.
        const slice = node.content.substring(startOffset);
        parts.push(
          ClipboardHandler.nodeToPartialMarkdown(node, ClipboardHandler.fixHtmlTags(slice)),
        );
      } else if (node.id === endNodeId) {
        // Last node: take from start of content to endOffset.
        const slice = node.content.substring(0, endOffset);
        parts.push(
          ClipboardHandler.nodeToPartialMarkdown(node, ClipboardHandler.fixHtmlTags(slice)),
        );
      } else {
        // Intermediate node: full markdown.
        parts.push(node.toMarkdown());
      }
    }
    return parts.join(`\n\n`);
  }

  /**
   * Wraps a (possibly trimmed) content string in the block-level
   * markdown prefix / suffix that `node.toMarkdown()` would normally
   * produce, but using `content` instead of `node.content`.
   *
   * @param {SyntaxNode} node
   * @param {string} content — trimmed / repaired content
   * @returns {string}
   */
  static nodeToPartialMarkdown(node, content) {
    switch (node.type) {
      case `heading1`:
        return `# ${content}`;
      case `heading2`:
        return `## ${content}`;
      case `heading3`:
        return `### ${content}`;
      case `heading4`:
        return `#### ${content}`;
      case `heading5`:
        return `##### ${content}`;
      case `heading6`:
        return `###### ${content}`;
      case `paragraph`:
        return content;
      case `blockquote`:
        return content
          .split(`\n`)
          .map((line) => `> ${line}`)
          .join(`\n`);
      case `code-block`: {
        const lang = node.attributes.language || ``;
        const fence = `\``.repeat(node.attributes.fenceCount || 3);
        return `${fence}${lang}\n${content}\n${fence}`;
      }
      case `list-item`: {
        const indent = `  `.repeat(node.attributes.indent || 0);
        const marker = node.attributes.ordered ? `${node.attributes.number || 1}. ` : `- `;
        const checkbox =
          typeof node.attributes.checked === `boolean`
            ? node.attributes.checked
              ? `[x] `
              : `[ ] `
            : ``;
        return `${indent}${marker}${checkbox}${content}`;
      }
      case `horizontal-rule`:
        return `---`;
      case `table`:
        return content;
      default:
        return content;
    }
  }

  /**
   * Repairs HTML inline tags that were sliced open at the boundaries
   * of a substring.  Walks the string left-to-right, tracking a stack
   * of open tags.  After the walk:
   *
   * - Any tags left on the stack (opened but never closed inside the
   *   slice) get their closing tags appended.
   * - Any closing tags encountered before their opener (the opener was
   *   before the slice start) get their opening tags prepended.
   *
   * Markdown formatting (`**`, `*`, `~~`, `` ` ``) is left alone — it
   * is handled naturally because trimming a raw content substring
   * preserves the delimiters that fall inside the selection.
   *
   * @param {string} slice — a raw substring of a node's content
   * @returns {string}
   */
  static fixHtmlTags(slice) {
    /** @type {string[]} */
    const openStack = [];
    /** @type {string[]} */
    const unmatchedCloses = [];

    // Collect all open and close tags sorted by position.
    /** @type {{ tag: string, kind: 'open' | 'close', index: number }[]} */
    const positioned = [];

    HTML_OPEN_RE.lastIndex = 0;
    for (let m = HTML_OPEN_RE.exec(slice); m !== null; m = HTML_OPEN_RE.exec(slice)) {
      positioned.push({ tag: m[1].toLowerCase(), kind: `open`, index: m.index });
    }
    HTML_CLOSE_RE.lastIndex = 0;
    for (let m = HTML_CLOSE_RE.exec(slice); m !== null; m = HTML_CLOSE_RE.exec(slice)) {
      positioned.push({ tag: m[1].toLowerCase(), kind: `close`, index: m.index });
    }
    positioned.sort((a, b) => a.index - b.index);

    for (const { tag, kind } of positioned) {
      if (kind === `open`) {
        openStack.push(tag);
      } else {
        // Try to match against the most recent open of the same tag.
        const idx = openStack.lastIndexOf(tag);
        if (idx !== -1) {
          openStack.splice(idx, 1);
        } else {
          // No matching opener in the slice → opener was before
          // the slice boundary.
          unmatchedCloses.push(tag);
        }
      }
    }

    // Prepend missing openers (in the order the closers appeared).
    const prefix = unmatchedCloses.map((t) => `<${t}>`).join(``);
    // Append missing closers (innermost first → reverse the stack).
    const suffix = openStack
      .reverse()
      .map((t) => `</${t}>`)
      .join(``);

    return `${prefix}${slice}${suffix}`;
  }

  /**
   * Handles the `cut` event by writing the selected markdown to the
   * clipboard.  The actual DOM/tree mutation is handled by
   * `handleBeforeInput` for the `deleteByCut` input type.
   * @param {ClipboardEvent} event
   */
  handleCut(event) {
    if (this.editor.viewMode === `source2`) return;

    this.editor.syncCursorFromDOM();
    if (!this.editor.treeRange) return; // nothing selected — let browser handle

    event.preventDefault();
    const markdown = this.getSelectedMarkdown();
    if (event.clipboardData) {
      event.clipboardData.setData(`text/plain`, markdown);
    }
    // After this event, the browser fires beforeinput with inputType
    // 'deleteByCut', which we intercept to delete through the tree.
    // However, since we preventDefault'd the cut, no beforeinput fires.
    // Do the deletion here directly.
    const rangeResult = this.editor.rangeOperations.deleteSelectedRange();
    if (rangeResult) {
      this.editor.recordAndRender(rangeResult.before, rangeResult.hints);
    }
  }

  /**
   * Handles the `copy` event by writing the selected markdown to the
   * clipboard instead of the browser's default rendered-text copy.
   * @param {ClipboardEvent} event
   */
  handleCopy(event) {
    if (this.editor.viewMode === `source2`) return;

    this.editor.syncCursorFromDOM();
    if (!this.editor.treeRange) return; // nothing selected — let browser handle

    event.preventDefault();
    const markdown = this.getSelectedMarkdown();
    if (event.clipboardData) {
      event.clipboardData.setData(`text/plain`, markdown);
    }
  }
}
