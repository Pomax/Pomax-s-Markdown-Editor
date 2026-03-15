/**
 * @fileoverview Preferences modal dialog.
 * Displays a modal overlay that lets the user adjust application settings.
 * Settings are persisted to SQLite via the main-process IPC bridge.
 */

/// <reference path="../../../../types.d.ts" />

/**
 * Default view mode for the editor on startup.
 * @type {ViewMode}
 */
const DEFAULT_VIEW_MODE = `writing`;

/**
 * Default page-width values matching the CSS default (A4 = 210 mm fixed).
 * @type {{ useFixed: boolean, width: number, unit: 'px' | 'mm' }}
 */
const DEFAULT_PAGE_WIDTH = { useFixed: true, width: 210, unit: `mm` };

/**
 * Default margin values (in mm) matching the CSS defaults.
 * @type {{ top: number, right: number, bottom: number, left: number }}
 */
const DEFAULT_MARGINS = { top: 25, right: 25, bottom: 25, left: 25 };

/**
 * Default page colors matching the CSS defaults.
 * @type {{ pageBg: string, pageText: string }}
 */
const DEFAULT_COLORS = { pageBg: `#ffffff`, pageText: `#212529` };

/**
 * Default TOC visibility (enabled by default).
 * @type {boolean}
 */
const DEFAULT_TOC_VISIBLE = true;

/**
 * Default TOC sidebar position.
 * @type {TocPosition}
 */
const DEFAULT_TOC_POSITION = `left`;

/**
 * Default setting for automatic local image path rewriting.
 * @type {boolean}
 */
const DEFAULT_ENSURE_LOCAL_PATHS = true;

/**
 * Default setting for whether &lt;details&gt; blocks load closed.
 * @type {boolean}
 */
const DEFAULT_DETAILS_CLOSED = false;

/**
 * Default setting for whether &lt;style&gt; elements are injected into the DOM.
 * @type {boolean}
 */
const DEFAULT_ENABLE_STYLE_ELEMENTS = false;

/**
 * A modal dialog for editing application preferences.
 */
export class PreferencesModal {
  constructor() {
    /** @type {HTMLDialogElement|null} */
    this.dialog = null;

    /** @type {boolean} */
    this.built = false;

    /** @type {boolean} */
    this.linkTopBottom = false;

    /** @type {boolean} */
    this.linkLeftRight = false;

    /** @type {boolean} */
    this.linkAll = false;
  }

  /**
   * Lazily builds the dialog DOM the first time it is needed.
   */
  build() {
    if (this.built) return;
    this.built = true;

    const dialog = document.createElement(`dialog`);
    dialog.className = `preferences-dialog`;
    dialog.setAttribute(`aria-label`, `Preferences`);

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
                            <li><a href="#" class="preferences-nav-link" data-section="pref-images">Image Handling</a></li>
                            <li><a href="#" class="preferences-nav-link" data-section="pref-content">Content</a></li>
                        </ul>
                    </nav>
                    <div class="preferences-body">
                        <fieldset class="preferences-fieldset" id="pref-default-view">
                            <legend>Default View</legend>
                        <div class="default-view-row">
                            <label for="default-view-select">View mode on startup</label>
                            <select id="default-view-select" name="defaultView">
                                <option value="writing">Writing</option>
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
                    <fieldset class="preferences-fieldset" id="pref-images">
                        <legend>Image Handling</legend>
                        <div class="image-handling-row">
                            <label class="image-handling-toggle">
                                <input type="checkbox" id="ensure-local-paths">
                                <span>Ensure local paths</span>
                            </label>
                            <p class="preferences-hint">When enabled, absolute image paths that point to files inside the document's folder are automatically rewritten to relative paths.</p>
                        </div>
                    </fieldset>
                    <fieldset class="preferences-fieldset" id="pref-content">
                        <legend>Content</legend>
                        <div class="content-settings-row">
                            <label class="content-toggle">
                                <input type="checkbox" id="details-closed">
                                <span>Load &lt;details&gt; closed</span>
                            </label>
                            <p class="preferences-hint">When enabled, &lt;details&gt; blocks are initially collapsed in writing view. Click the disclosure triangle to expand or collapse them.</p>
                        </div>
                        <div class="content-settings-row">
                            <label class="content-toggle">
                                <input type="checkbox" id="enable-style-elements">
                                <span>Enable &lt;style&gt; elements in document</span>
                            </label>
                            <p class="preferences-hint">When enabled, &lt;style&gt; blocks in the document are injected as real CSS that affects the page. When disabled, they are ignored.</p>
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
    const closeBtn = dialog.querySelector(`.preferences-close`);
    if (closeBtn) {
      closeBtn.addEventListener(`click`, () => this.close());
    }
    const cancelBtn = dialog.querySelector(`.preferences-btn--cancel`);
    if (cancelBtn) {
      cancelBtn.addEventListener(`click`, () => this.close());
    }

    // Save handler
    const form = dialog.querySelector(`form`);
    if (form) {
      form.addEventListener(`submit`, (e) => {
        e.preventDefault();
        this.save();
      });
    }

    // Close on backdrop click
    dialog.addEventListener(`click`, (e) => {
      if (e.target === dialog) {
        this.close();
      }
    });

    // Close on Escape key
    dialog.addEventListener(`cancel`, () => {
      this.close();
    });

    // Wire up link toggles
    this.setupLinkToggles(dialog);

    // Wire up margin input syncing
    this.setupMarginInputs(dialog);

    // Wire up color input syncing
    this.setupColorInputs(dialog);

    // Wire up page-width toggle
    this.setupPageWidth(dialog);

    // Wire up sidebar navigation links
    this.setupNavLinks(dialog);

    document.body.appendChild(dialog);
    this.dialog = dialog;
  }

