/**
 * @fileoverview Image insertion/editing modal dialog.
 * Displays a modal overlay for inserting or editing an image in the document.
 * Allows the user to type an image path or browse for one, specify alt text,
 * and optionally provide a link URL for a linked image.
 */

/// <reference path="../../../types.d.ts" />

import { BaseModal } from '../modal/base-modal.js';

/**
 * @typedef {Object} ImageData
 * @property {string} alt - Alt text for the image
 * @property {string} src - Image file path or URL
 * @property {string} href - Optional link URL for linked images
 * @property {string} style - Optional inline CSS style string
 * @property {string} rename - New filename for the image (empty string if unchanged)
 */

/**
 * A modal dialog for inserting or editing images.
 * @extends {BaseModal}
 */
export class ImageModal extends BaseModal {
    get _prefix() {
        return 'image';
    }

    get _ariaLabel() {
        return 'Insert Image';
    }

    _getTemplate() {
        return `
            <form method="dialog" class="image-form">
                <header class="image-dialog-header">
                    <h2>Insert Image</h2>
                    <button type="button" class="image-dialog-close" aria-label="Close">&times;</button>
                </header>
                <div class="image-dialog-body">
                    <div class="image-field">
                        <label for="image-src">Image location</label>
                        <div class="image-src-group">
                            <input type="text" id="image-src" name="imageSrc" placeholder="Path or URL" autocomplete="off">
                            <button type="button" class="image-browse-btn">Browse…</button>
                        </div>
                    </div>
                    <div class="image-field">
                        <label for="image-rename">Filename</label>
                        <input type="text" id="image-rename" name="imageRename" placeholder="Rename the image file" autocomplete="off">
                    </div>
                    <div class="image-field">
                        <label for="image-alt">Alt text</label>
                        <input type="text" id="image-alt" name="imageAlt" autocomplete="off">
                    </div>
                    <div class="image-field">
                        <label for="image-href">Link URL <span class="image-field-hint">(optional)</span></label>
                        <input type="text" id="image-href" name="imageHref" autocomplete="off">
                    </div>
                    <div class="image-field">
                        <label for="image-style">Style <span class="image-field-hint">(optional)</span></label>
                        <input type="text" id="image-style" name="imageStyle" autocomplete="off">
                    </div>
                    <div class="image-preview-container" id="image-preview-container">
                        <img id="image-preview" class="image-preview" alt="">
                    </div>
                </div>
                <footer class="image-dialog-footer">
                    <button type="button" class="image-btn image-btn--cancel">Cancel</button>
                    <button type="submit" class="image-btn image-btn--insert">Insert</button>
                </footer>
            </form>
        `;
    }

    _afterBuild() {
        if (!this.dialog) return;

        // Browse button
        const browseBtn = this.dialog.querySelector('.image-browse-btn');
        if (browseBtn) {
            browseBtn.addEventListener('click', () => this._browse());
        }

        // Image preview on src change
        const srcInput = /** @type {HTMLInputElement} */ (this.dialog.querySelector('#image-src'));
        if (srcInput) {
            srcInput.addEventListener('input', () => {
                this._updatePreview();
                this._updateRename();
            });
        }
    }

    /**
     * @param {Partial<ImageData>} [existing]
     */
    _populateFields(existing) {
        const srcInput = this._getInput('image-src');
        const renameInput = this._getInput('image-rename');
        const altInput = this._getInput('image-alt');
        const hrefInput = this._getInput('image-href');
        const styleInput = this._getInput('image-style');
        const insertBtn = this._getInsertBtn();
        const heading = this._getHeading();

        if (existing?.src || existing?.alt || existing?.href) {
            srcInput.value = existing.src ?? '';
            renameInput.value = this._extractFilename(existing.src ?? '');
            altInput.value = existing.alt ?? '';
            hrefInput.value = existing.href ?? '';
            styleInput.value = existing.style ?? '';
            if (insertBtn) insertBtn.textContent = 'Update';
            if (heading) heading.textContent = 'Edit Image';
        } else {
            srcInput.value = '';
            renameInput.value = '';
            altInput.value = '';
            hrefInput.value = '';
            styleInput.value = '';
            if (insertBtn) insertBtn.textContent = 'Insert';
            if (heading) heading.textContent = 'Insert Image';
        }

        this._updatePreview();
    }

    /**
     * @returns {HTMLElement}
     */
    _getFocusTarget() {
        return this._getInput('image-src');
    }

    _submit() {
        const src = this._getInput('image-src').value.trim();
        const rename = this._getInput('image-rename').value.trim();
        const alt = this._getInput('image-alt').value.trim();
        const href = this._getInput('image-href').value.trim();
        const style = this._getInput('image-style').value.trim();

        if (!src) {
            this._getInput('image-src').focus();
            return;
        }

        this._closeWithResult({ alt, src, href, style, rename });
    }

    /**
     * Opens a file dialog to browse for an image.
     */
    async _browse() {
        if (!window.electronAPI) return;

        const result = await window.electronAPI.browseForImage();
        if (result.success && result.filePath) {
            this._getInput('image-src').value = result.filePath;
            this._updateRename();
            this._updatePreview();
        }
    }

    /**
     * Updates the image preview.
     */
    _updatePreview() {
        if (!this.dialog) return;

        const src = this._getInput('image-src').value.trim();
        const previewContainer = this.dialog.querySelector('#image-preview-container');
        const previewImg = /** @type {HTMLImageElement} */ (
            this.dialog.querySelector('#image-preview')
        );

        if (!previewContainer || !previewImg) return;

        if (src) {
            previewImg.src = src;
            previewImg.alt = this._getInput('image-alt').value.trim() || 'Preview';
            previewContainer.classList.add('visible');

            previewImg.onerror = () => {
                previewContainer.classList.remove('visible');
            };
            previewImg.onload = () => {
                previewContainer.classList.add('visible');
            };
        } else {
            previewContainer.classList.remove('visible');
        }
    }

    /**
     * Updates the rename field with the filename from the current src value.
     */
    _updateRename() {
        if (!this.dialog) return;
        const src = this._getInput('image-src').value.trim();
        this._getInput('image-rename').value = this._extractFilename(src);
    }

    /**
     * Extracts the filename from a path or URL.
     * @param {string} src - Image source path or URL
     * @returns {string} The filename portion, or empty string if none
     */
    _extractFilename(src) {
        if (!src) return '';
        // Strip query string and fragment
        const clean = src.split('?')[0].split('#')[0];
        // Handle both forward and back slashes
        const parts = clean.split(/[/\\]/);
        return parts[parts.length - 1] || '';
    }
}
