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

/**
 * Base class for all modal dialogs in the editor.
 *
 * @abstract
 */
export class BaseModal {
    constructor() {
        /** @type {HTMLDialogElement|null} */
        this.dialog = null;

        /** @type {boolean} */
        this._built = false;

        /**
         * Resolve function for the current open() promise.
         * @type {function(*): void}
         */
        this._resolve = () => {};

        /**
         * The element that had focus before the modal opened.
         * @type {HTMLElement|null}
         */
        this._previousFocus = null;
    }

    // ──────────────────────────────────────────────
    //  Hooks for subclasses
    // ──────────────────────────────────────────────

    /**
     * CSS class prefix used in selectors (e.g. `'link'`, `'image'`, `'table'`).
     * @abstract
     * @returns {string}
     */
    get _prefix() {
        throw new Error('Subclass must implement get _prefix()');
    }

    /**
     * The aria-label for the `<dialog>` element.
     * @abstract
     * @returns {string}
     */
    get _ariaLabel() {
        throw new Error('Subclass must implement get _ariaLabel()');
    }

    /**
     * Returns the inner HTML for the dialog.
     * Must include a `<form>`, header with `<h2>`, close/cancel/submit
     * buttons, and input fields — all using the modal's CSS prefix.
     * @abstract
     * @returns {string}
     */
    _getTemplate() {
        throw new Error('Subclass must implement _getTemplate()');
    }

    /**
     * Called after the dialog DOM has been built and the shared event
     * listeners have been wired up.  Subclasses may override this to
     * attach additional listeners (e.g. the image browse button).
     *
     * The default implementation is a no-op.
     */
    _afterBuild() {}

    /**
     * Populate the dialog fields from `existing` data and configure the
     * heading / button text for insert-vs-edit mode.
     *
     * @abstract
     * @param {*} _existing - Modal-specific data (may be null/undefined).
     */
    _populateFields(_existing) {
        throw new Error('Subclass must implement _populateFields()');
    }

    /**
     * Return the input element that should receive focus after the modal
     * opens.
     *
     * @abstract
     * @param {*} _existing - The same value passed to `open()`.
     * @returns {HTMLElement}
     */
    _getFocusTarget(_existing) {
        throw new Error('Subclass must implement _getFocusTarget()');
    }

    /**
     * Validate the form, gather the result data, and call
     * `this._closeWithResult(data)`.  If validation fails the method
     * should return without calling `_closeWithResult`.
     *
     * @abstract
     */
    _submit() {
        throw new Error('Subclass must implement _submit()');
    }

    // ──────────────────────────────────────────────
    //  Shared lifecycle
    // ──────────────────────────────────────────────

    /**
     * Lazily builds the dialog DOM the first time it is needed.
     */
    _build() {
        if (this._built) return;
        this._built = true;

        const dialog = document.createElement('dialog');
        dialog.className = `${this._prefix}-dialog`;
        dialog.setAttribute('aria-label', this._ariaLabel);
        dialog.innerHTML = this._getTemplate();

        const p = this._prefix;

        // Close on × or Cancel
        const closeBtn = dialog.querySelector(`.${p}-dialog-close`);
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this._cancel());
        }
        const cancelBtn = dialog.querySelector(`.${p}-btn--cancel`);
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

        this._afterBuild();
    }

    /**
     * Opens the modal.  If `existing` is provided, the modal is in edit
     * mode; otherwise it is in insert mode.
     *
     * @param {*} [existing] - Modal-specific data for pre-population.
     * @returns {Promise<*>} Resolves with result data, or `null` if cancelled.
     */
    open(existing) {
        this._build();
        if (!this.dialog || this.dialog.open) return Promise.resolve(null);

        this._populateFields(existing);

        this._previousFocus = /** @type {HTMLElement|null} */ (document.activeElement);
        this.dialog.showModal();

        const target = this._getFocusTarget(existing);
        if (target) target.focus();

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
        this._restoreFocus();
        this._resolve(null);
    }

    /**
     * Closes the modal and resolves the promise with `data`.
     * Subclasses call this from their `_submit()` implementation.
     *
     * @param {*} data
     */
    _closeWithResult(data) {
        if (this.dialog?.open) {
            this.dialog.close();
        }
        this._restoreFocus();
        this._resolve(data);
    }

    /**
     * Restores focus to the element that was active before the modal opened.
     */
    _restoreFocus() {
        if (this._previousFocus && typeof this._previousFocus.focus === 'function') {
            this._previousFocus.focus();
            this._previousFocus = null;
        }
    }

    /**
     * Gets an input element by id.
     * @param {string} id
     * @returns {HTMLInputElement}
     */
    _getInput(id) {
        return /** @type {HTMLInputElement} */ (this.dialog?.querySelector(`#${id}`));
    }

    /**
     * Returns the heading `<h2>` element inside the dialog header.
     * @returns {Element|null}
     */
    _getHeading() {
        return this.dialog?.querySelector(`.${this._prefix}-dialog-header h2`) ?? null;
    }

    /**
     * Returns the primary action button (Insert / Update).
     * @returns {HTMLButtonElement|null}
     */
    _getInsertBtn() {
        return /** @type {HTMLButtonElement|null} */ (
            this.dialog?.querySelector(`.${this._prefix}-btn--insert`) ?? null
        );
    }
}
