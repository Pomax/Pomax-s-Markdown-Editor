/**
 * @fileoverview Delete-key operation for the edit-operations module.
 */

/// <reference path="../../../../types.d.ts" />

/**
 * Handles the Delete key.
 * @param {EditOperations} ops
 */
export async function handleDelete(ops) {
  ops.editor.syncCursorFromDOM();

  // If there is a non-collapsed selection, delete the entire range
  // instead of a single character.
  if (ops.editor.treeRange) {
    const rangeResult = ops.editor.rangeOperations.deleteSelectedRange();
    if (rangeResult) {
      ops.cleanupEmptyNodeAfterDelete(rangeResult);
      ops.editor.recordAndRender(rangeResult.before, rangeResult.hints);
      return;
    }
  }

  const node = ops.editor.getCurrentBlockNode();
  if (!node || !ops.editor.syntaxTree || !ops.editor.syntaxTree.treeCursor) return;

  // When the cursor is on an html-block tag line (source view), edit
  // the openingTag / closingTag attribute directly.
  if (node.type === `html-block` && ops.editor.syntaxTree.treeCursor.tagPart) {
    const attr =
      ops.editor.syntaxTree.treeCursor.tagPart === `opening` ? `openingTag` : `closingTag`;
    const old = node.attributes[attr] || ``;
    if (ops.editor.syntaxTree.treeCursor.offset < old.length) {
      const before = ops.editor.syntaxTree.toMarkdown();
      const left = old.substring(0, ops.editor.syntaxTree.treeCursor.offset);
      const right = old.substring(ops.editor.syntaxTree.treeCursor.offset + 1);
      node.attributes[attr] = left + right;
      ops.editor.syntaxTree.treeCursor = {
        nodeId: node.id,
        offset: left.length,
        tagPart: ops.editor.syntaxTree.treeCursor.tagPart,
      };
      ops.editor.recordAndRender(before, { updated: [node.id] });
    }
    return;
  }

  // html-block containers without tagPart are structural (writing view).
  if (node.type === `html-block` && node.children.length > 0) return;

  // Table cell delete
  if (
    node.type === `table` &&
    ops.editor.syntaxTree.treeCursor.cellRow !== undefined &&
    ops.editor.syntaxTree.treeCursor.cellCol !== undefined
  ) {
    const { cellRow, cellCol, offset } = ops.editor.syntaxTree.treeCursor;
    const cellText = ops.editor.tableManager.getTableCellText(node, cellRow, cellCol);
    if (offset < cellText.length) {
      const before = ops.editor.syntaxTree.toMarkdown();
      const left = cellText.substring(0, offset);
      const right = cellText.substring(offset + 1);
      ops.editor.tableManager.setTableCellText(node, cellRow, cellCol, left + right);
      ops.editor.syntaxTree.treeCursor = {
        nodeId: node.id,
        offset,
        cellRow,
        cellCol,
      };
      ops.editor.recordAndRender(before, { updated: [node.id] });
    }
    // At end of cell — no-op
    return;
  }

  const before = ops.editor.syntaxTree.toMarkdown();
  /** @type {{ updated?: string[], added?: string[], removed?: string[] }} */
  let renderHints = { updated: [node.id] };

  // For code-blocks in source-edit mode, the effective length is
  // the full source text, not just node.content.
  const effectiveLength =
    node.type === `code-block` && node.sourceEditText !== null
      ? node.sourceEditText.length
      : node.content.length;

  if (ops.editor.syntaxTree.treeCursor.offset < effectiveLength) {
    // Delete one character after the cursor
    const left = node.content.substring(0, ops.editor.syntaxTree.treeCursor.offset);
    const right = node.content.substring(ops.editor.syntaxTree.treeCursor.offset + 1);
    const newContent = left + right;
    const oldType = node.type;

    // Code-block content is raw code — skip re-parsing.
    if (node.type === `code-block`) {
      if (ops.editor.viewMode === `source` && node.sourceEditText !== null) {
        const srcLeft = node.sourceEditText.substring(0, ops.editor.syntaxTree.treeCursor.offset);
        const srcRight = node.sourceEditText.substring(ops.editor.syntaxTree.treeCursor.offset + 1);
        node.sourceEditText = srcLeft + srcRight;
        ops.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: srcLeft.length };
      } else {
        node.content = newContent;
        ops.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: left.length };
      }
      ops.editor.recordAndRender(before, { updated: [node.id] });
      return;
    }

    // Re-parse to detect type changes
    let newOffset;
    const wasBareText = !!node.attributes.bareText;
    const fullLine = ops.editor.buildMarkdownLine(node.type, newContent, node.attributes);
    const parsed = await ops.editor.reparseLine(fullLine);

    if (parsed) {
      node.type = parsed.type;
      node.content = parsed.content;
      node.attributes = parsed.attributes;
    } else {
      node.content = newContent;
    }

    // Preserve the bareText flag (see insertTextAtCursor).
    if (wasBareText) {
      node.attributes.bareText = true;
    }

    if (oldType === node.type) {
      newOffset = left.length;
    } else {
      const oldPrefix = ops.editor.getPrefixLength(oldType, node.attributes);
      const newPrefix = ops.editor.getPrefixLength(node.type, node.attributes);
      newOffset = Math.max(0, oldPrefix + left.length - newPrefix);
    }

    ops.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: newOffset };
  } else {
    // Cursor is at the end — merge with the next node.
    // If this is a code-block in source-edit mode, finalize it
    // first so the tree is consistent before merging.
    if (node.type === `code-block` && node.sourceEditText !== null) {
      await ops.editor.finalizeCodeBlockSourceEdit(node);
    }

    const siblings = ops.editor.getSiblings(node);
    const idx = siblings.indexOf(node);
    if (idx < siblings.length - 1) {
      const next = siblings[idx + 1];

      if (next.type === `html-block` && next.children.length > 0) {
        // Next sibling is a container html-block.
        if (ops.editor.viewMode === `source`) {
          // In source view the container boundary is
          // structural — delete is a no-op.
        } else {
          // In writing view, merge the first child of the
          // html-block container into this node.
          const firstChild = next.children[0];
          const curLen = node.content.length;
          node.content += firstChild.content;
          next.children.splice(0, 1);
          firstChild.parent = null;
          // If the html-block is now empty, remove it too.
          if (next.children.length === 0) {
            siblings.splice(idx + 1, 1);
            next.parent = null;
          }
          ops.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: curLen };
          renderHints =
            next.children.length === 0
              ? { updated: [node.id], removed: [next.id] }
              : { updated: [node.id, next.id] };
        }
      } else {
        const curLen = node.content.length;
        node.content += next.content;
        siblings.splice(idx + 1, 1);
        next.parent = null;
        ops.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: curLen };
        renderHints = { updated: [node.id], removed: [next.id] };
      }
    }
  }

  ops.editor.recordAndRender(before, renderHints);
}
