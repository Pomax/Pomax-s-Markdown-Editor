/**
 * @fileoverview Link insertion/editing modal dialog.
 * Displays a modal overlay for inserting or editing a markdown link.
 */

/// <reference path="../../../types.d.ts" />

/**
 * @typedef {Object} LinkData
 * @property {string} text - The visible link text
 * @property {string} url - The link URL
 */

/**
 * A modal dialog for inserting or editing links.
 */
export class LinkModal {
    constructor() {
        /** @type {HTMLDialogElement|null} */
        this.dialog = null;

        /** @type {boolean} */
        this._built = false;

        /**
         * Resolve function for the current open() promise.
         * @type {function(LinkData|null): void}
         */
        this._resolve = () => {};
    }

    /**
     * Lazily builds the dialog DOM the first time it is needed.
     */
    _build() {
        if (this._built) return;
        this._built = true;

        const dialog = document.createElement('dialog');
        dialog.className = 'link-dialog';
        dialog.setAttribute('aria-label', 'Edit Link');

        dialog.innerHTML = `
            <form method="dialog" class="link-form">
                <header class="link-dialog-header">
                    <h2>Insert Link</h2>
                    <button type="button" class="link-dialog-close" aria-label="Close">&times;</button>
                </header>
                <div class="link-dialog-body">
                    <div class="link-field">
                        <label for="link-text">Link text</label>
                        <input type="text" id="link-text" name="linkText" placeholder="Display text" autocomplete="off">
                    </div>
                    <div class="link-field">
                        <label for="link-url">URL</label>
                        <input type="text" id="link-url" name="linkUrl" placeholder="https://example.com" autocomplete="off">
                    </div>
                </div>
                <footer class="link-dialog-footer">
                    <button type="button" class="link-btn link-btn--cancel">Cancel</button>
                    <button type="submit" class="link-btn link-btn--insert">Insert</button>
                </footer>
            </form>
        `;

        // Close on × or Cancel
        const closeBtn = dialog.querySelector('.link-dialog-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this._cancel());
        }
        const cancelBtn = dialog.querySelector('.link-btn--cancel');
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

    /**
     * Opens the link modal.
     * If `existing` is provided, the fields are pre-populated for editing.
     * Returns a promise that resolves with the link data, or null if cancelled.
     *
     * @param {Partial<LinkData>} [existing] - Existing link data for editing
     * @returns {Promise<LinkData|null>}
     */
    open(existing) {
        this._build();
        if (!this.dialog || this.dialog.open) return Promise.resolve(null);

        const textInput = this._getInput('link-text');
        const urlInput = this._getInput('link-url');
        const insertBtn = /** @type {HTMLButtonElement} */ (
            this.dialog.querySelector('.link-btn--insert')
        );
        const heading = this.dialog.querySelector('.link-dialog-header h2');

        if (existing?.text || existing?.url) {
            textInput.value = existing.text ?? '';
            urlInput.value = existing.url ?? '';
            if (insertBtn) insertBtn.textContent = 'Update';
            if (heading) heading.textContent = 'Edit Link';
        } else {
            textInput.value = '';
            urlInput.value = '';
            if (insertBtn) insertBtn.textContent = 'Insert';
            if (heading) heading.textContent = 'Insert Link';
        }

        this.dialog.showModal();

        // Focus the URL input when editing (text is usually fine), text input when inserting
        if (existing?.text || existing?.url) {
            urlInput.focus();
        } else {
            textInput.focus();
        }

        return new Promise((resolve) => {
            this._resolve = resolve;
        });
    }

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
        const text = this._getInput('link-text').value.trim();
        const url = this._getInput('link-url').value.trim();

        if (!url) {
            this._getInput('link-url').focus();
            return;
        }

        if (this.dialog?.open) {
            this.dialog.close();
        }

        this._resolve({ text: text || url, url });
    }

    /**
     * Gets an input element by id.
     * @param {string} id
     * @returns {HTMLInputElement}
     */
    _getInput(id) {
        return /** @type {HTMLInputElement} */ (this.dialog?.querySelector(`#${id}`));
    }
}
