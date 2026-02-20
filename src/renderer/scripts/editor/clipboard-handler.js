/**
 * @fileoverview Clipboard operations: cut, copy, and the helper that
 * extracts raw markdown from the current selection.
 */

/// <reference path="../../../types.d.ts" />

/**
 * Handles clipboard operations (cut, copy) for the editor.
 */
export class ClipboardHandler {
    /**
     * @param {import('./editor.js').Editor} editor
     */
    constructor(editor) {
        /** @type {import('./editor.js').Editor} */
        this.editor = editor;
    }

    /**
     * Returns the raw markdown text for the current selection range.
     * For same-node selections, returns the selected substring.
     * For cross-node selections, returns the full markdown of the
     * selected region (trimmed start/end, full intermediate nodes).
     *
     * @returns {string} The markdown text of the selection, or empty string.
     */
    getSelectedMarkdown() {
        this.editor.syncCursorFromDOM();
        if (!this.editor.treeRange || !this.editor.syntaxTree) return '';

        const { startNodeId, startOffset, endNodeId, endOffset } = this.editor.treeRange;
        const startNode = this.editor.syntaxTree.findNodeById(startNodeId);
        const endNode = this.editor.syntaxTree.findNodeById(endNodeId);
        if (!startNode || !endNode) return '';

        // Same node — just the selected substring.
        if (startNodeId === endNodeId) {
            return startNode.content.substring(startOffset, endOffset);
        }

        // Cross-node: collect the tail of the first node, full intermediate
        // nodes, and the head of the last node.
        const siblings = this.editor.getSiblings(startNode);
        const startIdx = siblings.indexOf(startNode);
        const endIdx = siblings.indexOf(endNode);
        if (startIdx === -1 || endIdx === -1) return '';

        const parts = [];
        parts.push(startNode.content.substring(startOffset));
        for (let i = startIdx + 1; i < endIdx; i++) {
            parts.push(siblings[i].toMarkdown());
        }
        parts.push(endNode.content.substring(0, endOffset));
        return parts.join('\n\n');
    }

    /**
     * Handles the `cut` event by writing the selected markdown to the
     * clipboard.  The actual DOM/tree mutation is handled by
     * `handleBeforeInput` for the `deleteByCut` input type.
     * @param {ClipboardEvent} event
     */
    handleCut(event) {
        this.editor.syncCursorFromDOM();
        if (!this.editor.treeRange) return; // nothing selected — let browser handle

        event.preventDefault();
        const markdown = this.getSelectedMarkdown();
        if (event.clipboardData) {
            event.clipboardData.setData('text/plain', markdown);
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
        this.editor.syncCursorFromDOM();
        if (!this.editor.treeRange) return; // nothing selected — let browser handle

        event.preventDefault();
        const markdown = this.getSelectedMarkdown();
        if (event.clipboardData) {
            event.clipboardData.setData('text/plain', markdown);
        }
    }
}
