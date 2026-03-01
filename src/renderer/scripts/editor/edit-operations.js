/**
 * @fileoverview Tree-level edit operations: inserting text, backspace,
 * delete, and Enter key handling.
 *
 * All edits flow through the parse tree: user input is intercepted,
 * applied to the tree, and then the DOM is re-rendered from the tree.
 */

/// <reference path="../../../types.d.ts" />

import { SyntaxNode } from '../parser/syntax-tree.js';

/**
 * Node types that should be removed when left empty after a
 * selection-delete.  Easily extensible as new element types are added.
 * @type {Set<string>}
 */
const REMOVABLE_WHEN_EMPTY = new Set([
    'paragraph',
    'heading1',
    'heading2',
    'heading3',
    'heading4',
    'heading5',
    'heading6',
    'blockquote',
    'list-item',
    'code-block',
    'table',
    'html-block',
]);

/**
 * Handles tree-level edit operations on the syntax tree.
 */
export class EditOperations {
    /**
     * @param {import('./editor.js').Editor} editor
     */
    constructor(editor) {
        /** @type {import('./editor.js').Editor} */
        this.editor = editor;
    }

    /**
     * After a selection-delete, checks whether the surviving node is empty
     * and should be removed entirely.  If so, removes it from the tree,
     * moves the cursor to an adjacent node, and updates the render hints.
     *
     * If removing the node would leave the document empty, a fresh empty
     * paragraph is inserted instead.
     *
     * @param {{ before: string, hints: { updated?: string[], added?: string[], removed?: string[] } }} result
     *     The result object from `deleteSelectedRange()`, mutated in place.
     */
    _cleanupEmptyNodeAfterDelete(result) {
        const node = this.editor.getCurrentBlockNode();
        if (!node || !this.editor.syntaxTree) return;

        // Only remove types in the extensible set.
        if (!REMOVABLE_WHEN_EMPTY.has(node.type)) return;

        // Check if the node is truly empty.
        if (node.content !== '') return;
        // For tables, content is '' but rows may still have data — skip.
        if (node.type === 'table') return;
        // For html-blocks with children, skip unless all children are gone.
        if (node.type === 'html-block' && node.children.length > 0) return;

        const siblings = this.editor.getSiblings(node);
        const idx = siblings.indexOf(node);
        const wasListItem = node.type === 'list-item';

        // Remove the empty node from the tree.
        siblings.splice(idx, 1);
        node.parent = null;
        if (!result.hints.removed) result.hints.removed = [];
        result.hints.removed.push(node.id);

        // Remove from updated hints — it no longer exists.
        if (result.hints.updated) {
            result.hints.updated = result.hints.updated.filter((id) => id !== node.id);
        }

        // Renumber adjacent ordered list items after removing a list item.
        if (wasListItem && siblings.length > 0) {
            const renumberIdx = Math.min(idx, siblings.length - 1);
            const renumbered = this.editor.renumberAdjacentList(siblings, renumberIdx);
            for (const id of renumbered) {
                if (!result.hints.updated) result.hints.updated = [];
                if (!result.hints.updated.includes(id)) {
                    result.hints.updated.push(id);
                }
            }
        }

        // If document is now empty, insert a fresh paragraph.
        if (this.editor.syntaxTree.children.length === 0) {
            const fresh = new SyntaxNode('paragraph', '');
            this.editor.syntaxTree.children.push(fresh);
            if (!result.hints.added) result.hints.added = [];
            result.hints.added.push(fresh.id);
            this.editor.syntaxTree.treeCursor = { nodeId: fresh.id, offset: 0 };
            return;
        }

        // Move cursor to the adjacent node.
        const newIdx = Math.min(idx, siblings.length - 1);
        if (newIdx >= 0 && newIdx < siblings.length) {
            const target = siblings[newIdx];
            this.editor.syntaxTree.treeCursor = {
                nodeId: target.id,
                offset: 0,
            };
        }
    }

