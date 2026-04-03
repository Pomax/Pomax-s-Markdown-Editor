/// <reference path="../../../../types.d.ts" />

import { SyntaxNode } from '../../../../parsers/old/syntax-node.js';

/**
 * Handles the Enter key — splits the current node at the cursor.
 * @param {EditOperations} ops
 */
export function handleEnterKey(ops) {
  ops.editor.syncCursorFromDOM();

  // If there is a non-collapsed selection, delete it first, then
  // split at the resulting cursor position.
  /** @type {string|null} */
  let rangeDeleteBefore = null;
  /** @type {string[]} */
  let rangeRemovedIds = [];
  if (ops.editor.treeRange) {
    const rangeResult = ops.editor.rangeOperations.deleteSelectedRange();
    if (rangeResult) {
      rangeDeleteBefore = rangeResult.before;
      rangeRemovedIds = rangeResult.hints.removed ?? [];
      // Fall through — treeCursor now points at the join point.
    }
  }

  const node = ops.editor.getCurrentBlockNode();
  if (!node || !ops.editor.syntaxTree || !ops.editor.syntaxTree.treeCursor) return;

  // html-block tag lines and containers are not splittable.
  if (node.type === `html-block` && node.children.length > 0) {
    return;
  }

  // Enter inside a table → move to next row, same column
  if (node.type === `table` && ops.editor.syntaxTree.treeCursor.cellRow !== undefined) {
    const { cellRow, cellCol } = ops.editor.syntaxTree.treeCursor;
    const { totalRows } = ops.editor.tableManager.getTableDimensions(node);
    if (cellRow < totalRows - 1) {
      ops.editor.syntaxTree.treeCursor = {
        nodeId: node.id,
        offset: 0,
        cellRow: cellRow + 1,
        cellCol,
      };
      ops.editor.placeCursor();
    }
    // On last row — no-op
    return;
  }

  const before = rangeDeleteBefore ?? ops.editor.syntaxTree.toMarkdown();

  // Early conversion: ```lang + Enter → code block
  // Walk the content character by character: 3+ backticks, optional
  // word chars (language), nothing else.  Enter supplies the newline.
  if (node.type === `paragraph`) {
    const text = node.content;
    let i = 0;
    while (i < text.length && text[i] === `\``) i++;
    if (i >= 3) {
      const fenceCount = i;
      let language = ``;
      let valid = true;
      while (i < text.length) {
        const ch = text[i];
        if (/\w/.test(ch)) {
          language += ch;
        } else {
          valid = false;
          break;
        }
        i++;
      }
      if (valid) {
        node.type = `code-block`;
        node.content = ``;
        node.attributes = { language, fenceCount };
        ops.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
        ops.editor.recordAndRender(before, { updated: [node.id] });
        return;
      }
    }
  }

  // Enter inside a code block → insert newline
  if (node.type === `code-block`) {
    const left = node.content.substring(0, ops.editor.syntaxTree.treeCursor.offset);
    const right = node.content.substring(ops.editor.syntaxTree.treeCursor.offset);
    node.content = `${left}\n${right}`;
    ops.editor.syntaxTree.treeCursor = {
      nodeId: node.id,
      offset: left.length + 1,
    };
    ops.editor.recordAndRender(before, { updated: [node.id] });
    return;
  }

  const contentBefore = node.content.substring(0, ops.editor.syntaxTree.treeCursor.offset);
  const contentAfter = node.content.substring(ops.editor.syntaxTree.treeCursor.offset);

  // Enter inside a list item
  if (node.type === `list-item`) {
    if (contentBefore === `` && contentAfter === ``) {
      // Empty list item → exit list: convert to empty paragraph
      const siblings = ops.editor.getSiblings(node);
      const idx = siblings.indexOf(node);
      node.type = `paragraph`;
      node.content = ``;
      node.attributes = {};
      ops.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
      const renumbered = ops.editor.renumberAdjacentList(siblings, idx);
      /** @type {{ updated: string[], removed?: string[] }} */
      const listHints = { updated: [node.id, ...renumbered] };
      if (rangeRemovedIds.length > 0) listHints.removed = rangeRemovedIds;
      ops.editor.recordAndRender(before, listHints);
      return;
    }

    // Split: current item keeps text before cursor,
    // new item gets text after cursor.
    node.content = contentBefore;
    /** @type {NodeAttributes} */
    const newAttrs = {
      ordered: node.attributes.ordered,
      indent: node.attributes.indent || 0,
    };
    if (node.attributes.ordered) {
      newAttrs.number = (node.attributes.number || 1) + 1;
    }
    if (typeof node.attributes.checked === `boolean`) {
      newAttrs.checked = false;
    }
    const newItem = new SyntaxNode(`list-item`, contentAfter);
    newItem.attributes = newAttrs;
    const siblings = ops.editor.getSiblings(node);
    const idx = siblings.indexOf(node);
    siblings.splice(idx + 1, 0, newItem);
    if (node.parent) newItem.parent = node.parent;

    // Renumber subsequent ordered items in the same run
    const renumbered = ops.editor.renumberAdjacentList(siblings, idx);

    ops.editor.syntaxTree.treeCursor = { nodeId: newItem.id, offset: 0 };
    /** @type {{ updated: string[], added: string[], removed?: string[] }} */
    const listHints = {
      updated: [node.id, ...renumbered],
      added: [newItem.id],
    };
    if (rangeRemovedIds.length > 0) listHints.removed = rangeRemovedIds;
    ops.editor.recordAndRender(before, listHints);
    return;
  }

  // Current node keeps the text before the cursor
  node.content = contentBefore;

  // If the node was bare text inside an HTML container, splitting it
  // means it is no longer a single bare-text line — clear the flag.
  if (node.attributes?.bareText) {
    node.attributes.bareText = undefined;
  }

  // New node is always a paragraph
  const newNode = new SyntaxNode(`paragraph`, contentAfter);
  const siblings = ops.editor.getSiblings(node);
  const idx = siblings.indexOf(node);
  siblings.splice(idx + 1, 0, newNode);
  if (node.parent) newNode.parent = node.parent;

  ops.editor.syntaxTree.treeCursor = { nodeId: newNode.id, offset: 0 };

  /** @type {{ updated: string[], added: string[], removed?: string[] }} */
  const hints = { updated: [node.id], added: [newNode.id] };
  if (rangeRemovedIds.length > 0) hints.removed = rangeRemovedIds;
  ops.editor.recordAndRender(before, hints);
}
