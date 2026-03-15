/// <reference path="../../../../types.d.ts" />

/**
 * Handles the Backspace key.
 * @param {EditOperations} ops
 */
export async function handleBackspace(ops) {
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
    if (ops.editor.syntaxTree.treeCursor.offset > 0) {
      const before = ops.editor.syntaxTree.toMarkdown();
      const attr =
        ops.editor.syntaxTree.treeCursor.tagPart === `opening` ? `openingTag` : `closingTag`;
      const old = node.attributes[attr] || ``;
      const left = old.substring(0, ops.editor.syntaxTree.treeCursor.offset - 1);
      const right = old.substring(ops.editor.syntaxTree.treeCursor.offset);
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

  // Table cell backspace
  if (
    node.type === `table` &&
    ops.editor.syntaxTree.treeCursor.cellRow !== undefined &&
    ops.editor.syntaxTree.treeCursor.cellCol !== undefined
  ) {
    const { cellRow, cellCol, offset } = ops.editor.syntaxTree.treeCursor;
    if (offset > 0) {
      const before = ops.editor.syntaxTree.toMarkdown();
      const cellText = ops.editor.tableManager.getTableCellText(node, cellRow, cellCol);
      const left = cellText.substring(0, offset - 1);
      const right = cellText.substring(offset);
      ops.editor.tableManager.setTableCellText(node, cellRow, cellCol, left + right);
      ops.editor.syntaxTree.treeCursor = {
        nodeId: node.id,
        offset: left.length,
        cellRow,
        cellCol,
      };
      ops.editor.recordAndRender(before, { updated: [node.id] });
    }
    // At offset 0 — no-op (don't merge cells or break table)
    return;
  }

  const before = ops.editor.syntaxTree.toMarkdown();
  /** @type {{ updated?: string[], added?: string[], removed?: string[] }} */
  let renderHints = { updated: [node.id] };

  if (ops.editor.syntaxTree.treeCursor.offset > 0) {
    // Delete one character before the cursor inside this node's content
    const left = node.content.substring(0, ops.editor.syntaxTree.treeCursor.offset - 1);
    const right = node.content.substring(ops.editor.syntaxTree.treeCursor.offset);
    const newContent = left + right;
    const oldType = node.type;

    // Code-block content is raw code — skip re-parsing.
    if (node.type === `code-block`) {
      // In source view, backspace targets sourceEditText.
      if (ops.editor.viewMode === `source` && node.sourceEditText !== null) {
        const srcLeft = node.sourceEditText.substring(
          0,
          ops.editor.syntaxTree.treeCursor.offset - 1,
        );
        const srcRight = node.sourceEditText.substring(ops.editor.syntaxTree.treeCursor.offset);
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

    // Compute new cursor offset
    if (oldType === node.type) {
      newOffset = left.length;
    } else {
      const oldPrefix = ops.editor.getPrefixLength(oldType, node.attributes);
      const newPrefix = ops.editor.getPrefixLength(node.type, node.attributes);
      newOffset = Math.max(0, oldPrefix + left.length - newPrefix);
    }

    ops.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: newOffset };
  } else {
    // Cursor is at the start of the node.

    // Code-block at offset 0: in source view the full text is in
    // sourceEditText so offset 0 means the very start of the
    // opening fence — there is nothing before it to merge into
    // while still preserving the code-block structure, so this
    // is a no-op (consistent with html-block boundary behaviour).
    // In writing view with empty content, convert to paragraph.
    if (node.type === `code-block`) {
      if (ops.editor.viewMode === `source`) {
        // If the first line of the source edit text no longer
        // contains any backticks, the user has fully removed
        // the opening fence.  Finalize to reparse the text as
        // normal content and fall through to the standard
        // backspace-at-offset-0 logic (merge with previous).
        const firstLine = (node.sourceEditText ?? ``).split(`\n`)[0];
        if (firstLine.includes(`\``)) {
          // Still has backticks — no-op.
          ops.editor.recordAndRender(before, renderHints);
          return;
        }
        // Finalize: reparse into non-code-block nodes.
        const finalizeHints = await ops.editor.finalizeCodeBlockSourceEdit(node);
        if (finalizeHints) {
          renderHints = finalizeHints;
        }
        ops.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
        // Fall through to the offset-0 logic below.
      }
      if (node.content === ``) {
        node.type = `paragraph`;
        node.content = ``;
        node.attributes = {};
        node.sourceEditText = null;
        ops.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
        ops.editor.recordAndRender(before, { updated: [node.id] });
        return;
      }
    }

    // If this is a heading (or blockquote, list-item, etc.) with an
    // empty content, convert it back to an empty paragraph.
    if (node.type !== `paragraph` && node.content === ``) {
      const wasListItem = node.type === `list-item`;
      node.type = `paragraph`;
      node.content = ``;
      node.attributes = {};
      ops.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
      if (wasListItem) {
        const siblings = ops.editor.getSiblings(node);
        const idx = siblings.indexOf(node);
        const renumbered = ops.editor.renumberAdjacentList(siblings, idx);
        if (renumbered.length) {
          renderHints = { updated: [node.id, ...renumbered] };
        }
      }
    } else if (node.type !== `paragraph`) {
      // Non-paragraph with content and cursor at start: demote to paragraph,
      // keeping the content.
      const wasListItem = node.type === `list-item`;
      node.type = `paragraph`;
      node.attributes = {};
      ops.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
      if (wasListItem) {
        const siblings = ops.editor.getSiblings(node);
        const idx = siblings.indexOf(node);
        const renumbered = ops.editor.renumberAdjacentList(siblings, idx);
        if (renumbered.length) {
          renderHints = { updated: [node.id, ...renumbered] };
        }
      }
    } else {
      // Merge with the previous node (if any)
      const siblings = ops.editor.getSiblings(node);
      const idx = siblings.indexOf(node);
      if (idx > 0) {
        const prev = siblings[idx - 1];

        if (prev.type === `html-block` && prev.children.length > 0) {
          // Previous sibling is a container html-block.
          if (ops.editor.viewMode === `source`) {
            // In source view the container boundary is
            // structural — backspace is a no-op.
          } else {
            // In writing view, merge into the last child
            // of the html-block container.
            const lastChild = prev.children[prev.children.length - 1];
            const lastChildLen = lastChild.content.length;
            lastChild.content += node.content;
            siblings.splice(idx, 1);
            node.parent = null;
            ops.editor.syntaxTree.treeCursor = {
              nodeId: lastChild.id,
              offset: lastChildLen,
            };
            renderHints = { updated: [lastChild.id], removed: [node.id] };
          }
        } else {
          const prevLen = prev.content.length;
          prev.content += node.content;
          siblings.splice(idx, 1);
          node.parent = null;
          ops.editor.syntaxTree.treeCursor = { nodeId: prev.id, offset: prevLen };
          renderHints = { updated: [prev.id], removed: [node.id] };
        }
      }
      // If idx === 0 there is nothing to merge into — do nothing.
    }
  }

  ops.editor.recordAndRender(before, renderHints);
}
