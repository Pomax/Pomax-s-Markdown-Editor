/**
 * @fileoverview Abstract base class for modal dialogs.
 *
 * Handles the shared lifecycle that every modal follows:
 *
 *   build (lazy) → open → populate → showModal → user interaction →
 *   submit / cancel → close → restore focus → resolve promise
 *
 * Subclasses override a small set of hooks to supply their own HTML
 * template, field population logic, and submit behaviour.
 */

import { BaseModalData } from '../../editor/types.js';

/**
 * Base class for all modal dialogs in the editor.
 *
 * @abstract
 */
export class BaseModal extends BaseModalData {
  constructor() {
    super();
  }

  /**
   * CSS class prefix used in selectors (e.g. `'link'`, `'image'`, `'table'`).
   * @abstract
   * @returns {string}
   */
  get prefix() {
    throw new Error(`Subclass must implement get prefix()`);
  }

  /**
   * The aria-label for the `<dialog>` element.
   * @abstract
   * @returns {string}
   */
  get ariaLabel() {
    throw new Error(`Subclass must implement get ariaLabel()`);
  }

  /**
   * Returns the inner HTML for the dialog.
   * Must include a `<form>`, header with `<h2>`, close/cancel/submit
   * buttons, and input fields — all using the modal's CSS prefix.
   * @abstract
   * @returns {string}
   */
  getTemplate() {
    throw new Error(`Subclass must implement getTemplate()`);
  }

  /**
   * Called after the dialog DOM has been built and the shared event
   * listeners have been wired up.  Subclasses may override this to
   * attach additional listeners (e.g. the image browse button).
   *
   * The default implementation is a no-op.
   */
  afterBuild() {}

  /**
   * Populate the dialog fields from `existing` data and configure the
   * heading / button text for insert-vs-edit mode.
   *
   * @abstract
   * @param {*} existing - Modal-specific data (may be undefined).
   */
  populateFields(existing) {
    throw new Error(`Subclass must implement populateFields()`);
  }

  /**
   * Return the input element that should receive focus after the modal
   * opens.
   *
   * @abstract
   * @param {*} existing - The same value passed to `open()`.
   * @returns {HTMLElement}
   */
  getFocusTarget(existing) {
    throw new Error(`Subclass must implement getFocusTarget()`);
  }

  /**
   * Validate the form, gather the result data, and call
   * `this.closeWithResult(data)`.  If validation fails the method
   * should return without calling `closeWithResult`.
   *
   * @abstract
   */
  submit() {
    throw new Error(`Subclass must implement submit()`);
  }

  /**
   * Lazily builds the dialog DOM the first time it is needed.
   */
  build() {
    if (this.built) return;
    this.built = true;

    const dialog = document.createElement(`dialog`);
    dialog.className = `${this.prefix}-dialog`;
    dialog.setAttribute(`aria-label`, this.ariaLabel);
    dialog.innerHTML = this.getTemplate();

    const p = this.prefix;

    // Close on × or Cancel
    const closeBtn = dialog.querySelector(`.${p}-dialog-close`);
    if (closeBtn) {
      closeBtn.addEventListener(`click`, () => this.cancel());
    }
    const cancelBtn = dialog.querySelector(`.${p}-btn--cancel`);
    if (cancelBtn) {
      cancelBtn.addEventListener(`click`, () => this.cancel());
    }

    // Submit handler
    const form = dialog.querySelector(`form`);
    if (form) {
      form.addEventListener(`submit`, (e) => {
        e.preventDefault();
        this.submit();
      });
    }

    // Close on backdrop click — but only when the mousedown also
    // started on the backdrop.  If the user mousedowns inside the
    // form (e.g. to select text in an input) and the mouseup drifts
    // onto the backdrop, the browser fires click with target=dialog;
    // we must not dismiss in that case.
    /** @type {EventTarget | undefined} */
    let mouseDownTarget;
    dialog.addEventListener(`mousedown`, (e) => {
      mouseDownTarget = e.target ?? undefined;
    });
    dialog.addEventListener(`click`, (e) => {
      if (e.target === dialog && mouseDownTarget === dialog) {
        this.cancel();
      }
      mouseDownTarget = undefined;
    });

    // Close on Escape key
    dialog.addEventListener(`cancel`, (e) => {
      e.preventDefault();
      this.cancel();
    });

    document.body.appendChild(dialog);
    this.dialog = dialog;

    this.afterBuild();
  }

  /**
   * Opens the modal.  If `existing` is provided, the modal is in edit
   * mode; otherwise it is in insert mode.
   *
   * @param {*} [existing] - Modal-specific data for pre-population.
   * @returns {Promise<*>} Resolves with result data, or `undefined` if cancelled.
   */
  open(existing) {
    this.build();
    if (!this.dialog || this.dialog.open) return Promise.resolve();

    this.populateFields(existing);

    this.previousFocus = /** @type {HTMLElement | undefined} */ (document.activeElement);
    this.dialog.showModal();

    const target = this.getFocusTarget(existing);
    if (target) target.focus();

    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  /**
   * Closes the modal without submitting.
   */
  cancel() {
    if (this.dialog?.open) {
      this.dialog.close();
    }
    this.restoreFocus();
    this.resolve();
  }

  /**
   * Closes the modal and resolves the promise with `data`.
   * Subclasses call this from their `submit()` implementation.
   *
   * @param {*} data
   */
  closeWithResult(data) {
    if (this.dialog?.open) {
      this.dialog.close();
    }
    this.restoreFocus();
    this.resolve(data);
  }

  /**
   * Restores focus to the element that was active before the modal opened.
   */
  restoreFocus() {
    if (this.previousFocus && typeof this.previousFocus.focus === `function`) {
      this.previousFocus.focus();
      this.previousFocus = undefined;
    }
  }

  /**
   * Gets an input element by id.
   * @param {string} id
   * @returns {HTMLInputElement}
   */
  getInput(id) {
    return /** @type {HTMLInputElement} */ (this.dialog?.querySelector(`#${id}`));
  }

  /**
   * Returns the heading `<h2>` element inside the dialog header.
   * @returns {Element | undefined}
   */
  getHeading() {
    return this.dialog?.querySelector(`.${this.prefix}-dialog-header h2`) ?? undefined;
  }

  /**
   * Returns the primary action button (Insert / Update).
   * @returns {HTMLButtonElement | undefined}
   */
  getInsertBtn() {
    return /** @type {HTMLButtonElement | undefined} */ (
      this.dialog?.querySelector(`.${this.prefix}-btn--insert`)
    );
  }
}
