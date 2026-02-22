/**
 * @fileoverview Table cell editing helpers: reading/writing cell text,
 * computing cell positions from the DOM, placing the cursor inside a cell,
 * and handling Tab navigation between cells.
 */

/// <reference path="../../../types.d.ts" />

import { TableModal } from '../table/table-modal.js';

/**
 * Manages table-specific editing operations.
 */
export class TableManager {
    /**
     * @param {import('./editor.js').Editor} editor
     */
    constructor(editor) {
        /** @type {import('./editor.js').Editor} */
        this.editor = editor;
    }

    /**
     * Returns the text of a specific table cell.
     * @param {import('../parser/syntax-tree.js').SyntaxNode} node
     * @param {number} row - Row index (0 = header row)
     * @param {number} col - Column index
     * @returns {string}
     */
    getTableCellText(node, row, col) {
        const data = TableModal.parseTableContent(node.content);
        return data.cells[row]?.[col] ?? '';
    }

    /**
     * Replaces a single cell's text and rebuilds the table markdown.
     * @param {import('../parser/syntax-tree.js').SyntaxNode} node
     * @param {number} row - Row index (0 = header)
     * @param {number} col - Column index
     * @param {string} newText - New cell content
     */
    setTableCellText(node, row, col, newText) {
        const data = TableModal.parseTableContent(node.content);
        if (data.cells[row]) {
            data.cells[row][col] = newText;
        }
        node.content = this.buildTableMarkdown(data);
    }

    /**
     * Returns the dimensions of a table node.
     * @param {import('../parser/syntax-tree.js').SyntaxNode} node
     * @returns {{totalRows: number, columns: number}}
     */
    getTableDimensions(node) {
        const data = TableModal.parseTableContent(node.content);
        return { totalRows: data.cells.length, columns: data.columns };
    }

    /**
     * Appends an empty row to a table node and rebuilds the markdown.
     * @param {import('../parser/syntax-tree.js').SyntaxNode} node
     * @returns {number} The row index of the new row
     */
    tableAddRow(node) {
        const data = TableModal.parseTableContent(node.content);
        const newRow = Array.from({ length: data.columns }, () => '');
        data.cells.push(newRow);
        data.rows++;
        node.content = this.buildTableMarkdown(data);
        return data.cells.length - 1;
    }

    /**
     * Determines the cell (row, col) the DOM cursor is in for a table node.
     * Walks up from the cursor node to find the `<th>` or `<td>` element,
     * then counts its position within the table.
     * @param {HTMLElement} nodeElement - The `[data-node-id]` wrapper
     * @param {Node} cursorNode - The DOM node the cursor is in
     * @param {number} cursorOffset - The offset within cursorNode
     * @returns {{cellRow: number, cellCol: number, offset: number}}
     */
    computeTableCellPosition(nodeElement, cursorNode, cursorOffset) {
        // Walk up to find the <th> or <td>
        /** @type {HTMLElement|null} */
        let cell = null;
        /** @type {Node|null} */
        let el = cursorNode;
        while (el && el !== nodeElement) {
            if (el.nodeType === Node.ELEMENT_NODE) {
                const tag = /** @type {HTMLElement} */ (el).tagName;
                if (tag === 'TH' || tag === 'TD') {
                    cell = /** @type {HTMLElement} */ (el);
                    break;
                }
            }
            el = el.parentNode;
        }

        if (!cell) {
            return { cellRow: 0, cellCol: 0, offset: 0 };
        }

        // Determine column index
        const row = /** @type {HTMLTableRowElement} */ (cell.parentNode);
        const cellCol = Array.from(row.cells).indexOf(/** @type {HTMLTableCellElement} */ (cell));

        // Determine row index (header row = 0, body rows = 1+)
        let cellRow = 0;
        const tbody = nodeElement.querySelector('tbody');
        if (cell.tagName === 'TH') {
            cellRow = 0;
        } else if (tbody) {
            const bodyRow = /** @type {HTMLTableRowElement} */ (cell.parentNode);
            cellRow = Array.from(tbody.rows).indexOf(bodyRow) + 1;
        }

        // Compute text offset within the cell
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null);
        let offset = 0;
        let textNode = walker.nextNode();
        while (textNode) {
            if (textNode === cursorNode) {
                return { cellRow, cellCol, offset: offset + cursorOffset };
            }
            offset += textNode.textContent?.length ?? 0;
            textNode = walker.nextNode();
        }

