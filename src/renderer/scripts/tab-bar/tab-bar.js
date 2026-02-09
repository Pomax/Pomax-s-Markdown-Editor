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
 * Splits a file path into its segments.
 * @param {string} filePath
 * @returns {string[]}
 */
function getPathSegments(filePath) {
    return filePath.split(/[\\/]/);
}

/**
 * Computes disambiguated display labels for a list of tabs.
 * Tabs with unique filenames get just the filename.  Tabs whose filenames
 * collide get the minimum number of parent directory segments appended
 * (e.g. "README.md — docs") to make them unique.
 * @param {TabInfo[]} tabs
 * @returns {Map<string, string>} Map of tab ID → display label
 */
export function getDisambiguatedLabels(tabs) {
    /** @type {Map<string, string>} */
    const labels = new Map();

    // Group tabs by their base filename
    /** @type {Map<string, TabInfo[]>} */
    const groups = new Map();
    for (const tab of tabs) {
        const name = getFileName(tab.filePath);
        const group = groups.get(name) ?? [];
        group.push(tab);
        groups.set(name, group);
    }

    for (const [name, group] of groups) {
        if (group.length === 1) {
            // Unique filename — no disambiguation needed
            labels.set(group[0].id, name);
            continue;
        }

        // Multiple tabs share the same filename — find the minimum
        // number of parent segments needed to distinguish each one
        const segmentsList = group.map((tab) =>
            tab.filePath ? getPathSegments(tab.filePath) : [name],
        );

        for (let i = 0; i < group.length; i++) {
            const segments = segmentsList[i];
            let depth = 1;
            const maxDepth = segments.length - 1;

            while (depth < maxDepth) {
                const suffix = segments
                    .slice(segments.length - 1 - depth, segments.length - 1)
                    .join('/');
                const isUnique = segmentsList.every(
                    (other, j) =>
                        j === i ||
                        other.slice(other.length - 1 - depth, other.length - 1).join('/') !==
                            suffix,
                );
                if (isUnique) break;
                depth++;
            }

            if (maxDepth > 0) {
                const suffix = segments
                    .slice(segments.length - 1 - depth, segments.length - 1)
                    .join('/');
                labels.set(group[i].id, `${name} — ${suffix}`);
            } else {
                labels.set(group[i].id, name);
            }
        }
    }

    return labels;
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
        const labels = getDisambiguatedLabels(this.tabs);
        this.container.innerHTML = '';
        for (const tab of this.tabs) {
            const displayLabel = labels.get(tab.id) ?? tab.label;
            const button = this._createTabElement(tab, displayLabel);
            this.container.appendChild(button);
        }
    }

    /**
     * Creates a DOM element for a single tab.
     * @param {TabInfo} tab
     * @param {string} displayLabel - The disambiguated label to show
     * @returns {HTMLButtonElement}
     */
    _createTabElement(tab, displayLabel) {
        const button = document.createElement('button');
        button.className = 'tab-button';
        button.dataset.tabId = tab.id;
        button.title = tab.filePath ?? 'Untitled';
        if (tab.active) button.classList.add('active');
        if (tab.modified) button.classList.add('modified');

        const dot = document.createElement('span');
        dot.className = 'tab-modified';
        button.appendChild(dot);

        const label = document.createElement('span');
        label.className = 'tab-label';
        label.textContent = displayLabel;
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