  /**
   * Sets up the link-toggle checkboxes so they interact correctly.
   * @param {HTMLDialogElement} dialog
   */
  setupLinkToggles(dialog) {
    const linkTB = /** @type {HTMLInputElement} */ (dialog.querySelector(`#link-top-bottom`));
    const linkLR = /** @type {HTMLInputElement} */ (dialog.querySelector(`#link-left-right`));
    const linkAll = /** @type {HTMLInputElement} */ (dialog.querySelector(`#link-all`));

    linkTB.addEventListener(`change`, () => {
      this.linkTopBottom = linkTB.checked;
      if (linkTB.checked) {
        this.syncValue(dialog, `margin-top`, `margin-bottom`);
      }
      // If both TB and LR are on, turn on All
      if (linkTB.checked && linkLR.checked) {
        linkAll.checked = true;
        this.linkAll = true;
        this.syncAllToValue(dialog, this.getInput(dialog, `margin-top`).value);
      }
      if (!linkTB.checked && linkAll.checked) {
        linkAll.checked = false;
        this.linkAll = false;
      }
      this.updateDisabledState(dialog);
    });

    linkLR.addEventListener(`change`, () => {
      this.linkLeftRight = linkLR.checked;
      if (linkLR.checked) {
        this.syncValue(dialog, `margin-left`, `margin-right`);
      }
      if (linkTB.checked && linkLR.checked) {
        linkAll.checked = true;
        this.linkAll = true;
        this.syncAllToValue(dialog, this.getInput(dialog, `margin-top`).value);
      }
      if (!linkLR.checked && linkAll.checked) {
        linkAll.checked = false;
        this.linkAll = false;
      }
      this.updateDisabledState(dialog);
    });

    linkAll.addEventListener(`change`, () => {
      this.linkAll = linkAll.checked;
      if (linkAll.checked) {
        linkTB.checked = true;
        linkLR.checked = true;
        this.linkTopBottom = true;
        this.linkLeftRight = true;
        this.syncAllToValue(dialog, this.getInput(dialog, `margin-top`).value);
      } else {
        linkTB.checked = false;
        linkLR.checked = false;
        this.linkTopBottom = false;
        this.linkLeftRight = false;
      }
      this.updateDisabledState(dialog);
    });
  }

  /**
   * Sets up input event listeners on margin fields for linked syncing.
   * @param {HTMLDialogElement} dialog
   */
  setupMarginInputs(dialog) {
    const ids = [`margin-top`, `margin-right`, `margin-bottom`, `margin-left`];
    for (const id of ids) {
      this.getInput(dialog, id).addEventListener(`input`, () => {
        this.handleMarginInput(dialog, id);
      });
    }
  }

