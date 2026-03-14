/**
 * @fileoverview Insert-text operation for the edit-operations module.
 */

/// <reference path="../../../../types.d.ts" />

/**
 * Inserts text at the current tree cursor position, re-parses the affected
 * line to detect type changes (e.g. `# ` → heading), and re-renders.
 * @param {import('./index.js').EditOperations} ops
 * @param {string} text
 */
export function insertTextAtCursor(ops, text) {
  ops.editor.syncCursorFromDOM();

  // If there is a non-collapsed selection, delete it first so the
  // typed text replaces the selection.
  /** @type {string|null} */
  let rangeDeleteBefore = null;
  /** @type {string[]} */
  let rangeRemovedIds = [];
  if (ops.editor.treeRange) {
    const rangeResult = ops.editor.rangeOperations.deleteSelectedRange();
    if (rangeResult) {
      rangeDeleteBefore = rangeResult.before;
      rangeRemovedIds = rangeResult.hints.removed ?? [];
      if (!text) {
        ops.editor.recordAndRender(rangeResult.before, rangeResult.hints);
        return;
      }
      // Fall through — treeCursor is at the join point and we
      // will insert the text there.  Use the pre-deletion
      // snapshot for the undo entry.
    }
  }

  const node = ops.editor.getCurrentBlockNode();
  if (!node || !ops.editor.syntaxTree || !ops.editor.syntaxTree.treeCursor) return;

  // When the cursor is on an html-block tag line (source view), edit
  // the openingTag / closingTag attribute directly.
  if (node.type === `html-block` && ops.editor.syntaxTree.treeCursor.tagPart) {
    const before = rangeDeleteBefore ?? ops.editor.syntaxTree.toMarkdown();
    const attr =
      ops.editor.syntaxTree.treeCursor.tagPart === `opening` ? `openingTag` : `closingTag`;
    const old = node.attributes[attr] || ``;
    const left = old.substring(0, ops.editor.syntaxTree.treeCursor.offset);
    const right = old.substring(ops.editor.syntaxTree.treeCursor.offset);
    node.attributes[attr] = left + text + right;
    ops.editor.syntaxTree.treeCursor = {
      nodeId: node.id,
      offset: left.length + text.length,
      tagPart: ops.editor.syntaxTree.treeCursor.tagPart,
    };
    ops.editor.recordAndRender(before, { updated: [node.id] });
    return;
  }

  // html-block containers without tagPart are structural (writing view).
  if (node.type === `html-block` && node.children.length > 0) return;

  const before = rangeDeleteBefore ?? ops.editor.syntaxTree.toMarkdown();

  if (
    node.type === `table` &&
    ops.editor.syntaxTree.treeCursor.cellRow !== undefined &&
    ops.editor.syntaxTree.treeCursor.cellCol !== undefined
  ) {
    const { cellRow, cellCol, offset } = ops.editor.syntaxTree.treeCursor;
    const cellText = ops.editor.tableManager.getTableCellText(node, cellRow, cellCol);
    const left = cellText.substring(0, offset);
    const right = cellText.substring(offset);
    ops.editor.tableManager.setTableCellText(node, cellRow, cellCol, left + text + right);
    ops.editor.syntaxTree.treeCursor = {
      nodeId: node.id,
      offset: left.length + text.length,
      cellRow,
      cellCol,
    };
    ops.editor.recordAndRender(before, { updated: [node.id] });
    return;
  }

  const oldType = node.type;

  // Insert the text into the node's content at the cursor offset
  const left = node.content.substring(0, ops.editor.syntaxTree.treeCursor.offset);
  const right = node.content.substring(ops.editor.syntaxTree.treeCursor.offset);
  const newContent = left + text + right;

  // Code-block content is raw code, not markdown — skip re-parsing
  // to avoid misidentifying code lines as headings, lists, etc.
  if (node.type === `code-block`) {
    // In source view, edits target the full markdown text
    // (fences + language + content) stored in sourceEditText.
    if (ops.editor.viewMode === `source` && node.sourceEditText !== null) {
      const srcLeft = node.sourceEditText.substring(0, ops.editor.syntaxTree.treeCursor.offset);
      const srcRight = node.sourceEditText.substring(ops.editor.syntaxTree.treeCursor.offset);
      node.sourceEditText = srcLeft + text + srcRight;
      ops.editor.syntaxTree.treeCursor = {
        nodeId: node.id,
        offset: srcLeft.length + text.length,
      };
    } else {
      node.content = newContent;
      ops.editor.syntaxTree.treeCursor = {
        nodeId: node.id,
        offset: left.length + text.length,
      };
    }
    ops.editor.recordAndRender(before, { updated: [node.id] });
    return;
  }

  // When the inserted text contains newlines, we must rebuild the
  // affected portion of the tree: combine the current node's markdown
  // prefix + left half, the pasted text, and the right half, then
  // re-parse all resulting lines as separate nodes.
  // Normalize Windows \r\n to \n before checking.
  const normalizedText = text.replace(/\r\n/g, `\n`).replace(/\r/g, `\n`);
  if (normalizedText.includes(`\n`)) {
    const prefixLen = ops.editor.getPrefixLength(oldType, node.attributes);
    const mdPrefix = ops.editor
      .buildMarkdownLine(oldType, ``, node.attributes)
      .substring(0, prefixLen);
    const normalizedContent = left + normalizedText + right;
    const combined = mdPrefix + normalizedContent;

    // Parse into nodes via the currently active parser.
    const parsedNodes = ops.editor.parseMultiLine(combined);

    if (parsedNodes.length === 0) {
      // Edge case: everything was blank lines — empty paragraph
      node.type = `paragraph`;
      node.content = ``;
      node.attributes = {};
      ops.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
      ops.editor.recordAndRender(before, { updated: [node.id] });
      return;
    }

    // Update the current node in-place with the first parsed result.
    const first = parsedNodes[0];
    node.type = first.type;
    node.content = first.content;
    node.attributes = first.attributes;

    // Splice remaining parsed nodes as new siblings after the
    // current node.
    const siblings = ops.editor.getSiblings(node);
    const idx = siblings.indexOf(node);
    /** @type {string[]} */
    const addedIds = [];
    for (let j = 1; j < parsedNodes.length; j++) {
      const newNode = parsedNodes[j];
      if (node.parent) newNode.parent = node.parent;
      siblings.splice(idx + j, 0, newNode);
      addedIds.push(newNode.id);
    }

    // Place cursor at the end of the last node's content.
    const lastNode = parsedNodes[parsedNodes.length - 1];
    ops.editor.syntaxTree.treeCursor = {
      nodeId: lastNode.id,
      offset: lastNode.content.length,
    };

    /** @type {{ updated: string[], added?: string[], removed?: string[] }} */
    const hints = { updated: [node.id] };
    if (addedIds.length > 0) hints.added = addedIds;
    if (rangeRemovedIds.length > 0) hints.removed = rangeRemovedIds;
    ops.editor.recordAndRender(before, hints);
    return;
  }

  // Re-parse the full markdown line to detect type changes
  let newOffset;
  const wasBareText = !!node.attributes.bareText;
  const fullLine = ops.editor.buildMarkdownLine(node.type, newContent, node.attributes);
  const parsed = ops.editor.reparseLine(fullLine);

  if (parsed) {
    // Suppress code-block fence conversion during typing — the
    // fence pattern (```) is converted on Enter instead.
    if (parsed.type === `code-block` && oldType !== `code-block`) {
      node.content = newContent;
      // Suppress image/linked-image block conversion during typing —
      // the inline tokenizer handles ![alt](src) within paragraphs.
    } else if (
      (parsed.type === `image` || parsed.type === `linked-image`) &&
      oldType !== `image` &&
      oldType !== `linked-image`
    ) {
      node.content = newContent;
    } else {
      node.type = parsed.type;
      node.content = parsed.content;
      node.attributes = parsed.attributes;
    }
  } else {
    node.content = newContent;
  }

  // Preserve the bareText flag — it is not part of the markdown syntax
  // that parseSingleLine can reconstruct, so it would be lost.
  if (wasBareText) {
    node.attributes.bareText = true;
  }

  // Compute cursor position in the new content.
  // If the type didn't change, the cursor is simply after the inserted text.
  // If it changed (e.g. paragraph "# " → heading1 ""), we need to account
  // for the prefix that was absorbed by the type change.
  if (oldType === node.type) {
    newOffset = left.length + text.length;
  } else {
    // The old content up to cursor was `left + text`.  In the old type's
    // markdown line, that corresponds to `oldPrefix + left + text`.
    // In the new type's markdown line, the prefix changed.  The cursor
    // position in the new content = old raw cursor pos − new prefix len.
    const oldPrefix = ops.editor.getPrefixLength(oldType, node.attributes);
    const newPrefix = ops.editor.getPrefixLength(node.type, node.attributes);
    const rawCursorPos = oldPrefix + left.length + text.length;
    newOffset = Math.max(0, rawCursorPos - newPrefix);
  }

  ops.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: newOffset };
  /** @type {{ updated: string[], removed?: string[] }} */
  const hints = { updated: [node.id] };
  if (rangeRemovedIds.length > 0) hints.removed = rangeRemovedIds;
  ops.editor.recordAndRender(before, hints);
}
