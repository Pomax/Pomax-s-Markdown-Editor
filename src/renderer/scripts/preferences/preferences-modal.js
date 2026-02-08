/**
 * @fileoverview Preferences modal dialog.
 * Displays a modal overlay that lets the user adjust application settings.
 * Settings are persisted to SQLite via the main-process IPC bridge.
 */

/// <reference path="../../../types.d.ts" />

/**
 * Default view mode for the editor on startup.
 * @type {import('../editor/editor.js').ViewMode}
 */
const DEFAULT_VIEW_MODE = 'focused';

/**
 * Default page-width values matching the CSS default (A4 = 210 mm fixed).
 * @type {{ useFixed: boolean, width: number, unit: 'px' | 'mm' }}
 */
const DEFAULT_PAGE_WIDTH = { useFixed: true, width: 210, unit: 'mm' };

/**
 * Default margin values (in mm) matching the CSS defaults.
 * @type {{ top: number, right: number, bottom: number, left: number }}
 */
const DEFAULT_MARGINS = { top: 25, right: 25, bottom: 25, left: 25 };

/**
 * Default page colors matching the CSS defaults.
 * @type {{ pageBg: string, pageText: string }}
 */
const DEFAULT_COLORS = { pageBg: '#ffffff', pageText: '#212529' };

/**
 * Default TOC visibility (enabled by default).
 * @type {boolean}
 */
const DEFAULT_TOC_VISIBLE = true;

/**
 * Default TOC sidebar position.
 * @type {import('../toc/toc.js').TocPosition}
 */
const DEFAULT_TOC_POSITION = 'left';

/**
 * A modal dialog for editing application preferences.
 */
export class PreferencesModal {
    constructor() {
        /** @type {HTMLDialogElement|null} */
        this.dialog = null;

        /** @type {boolean} */
        this._built = false;

        /** @type {boolean} */
        this._linkTopBottom = false;

        /** @type {boolean} */
        this._linkLeftRight = false;

        /** @type {boolean} */
        this._linkAll = false;
    }