    /**
     * Inserts text at the current tree cursor position, re-parses the affected
     * line to detect type changes (e.g. `# ` → heading), and re-renders.
     * @param {string} text
     */
    insertTextAtCursor(text) {
        this.editor.syncCursorFromDOM();

        // If there is a non-collapsed selection, delete it first so the
        // typed text replaces the selection.
        /** @type {string|null} */
        let rangeDeleteBefore = null;
        /** @type {string[]} */
        let rangeRemovedIds = [];
        if (this.editor.treeRange) {
            const rangeResult = this.editor.rangeOperations.deleteSelectedRange();
            if (rangeResult) {
                rangeDeleteBefore = rangeResult.before;
                rangeRemovedIds = rangeResult.hints.removed ?? [];
                if (!text) {
                    this.editor.recordAndRender(rangeResult.before, rangeResult.hints);
                    return;
                }
                // Fall through — treeCursor is at the join point and we
                // will insert the text there.  Use the pre-deletion
                // snapshot for the undo entry.
            }
        }

        const node = this.editor.getCurrentBlockNode();
        if (!node || !this.editor.syntaxTree || !this.editor.syntaxTree.treeCursor) return;

        // When the cursor is on an html-block tag line (source view), edit
        // the openingTag / closingTag attribute directly.
        if (node.type === 'html-block' && this.editor.syntaxTree.treeCursor.tagPart) {
            const before = rangeDeleteBefore ?? this.editor.syntaxTree.toMarkdown();
            const attr =
                this.editor.syntaxTree.treeCursor.tagPart === 'opening'
                    ? 'openingTag'
                    : 'closingTag';
            const old = node.attributes[attr] || '';
            const left = old.substring(0, this.editor.syntaxTree.treeCursor.offset);
            const right = old.substring(this.editor.syntaxTree.treeCursor.offset);
            node.attributes[attr] = left + text + right;
            this.editor.syntaxTree.treeCursor = {
                nodeId: node.id,
                offset: left.length + text.length,
                tagPart: this.editor.syntaxTree.treeCursor.tagPart,
            };
            this.editor.recordAndRender(before, { updated: [node.id] });
            return;
        }

        // html-block containers without tagPart are structural (writing view).
        if (node.type === 'html-block' && node.children.length > 0) return;

        const before = rangeDeleteBefore ?? this.editor.syntaxTree.toMarkdown();

        // ── Table cell editing ──
        if (
            node.type === 'table' &&
            this.editor.syntaxTree.treeCursor.cellRow !== undefined &&
            this.editor.syntaxTree.treeCursor.cellCol !== undefined
        ) {
            const { cellRow, cellCol, offset } = this.editor.syntaxTree.treeCursor;
            const cellText = this.editor.tableManager.getTableCellText(node, cellRow, cellCol);
            const left = cellText.substring(0, offset);
            const right = cellText.substring(offset);
            this.editor.tableManager.setTableCellText(node, cellRow, cellCol, left + text + right);
            this.editor.syntaxTree.treeCursor = {
                nodeId: node.id,
                offset: left.length + text.length,
                cellRow,
                cellCol,
            };
            this.editor.recordAndRender(before, { updated: [node.id] });
            return;
        }

        const oldType = node.type;

        // Insert the text into the node's content at the cursor offset
        const left = node.content.substring(0, this.editor.syntaxTree.treeCursor.offset);
        const right = node.content.substring(this.editor.syntaxTree.treeCursor.offset);
        const newContent = left + text + right;

        // Code-block content is raw code, not markdown — skip re-parsing
        // to avoid misidentifying code lines as headings, lists, etc.
        if (node.type === 'code-block') {
            // In source view, edits target the full markdown text
            // (fences + language + content) stored in _sourceEditText.
            if (this.editor.viewMode === 'source' && node._sourceEditText !== null) {
                const srcLeft = node._sourceEditText.substring(
                    0,
                    this.editor.syntaxTree.treeCursor.offset,
                );
                const srcRight = node._sourceEditText.substring(
                    this.editor.syntaxTree.treeCursor.offset,
                );
                node._sourceEditText = srcLeft + text + srcRight;
                this.editor.syntaxTree.treeCursor = {
                    nodeId: node.id,
                    offset: srcLeft.length + text.length,
                };
            } else {
                node.content = newContent;
                this.editor.syntaxTree.treeCursor = {
                    nodeId: node.id,
                    offset: left.length + text.length,
                };
            }
            this.editor.recordAndRender(before, { updated: [node.id] });
            return;
        }

        // ── Multi-line paste ──
        // When the inserted text contains newlines, we must rebuild the
        // affected portion of the tree: combine the current node's markdown
        // prefix + left half, the pasted text, and the right half, then
        // re-parse all resulting lines as separate nodes.
        // Normalize Windows \r\n to \n before checking.
        const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (normalizedText.includes('\n')) {
            const prefixLen = this.editor.getPrefixLength(oldType, node.attributes);
            const mdPrefix = this.editor
                .buildMarkdownLine(oldType, '', node.attributes)
                .substring(0, prefixLen);
            const normalizedContent = left + normalizedText + right;
            const combined = mdPrefix + normalizedContent;

            // Parse into nodes via the currently active parser.
            const parsedNodes = this.editor._parseMultiLine(combined);

            if (parsedNodes.length === 0) {
                // Edge case: everything was blank lines — empty paragraph
                node.type = 'paragraph';
                node.content = '';
                node.attributes = {};
                this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
                this.editor.recordAndRender(before, { updated: [node.id] });
                return;
            }

            // Update the current node in-place with the first parsed result.
            const first = parsedNodes[0];
            node.type = first.type;
            node.content = first.content;
            node.attributes = first.attributes;

            // Splice remaining parsed nodes as new siblings after the
            // current node.
            const siblings = this.editor.getSiblings(node);
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
            this.editor.syntaxTree.treeCursor = {
                nodeId: lastNode.id,
                offset: lastNode.content.length,
            };

            /** @type {{ updated: string[], added?: string[], removed?: string[] }} */
            const hints = { updated: [node.id] };
            if (addedIds.length > 0) hints.added = addedIds;
            if (rangeRemovedIds.length > 0) hints.removed = rangeRemovedIds;
            this.editor.recordAndRender(before, hints);
            return;
        }

        // ── Single-line insert ──
        // Re-parse the full markdown line to detect type changes
        let newOffset;
        const wasBareText = !!node.attributes.bareText;
        const fullLine = this.editor.buildMarkdownLine(node.type, newContent, node.attributes);
        const parsed = this.editor._reparseLine(fullLine);

        if (parsed) {
            // Suppress code-block fence conversion during typing — the
            // fence pattern (```) is converted on Enter instead.
            if (parsed.type === 'code-block' && oldType !== 'code-block') {
                node.content = newContent;
                // Suppress image/linked-image block conversion during typing —
                // the inline tokenizer handles ![alt](src) within paragraphs.
            } else if (
                (parsed.type === 'image' || parsed.type === 'linked-image') &&
                oldType !== 'image' &&
                oldType !== 'linked-image'
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
            const oldPrefix = this.editor.getPrefixLength(oldType, node.attributes);
            const newPrefix = this.editor.getPrefixLength(node.type, node.attributes);
            const rawCursorPos = oldPrefix + left.length + text.length;
            newOffset = Math.max(0, rawCursorPos - newPrefix);
        }

        this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: newOffset };
        /** @type {{ updated: string[], removed?: string[] }} */
        const hints = { updated: [node.id] };
        if (rangeRemovedIds.length > 0) hints.removed = rangeRemovedIds;
        this.editor.recordAndRender(before, hints);
    }