  /**
   * Sets up color picker ↔ hex text input syncing.
   * @param {HTMLDialogElement} dialog
   */
  setupColorInputs(dialog) {
    const pairs = [
      { picker: `color-page-bg`, hex: `color-page-bg-hex` },
      { picker: `color-page-text`, hex: `color-page-text-hex` },
    ];

    for (const { picker, hex } of pairs) {
      const pickerEl = this.getInput(dialog, picker);
      const hexEl = this.getInput(dialog, hex);

      pickerEl.addEventListener(`input`, () => {
        hexEl.value = pickerEl.value;
      });

      hexEl.addEventListener(`input`, () => {
        const expanded = this.expandHex(hexEl.value);
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
  setupPageWidth(dialog) {
    const fixedCb = /** @type {HTMLInputElement} */ (dialog.querySelector(`#page-width-fixed`));
    const customRow = dialog.querySelector(`#page-width-custom`);

    fixedCb.addEventListener(`change`, () => {
      if (customRow) {
        customRow.classList.toggle(`hidden`, fixedCb.checked);
      }
    });
  }

  /**
   * Sets up the sidebar navigation links so clicking a link scrolls the
   * corresponding fieldset into view and highlights the active link.
   * Also observes scroll position to update the active link automatically.
   * @param {HTMLDialogElement} dialog
   */
  setupNavLinks(dialog) {
    const links = dialog.querySelectorAll(`.preferences-nav-link`);
    const body = dialog.querySelector(`.preferences-body`);
    if (!body) return;

    // Click handler — scroll the target section to the top of the body
    for (const link of links) {
      link.addEventListener(`click`, (e) => {
        e.preventDefault();
        const sectionId = /** @type {HTMLElement} */ (link).dataset.section;
        if (!sectionId) return;
        const section = dialog.querySelector(`#${sectionId}`);
        if (!section) return;

        section.scrollIntoView({ behavior: `instant`, block: `start` });

        // Update active state
        for (const l of links) l.classList.remove(`active`);
        link.classList.add(`active`);
      });
    }

    // Observe scroll to highlight whichever section is currently visible
    body.addEventListener(`scroll`, () => {
      this.updateActiveNavLink(dialog);
    });
  }

  /**
   * Updates the active nav link based on which fieldset is closest to the
   * top of the scrollable body.
   * @param {HTMLDialogElement} dialog
   */
  updateActiveNavLink(dialog) {
    const body = dialog.querySelector(`.preferences-body`);
    if (!body) return;

    const bodyRect = body.getBoundingClientRect();
    const links = dialog.querySelectorAll(`.preferences-nav-link`);
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
      for (const l of links) l.classList.remove(`active`);
      closest.classList.add(`active`);
    }
  }

  /**
   * Enables or disables margin inputs based on the current link state.
   * When linked, the secondary input is disabled (bottom follows top,
   * right follows left). When "link all" is on, only top is editable.
   * @param {HTMLDialogElement} dialog
   */
  updateDisabledState(dialog) {
    const bottomInput = this.getInput(dialog, `margin-bottom`);
    const rightInput = this.getInput(dialog, `margin-right`);
    const leftInput = this.getInput(dialog, `margin-left`);

    bottomInput.disabled = this.linkTopBottom || this.linkAll;
    rightInput.disabled = this.linkLeftRight || this.linkAll;
    leftInput.disabled = this.linkAll;
  }

  /**
   * Called when a margin input value changes.
   * @param {HTMLDialogElement} dialog
   * @param {string} changedId
   */
  handleMarginInput(dialog, changedId) {
    const value = this.getInput(dialog, changedId).value;

    if (this.linkAll) {
      this.syncAllToValue(dialog, value);
      return;
    }

    if (this.linkTopBottom && (changedId === `margin-top` || changedId === `margin-bottom`)) {
      const other = changedId === `margin-top` ? `margin-bottom` : `margin-top`;
      this.getInput(dialog, other).value = value;
    }

    if (this.linkLeftRight && (changedId === `margin-left` || changedId === `margin-right`)) {
      const other = changedId === `margin-left` ? `margin-right` : `margin-left`;
      this.getInput(dialog, other).value = value;
    }
  }

  /**
   * Copies the value from one input to another.
   * @param {HTMLDialogElement} dialog
   * @param {string} sourceId
   * @param {string} targetId
   */
  syncValue(dialog, sourceId, targetId) {
    this.getInput(dialog, targetId).value = this.getInput(dialog, sourceId).value;
  }

  /**
   * Sets all four margin inputs to the same value.
   * @param {HTMLDialogElement} dialog
   * @param {string} value
   */
  syncAllToValue(dialog, value) {
    for (const id of [`margin-top`, `margin-right`, `margin-bottom`, `margin-left`]) {
      this.getInput(dialog, id).value = value;
    }
  }

  /**
   * Gets a margin input element by id.
   * @param {HTMLDialogElement} dialog
   * @param {string} id
   * @returns {HTMLInputElement}
   */
  getInput(dialog, id) {
    return /** @type {HTMLInputElement} */ (dialog.querySelector(`#${id}`));
  }

  /**
   * Expands a hex color string to its full 7-character form.
   * Accepts `#rgb` (3-digit shorthand) and `#rrggbb` (full form).
   * Returns the expanded string or `null` if the input is not a valid hex color.
   * @param {string} value
   * @returns {string|null}
   */
  expandHex(value) {
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
    this.build();
    if (!this.dialog || this.dialog.open) return;

    // Load saved default view setting
    const defaultView = await this.loadDefaultView();
    const viewSelect = /** @type {HTMLSelectElement} */ (
      this.dialog.querySelector(`#default-view-select`)
    );
    viewSelect.value = defaultView;

    // Load saved page-width setting
    const pageWidth = await this.loadPageWidth();
    const fixedCb = /** @type {HTMLInputElement} */ (
      this.dialog.querySelector(`#page-width-fixed`)
    );
    fixedCb.checked = pageWidth.useFixed;
    this.getInput(this.dialog, `page-width-value`).value = String(pageWidth.width);
    const unitSelect = /** @type {HTMLSelectElement} */ (
      this.dialog.querySelector(`#page-width-unit`)
    );
    unitSelect.value = pageWidth.unit;
    const customRow = this.dialog.querySelector(`#page-width-custom`);
    if (customRow) {
      customRow.classList.toggle(`hidden`, pageWidth.useFixed);
    }

    // Load saved margins (fall back to CSS defaults)
    const margins = await this.loadMargins();

    this.getInput(this.dialog, `margin-top`).value = String(margins.top);
    this.getInput(this.dialog, `margin-right`).value = String(margins.right);
    this.getInput(this.dialog, `margin-bottom`).value = String(margins.bottom);
    this.getInput(this.dialog, `margin-left`).value = String(margins.left);

    // Reset link toggles
    this.linkTopBottom = false;
    this.linkLeftRight = false;
    this.linkAll = false;
    const linkTB = /** @type {HTMLInputElement} */ (this.dialog.querySelector(`#link-top-bottom`));
    const linkLR = /** @type {HTMLInputElement} */ (this.dialog.querySelector(`#link-left-right`));
    const linkAllEl = /** @type {HTMLInputElement} */ (this.dialog.querySelector(`#link-all`));
    linkTB.checked = false;
    linkLR.checked = false;
    linkAllEl.checked = false;

    // Reset disabled state on all inputs
    this.updateDisabledState(this.dialog);

    // Load saved colors
    const colors = await this.loadColors();
    this.getInput(this.dialog, `color-page-bg`).value = colors.pageBg;
    this.getInput(this.dialog, `color-page-bg-hex`).value = colors.pageBg;
    this.getInput(this.dialog, `color-page-text`).value = colors.pageText;
    this.getInput(this.dialog, `color-page-text-hex`).value = colors.pageText;

    // Load TOC settings
    const tocVisible = await this.loadTocVisible();
    const tocVisibleCb = /** @type {HTMLInputElement} */ (
      this.dialog.querySelector(`#toc-visible`)
    );
    tocVisibleCb.checked = tocVisible;

    const tocPosition = await this.loadTocPosition();
    const tocPositionSelect = /** @type {HTMLSelectElement} */ (
      this.dialog.querySelector(`#toc-position-select`)
    );
    tocPositionSelect.value = tocPosition;

    // Load image handling settings
    const ensureLocalPaths = await this.loadEnsureLocalPaths();
    const ensureLocalPathsCb = /** @type {HTMLInputElement} */ (
      this.dialog.querySelector(`#ensure-local-paths`)
    );
    ensureLocalPathsCb.checked = ensureLocalPaths;

    // Load content settings
    const detailsClosed = await this.loadDetailsClosed();
    const detailsClosedCb = /** @type {HTMLInputElement} */ (
      this.dialog.querySelector(`#details-closed`)
    );
    detailsClosedCb.checked = detailsClosed;

    const enableStyleElements = await this.loadEnableStyleElements();
    const enableStyleCb = /** @type {HTMLInputElement} */ (
      this.dialog.querySelector(`#enable-style-elements`)
    );
    enableStyleCb.checked = enableStyleElements;

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
   * @returns {Promise<ViewMode>}
   */
  async loadDefaultView() {
    if (!window.electronAPI) return DEFAULT_VIEW_MODE;

    try {
      const result = await window.electronAPI.getSetting(`defaultView`);
      if (result.success && result.value) {
        return result.value === `source` ? `source` : `writing`;
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
  async loadPageWidth() {
    if (!window.electronAPI) return { ...DEFAULT_PAGE_WIDTH };

    try {
      const result = await window.electronAPI.getSetting(`pageWidth`);
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
  async loadMargins() {
    if (!window.electronAPI) return { ...DEFAULT_MARGINS };

    try {
      const result = await window.electronAPI.getSetting(`margins`);
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
  async loadColors() {
    if (!window.electronAPI) return { ...DEFAULT_COLORS };

    try {
      const result = await window.electronAPI.getSetting(`colors`);
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
  async loadTocVisible() {
    if (!window.electronAPI) return DEFAULT_TOC_VISIBLE;

    try {
      const result = await window.electronAPI.getSetting(`tocVisible`);
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
   * @returns {Promise<TocPosition>}
   */
  async loadTocPosition() {
    if (!window.electronAPI) return DEFAULT_TOC_POSITION;

    try {
      const result = await window.electronAPI.getSetting(`tocPosition`);
      if (result.success && result.value) {
        return result.value === `right` ? `right` : `left`;
      }
    } catch {
      // Fall through to default
    }

    return DEFAULT_TOC_POSITION;
  }

  /**
   * Loads the "ensure local paths" setting from the settings database.
   * @returns {Promise<boolean>}
   */
  async loadEnsureLocalPaths() {
    if (!window.electronAPI) return DEFAULT_ENSURE_LOCAL_PATHS;

    try {
      const result = await window.electronAPI.getSetting(`ensureLocalPaths`);
      if (result.success && result.value !== undefined && result.value !== null) {
        return !!result.value;
      }
    } catch {
      // Fall through to default
    }

    return DEFAULT_ENSURE_LOCAL_PATHS;
  }

  /**
   * Loads the details-closed setting from the settings database.
   * @returns {Promise<boolean>}
   */
  async loadDetailsClosed() {
    if (!window.electronAPI) return DEFAULT_DETAILS_CLOSED;

    try {
      const result = await window.electronAPI.getSetting(`detailsClosed`);
      if (result.success && result.value !== undefined && result.value !== null) {
        return !!result.value;
      }
    } catch {
      // Fall through to default
    }

    return DEFAULT_DETAILS_CLOSED;
  }

  /**
   * Loads the enable-style-elements setting from the settings database.
   * @returns {Promise<boolean>}
   */
  async loadEnableStyleElements() {
    if (!window.electronAPI) return DEFAULT_ENABLE_STYLE_ELEMENTS;

    try {
      const result = await window.electronAPI.getSetting(`enableStyleElements`);
      if (result.success && result.value !== undefined && result.value !== null) {
        return !!result.value;
      }
    } catch {
      // Fall through to default
    }

    return DEFAULT_ENABLE_STYLE_ELEMENTS;
  }

  /**
   * Saves the current form values to the settings store and applies them.
   */
  async save() {
    if (!this.dialog) return;

    const viewSelect = /** @type {HTMLSelectElement} */ (
      this.dialog.querySelector(`#default-view-select`)
    );
    const defaultView = viewSelect.value === `source` ? `source` : `writing`;

    const fixedCb = /** @type {HTMLInputElement} */ (
      this.dialog.querySelector(`#page-width-fixed`)
    );
    const unitSelect = /** @type {HTMLSelectElement} */ (
      this.dialog.querySelector(`#page-width-unit`)
    );
    const rawWidth = Number(this.getInput(this.dialog, `page-width-value`).value);
    const pageWidth = {
      useFixed: fixedCb.checked,
      width: Number.isNaN(rawWidth) ? DEFAULT_PAGE_WIDTH.width : rawWidth,
      unit: /** @type {'px' | 'mm'} */ (unitSelect.value),
    };

    const rawTop = Number(this.getInput(this.dialog, `margin-top`).value);
    const rawRight = Number(this.getInput(this.dialog, `margin-right`).value);
    const rawBottom = Number(this.getInput(this.dialog, `margin-bottom`).value);
    const rawLeft = Number(this.getInput(this.dialog, `margin-left`).value);

    const margins = {
      top: Number.isNaN(rawTop) ? DEFAULT_MARGINS.top : rawTop,
      right: Number.isNaN(rawRight) ? DEFAULT_MARGINS.right : rawRight,
      bottom: Number.isNaN(rawBottom) ? DEFAULT_MARGINS.bottom : rawBottom,
      left: Number.isNaN(rawLeft) ? DEFAULT_MARGINS.left : rawLeft,
    };

    const colors = {
      pageBg: this.getInput(this.dialog, `color-page-bg`).value || DEFAULT_COLORS.pageBg,
      pageText: this.getInput(this.dialog, `color-page-text`).value || DEFAULT_COLORS.pageText,
    };

    const tocVisibleCb = /** @type {HTMLInputElement} */ (
      this.dialog.querySelector(`#toc-visible`)
    );
    const tocVisible = tocVisibleCb.checked;

    const tocPositionSelect = /** @type {HTMLSelectElement} */ (
      this.dialog.querySelector(`#toc-position-select`)
    );
    const tocPosition = tocPositionSelect.value === `right` ? `right` : `left`;

    const ensureLocalPathsCb = /** @type {HTMLInputElement} */ (
      this.dialog.querySelector(`#ensure-local-paths`)
    );
    const ensureLocalPaths = ensureLocalPathsCb.checked;

    const detailsClosedCb = /** @type {HTMLInputElement} */ (
      this.dialog.querySelector(`#details-closed`)
    );
    const detailsClosed = detailsClosedCb.checked;

    const enableStyleCb = /** @type {HTMLInputElement} */ (
      this.dialog.querySelector(`#enable-style-elements`)
    );
    const enableStyleElements = enableStyleCb.checked;

    // Persist to database
    if (window.electronAPI) {
      await window.electronAPI.setSetting(`defaultView`, defaultView);
      await window.electronAPI.setSetting(`pageWidth`, pageWidth);
      await window.electronAPI.setSetting(`margins`, margins);
      await window.electronAPI.setSetting(`colors`, colors);
      await window.electronAPI.setSetting(`tocVisible`, tocVisible);
      await window.electronAPI.setSetting(`tocPosition`, tocPosition);
      await window.electronAPI.setSetting(`ensureLocalPaths`, ensureLocalPaths);
      await window.electronAPI.setSetting(`detailsClosed`, detailsClosed);
      await window.electronAPI.setSetting(`enableStyleElements`, enableStyleElements);
    }

    // Apply to CSS immediately
    applyPageWidth(pageWidth);
    applyMargins(margins);
    applyColors(colors);

    // Apply TOC settings via custom event so the App class can handle it
    document.dispatchEvent(
      new CustomEvent(`toc:settingsChanged`, {
        detail: { visible: tocVisible, position: tocPosition },
      }),
    );

    // Notify listeners about image handling settings
    document.dispatchEvent(
      new CustomEvent(`imageHandling:settingsChanged`, {
        detail: { ensureLocalPaths },
      }),
    );

    // Notify listeners about content settings
    document.dispatchEvent(
      new CustomEvent(`content:settingsChanged`, {
        detail: { detailsClosed, enableStyleElements },
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
    root.style.setProperty(`--page-max-width`, `210mm`);
  } else {
    root.style.setProperty(`--page-max-width`, `${pageWidth.width}${pageWidth.unit}`);
  }
}

/**
 * Applies margin values to the document's CSS custom properties.
 * @param {{ top: number, right: number, bottom: number, left: number }} margins
 */
export function applyMargins(margins) {
  const root = document.documentElement;
  root.style.setProperty(`--page-padding-top`, `${margins.top}mm`);
  root.style.setProperty(`--page-padding-right`, `${margins.right}mm`);
  root.style.setProperty(`--page-padding-bottom`, `${margins.bottom}mm`);
  root.style.setProperty(`--page-padding-left`, `${margins.left}mm`);
}

/**
 * Applies page color values to the document's CSS custom properties.
 * @param {{ pageBg: string, pageText: string }} colors
 */
export function applyColors(colors) {
  const root = document.documentElement;
  root.style.setProperty(`--page-bg`, colors.pageBg);
  root.style.setProperty(`--page-text`, colors.pageText);
}