    /**
     * Lazily builds the dialog DOM the first time it is needed.
     */
    _build() {
        if (this._built) return;
        this._built = true;

        const dialog = document.createElement('dialog');
        dialog.className = 'preferences-dialog';
        dialog.setAttribute('aria-label', 'Preferences');

        dialog.innerHTML = `
            <form method="dialog" class="preferences-form">
                <header class="preferences-header">
                    <h2>Preferences</h2>
                    <button type="button" class="preferences-close" aria-label="Close">&times;</button>
                </header>
                <div class="preferences-layout">
                    <nav class="preferences-nav">
                        <ul class="preferences-nav-list">
                            <li><a href="#" class="preferences-nav-link active" data-section="pref-default-view">Default View</a></li>
                            <li><a href="#" class="preferences-nav-link" data-section="pref-page-width">Page Width</a></li>
                            <li><a href="#" class="preferences-nav-link" data-section="pref-margins">Margins</a></li>
                            <li><a href="#" class="preferences-nav-link" data-section="pref-colors">Colors</a></li>
                            <li><a href="#" class="preferences-nav-link" data-section="pref-toc">Table of Contents</a></li>
                        </ul>
                    </nav>
                    <div class="preferences-body">
                        <fieldset class="preferences-fieldset" id="pref-default-view">
                            <legend>Default View</legend>
                        <div class="default-view-row">
                            <label for="default-view-select">View mode on startup</label>
                            <select id="default-view-select" name="defaultView">
                                <option value="focused">Focused</option>
                                <option value="source">Source</option>
                            </select>
                        </div>
                    </fieldset>
                    <fieldset class="preferences-fieldset" id="pref-page-width">
                        <legend>Page Width</legend>
                        <div class="page-width-row">
                            <label class="page-width-toggle">
                                <input type="checkbox" id="page-width-fixed" checked>
                                <span>Use fixed width (A4 – 210 mm)</span>
                            </label>
                        </div>
                        <div class="page-width-custom" id="page-width-custom">
                            <label for="page-width-value">Width</label>
                            <div class="page-width-input-group">
                                <input type="number" id="page-width-value" name="pageWidthValue" min="100" max="2000" step="1">
                                <select id="page-width-unit" name="pageWidthUnit">
                                    <option value="mm">mm</option>
                                    <option value="px">px</option>
                                </select>
                            </div>
                        </div>
                    </fieldset>
                    <fieldset class="preferences-fieldset" id="pref-margins">
                        <legend>Margins</legend>
                        <div class="margins-grid">
                            <div class="margin-field margin-field--top">
                                <label for="margin-top">Top</label>
                                <div class="margin-input-group">
                                    <input type="number" id="margin-top" name="marginTop" min="0" max="100" step="1">
                                    <span class="margin-unit">mm</span>
                                </div>
                            </div>
                            <div class="margin-field margin-field--left">
                                <label for="margin-left">Left</label>
                                <div class="margin-input-group">
                                    <input type="number" id="margin-left" name="marginLeft" min="0" max="100" step="1">
                                    <span class="margin-unit">mm</span>
                                </div>
                            </div>
                            <div class="margin-field margin-field--right">
                                <label for="margin-right">Right</label>
                                <div class="margin-input-group">
                                    <input type="number" id="margin-right" name="marginRight" min="0" max="100" step="1">
                                    <span class="margin-unit">mm</span>
                                </div>
                            </div>
                            <div class="margin-field margin-field--bottom">
                                <label for="margin-bottom">Bottom</label>
                                <div class="margin-input-group">
                                    <input type="number" id="margin-bottom" name="marginBottom" min="0" max="100" step="1">
                                    <span class="margin-unit">mm</span>
                                </div>
                            </div>
                        </div>
                        <div class="margins-links">
                            <label class="link-toggle">
                                <input type="checkbox" id="link-top-bottom">
                                <span>Link top &amp; bottom</span>
                            </label>
                            <label class="link-toggle">
                                <input type="checkbox" id="link-left-right">
                                <span>Link left &amp; right</span>
                            </label>
                            <label class="link-toggle">
                                <input type="checkbox" id="link-all">
                                <span>Link all</span>
                            </label>
                        </div>
                    </fieldset>
                    <fieldset class="preferences-fieldset" id="pref-colors">
                        <legend>Colors</legend>
                        <div class="colors-grid">
                            <div class="color-field">
                                <label for="color-page-bg">Page background</label>
                                <div class="color-input-group">
                                    <input type="color" id="color-page-bg" name="colorPageBg">
                                    <input type="text" id="color-page-bg-hex" class="color-hex-input" maxlength="7" placeholder="#ffffff">
                                </div>
                            </div>
                            <div class="color-field">
                                <label for="color-page-text">Text</label>
                                <div class="color-input-group">
                                    <input type="color" id="color-page-text" name="colorPageText">
                                    <input type="text" id="color-page-text-hex" class="color-hex-input" maxlength="7" placeholder="#212529">
                                </div>
                            </div>
                        </div>
                    </fieldset>
                    <fieldset class="preferences-fieldset" id="pref-toc">
                        <legend>Table of Contents</legend>
                        <div class="toc-settings-row">
                            <label class="toc-visible-toggle">
                                <input type="checkbox" id="toc-visible" checked>
                                <span>Show table of contents</span>
                            </label>
                        </div>
                        <div class="toc-position-row">
                            <label for="toc-position-select">Sidebar position</label>
                            <select id="toc-position-select" name="tocPosition">
                                <option value="left">Left</option>
                                <option value="right">Right</option>
                            </select>
                        </div>
                    </fieldset>
                    </div>
                </div>
                <footer class="preferences-footer">
                    <button type="button" class="preferences-btn preferences-btn--cancel">Cancel</button>
                    <button type="submit" class="preferences-btn preferences-btn--save">Save</button>
                </footer>
            </form>
        `;

        // Close on × or Cancel
        const closeBtn = dialog.querySelector('.preferences-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        const cancelBtn = dialog.querySelector('.preferences-btn--cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.close());
        }

