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
  get prefix() {
    return `image`;
  }

  get ariaLabel() {
    return `Insert Image`;
  }

  getTemplate() {
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

  afterBuild() {
    if (!this.dialog) return;

    // Browse button
    const browseBtn = this.dialog.querySelector(`.image-browse-btn`);
    if (browseBtn) {
      browseBtn.addEventListener(`click`, () => this.browse());
    }

    // Image preview on src change
    const srcInput = /** @type {HTMLInputElement} */ (this.dialog.querySelector(`#image-src`));
    if (srcInput) {
      srcInput.addEventListener(`input`, () => {
        this.updatePreview();
        this.updateRename();
      });
    }
  }

  /**
   * @param {Partial<ImageData>} [existing]
   */
  populateFields(existing) {
    const srcInput = this.getInput(`image-src`);
    const renameInput = this.getInput(`image-rename`);
    const altInput = this.getInput(`image-alt`);
    const hrefInput = this.getInput(`image-href`);
    const styleInput = this.getInput(`image-style`);
    const insertBtn = this.getInsertBtn();
    const heading = this.getHeading();

    if (existing?.src || existing?.alt || existing?.href) {
      srcInput.value = existing.src ?? ``;
      renameInput.value = this.extractFilename(existing.src ?? ``);
      altInput.value = existing.alt ?? ``;
      hrefInput.value = existing.href ?? ``;
      styleInput.value = existing.style ?? ``;
      if (insertBtn) insertBtn.textContent = `Update`;
      if (heading) heading.textContent = `Edit Image`;
    } else {
      srcInput.value = ``;
      renameInput.value = ``;
      altInput.value = ``;
      hrefInput.value = ``;
      styleInput.value = ``;
      if (insertBtn) insertBtn.textContent = `Insert`;
      if (heading) heading.textContent = `Insert Image`;
    }

    this.updatePreview();
  }

  /**
   * @returns {HTMLElement}
   */
  getFocusTarget() {
    return this.getInput(`image-src`);
  }

  submit() {
    const src = this.getInput(`image-src`).value.trim();
    const rename = this.getInput(`image-rename`).value.trim();
    const alt = this.getInput(`image-alt`).value.trim();
    const href = this.getInput(`image-href`).value.trim();
    const style = this.getInput(`image-style`).value.trim();

    if (!src) {
      this.getInput(`image-src`).focus();
      return;
    }

    this.closeWithResult({ alt, src, href, style, rename });
  }

  /**
   * Opens a file dialog to browse for an image.
   */
  async browse() {
    if (!window.electronAPI) return;

    const result = await window.electronAPI.browseForImage();
    if (result.success && result.filePath) {
      this.getInput(`image-src`).value = result.filePath;
      this.updateRename();
      this.updatePreview();
    }
  }

  /**
   * Updates the image preview.
   */
  updatePreview() {
    if (!this.dialog) return;

    const src = this.getInput(`image-src`).value.trim();
    const previewContainer = this.dialog.querySelector(`#image-preview-container`);
    const previewImg = /** @type {HTMLImageElement} */ (
      this.dialog.querySelector(`#image-preview`)
    );

    if (!previewContainer || !previewImg) return;

    if (src) {
      previewImg.src = src;
      previewImg.alt = this.getInput(`image-alt`).value.trim() || `Preview`;
      previewContainer.classList.add(`visible`);

      previewImg.onerror = () => {
        previewContainer.classList.remove(`visible`);
      };
      previewImg.onload = () => {
        previewContainer.classList.add(`visible`);
      };
    } else {
      previewContainer.classList.remove(`visible`);
    }
  }

  /**
   * Updates the rename field with the filename from the current src value.
   */
  updateRename() {
    if (!this.dialog) return;
    const src = this.getInput(`image-src`).value.trim();
    this.getInput(`image-rename`).value = this.extractFilename(src);
  }

  /**
   * Extracts the filename from a path or URL.
   * @param {string} src - Image source path or URL
   * @returns {string} The filename portion, or empty string if none
   */
  extractFilename(src) {
    if (!src) return ``;
    // Strip query string and fragment
    const clean = src.split(`?`)[0].split(`#`)[0];
    // Handle both forward and back slashes
    const parts = clean.split(/[/\\]/);
    return parts[parts.length - 1] || ``;
  }
}
