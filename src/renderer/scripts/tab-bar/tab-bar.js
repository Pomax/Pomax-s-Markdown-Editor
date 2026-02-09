/**
 * @fileoverview Tab bar component for switching between open files.
 * Renders a horizontal bar of file tabs at the bottom of the application window.
 */

/**
 * @typedef {object} TabInfo
 * @property {string} id - Unique identifier for the tab
 * @property {string} label - Display label (filename)
 * @property {string|null} filePath - Full file path, or null for untitled
 * @property {boolean} modified - Whether the tab has unsaved changes
 * @property {boolean} active - Whether the tab is currently active
 */

/**
 * Extracts a filename from a full file path.
 * @param {string|null} filePath
 * @returns {string}
 */
function getFileName(filePath) {
    if (!filePath) return 'Untitled';
    return filePath.split(/[\\/]/).pop() ?? 'Untitled';
}

/**
 * Creates a close button element for a tab.
 * @returns {HTMLButtonElement}
 */
function createCloseButton() {
    const btn = document.createElement('button');
    btn.className = 'tab-close';
    btn.setAttribute('aria-label', 'Close tab');
    btn.textContent = '×';
    return btn;
}

/**
 * Tab bar for switching between open files.
 */
export class TabBar {
    /**
     * @param {HTMLElement} container - The tab bar container element
     */
    constructor(container) {
        /** @type {HTMLElement} */
        this.container = container;

        /** @type {TabInfo[]} */
        this.tabs = [];

        /** @type {string|null} */
        this.activeTabId = null;

        /** @type {((tabId: string) => void)|null} */
        this.onTabSelect = null;

        /** @type {((tabId: string) => void)|null} */
        this.onTabClose = null;
    }

    /**
     * Initializes the tab bar with event delegation.
     */
    initialize() {
        this.container.addEventListener('click', (e) => {
            this._handleClick(e);
        });
    }

    /**
     * Adds a tab to the bar.
     * @param {string} id - Unique tab identifier
     * @param {string|null} filePath - Full file path, or null for untitled
     * @param {boolean} [active=true] - Whether to make this the active tab
     */
    addTab(id, filePath, active = true) {
        const tab = {
            id,
            label: getFileName(filePath),
            filePath,
            modified: false,
            active: false,
        };
        this.tabs.push(tab);
        if (active) {
            this.setActiveTab(id);
        }
        this.render();
    }

    /**
     * Removes a tab from the bar.
     * @param {string} id - Tab identifier to remove
     */
    removeTab(id) {
        const index = this.tabs.findIndex((t) => t.id === id);
        if (index === -1) return;
        this.tabs.splice(index, 1);
        if (this.activeTabId === id && this.tabs.length > 0) {
            const nextIndex = Math.min(index, this.tabs.length - 1);
            this.setActiveTab(this.tabs[nextIndex].id);
        }
        this.render();
    }

    /**
     * Sets the active tab.
     * @param {string} id - Tab identifier to activate
     */
    setActiveTab(id) {
        for (const tab of this.tabs) {
            tab.active = tab.id === id;
        }
        this.activeTabId = id;
        this.render();
    }

    /**
     * Updates a tab's file path and label.
     * @param {string} id - Tab identifier
     * @param {string|null} filePath - New file path
     */
    updateTabPath(id, filePath) {
        const tab = this.tabs.find((t) => t.id === id);
        if (!tab) return;
        tab.filePath = filePath;
        tab.label = getFileName(filePath);
        this.render();
    }

    /**
     * Sets the modified indicator on a tab.
     * @param {string} id - Tab identifier
     * @param {boolean} modified - Whether the tab has unsaved changes
     */
    setModified(id, modified) {
        const tab = this.tabs.find((t) => t.id === id);
        if (!tab) return;
        tab.modified = modified;
        this.render();
    }

    /**
     * Renders all tabs into the container.
     */
    render() {
        this.container.innerHTML = '';
        for (const tab of this.tabs) {
            const button = this._createTabElement(tab);
            this.container.appendChild(button);
        }
    }

    /**
     * Creates a DOM element for a single tab.
     * @param {TabInfo} tab
     * @returns {HTMLButtonElement}
     */
    _createTabElement(tab) {
        const button = document.createElement('button');
        button.className = 'tab-button';
        button.dataset.tabId = tab.id;
        if (tab.active) button.classList.add('active');
        if (tab.modified) button.classList.add('modified');

        const dot = document.createElement('span');
        dot.className = 'tab-modified';
        button.appendChild(dot);

        const label = document.createElement('span');
        label.className = 'tab-label';
        label.textContent = tab.label;
        button.appendChild(label);

        const close = createCloseButton();
        button.appendChild(close);

        return button;
    }

    /**
     * Handles click events on the tab bar via delegation.
     * @param {MouseEvent} e
     */
    _handleClick(e) {
        const target = /** @type {HTMLElement} */ (e.target);

        // Check for close button click
        if (target.classList.contains('tab-close')) {
            const tabButton = target.closest('.tab-button');
            const tabId = /** @type {HTMLElement} */ (tabButton)?.dataset.tabId;
            if (tabId && this.onTabClose) {
                this.onTabClose(tabId);
            }
            return;
        }

        // Check for tab button click
        const tabButton = target.closest('.tab-button');
        if (tabButton) {
            const tabId = /** @type {HTMLElement} */ (tabButton).dataset.tabId;
            if (tabId && tabId !== this.activeTabId && this.onTabSelect) {
                this.onTabSelect(tabId);
            }
        }
    }
}
