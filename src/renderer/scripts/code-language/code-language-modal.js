/**
 * @fileoverview Code-block language editing modal dialog.
 * Displays a small modal with a single input field so the user can set
 * or change the language tag of a fenced code block.
 */

/// <reference path="../../../types.d.ts" />

import { BaseModal } from '../modal/base-modal.js';

/**
 * @typedef {Object} CodeLanguageData
 * @property {string} language - The language identifier (e.g. "js", "python")
 */

/**
 * A modal dialog for setting or changing a code block's language tag.
 * @extends {BaseModal}
 */
export class CodeLanguageModal extends BaseModal {
    get _prefix() {
        return 'code-language';
    }

    get _ariaLabel() {
        return 'Edit Code Language';
    }

    _getTemplate() {
        return `
            <form method="dialog" class="code-language-form">
                <header class="code-language-dialog-header">
                    <h2>Set Language</h2>
                    <button type="button" class="code-language-dialog-close" aria-label="Close">&times;</button>
                </header>
                <div class="code-language-dialog-body">
                    <div class="code-language-field">
                        <label for="code-language-input">Language</label>
                        <input type="text" id="code-language-input" name="language" placeholder="e.g. js, python, html" autocomplete="off">
                    </div>
                </div>
                <footer class="code-language-dialog-footer">
                    <button type="button" class="code-language-btn code-language-btn--cancel">Cancel</button>
                    <button type="submit" class="code-language-btn code-language-btn--insert">Apply</button>
                </footer>
            </form>
        `;
    }

    /**
     * @param {Partial<CodeLanguageData>} [existing]
     */
    _populateFields(existing) {
        const input = this._getInput('code-language-input');
        const heading = this._getHeading();
        const btn = this._getInsertBtn();

        if (existing?.language) {
            input.value = existing.language;
            if (heading) heading.textContent = 'Edit Language';
            if (btn) btn.textContent = 'Update';
        } else {
            input.value = '';
            if (heading) heading.textContent = 'Set Language';
            if (btn) btn.textContent = 'Apply';
        }
    }

    /**
     * @param {Partial<CodeLanguageData>} [_existing]
     * @returns {HTMLElement}
     */
    _getFocusTarget(_existing) {
        return this._getInput('code-language-input');
    }

    _submit() {
        const language = this._getInput('code-language-input').value.trim();
        // Allow empty string — this clears the language tag.
        this._closeWithResult({ language });
    }
}