        // Save handler
        const form = dialog.querySelector('form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this._save();
            });
        }

        // Close on backdrop click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                this.close();
            }
        });

        // Close on Escape key
        dialog.addEventListener('cancel', () => {
            this.close();
        });

        // Wire up link toggles
        this._setupLinkToggles(dialog);

        // Wire up margin input syncing
        this._setupMarginInputs(dialog);

        // Wire up color input syncing
        this._setupColorInputs(dialog);

        // Wire up page-width toggle
        this._setupPageWidth(dialog);

        // Wire up sidebar navigation links
        this._setupNavLinks(dialog);

        document.body.appendChild(dialog);
        this.dialog = dialog;
    }

    /**
     * Sets up the link-toggle checkboxes so they interact correctly.
     * @param {HTMLDialogElement} dialog
     */
    _setupLinkToggles(dialog) {
        const linkTB = /** @type {HTMLInputElement} */ (dialog.querySelector('#link-top-bottom'));
        const linkLR = /** @type {HTMLInputElement} */ (dialog.querySelector('#link-left-right'));
        const linkAll = /** @type {HTMLInputElement} */ (dialog.querySelector('#link-all'));

        linkTB.addEventListener('change', () => {
            this._linkTopBottom = linkTB.checked;
            if (linkTB.checked) {
                this._syncValue(dialog, 'margin-top', 'margin-bottom');
            }
            // If both TB and LR are on, turn on All
            if (linkTB.checked && linkLR.checked) {
                linkAll.checked = true;
                this._linkAll = true;
                this._syncAllToValue(dialog, this._getInput(dialog, 'margin-top').value);
            }
            if (!linkTB.checked && linkAll.checked) {
                linkAll.checked = false;
                this._linkAll = false;
            }
            this._updateDisabledState(dialog);
        });

        linkLR.addEventListener('change', () => {
            this._linkLeftRight = linkLR.checked;
            if (linkLR.checked) {
                this._syncValue(dialog, 'margin-left', 'margin-right');
            }
            if (linkTB.checked && linkLR.checked) {
                linkAll.checked = true;
                this._linkAll = true;
                this._syncAllToValue(dialog, this._getInput(dialog, 'margin-top').value);
            }
            if (!linkLR.checked && linkAll.checked) {
                linkAll.checked = false;
                this._linkAll = false;
            }
            this._updateDisabledState(dialog);
        });

        linkAll.addEventListener('change', () => {
            this._linkAll = linkAll.checked;
            if (linkAll.checked) {
                linkTB.checked = true;
                linkLR.checked = true;
                this._linkTopBottom = true;
                this._linkLeftRight = true;
                this._syncAllToValue(dialog, this._getInput(dialog, 'margin-top').value);
            } else {
                linkTB.checked = false;
                linkLR.checked = false;
                this._linkTopBottom = false;
                this._linkLeftRight = false;
            }
            this._updateDisabledState(dialog);
        });
    }

    /**
     * Sets up input event listeners on margin fields for linked syncing.
     * @param {HTMLDialogElement} dialog
     */
    _setupMarginInputs(dialog) {
        const ids = ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'];
        for (const id of ids) {
            this._getInput(dialog, id).addEventListener('input', () => {
                this._handleMarginInput(dialog, id);
            });
        }
    }

    /**
     * Sets up color picker ↔ hex text input syncing.
     * @param {HTMLDialogElement} dialog
     */
    _setupColorInputs(dialog) {
        const pairs = [
            { picker: 'color-page-bg', hex: 'color-page-bg-hex' },
            { picker: 'color-page-text', hex: 'color-page-text-hex' },
        ];

        for (const { picker, hex } of pairs) {
            const pickerEl = this._getInput(dialog, picker);
            const hexEl = this._getInput(dialog, hex);

            pickerEl.addEventListener('input', () => {
                hexEl.value = pickerEl.value;
            });

            hexEl.addEventListener('input', () => {
                const expanded = this._expandHex(hexEl.value);
                if (expanded) {
                    pickerEl.value = expanded;
                }
            });
        }
    }

    /**
     * Sets up the page-width fixed-toggle so the custom row shows/hides.
     * @param {HTMLDialogElement} dialog
     */
    _setupPageWidth(dialog) {
        const fixedCb = /** @type {HTMLInputElement} */ (dialog.querySelector('#page-width-fixed'));
        const customRow = dialog.querySelector('#page-width-custom');

        fixedCb.addEventListener('change', () => {
            if (customRow) {
                customRow.classList.toggle('hidden', fixedCb.checked);
            }
        });
    }

    /**
     * Sets up the sidebar navigation links so clicking a link scrolls the
     * corresponding fieldset into view and highlights the active link.
     * Also observes scroll position to update the active link automatically.
     * @param {HTMLDialogElement} dialog
     */
    _setupNavLinks(dialog) {
        const links = dialog.querySelectorAll('.preferences-nav-link');
        const body = dialog.querySelector('.preferences-body');
        if (!body) return;

        // Click handler — scroll the target section to the top of the body
        for (const link of links) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const sectionId = /** @type {HTMLElement} */ (link).dataset.section;
                if (!sectionId) return;
                const section = dialog.querySelector(`#${sectionId}`);
                if (!section) return;

                section.scrollIntoView({ behavior: 'instant', block: 'start' });

                // Update active state
                for (const l of links) l.classList.remove('active');
                link.classList.add('active');
            });
        }

        // Observe scroll to highlight whichever section is currently visible
        body.addEventListener('scroll', () => {
            this._updateActiveNavLink(dialog);
        });
    }

    /**
     * Updates the active nav link based on which fieldset is closest to the
     * top of the scrollable body.
     * @param {HTMLDialogElement} dialog
     */
    _updateActiveNavLink(dialog) {
        const body = dialog.querySelector('.preferences-body');
        if (!body) return;

        const bodyRect = body.getBoundingClientRect();
        const links = dialog.querySelectorAll('.preferences-nav-link');
        /** @type {Element|null} */
        let closest = null;
        let closestDist = Number.POSITIVE_INFINITY;

        for (const link of links) {
            const sectionId = /** @type {HTMLElement} */ (link).dataset.section;
            if (!sectionId) continue;
            const section = dialog.querySelector(`#${sectionId}`);
            if (!section) continue;

            const dist = Math.abs(section.getBoundingClientRect().top - bodyRect.top);
            if (dist < closestDist) {
                closestDist = dist;
                closest = link;
            }
        }

        if (closest) {
            for (const l of links) l.classList.remove('active');
            closest.classList.add('active');
        }
    }

    /**
     * Enables or disables margin inputs based on the current link state.
     * When linked, the secondary input is disabled (bottom follows top,
     * right follows left). When "link all" is on, only top is editable.
     * @param {HTMLDialogElement} dialog
     */
    _updateDisabledState(dialog) {
        const bottomInput = this._getInput(dialog, 'margin-bottom');
        const rightInput = this._getInput(dialog, 'margin-right');
        const leftInput = this._getInput(dialog, 'margin-left');

        bottomInput.disabled = this._linkTopBottom || this._linkAll;
        rightInput.disabled = this._linkLeftRight || this._linkAll;
        leftInput.disabled = this._linkAll;
    }

    /**
     * Called when a margin input value changes.
     * @param {HTMLDialogElement} dialog
     * @param {string} changedId
     */
    _handleMarginInput(dialog, changedId) {
        const value = this._getInput(dialog, changedId).value;

        if (this._linkAll) {
            this._syncAllToValue(dialog, value);
            return;
        }

        if (this._linkTopBottom && (changedId === 'margin-top' || changedId === 'margin-bottom')) {
            const other = changedId === 'margin-top' ? 'margin-bottom' : 'margin-top';
            this._getInput(dialog, other).value = value;
        }

        if (this._linkLeftRight && (changedId === 'margin-left' || changedId === 'margin-right')) {
            const other = changedId === 'margin-left' ? 'margin-right' : 'margin-left';
            this._getInput(dialog, other).value = value;
        }
    }

    /**
     * Copies the value from one input to another.
     * @param {HTMLDialogElement} dialog
     * @param {string} sourceId
     * @param {string} targetId
     */
    _syncValue(dialog, sourceId, targetId) {
        this._getInput(dialog, targetId).value = this._getInput(dialog, sourceId).value;
    }

    /**
     * Sets all four margin inputs to the same value.
     * @param {HTMLDialogElement} dialog
     * @param {string} value
     */
    _syncAllToValue(dialog, value) {
        for (const id of ['margin-top', 'margin-right', 'margin-bottom', 'margin-left']) {
            this._getInput(dialog, id).value = value;
        }
    }

    /**
     * Gets a margin input element by id.
     * @param {HTMLDialogElement} dialog
     * @param {string} id
     * @returns {HTMLInputElement}
     */
    _getInput(dialog, id) {
        return /** @type {HTMLInputElement} */ (dialog.querySelector(`#${id}`));
    }

    /**
     * Expands a hex color string to its full 7-character form.
     * Accepts `#rgb` (3-digit shorthand) and `#rrggbb` (full form).
     * Returns the expanded string or `null` if the input is not a valid hex color.
     * @param {string} value
     * @returns {string|null}
     */
    _expandHex(value) {
        if (/^#[0-9a-f]{6}$/i.test(value)) {
            return value.toLowerCase();
        }
        if (/^#[0-9a-f]{3}$/i.test(value)) {
            const [, r, g, b] = value;
            return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
        }
        return null;
    }

    /**
     * Opens the preferences modal, loading current values from the database.
     */
    async open() {
        this._build();
        if (!this.dialog || this.dialog.open) return;

        // Load saved default view setting
        const defaultView = await this._loadDefaultView();
        const viewSelect = /** @type {HTMLSelectElement} */ (
            this.dialog.querySelector('#default-view-select')
        );
        viewSelect.value = defaultView;

        // Load saved page-width setting
        const pageWidth = await this._loadPageWidth();
        const fixedCb = /** @type {HTMLInputElement} */ (
            this.dialog.querySelector('#page-width-fixed')
        );
        fixedCb.checked = pageWidth.useFixed;
        this._getInput(this.dialog, 'page-width-value').value = String(pageWidth.width);
        const unitSelect = /** @type {HTMLSelectElement} */ (
            this.dialog.querySelector('#page-width-unit')
        );
        unitSelect.value = pageWidth.unit;
        const customRow = this.dialog.querySelector('#page-width-custom');
        if (customRow) {
            customRow.classList.toggle('hidden', pageWidth.useFixed);
        }

        // Load saved margins (fall back to CSS defaults)
        const margins = await this._loadMargins();

        this._getInput(this.dialog, 'margin-top').value = String(margins.top);
        this._getInput(this.dialog, 'margin-right').value = String(margins.right);
        this._getInput(this.dialog, 'margin-bottom').value = String(margins.bottom);
        this._getInput(this.dialog, 'margin-left').value = String(margins.left);

        // Reset link toggles
        this._linkTopBottom = false;
        this._linkLeftRight = false;
        this._linkAll = false;
        const linkTB = /** @type {HTMLInputElement} */ (
            this.dialog.querySelector('#link-top-bottom')
        );
        const linkLR = /** @type {HTMLInputElement} */ (
            this.dialog.querySelector('#link-left-right')
        );
        const linkAllEl = /** @type {HTMLInputElement} */ (this.dialog.querySelector('#link-all'));
        linkTB.checked = false;
        linkLR.checked = false;
        linkAllEl.checked = false;

        // Reset disabled state on all inputs
        this._updateDisabledState(this.dialog);

        // Load saved colors
        const colors = await this._loadColors();
        this._getInput(this.dialog, 'color-page-bg').value = colors.pageBg;
        this._getInput(this.dialog, 'color-page-bg-hex').value = colors.pageBg;
        this._getInput(this.dialog, 'color-page-text').value = colors.pageText;
        this._getInput(this.dialog, 'color-page-text-hex').value = colors.pageText;

        // Load TOC settings
        const tocVisible = await this._loadTocVisible();
        const tocVisibleCb = /** @type {HTMLInputElement} */ (
            this.dialog.querySelector('#toc-visible')
        );
        tocVisibleCb.checked = tocVisible;

        const tocPosition = await this._loadTocPosition();
        const tocPositionSelect = /** @type {HTMLSelectElement} */ (
            this.dialog.querySelector('#toc-position-select')
        );
        tocPositionSelect.value = tocPosition;

        this.dialog.showModal();
    }

    /**
     * Closes the preferences modal.
     */
    close() {
        if (this.dialog?.open) {
            this.dialog.close();
        }
    }

    /**
     * Loads the default view mode from the settings database.
     * @returns {Promise<import('../editor/editor.js').ViewMode>}
     */
    async _loadDefaultView() {
        if (!window.electronAPI) return DEFAULT_VIEW_MODE;

        try {
            const result = await window.electronAPI.getSetting('defaultView');
            if (result.success && result.value) {
                return result.value === 'source' ? 'source' : 'focused';
            }
        } catch {
            // Fall through to default
        }

        return DEFAULT_VIEW_MODE;
    }

    /**
     * Loads the current page-width setting from the settings database.
     * @returns {Promise<{ useFixed: boolean, width: number, unit: 'px' | 'mm' }>}
     */
    async _loadPageWidth() {
        if (!window.electronAPI) return { ...DEFAULT_PAGE_WIDTH };

        try {
            const result = await window.electronAPI.getSetting('pageWidth');
            if (result.success && result.value) {
                return {
                    useFixed: result.value.useFixed ?? DEFAULT_PAGE_WIDTH.useFixed,
                    width: result.value.width ?? DEFAULT_PAGE_WIDTH.width,
                    unit: result.value.unit ?? DEFAULT_PAGE_WIDTH.unit,
                };
            }
        } catch {
            // Fall through to defaults
        }

        return { ...DEFAULT_PAGE_WIDTH };
    }

    /**
     * Loads the current margin values from the settings database.
     * @returns {Promise<{ top: number, right: number, bottom: number, left: number }>}
     */
    async _loadMargins() {
        if (!window.electronAPI) return { ...DEFAULT_MARGINS };

        try {
            const result = await window.electronAPI.getSetting('margins');
            if (result.success && result.value) {
                return {
                    top: result.value.top ?? DEFAULT_MARGINS.top,
                    right: result.value.right ?? DEFAULT_MARGINS.right,
                    bottom: result.value.bottom ?? DEFAULT_MARGINS.bottom,
                    left: result.value.left ?? DEFAULT_MARGINS.left,
                };
            }
        } catch {
            // Fall through to defaults
        }

        return { ...DEFAULT_MARGINS };
    }

    /**
     * Loads the current color values from the settings database.
     * @returns {Promise<{ pageBg: string, pageText: string }>}
     */
    async _loadColors() {
        if (!window.electronAPI) return { ...DEFAULT_COLORS };

        try {
            const result = await window.electronAPI.getSetting('colors');
            if (result.success && result.value) {
                return {
                    pageBg: result.value.pageBg ?? DEFAULT_COLORS.pageBg,
                    pageText: result.value.pageText ?? DEFAULT_COLORS.pageText,
                };
            }
        } catch {
            // Fall through to defaults
        }

        return { ...DEFAULT_COLORS };
    }

    /**
     * Loads the TOC visibility setting from the settings database.
     * @returns {Promise<boolean>}
     */
    async _loadTocVisible() {
        if (!window.electronAPI) return DEFAULT_TOC_VISIBLE;

        try {
            const result = await window.electronAPI.getSetting('tocVisible');
            if (result.success && result.value !== undefined && result.value !== null) {
                return !!result.value;
            }
        } catch {
            // Fall through to default
        }

        return DEFAULT_TOC_VISIBLE;
    }

    /**
     * Loads the TOC position setting from the settings database.
     * @returns {Promise<import('../toc/toc.js').TocPosition>}
     */
    async _loadTocPosition() {
        if (!window.electronAPI) return DEFAULT_TOC_POSITION;

        try {
            const result = await window.electronAPI.getSetting('tocPosition');
            if (result.success && result.value) {
                return result.value === 'right' ? 'right' : 'left';
            }
        } catch {
            // Fall through to default
        }

        return DEFAULT_TOC_POSITION;
    }

    /**
     * Saves the current form values to the settings store and applies them.
     */
    async _save() {
        if (!this.dialog) return;

        const viewSelect = /** @type {HTMLSelectElement} */ (
            this.dialog.querySelector('#default-view-select')
        );
        const defaultView = viewSelect.value === 'source' ? 'source' : 'focused';

        const fixedCb = /** @type {HTMLInputElement} */ (
            this.dialog.querySelector('#page-width-fixed')
        );
        const unitSelect = /** @type {HTMLSelectElement} */ (
            this.dialog.querySelector('#page-width-unit')
        );
        const rawWidth = Number(this._getInput(this.dialog, 'page-width-value').value);
        const pageWidth = {
            useFixed: fixedCb.checked,
            width: Number.isNaN(rawWidth) ? DEFAULT_PAGE_WIDTH.width : rawWidth,
            unit: /** @type {'px' | 'mm'} */ (unitSelect.value),
        };

        const rawTop = Number(this._getInput(this.dialog, 'margin-top').value);
        const rawRight = Number(this._getInput(this.dialog, 'margin-right').value);
        const rawBottom = Number(this._getInput(this.dialog, 'margin-bottom').value);
        const rawLeft = Number(this._getInput(this.dialog, 'margin-left').value);

        const margins = {
            top: Number.isNaN(rawTop) ? DEFAULT_MARGINS.top : rawTop,
            right: Number.isNaN(rawRight) ? DEFAULT_MARGINS.right : rawRight,
            bottom: Number.isNaN(rawBottom) ? DEFAULT_MARGINS.bottom : rawBottom,
            left: Number.isNaN(rawLeft) ? DEFAULT_MARGINS.left : rawLeft,
        };

        const colors = {
            pageBg: this._getInput(this.dialog, 'color-page-bg').value || DEFAULT_COLORS.pageBg,
            pageText:
                this._getInput(this.dialog, 'color-page-text').value || DEFAULT_COLORS.pageText,
        };

        const tocVisibleCb = /** @type {HTMLInputElement} */ (
            this.dialog.querySelector('#toc-visible')
        );
        const tocVisible = tocVisibleCb.checked;

        const tocPositionSelect = /** @type {HTMLSelectElement} */ (
            this.dialog.querySelector('#toc-position-select')
        );
        const tocPosition = tocPositionSelect.value === 'right' ? 'right' : 'left';

        // Persist to database
        if (window.electronAPI) {
            await window.electronAPI.setSetting('defaultView', defaultView);
            await window.electronAPI.setSetting('pageWidth', pageWidth);
            await window.electronAPI.setSetting('margins', margins);
            await window.electronAPI.setSetting('colors', colors);
            await window.electronAPI.setSetting('tocVisible', tocVisible);
            await window.electronAPI.setSetting('tocPosition', tocPosition);
        }

        // Apply to CSS immediately
        applyPageWidth(pageWidth);
        applyMargins(margins);
        applyColors(colors);

        // Apply TOC settings via custom event so the App class can handle it
        document.dispatchEvent(
            new CustomEvent('toc:settingsChanged', {
                detail: { visible: tocVisible, position: tocPosition },
            }),
        );

        this.close();
    }
}