    /**
     * Handles the Backspace key.
     */
    handleBackspace() {
        this.editor.syncCursorFromDOM();

        // If there is a non-collapsed selection, delete the entire range
        // instead of a single character.
        if (this.editor.treeRange) {
            const rangeResult = this.editor.rangeOperations.deleteSelectedRange();
            if (rangeResult) {
                this._cleanupEmptyNodeAfterDelete(rangeResult);
                this.editor.recordAndRender(rangeResult.before, rangeResult.hints);
                return;
            }
        }

        const node = this.editor.getCurrentBlockNode();
        if (!node || !this.editor.syntaxTree || !this.editor.syntaxTree.treeCursor) return;

        // When the cursor is on an html-block tag line (source view), edit
        // the openingTag / closingTag attribute directly.
        if (node.type === 'html-block' && this.editor.syntaxTree.treeCursor.tagPart) {
            if (this.editor.syntaxTree.treeCursor.offset > 0) {
                const before = this.editor.syntaxTree.toMarkdown();
                const attr =
                    this.editor.syntaxTree.treeCursor.tagPart === 'opening'
                        ? 'openingTag'
                        : 'closingTag';
                const old = node.attributes[attr] || '';
                const left = old.substring(0, this.editor.syntaxTree.treeCursor.offset - 1);
                const right = old.substring(this.editor.syntaxTree.treeCursor.offset);
                node.attributes[attr] = left + right;
                this.editor.syntaxTree.treeCursor = {
                    nodeId: node.id,
                    offset: left.length,
                    tagPart: this.editor.syntaxTree.treeCursor.tagPart,
                };
                this.editor.recordAndRender(before, { updated: [node.id] });
            }
            return;
        }

        // html-block containers without tagPart are structural (writing view).
        if (node.type === 'html-block' && node.children.length > 0) return;

        // ── Table cell backspace ──
        if (
            node.type === 'table' &&
            this.editor.syntaxTree.treeCursor.cellRow !== undefined &&
            this.editor.syntaxTree.treeCursor.cellCol !== undefined
        ) {
            const { cellRow, cellCol, offset } = this.editor.syntaxTree.treeCursor;
            if (offset > 0) {
                const before = this.editor.syntaxTree.toMarkdown();
                const cellText = this.editor.tableManager.getTableCellText(node, cellRow, cellCol);
                const left = cellText.substring(0, offset - 1);
                const right = cellText.substring(offset);
                this.editor.tableManager.setTableCellText(node, cellRow, cellCol, left + right);
                this.editor.syntaxTree.treeCursor = {
                    nodeId: node.id,
                    offset: left.length,
                    cellRow,
                    cellCol,
                };
                this.editor.recordAndRender(before, { updated: [node.id] });
            }
            // At offset 0 — no-op (don't merge cells or break table)
            return;
        }

        const before = this.editor.syntaxTree.toMarkdown();
        /** @type {{ updated?: string[], added?: string[], removed?: string[] }} */
        let renderHints = { updated: [node.id] };

        if (this.editor.syntaxTree.treeCursor.offset > 0) {
            // Delete one character before the cursor inside this node's content
            const left = node.content.substring(0, this.editor.syntaxTree.treeCursor.offset - 1);
            const right = node.content.substring(this.editor.syntaxTree.treeCursor.offset);
            const newContent = left + right;
            const oldType = node.type;

            // Code-block content is raw code — skip re-parsing.
            if (node.type === 'code-block') {
                // In source view, backspace targets _sourceEditText.
                if (this.editor.viewMode === 'source' && node._sourceEditText !== null) {
                    const srcLeft = node._sourceEditText.substring(
                        0,
                        this.editor.syntaxTree.treeCursor.offset - 1,
                    );
                    const srcRight = node._sourceEditText.substring(
                        this.editor.syntaxTree.treeCursor.offset,
                    );
                    node._sourceEditText = srcLeft + srcRight;
                    this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: srcLeft.length };
                } else {
                    node.content = newContent;
                    this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: left.length };
                }
                this.editor.recordAndRender(before, { updated: [node.id] });
                return;
            }

