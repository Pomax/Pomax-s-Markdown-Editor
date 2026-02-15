/**
 * @fileoverview Link insertion/editing modal dialog.
 * Displays a modal overlay for inserting or editing a markdown link.
 */

/// <reference path="../../../types.d.ts" />

import { BaseModal } from '../modal/base-modal.js';

/**
 * @typedef {Object} LinkData
 * @property {string} text - The visible link text
 * @property {string} url - The link URL
 */

/**
 * A modal dialog for inserting or editing links.
 * @extends {BaseModal}
 */
export class LinkModal extends BaseModal {
    get _prefix() {
        return 'link';
    }

    get _ariaLabel() {
        return 'Edit Link';
    }

    _getTemplate() {
        return `
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
    }

    /**
     * @param {Partial<LinkData>} [existing]
     */
    _populateFields(existing) {
        const textInput = this._getInput('link-text');
        const urlInput = this._getInput('link-url');
        const insertBtn = this._getInsertBtn();
        const heading = this._getHeading();

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
    }

    /**
     * @param {Partial<LinkData>} [existing]
     * @returns {HTMLElement}
     */
    _getFocusTarget(existing) {
        // Focus the URL input when editing (text is usually fine), text input when inserting
        return existing?.text || existing?.url
            ? this._getInput('link-url')
            : this._getInput('link-text');
    }

    _submit() {
        const text = this._getInput('link-text').value.trim();
        const url = this._getInput('link-url').value.trim();

        if (!url) {
            this._getInput('link-url').focus();
            return;
        }

        this._closeWithResult({ text: text || url, url });
    }
}