/**
 * Applies the page-width setting to the document's CSS custom properties.
 * When `useFixed` is true the default A4 width (210 mm) is used.
 * @param {{ useFixed: boolean, width: number, unit: 'px' | 'mm' }} pageWidth
 */
export function applyPageWidth(pageWidth) {
    const root = document.documentElement;
    if (pageWidth.useFixed) {
        root.style.setProperty('--page-max-width', '210mm');
    } else {
        root.style.setProperty('--page-max-width', `${pageWidth.width}${pageWidth.unit}`);
    }
}

/**
 * Applies margin values to the document's CSS custom properties.
 * @param {{ top: number, right: number, bottom: number, left: number }} margins
 */
export function applyMargins(margins) {
    const root = document.documentElement;
    root.style.setProperty('--page-padding-top', `${margins.top}mm`);
    root.style.setProperty('--page-padding-right', `${margins.right}mm`);
    root.style.setProperty('--page-padding-bottom', `${margins.bottom}mm`);
    root.style.setProperty('--page-padding-left', `${margins.left}mm`);
}

/**
 * Applies page color values to the document's CSS custom properties.
 * @param {{ pageBg: string, pageText: string }} colors
 */
export function applyColors(colors) {
    const root = document.documentElement;
    root.style.setProperty('--page-bg', colors.pageBg);
    root.style.setProperty('--page-text', colors.pageText);
}