            // Re-parse to detect type changes
            let newOffset;
            const wasBareText = !!node.attributes.bareText;
            const fullLine = this.editor.buildMarkdownLine(node.type, newContent, node.attributes);
            const parsed = this.editor._reparseLine(fullLine);

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
                const oldPrefix = this.editor.getPrefixLength(oldType, node.attributes);
                const newPrefix = this.editor.getPrefixLength(node.type, node.attributes);
                newOffset = Math.max(0, oldPrefix + left.length - newPrefix);
            }

            this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: newOffset };
        } else {
            // Cursor is at the start of the node.

            // Code-block at offset 0: in source view the full text is in
            // _sourceEditText so offset 0 means the very start of the
            // opening fence — there is nothing before it to merge into
            // while still preserving the code-block structure, so this
            // is a no-op (consistent with html-block boundary behaviour).
            // In writing view with empty content, convert to paragraph.
            if (node.type === 'code-block') {
                if (this.editor.viewMode === 'source') {
                    // No-op in source view — the full text starts here.
                    this.editor.recordAndRender(before, renderHints);
                    return;
                }
                if (node.content === '') {
                    node.type = 'paragraph';
                    node.content = '';
                    node.attributes = {};
                    node._sourceEditText = null;
                    this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
                    this.editor.recordAndRender(before, { updated: [node.id] });
                    return;
                }
            }

            // If this is a heading (or blockquote, list-item, etc.) with an
            // empty content, convert it back to an empty paragraph.
            if (node.type !== 'paragraph' && node.content === '') {
                const wasListItem = node.type === 'list-item';
                node.type = 'paragraph';
                node.content = '';
                node.attributes = {};
                this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
                if (wasListItem) {
                    const siblings = this.editor.getSiblings(node);
                    const idx = siblings.indexOf(node);
                    const renumbered = this.editor.renumberAdjacentList(siblings, idx);
                    if (renumbered.length) {
                        renderHints = { updated: [node.id, ...renumbered] };
                    }
                }
            } else if (node.type !== 'paragraph') {
                // Non-paragraph with content and cursor at start: demote to paragraph,
                // keeping the content.
                const wasListItem = node.type === 'list-item';
                node.type = 'paragraph';
                node.attributes = {};
                this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
                if (wasListItem) {
                    const siblings = this.editor.getSiblings(node);
                    const idx = siblings.indexOf(node);
                    const renumbered = this.editor.renumberAdjacentList(siblings, idx);
                    if (renumbered.length) {
                        renderHints = { updated: [node.id, ...renumbered] };
                    }
                }
            } else {
                // Merge with the previous node (if any)
                const siblings = this.editor.getSiblings(node);
                const idx = siblings.indexOf(node);
                if (idx > 0) {
                    const prev = siblings[idx - 1];

                    if (prev.type === 'html-block' && prev.children.length > 0) {
                        // Previous sibling is a container html-block.
                        if (this.editor.viewMode === 'source') {
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
                            this.editor.syntaxTree.treeCursor = {
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
                        this.editor.syntaxTree.treeCursor = { nodeId: prev.id, offset: prevLen };
                        renderHints = { updated: [prev.id], removed: [node.id] };
                    }
                }
                // If idx === 0 there is nothing to merge into — do nothing.
            }
        }

        this.editor.recordAndRender(before, renderHints);
    }

    /**
     * Handles the Delete key.
     */
    handleDelete() {
        this.editor.syncCursorFromDOM();

        // If there is a non-collapsed selection, delete the entire range
        // instead of a single character.
        if (this.editor.treeRange) {
            const rangeResult = this.editor.rangeOperations.deleteSelectedRange();
            if (rangeResult) {
                this._cleanupEmptyNodeAfterDelete(rangeResult);
                this.editor.recordAndRender(rangeResult.before, rangeResult.hints);
                return;
            }
        }

        const node = this.editor.getCurrentBlockNode();
        if (!node || !this.editor.syntaxTree || !this.editor.syntaxTree.treeCursor) return;

        // When the cursor is on an html-block tag line (source view), edit
        // the openingTag / closingTag attribute directly.
        if (node.type === 'html-block' && this.editor.syntaxTree.treeCursor.tagPart) {
            const attr =
                this.editor.syntaxTree.treeCursor.tagPart === 'opening'
                    ? 'openingTag'
                    : 'closingTag';
            const old = node.attributes[attr] || '';
            if (this.editor.syntaxTree.treeCursor.offset < old.length) {
                const before = this.editor.syntaxTree.toMarkdown();
                const left = old.substring(0, this.editor.syntaxTree.treeCursor.offset);
                const right = old.substring(this.editor.syntaxTree.treeCursor.offset + 1);
                node.attributes[attr] = left + right;
                this.editor.syntaxTree.treeCursor = {
                    nodeId: node.id,
                    offset: left.length,
                    tagPart: this.editor.syntaxTree.treeCursor.tagPart,
                };
                this.editor.recordAndRender(before, { updated: [node.id] });
            }
            return;
        }

        // html-block containers without tagPart are structural (writing view).
        if (node.type === 'html-block' && node.children.length > 0) return;

        // ── Table cell delete ──
        if (
            node.type === 'table' &&
            this.editor.syntaxTree.treeCursor.cellRow !== undefined &&
            this.editor.syntaxTree.treeCursor.cellCol !== undefined
        ) {
            const { cellRow, cellCol, offset } = this.editor.syntaxTree.treeCursor;
            const cellText = this.editor.tableManager.getTableCellText(node, cellRow, cellCol);
            if (offset < cellText.length) {
                const before = this.editor.syntaxTree.toMarkdown();
                const left = cellText.substring(0, offset);
                const right = cellText.substring(offset + 1);
                this.editor.tableManager.setTableCellText(node, cellRow, cellCol, left + right);
                this.editor.syntaxTree.treeCursor = {
                    nodeId: node.id,
                    offset,
                    cellRow,
                    cellCol,
                };
                this.editor.recordAndRender(before, { updated: [node.id] });
            }
            // At end of cell — no-op
            return;
        }

        const before = this.editor.syntaxTree.toMarkdown();
        /** @type {{ updated?: string[], added?: string[], removed?: string[] }} */
        let renderHints = { updated: [node.id] };

        // For code-blocks in source-edit mode, the effective length is
        // the full source text, not just node.content.
        const effectiveLength =
            node.type === 'code-block' && node._sourceEditText !== null
                ? node._sourceEditText.length
                : node.content.length;

        if (this.editor.syntaxTree.treeCursor.offset < effectiveLength) {
            // Delete one character after the cursor
            const left = node.content.substring(0, this.editor.syntaxTree.treeCursor.offset);
            const right = node.content.substring(this.editor.syntaxTree.treeCursor.offset + 1);
            const newContent = left + right;
            const oldType = node.type;

            // Code-block content is raw code — skip re-parsing.
            if (node.type === 'code-block') {
                if (this.editor.viewMode === 'source' && node._sourceEditText !== null) {
                    const srcLeft = node._sourceEditText.substring(
                        0,
                        this.editor.syntaxTree.treeCursor.offset,
                    );
                    const srcRight = node._sourceEditText.substring(
                        this.editor.syntaxTree.treeCursor.offset + 1,
                    );
                    node._sourceEditText = srcLeft + srcRight;
                    this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: srcLeft.length };
                } else {
                    node.content = newContent;
                    this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: left.length };
                }
                this.editor.recordAndRender(before, { updated: [node.id] });
                return;
            }

            // Re-parse to detect type changes
            let newOffset;
            const wasBareText = !!node.attributes.bareText;
            const fullLine = this.editor.buildMarkdownLine(node.type, newContent, node.attributes);
            const parsed = this.editor._reparseLine(fullLine);

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
                const oldPrefix = this.editor.getPrefixLength(oldType, node.attributes);
                const newPrefix = this.editor.getPrefixLength(node.type, node.attributes);
                newOffset = Math.max(0, oldPrefix + left.length - newPrefix);
            }

            this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: newOffset };
        } else {
            // Cursor is at the end — merge with the next node.
            // If this is a code-block in source-edit mode, finalize it
            // first so the tree is consistent before merging.
            if (node.type === 'code-block' && node._sourceEditText !== null) {
                this.editor.finalizeCodeBlockSourceEdit(node);
            }

            const siblings = this.editor.getSiblings(node);
            const idx = siblings.indexOf(node);
            if (idx < siblings.length - 1) {
                const next = siblings[idx + 1];

                if (next.type === 'html-block' && next.children.length > 0) {
                    // Next sibling is a container html-block.
                    if (this.editor.viewMode === 'source') {
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
                        this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: curLen };
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
                    this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: curLen };
                    renderHints = { updated: [node.id], removed: [next.id] };
                }
            }
        }

        this.editor.recordAndRender(before, renderHints);
    }

    /**
     * Handles the Enter key — splits the current node at the cursor.
     */
    handleEnterKey() {
        this.editor.syncCursorFromDOM();

        // If there is a non-collapsed selection, delete it first, then
        // split at the resulting cursor position.
        /** @type {string|null} */
        let rangeDeleteBefore = null;
        /** @type {string[]} */
        let rangeRemovedIds = [];
        if (this.editor.treeRange) {
            const rangeResult = this.editor.rangeOperations.deleteSelectedRange();
            if (rangeResult) {
                rangeDeleteBefore = rangeResult.before;
                rangeRemovedIds = rangeResult.hints.removed ?? [];
                // Fall through — treeCursor now points at the join point.
            }
        }

        const node = this.editor.getCurrentBlockNode();
        if (!node || !this.editor.syntaxTree || !this.editor.syntaxTree.treeCursor) return;

        // html-block tag lines and containers are not splittable.
        if (
            node.type === 'html-block' &&
            (this.editor.syntaxTree.treeCursor.tagPart || node.children.length > 0)
        ) {
            return;
        }

        // ── Enter inside a table → move to next row, same column ──
        if (node.type === 'table' && this.editor.syntaxTree.treeCursor.cellRow !== undefined) {
            const { cellRow, cellCol } = this.editor.syntaxTree.treeCursor;
            const { totalRows } = this.editor.tableManager.getTableDimensions(node);
            if (cellRow < totalRows - 1) {
                this.editor.syntaxTree.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow: cellRow + 1,
                    cellCol,
                };
                this.editor.placeCursor();
            }
            // On last row — no-op
            return;
        }

        const before = rangeDeleteBefore ?? this.editor.syntaxTree.toMarkdown();

        // ── Early conversion: ```lang + Enter → code block ──
        // Walk the content character by character: 3+ backticks, optional
        // word chars (language), nothing else.  Enter supplies the newline.
        if (node.type === 'paragraph') {
            const text = node.content;
            let i = 0;
            while (i < text.length && text[i] === '`') i++;
            if (i >= 3) {
                const fenceCount = i;
                let language = '';
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
                    node.type = 'code-block';
                    node.content = '';
                    node.attributes = { language, fenceCount };
                    this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
                    this.editor.recordAndRender(before, { updated: [node.id] });
                    return;
                }
            }
        }

        // ── Enter inside a code block → insert newline ──
        if (node.type === 'code-block') {
            if (this.editor.viewMode === 'source' && node._sourceEditText !== null) {
                const srcLeft = node._sourceEditText.substring(
                    0,
                    this.editor.syntaxTree.treeCursor.offset,
                );
                const srcRight = node._sourceEditText.substring(
                    this.editor.syntaxTree.treeCursor.offset,
                );
                node._sourceEditText = `${srcLeft}\n${srcRight}`;
                this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: srcLeft.length + 1 };
            } else {
                const left = node.content.substring(0, this.editor.syntaxTree.treeCursor.offset);
                const right = node.content.substring(this.editor.syntaxTree.treeCursor.offset);
                node.content = `${left}\n${right}`;
                this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: left.length + 1 };
            }
            this.editor.recordAndRender(before, { updated: [node.id] });
            return;
        }

        const contentBefore = node.content.substring(0, this.editor.syntaxTree.treeCursor.offset);
        const contentAfter = node.content.substring(this.editor.syntaxTree.treeCursor.offset);

        // ── Enter inside a list item ──
        if (node.type === 'list-item') {
            if (contentBefore === '' && contentAfter === '') {
                // Empty list item → exit list: convert to empty paragraph
                const siblings = this.editor.getSiblings(node);
                const idx = siblings.indexOf(node);
                node.type = 'paragraph';
                node.content = '';
                node.attributes = {};
                this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
                const renumbered = this.editor.renumberAdjacentList(siblings, idx);
                /** @type {{ updated: string[], removed?: string[] }} */
                const listHints = { updated: [node.id, ...renumbered] };
                if (rangeRemovedIds.length > 0) listHints.removed = rangeRemovedIds;
                this.editor.recordAndRender(before, listHints);
                return;
            }

            // Split: current item keeps text before cursor,
            // new item gets text after cursor.
            node.content = contentBefore;
            /** @type {import('../parser/syntax-tree.js').NodeAttributes} */
            const newAttrs = {
                ordered: node.attributes.ordered,
                indent: node.attributes.indent || 0,
            };
            if (node.attributes.ordered) {
                newAttrs.number = (node.attributes.number || 1) + 1;
            }
            if (typeof node.attributes.checked === 'boolean') {
                newAttrs.checked = false;
            }
            const newItem = new SyntaxNode('list-item', contentAfter);
            newItem.attributes = newAttrs;
            const siblings = this.editor.getSiblings(node);
            const idx = siblings.indexOf(node);
            siblings.splice(idx + 1, 0, newItem);
            if (node.parent) newItem.parent = node.parent;

            // Renumber subsequent ordered items in the same run
            const renumbered = this.editor.renumberAdjacentList(siblings, idx);

            this.editor.syntaxTree.treeCursor = { nodeId: newItem.id, offset: 0 };
            /** @type {{ updated: string[], added: string[], removed?: string[] }} */
            const listHints = { updated: [node.id, ...renumbered], added: [newItem.id] };
            if (rangeRemovedIds.length > 0) listHints.removed = rangeRemovedIds;
            this.editor.recordAndRender(before, listHints);
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
        const newNode = new SyntaxNode('paragraph', contentAfter);
        const siblings = this.editor.getSiblings(node);
        const idx = siblings.indexOf(node);
        siblings.splice(idx + 1, 0, newNode);
        if (node.parent) newNode.parent = node.parent;

        this.editor.syntaxTree.treeCursor = { nodeId: newNode.id, offset: 0 };

        /** @type {{ updated: string[], added: string[], removed?: string[] }} */
        const hints = { updated: [node.id], added: [newNode.id] };
        if (rangeRemovedIds.length > 0) hints.removed = rangeRemovedIds;
        this.editor.recordAndRender(before, hints);
    }
}
