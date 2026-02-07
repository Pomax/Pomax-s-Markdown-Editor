/**
 * @fileoverview Selection Manager for tracking and manipulating text selection.
 */

/**
 * @typedef {Object} SelectionState
 * @property {number} startLine - Start line (0-based)
 * @property {number} startColumn - Start column (0-based)
 * @property {number} endLine - End line (0-based)
 * @property {number} endColumn - End column (0-based)
 * @property {boolean} isCollapsed - Whether the selection is collapsed (cursor only)
 */

/**
 * Manages text selection within the editor.
 */
export class SelectionManager {
    /**
     * @param {import('./editor.js').Editor} editor - The editor instance
     */
    constructor(editor) {
        /** @type {import('./editor.js').Editor} */
        this.editor = editor;

        /** @type {SelectionState|null} */
        this.currentSelection = null;

        /** @type {import('../parser/syntax-tree.js').SyntaxNode|null} */
        this.currentNode = null;
    }

    /**
     * Updates the selection state from the DOM.
     */
    updateFromDOM() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            this.currentSelection = null;
            this.currentNode = null;
            return;
        }

        const range = selection.getRangeAt(0);
        const container = this.editor.container;

        // Get the start and end positions relative to the editor content
        const startPos = this.getPositionInContent(range.startContainer, range.startOffset);
        const endPos = this.getPositionInContent(range.endContainer, range.endOffset);

        this.currentSelection = {
            startLine: startPos.line,
            startColumn: startPos.column,
            endLine: endPos.line,
            endColumn: endPos.column,
            isCollapsed: selection.isCollapsed,
        };

        // Update current node
        this.updateCurrentNode();

        // Dispatch selection change event
        this.dispatchSelectionChange();
    }

    /**
     * Gets the line and column position for a DOM position.
     * @param {Node} node - The DOM node
     * @param {number} offset - The offset within the node
     * @returns {{line: number, column: number}}
     */
    getPositionInContent(node, offset) {
        const content = this.editor.container.innerText;
        const lines = content.split('\n');

        // Get the text offset from the start of the editor
        const textOffset = this.getTextOffset(node, offset);

        // Convert text offset to line and column
        let currentOffset = 0;
        for (let line = 0; line < lines.length; line++) {
            const lineLength = lines[line].length;
            if (currentOffset + lineLength >= textOffset) {
                return {
                    line,
                    column: textOffset - currentOffset,
                };
            }
            currentOffset += lineLength + 1; // +1 for newline
        }

        // Default to end of content
        return {
            line: lines.length - 1,
            column: lines[lines.length - 1]?.length ?? 0,
        };
    }

    /**
     * Gets the text offset from the start of the editor container.
     * @param {Node} node - The DOM node
     * @param {number} offset - The offset within the node
     * @returns {number}
     */
    getTextOffset(node, offset) {
        const container = this.editor.container;
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);

        let totalOffset = 0;
        let currentNode = walker.nextNode();

        while (currentNode) {
            if (currentNode === node) {
                return totalOffset + offset;
            }
            totalOffset += currentNode.textContent?.length ?? 0;
            currentNode = walker.nextNode();
        }

        return totalOffset;
    }

    /**
     * Updates the current node based on the selection.
     */
    updateCurrentNode() {
        if (!this.currentSelection || !this.editor.syntaxTree) {
            this.currentNode = null;
            return;
        }

        // Find the node at the current cursor position
        this.currentNode = this.editor.syntaxTree.findNodeAtPosition(
            this.currentSelection.startLine,
            this.currentSelection.startColumn,
        );
    }

    /**
     * Gets the current selection state.
     * @returns {SelectionState|null}
     */
    getSelection() {
        return this.currentSelection;
    }

    /**
     * Gets the current syntax tree node at the cursor.
     * @returns {import('../parser/syntax-tree.js').SyntaxNode|null}
     */
    getCurrentNode() {
        return this.currentNode;
    }

    /**
     * Sets the cursor position.
     * @param {number} line - The line number (0-based)
     * @param {number} column - The column number (0-based)
     */
    setCursorPosition(line, column) {
        this.setSelection({
            startLine: line,
            startColumn: column,
            endLine: line,
            endColumn: column,
        });
    }

    /**
     * Sets the selection range.
     * @param {{startLine: number, startColumn: number, endLine: number, endColumn: number}} range
     */
    setSelection(range) {
        const container = this.editor.container;
        const content = container.innerText;
        const lines = content.split('\n');

        // Convert line/column to text offset
        const startOffset = this.lineColumnToOffset(lines, range.startLine, range.startColumn);
        const endOffset = this.lineColumnToOffset(lines, range.endLine, range.endColumn);

        // Find the DOM positions
        const startPos = this.offsetToDOM(startOffset);
        const endPos = this.offsetToDOM(endOffset);

        if (!startPos || !endPos) return;

        // Set the selection
        const selection = window.getSelection();
        if (!selection) return;

        const domRange = document.createRange();
        domRange.setStart(startPos.node, startPos.offset);
        domRange.setEnd(endPos.node, endPos.offset);

        selection.removeAllRanges();
        selection.addRange(domRange);

        this.updateFromDOM();
    }

    /**
     * Converts line and column to text offset.
     * @param {string[]} lines - The lines of text
     * @param {number} line - The line number (0-based)
     * @param {number} column - The column number (0-based)
     * @returns {number}
     */
    lineColumnToOffset(lines, line, column) {
        let offset = 0;
        for (let i = 0; i < line && i < lines.length; i++) {
            offset += lines[i].length + 1; // +1 for newline
        }
        return offset + Math.min(column, lines[line]?.length ?? 0);
    }

    /**
     * Converts a text offset to a DOM position.
     * @param {number} targetOffset - The target text offset
     * @returns {{node: Node, offset: number}|null}
     */
    offsetToDOM(targetOffset) {
        const container = this.editor.container;
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);

        let currentOffset = 0;
        let currentNode = walker.nextNode();

        while (currentNode) {
            const nodeLength = currentNode.textContent?.length ?? 0;
            if (currentOffset + nodeLength >= targetOffset) {
                return {
                    node: currentNode,
                    offset: targetOffset - currentOffset,
                };
            }
            currentOffset += nodeLength;
            currentNode = walker.nextNode();
        }

        // If we didn't find the position, return the end of the content
        const lastChild = container.lastChild;
        if (lastChild && lastChild.nodeType === Node.TEXT_NODE) {
            return {
                node: lastChild,
                offset: lastChild.textContent?.length ?? 0,
            };
        }

        return null;
    }

    /**
     * Dispatches a custom event for selection changes.
     */
    dispatchSelectionChange() {
        const event = new CustomEvent('editor:selectionchange', {
            detail: {
                selection: this.currentSelection,
                node: this.currentNode,
            },
        });
        this.editor.container.dispatchEvent(event);
    }
}
