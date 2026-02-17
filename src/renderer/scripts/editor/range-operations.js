/**
 * @fileoverview Range (selection) operations: deleting a selected range
 * and handling Ctrl+A (select all within context).
 */

/// <reference path="../../../types.d.ts" />

import { SyntaxNode } from '../parser/syntax-tree.js';

/**
 * Handles selection-range operations on the syntax tree.
 */
export class RangeOperations {
    /**
     * @param {import('./editor.js').Editor} editor
     */
    constructor(editor) {
        /** @type {import('./editor.js').Editor} */
        this.editor = editor;
    }

    /**
     * Returns an ordered flat list of leaf nodes within the given sibling
     * list, optionally restricted to the range between `startId` and `endId`.
     * Both endpoints are inclusive.  Only considers nodes at the same
     * nesting level (siblings).
     *
     * @param {SyntaxNode[]} siblings
     * @param {string} startId
     * @param {string} endId
     * @returns {SyntaxNode[]}
     */
    _getNodesBetween(siblings, startId, endId) {
        const result = [];
        let collecting = false;
        for (const node of siblings) {
            if (node.id === startId) {
                collecting = true;
            }
            if (collecting) {
                result.push(node);
            }
            if (node.id === endId) {
                break;
            }
        }
        return result;
    }

    /**
     * Deletes the currently selected range (stored in `editor.treeRange`)
     * from the syntax tree.  Handles same-node and cross-node selections.
     *
     * After deletion the cursor is placed at the join point and
     * `editor.treeRange` is cleared.
     *
     * @returns {{ before: string, hints: { updated?: string[], added?: string[], removed?: string[] } } | null}
     *     The markdown snapshot before the edit and render hints, or null
     *     if there was no range to delete.
     */
    deleteSelectedRange() {
        if (!this.editor.treeRange || !this.editor.syntaxTree) return null;

        const { startNodeId, startOffset, endNodeId, endOffset } = this.editor.treeRange;
        const startNode = this.editor.syntaxTree.findNodeById(startNodeId);
        const endNode = this.editor.syntaxTree.findNodeById(endNodeId);
        if (!startNode || !endNode) return null;

        const before = this.editor.syntaxTree.toMarkdown();

        // ── Same-node selection ──
        if (startNodeId === endNodeId) {
            const left = startNode.content.substring(0, startOffset);
            const right = startNode.content.substring(endOffset);
            startNode.content = left + right;
            this.editor.treeCursor = { nodeId: startNode.id, offset: startOffset };
            this.editor.treeRange = null;
            return { before, hints: { updated: [startNode.id] } };
        }

        // ── Cross-node selection ──
        // Both nodes must share the same parent (sibling list).
        const siblings = this.editor.getSiblings(startNode);
        const startIdx = siblings.indexOf(startNode);
        const endIdx = siblings.indexOf(endNode);

        // Safety: if nodes are not in the same sibling list, bail.
        if (startIdx === -1 || endIdx === -1) return null;

        // Ensure correct ordering (startIdx should be < endIdx).
        // The DOM selection direction is always start < end in document
        // order, so this should hold, but guard just in case.
        const [firstIdx, firstNode, firstOffset, lastIdx, lastNode, lastOffset] =
            startIdx <= endIdx
                ? [startIdx, startNode, startOffset, endIdx, endNode, endOffset]
                : [endIdx, endNode, endOffset, startIdx, startNode, startOffset];

        // Trim the first node: keep content before the selection start.
        const leftContent = firstNode.content.substring(0, firstOffset);

        // Trim the last node: keep content after the selection end.
        const rightContent = lastNode.content.substring(lastOffset);

        // Merge: first node gets left + right content
        firstNode.content = leftContent + rightContent;

        // Collect IDs of intermediate and end nodes to remove.
        /** @type {string[]} */
        const removedIds = [];
        for (let i = firstIdx + 1; i <= lastIdx; i++) {
            removedIds.push(siblings[i].id);
            siblings[i].parent = null;
        }
        // Remove them from the siblings array.
        siblings.splice(firstIdx + 1, lastIdx - firstIdx);

        this.editor.treeCursor = { nodeId: firstNode.id, offset: firstOffset };
        this.editor.treeRange = null;
        return { before, hints: { updated: [firstNode.id], removed: removedIds } };
    }

    /**
     * Handles Ctrl+A — selects all content within the current block-level
     * context rather than the entire document.
     *
     * Context scoping:
     * - Code block → selects all code inside the block
     * - List item → selects the list item text
     * - Paragraph / heading / blockquote → selects the whole element
     * - Text inside inline formatting (bold, italic…) in focused mode →
     *   selects the containing block-level node, not just the span
     * - Table cell → selects the cell content
     */
    handleSelectAll() {
        this.editor.syncCursorFromDOM();
        const node = this.editor.getCurrentNode();
        if (!node) return;

        // ── Table cell: select just the cell content ──
        if (
            node.type === 'table' &&
            this.editor.viewMode === 'focused' &&
            this.editor.treeCursor?.cellRow !== undefined &&
            this.editor.treeCursor?.cellCol !== undefined
        ) {
            const cellText = this.editor.tableManager.getTableCellText(
                node,
                this.editor.treeCursor.cellRow,
                this.editor.treeCursor.cellCol,
            );
            // Place selection spanning the whole cell via DOM
            const nodeEl = this.editor.container.querySelector(`[data-node-id="${node.id}"]`);
            if (nodeEl) {
                this.editor.tableManager.placeTableCellCursor(
                    /** @type {HTMLElement} */ (nodeEl),
                    this.editor.treeCursor.cellRow,
                    this.editor.treeCursor.cellCol,
                    0,
                );
                // Extend to end
                const sel = window.getSelection();
                if (sel && cellText.length > 0) {
                    // Re-select the full cell range using the DOM
                    const range = sel.getRangeAt(0);
                    const contentEl = range.startContainer.parentElement?.closest('td, th');
                    if (contentEl) {
                        const domRange = document.createRange();
                        domRange.selectNodeContents(contentEl);
                        sel.removeAllRanges();
                        sel.addRange(domRange);
                    }
                }
            }
            // Update treeRange from the new DOM selection.
            this.editor.syncCursorFromDOM();
            return;
        }

        // For all other block-level nodes, select the entire node content
        // by setting a DOM range over the content element.
        const nodeEl = this.editor.container.querySelector(`[data-node-id="${node.id}"]`);
        if (!nodeEl) return;

        const contentEl = nodeEl.querySelector('.md-content') ?? nodeEl;
        const sel = window.getSelection();
        if (!sel) return;

        const domRange = document.createRange();
        domRange.selectNodeContents(contentEl);
        sel.removeAllRanges();
        sel.addRange(domRange);

        // Refresh tree cursor/range from the new DOM selection.
        this.editor.syncCursorFromDOM();
    }
}
