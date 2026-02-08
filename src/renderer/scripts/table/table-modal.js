/**
 * @fileoverview Table insertion/editing modal dialog.
 * Displays a modal overlay for inserting or editing a markdown table.
 * Allows the user to specify the number of rows and columns.
 * When editing an existing table, pre-populates with current dimensions
 * and warns if shrinking would lose data.
 */

/**
 * @typedef {Object} TableData
 * @property {number} rows - Number of body rows (not counting the header)
 * @property {number} columns - Number of columns
 * @property {string[][]} cells - 2-D array [row][col] including the header row
 */

/**
 * A modal dialog for inserting or editing tables.
 */
export class TableModal {
    constructor() {
        /** @type {HTMLDialogElement|null} */
        this.dialog = null;

        /** @type {boolean} */
        this._built = false;

        /**
         * Resolve function for the current open() promise.
         * @type {function(TableData|null): void}
         */
        this._resolve = () => {};

        /**
         * The existing table data when editing (null for insert).
         * @type {TableData|null}
         */
        this._existing = null;
    }

    // ──────────────────────────────────────────────
    //  DOM construction (lazy)
    // ──────────────────────────────────────────────

    /**
     * Lazily builds the dialog DOM the first time it is needed.
     */
    _build() {
        if (this._built) return;
        this._built = true;

        const dialog = document.createElement('dialog');
        dialog.className = 'table-dialog';
        dialog.setAttribute('aria-label', 'Insert Table');

        dialog.innerHTML = `
            <form method="dialog" class="table-form">
                <header class="table-dialog-header">
                    <h2>Insert Table</h2>
                    <button type="button" class="table-dialog-close" aria-label="Close">&times;</button>
                </header>
                <div class="table-dialog-body">
                    <div class="table-field">
                        <label for="table-columns">Columns</label>
                        <input type="number" id="table-columns" name="tableColumns"
                               min="1" max="20" value="3" autocomplete="off">
                    </div>
                    <div class="table-field">
                        <label for="table-rows">Rows <span class="table-field-hint">(not counting the header)</span></label>
                        <input type="number" id="table-rows" name="tableRows"
                               min="1" max="100" value="3" autocomplete="off">
                    </div>
                </div>
                <footer class="table-dialog-footer">
                    <button type="button" class="table-btn table-btn--cancel">Cancel</button>
                    <button type="submit" class="table-btn table-btn--insert">Insert</button>
                </footer>
            </form>
        `;

        // Close on × or Cancel
        const closeBtn = dialog.querySelector('.table-dialog-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this._cancel());
        }
        const cancelBtn = dialog.querySelector('.table-btn--cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this._cancel());
        }

        // Submit handler
        const form = dialog.querySelector('form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this._submit();
            });
        }

        // Close on backdrop click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                this._cancel();
            }
        });

        // Close on Escape key
        dialog.addEventListener('cancel', (e) => {
            e.preventDefault();
            this._cancel();
        });

        document.body.appendChild(dialog);
        this.dialog = dialog;
    }

    // ──────────────────────────────────────────────
    //  Public API
    // ──────────────────────────────────────────────

    /**
     * Opens the table modal.
     * If `existing` is provided, the fields are pre-populated for editing.
     * Returns a promise that resolves with the table data, or null if cancelled.
     *
     * @param {TableData|null} [existing] - Existing table data for editing
     * @returns {Promise<TableData|null>}
     */
    open(existing = null) {
        this._build();
        if (!this.dialog || this.dialog.open) return Promise.resolve(null);

        this._existing = existing;

        const colsInput = this._getInput('table-columns');
        const rowsInput = this._getInput('table-rows');
        const insertBtn = /** @type {HTMLButtonElement} */ (
            this.dialog.querySelector('.table-btn--insert')
        );
        const heading = this.dialog.querySelector('.table-dialog-header h2');

        if (existing) {
            colsInput.value = String(existing.columns);
            rowsInput.value = String(existing.rows);
            if (insertBtn) insertBtn.textContent = 'Update';
            if (heading) heading.textContent = 'Edit Table';
        } else {
            colsInput.value = '3';
            rowsInput.value = '3';
            if (insertBtn) insertBtn.textContent = 'Insert';
            if (heading) heading.textContent = 'Insert Table';
        }

        this.dialog.showModal();
        colsInput.focus();
        colsInput.select();

        return new Promise((resolve) => {
            this._resolve = resolve;
        });
    }

    // ──────────────────────────────────────────────
    //  Internal helpers
    // ──────────────────────────────────────────────

    /**
     * Closes the modal without submitting.
     */
    _cancel() {
        if (this.dialog?.open) {
            this.dialog.close();
        }
        this._resolve(null);
    }

    /**
     * Submits the modal data.
     */
    _submit() {
        const newCols = Number.parseInt(this._getInput('table-columns').value, 10) || 1;
        const newRows = Number.parseInt(this._getInput('table-rows').value, 10) || 1;

        // Clamp to valid range
        const cols = Math.max(1, Math.min(20, newCols));
        const rows = Math.max(1, Math.min(100, newRows));

        if (this._existing) {
            const oldCols = this._existing.columns;
            const oldRows = this._existing.rows;

            // Check whether the user is shrinking the table — data may be lost
            if (cols < oldCols || rows < oldRows) {
                const wouldLose = this._wouldLoseData(this._existing, rows, cols);
                if (wouldLose) {
                    const ok = window.confirm(
                        'Reducing the table size will remove data from the deleted rows or columns. Continue?',
                    );
                    if (!ok) return;
                }
            }

            // Build new cells by copying what fits and trimming or expanding
            const cells = this._resizeCells(this._existing.cells, rows, cols);

            if (this.dialog?.open) {
                this.dialog.close();
            }
            this._resolve({ rows, columns: cols, cells });
        } else {
            // New table — empty cells
            const cells = this._emptyCells(rows, cols);

            if (this.dialog?.open) {
                this.dialog.close();
            }
            this._resolve({ rows, columns: cols, cells });
        }
    }

    /**
     * Checks whether shrinking to `newRows`×`newCols` would discard non-empty
     * cell data.
     * @param {TableData} data
     * @param {number} newRows
     * @param {number} newCols
     * @returns {boolean}
     */
    _wouldLoseData(data, newRows, newCols) {
        // Total rows in cells array = header (1) + body rows
        const totalOldRows = data.cells.length;
        const keepRows = newRows + 1; // +1 for header

        for (let r = 0; r < totalOldRows; r++) {
            const row = data.cells[r];
            for (let c = 0; c < row.length; c++) {
                const trimmed = (row[c] ?? '').trim();
                if (!trimmed) continue;

                // Is this cell outside the new bounds?
                if (r >= keepRows || c >= newCols) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Resizes a 2-D cells array to `newRows`×`newCols`, preserving existing
     * data that fits.
     * @param {string[][]} oldCells - [header + body rows][cols]
     * @param {number} newRows - body rows (not counting header)
     * @param {number} newCols
     * @returns {string[][]}
     */
    _resizeCells(oldCells, newRows, newCols) {
        const totalRows = newRows + 1; // +1 for header
        const cells = [];

        for (let r = 0; r < totalRows; r++) {
            const row = [];
            for (let c = 0; c < newCols; c++) {
                if (r < oldCells.length && c < (oldCells[r]?.length ?? 0)) {
                    row.push(oldCells[r][c]);
                } else {
                    row.push(r === 0 ? `Header ${c + 1}` : '');
                }
            }
            cells.push(row);
        }

        return cells;
    }

    /**
     * Creates an empty cells array.
     * @param {number} rows - body rows
     * @param {number} cols
     * @returns {string[][]}
     */
    _emptyCells(rows, cols) {
        const cells = [];

        // Header row
        const header = [];
        for (let c = 0; c < cols; c++) {
            header.push(`Header ${c + 1}`);
        }
        cells.push(header);

        // Body rows
        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) {
                row.push('');
            }
            cells.push(row);
        }

        return cells;
    }

    /**
     * Gets an input element by id.
     * @param {string} id
     * @returns {HTMLInputElement}
     */
    _getInput(id) {
        return /** @type {HTMLInputElement} */ (this.dialog?.querySelector(`#${id}`));
    }

    // ──────────────────────────────────────────────
    //  Static helpers for table ↔ markdown conversion
    // ──────────────────────────────────────────────

    /**
     * Parses raw markdown table content into a TableData object.
     * @param {string} content - The raw table markdown (node.content)
     * @returns {TableData}
     */
    static parseTableContent(content) {
        const lines = content.split('\n').filter((l) => l.trim());
        // A separator line contains only pipes, dashes, colons, and spaces,
        // and must include at least one dash.
        /** @param {string} l */
        const isSeparator = (l) => /^[\s|:-]+$/.test(l) && l.includes('-');
        const dataLines = lines.filter((l) => !isSeparator(l));

        /** @type {string[][]} */
        const cells = [];

        for (const line of dataLines) {
            const row = line
                .split('|')
                .filter((_, i, a) => i > 0 && i < a.length - 1) // trim leading/trailing empty splits
                .map((cell) => cell.trim());
            cells.push(row);
        }

        const columns = cells.length > 0 ? cells[0].length : 0;
        const rows = Math.max(0, cells.length - 1); // subtract header

        return { rows, columns, cells };
    }

    /**
     * Converts a TableData object to markdown table text.
     * @param {TableData} data
     * @returns {string}
     */
    static tableDateToMarkdown(data) {
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
}