        return { cellRow, cellCol, offset: Math.min(cursorOffset, offset) };
    }

    /**
     * Places the DOM cursor inside a specific table cell.
     * @param {HTMLElement} nodeElement - The `[data-node-id]` wrapper
     * @param {number} row - Row index (0 = header)
     * @param {number} col - Column index
     * @param {number} offset - Character offset within the cell text
     */
    placeTableCellCursor(nodeElement, row, col, offset) {
        /** @type {HTMLTableCellElement|null} */
        let cell = null;
        if (row === 0) {
            const thead = nodeElement.querySelector('thead');
            if (thead) {
                const headerRow = thead.querySelector('tr');
                cell = headerRow?.cells[col] ?? null;
            }
        } else {
            const tbody = nodeElement.querySelector('tbody');
            if (tbody) {
                const bodyRow = tbody.rows[row - 1];
                cell = bodyRow?.cells[col] ?? null;
            }
        }
        if (!cell) return;

        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null);
        let remaining = offset;
        let textNode = walker.nextNode();

        // If the cell is empty, place cursor at the start of the cell element
        if (!textNode) {
            const sel = window.getSelection();
            if (sel) {
                const range = document.createRange();
                range.selectNodeContents(cell);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
            return;
        }

        while (textNode) {
            const len = textNode.textContent?.length ?? 0;
            if (remaining <= len) {
                const sel = window.getSelection();
                if (sel) {
                    const range = document.createRange();
                    range.setStart(textNode, remaining);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
                return;
            }
            remaining -= len;
            textNode = walker.nextNode();
        }

        // Offset beyond available text — place at end
        const sel = window.getSelection();
        if (sel) {
            const range = document.createRange();
            range.selectNodeContents(cell);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }

    /**
     * Converts table data (cells array) to markdown table text.
     * @param {{rows: number, columns: number, cells: string[][]}} data
     * @returns {string}
     */
    buildTableMarkdown(data) {
        const { columns, cells } = data;
        const lines = [];

        for (let r = 0; r < cells.length; r++) {
            const row = cells[r];
            const paddedCells = [];

            for (let c = 0; c < columns; c++) {
                paddedCells.push(` ${row[c] ?? ''} `);
            }

            lines.push(`|${paddedCells.join('|')}|`);

            // After the header row, insert the separator line
            if (r === 0) {
                const sep = [];
                for (let c = 0; c < columns; c++) {
                    sep.push('---');
                }
                lines.push(`| ${sep.join(' | ')} |`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Handles Tab / Shift+Tab inside a table — moves between cells.
     * Tab on the last cell creates a new row.
     * @param {boolean} shiftKey - True for Shift+Tab (move backward)
     */
    handleTableTab(shiftKey) {
        const node = this.editor.getCurrentNode();
        if (
            !node ||
            !this.editor.treeCursor ||
            !this.editor.syntaxTree ||
            this.editor.treeCursor.cellRow === undefined ||
            this.editor.treeCursor.cellCol === undefined
        )
            return;

        const { cellRow, cellCol } = this.editor.treeCursor;
        const { totalRows, columns } = this.getTableDimensions(node);

        if (shiftKey) {
            // Move to previous cell
            if (cellCol > 0) {
                this.editor.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow,
                    cellCol: cellCol - 1,
                };
                this.editor.syntaxTree.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow,
                    cellCol: cellCol - 1,
                };
            } else if (cellRow > 0) {
                this.editor.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow: cellRow - 1,
                    cellCol: columns - 1,
                };
                this.editor.syntaxTree.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow: cellRow - 1,
                    cellCol: columns - 1,
                };
            }
            // On first cell — no-op
        } else {
            // Move to next cell
            if (cellCol < columns - 1) {
                this.editor.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow,
                    cellCol: cellCol + 1,
                };
                this.editor.syntaxTree.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow,
                    cellCol: cellCol + 1,
                };
            } else if (cellRow < totalRows - 1) {
                this.editor.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow: cellRow + 1,
                    cellCol: 0,
                };
                this.editor.syntaxTree.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow: cellRow + 1,
                    cellCol: 0,
                };
            } else {
                // Last cell — add a new row
                const before = this.editor.syntaxTree.toMarkdown();
                const newRowIdx = this.tableAddRow(node);
                this.editor.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow: newRowIdx,
                    cellCol: 0,
                };
                this.editor.syntaxTree.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow: newRowIdx,
                    cellCol: 0,
                };
                this.editor.recordAndRender(before, { updated: [node.id] });
                return;
            }
        }

        this.editor.placeCursor();
    }
}
