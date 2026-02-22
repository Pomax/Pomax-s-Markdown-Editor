/**
 * @fileoverview Table of Contents sidebar.
 * Reads h1–h3 headings from the editor's syntax tree and renders a nested,
 * clickable outline.  Clicking a heading scrolls the editor to that element.
 */

/// <reference path="../../../types.d.ts" />

/**
 * @typedef {'left' | 'right'} TocPosition
 */

/**
 * @typedef {Object} TocHeading
 * @property {string} id       - The syntax-tree node ID
 * @property {number} level    - 1, 2 or 3
 * @property {string} text     - Plain-text heading content
 */

/**
 * Table of Contents sidebar component.
 */
export class TableOfContents {
    /**
     * @param {HTMLElement} container - The TOC sidebar container element
     * @param {import('../editor/editor.js').Editor} editor - The editor instance
     */
    constructor(container, editor) {
        /** @type {HTMLElement} */
        this.container = container;

        /** @type {import('../editor/editor.js').Editor} */
        this.editor = editor;

        /** @type {boolean} */
        this._visible = true;

        /** @type {TocPosition} */
        this._position = 'left';

        /**
         * Maps every tree node ID to the ID of the h1–h3 heading whose
         * section it belongs to.  Rebuilt on every `refresh()`.
         * @type {Map<string, string>}
         */
        this._nodeToHeadingId = new Map();

        /** @type {((e: Event) => void) | null} */
        this._scrollHandler = null;

        /**
         * When non-null, the ToC link for this heading ID stays highlighted
         * regardless of scroll position.  Set when the user clicks a ToC
         * link and cleared on the next user-initiated scroll.
         * @type {string|null}
         */
        this._lockedHeadingId = null;

        /**
         * True while a programmatic scroll (from _scrollToHeading) is in
         * progress so we can distinguish it from a user scroll.
         * @type {boolean}
         */
        this._programmaticScroll = false;
    }

    /**
     * Builds the initial DOM and sets up observation so the TOC refreshes
     * whenever the editor re-renders.
     */
    initialize() {
        this.container.innerHTML =
            '<div class="toc-resize-handle"></div>' +
            '<h3 class="toc-title">Table of Contents</h3><nav class="toc-nav"></nav>';

        this._initResizeHandle();

        // Observe child-list changes on the editor container so we can
        // refresh the TOC whenever the document is re-rendered.
        this._observer = new MutationObserver(() => this.refresh());
        this._observer.observe(this.editor.container, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        // Listen for scroll on the editor's scroll container so we can
        // highlight the ToC heading whose section is most visible.
        const scrollContainer = this.editor.container.parentElement;
        if (scrollContainer) {
            this._scrollHandler = () => {
                if (this._programmaticScroll) return;
                // User scrolled — clear the locked heading so normal
                // scroll-based highlighting resumes.
                this._lockedHeadingId = null;
                this._updateActiveHeading();
            };
            scrollContainer.addEventListener('scroll', this._scrollHandler, { passive: true });
        }

        this.refresh();
    }

    /**
     * Re-attaches the MutationObserver to the editor's current container.
     * Call this after swapping the editor container (e.g. on tab switch).
     */
    reobserve() {
        if (this._observer) {
            this._observer.disconnect();
            this._observer.observe(this.editor.container, {
                childList: true,
                subtree: true,
                characterData: true,
            });
        }
        this.refresh();
    }

    /**
     * Extracts h1–h3 headings from the syntax tree and re-renders the TOC.
     */
    refresh() {
        const nav = this.container.querySelector('.toc-nav');
        if (!nav) return;

        const headings = this._extractHeadings();

        if (headings.length === 0) {
            nav.innerHTML = '<p class="toc-empty">No headings</p>';
            return;
        }

        this._buildNodeToHeadingMap(headings);

        const list = this._buildNestedList(headings);
        nav.replaceChildren(list);

        this._updateActiveHeading();
    }

    /**
     * Reads the editor's syntax tree and returns an ordered array of h1–h3
     * headings with their node IDs and plain-text content.
     * @returns {TocHeading[]}
     */
    _extractHeadings() {
        const tree = this.editor.syntaxTree;
        if (!tree) return [];

        /** @type {TocHeading[]} */
        const headings = [];
        this._collectHeadings(tree.children, headings);
        return headings;
    }

    /**
     * Recursively collects h1–h3 headings from a list of nodes.
     * Descends into container nodes (e.g. html-block) so that headings
     * nested inside HTML elements appear in the table of contents.
     * @param {import('../parser/syntax-tree.js').SyntaxNode[]} nodes
     * @param {TocHeading[]} headings
     */
    _collectHeadings(nodes, headings) {
        for (const node of nodes) {
            const level = this._headingLevel(node.type);
            if (level >= 1 && level <= 3) {
                headings.push({
                    id: node.id,
                    level,
                    text: node.content || '(empty)',
                });
            }
            // Recurse into container nodes
            if (node.children.length > 0) {
                this._collectHeadings(node.children, headings);
            }
        }
    }

    /**
     * Returns the heading level (1-6) for a node type string, or 0 if it is
     * not a heading.
     * @param {string} type
     * @returns {number}
     */
    _headingLevel(type) {
        const match = /^heading(\d)$/.exec(type);
        return match ? Number(match[1]) : 0;
    }

    /**
     * Walks the syntax tree in document order and maps every node ID to
     * the ID of the most recent h1–h3 heading that precedes it.  Nodes
     * that appear before the first heading are mapped to `''` (no heading).
     * @param {TocHeading[]} headings - The heading list produced by
     *   `_extractHeadings()` (used to build a fast heading-ID set).
     */
    _buildNodeToHeadingMap(headings) {
        this._nodeToHeadingId.clear();
        const headingIds = new Set(headings.map((h) => h.id));
        const tree = this.editor.syntaxTree;
        if (!tree) return;

        /** @type {string} */
        let currentHeadingId = '';

        /**
         * @param {import('../parser/syntax-tree.js').SyntaxNode[]} nodes
         */
        const walk = (nodes) => {
            for (const node of nodes) {
                if (headingIds.has(node.id)) {
                    currentHeadingId = node.id;
                }
                this._nodeToHeadingId.set(node.id, currentHeadingId);
                if (node.children.length > 0) {
                    walk(node.children);
                }
            }
        };
        walk(tree.children);
    }

    /**
     * Determines which ToC heading's section occupies the most visible
     * area in the scroll container and applies the `toc-active` CSS class
     * to the corresponding ToC link.
     */
    _updateActiveHeading() {
        // If a heading was locked by a ToC click, keep it highlighted.
        if (this._lockedHeadingId) {
            this._setActiveLink(this._lockedHeadingId);
            return;
        }

        const scrollContainer = this.editor.container.parentElement;
        if (!scrollContainer) return;

        const containerRect = scrollContainer.getBoundingClientRect();
        const viewTop = containerRect.top;
        const viewBottom = containerRect.bottom;

        /** @type {Map<string, number>} heading ID → visible pixels */
        const visiblePixels = new Map();

        const children = this.editor.container.children;
        for (let i = 0; i < children.length; i++) {
            const el = /** @type {HTMLElement} */ (children[i]);
            const nodeId = el.dataset.nodeId;
            if (!nodeId) continue;

            const headingId = this._nodeToHeadingId.get(nodeId);
            if (headingId === undefined) continue;

            const rect = el.getBoundingClientRect();
            const visTop = Math.max(rect.top, viewTop);
            const visBottom = Math.min(rect.bottom, viewBottom);
            const visible = Math.max(0, visBottom - visTop);
            if (visible > 0) {
                visiblePixels.set(headingId, (visiblePixels.get(headingId) || 0) + visible);
            }
        }

        // Find the heading with the most visible pixels.
        let bestId = '';
        let bestPixels = 0;
        for (const [id, px] of visiblePixels) {
            if (px > bestPixels) {
                bestId = id;
                bestPixels = px;
            }
        }

        this._setActiveLink(bestId);
    }

    /**
     * Applies the `toc-active` class to the link matching the given
     * heading ID and removes it from all others.  Also scrolls the ToC
     * sidebar so the active link is centred.
     * @param {string} headingId
     */
    _setActiveLink(headingId) {
        const links = this.container.querySelectorAll('.toc-link');
        for (const link of links) {
            const a = /** @type {HTMLElement} */ (link);
            const isActive = a.dataset.nodeId === headingId;
            a.classList.toggle('toc-active', isActive);
            if (isActive) {
                // Scroll the ToC sidebar so the active link is centered
                // vertically within the visible area.
                const tocRect = this.container.getBoundingClientRect();
                const linkRect = a.getBoundingClientRect();
                const linkCenter = linkRect.top + linkRect.height / 2;
                const tocCenter = tocRect.top + tocRect.height / 2;
                const offset = linkCenter - tocCenter;
                this.container.scrollTop += offset;
            }
        }
    }

    /**
     * Builds a nested `<ul>` list from the flat heading array.
     * Lower-level headings (h2 inside h1, h3 inside h2) are nested.
     * @param {TocHeading[]} headings
     * @returns {HTMLUListElement}
     */
    _buildNestedList(headings) {
        const root = document.createElement('ul');
        root.className = 'toc-list';

        /** @type {{ list: HTMLUListElement, level: number }[]} */
        const stack = [{ list: root, level: 0 }];

        for (const heading of headings) {
            // Pop back up the stack until we find a parent whose level is
            // strictly less than this heading's level.
            while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) {
                stack.pop();
            }

            const parent = stack[stack.length - 1].list;

            const li = document.createElement('li');
            li.className = `toc-item toc-level-${heading.level}`;

            const link = document.createElement('a');
            link.className = 'toc-link';
            link.href = '#';
            link.textContent = heading.text;
            link.dataset.nodeId = heading.id;
            // Prevent mousedown from stealing focus away from the editor.
            // Without this, clicking a TOC link fires the editor's
            // handleBlur (which clears treeCursor and re-renders) before
            // _scrollToHeading runs, disrupting the scroll.
            link.addEventListener('mousedown', (e) => e.preventDefault());
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this._scrollToHeading(heading.id);
            });

            li.appendChild(link);
            parent.appendChild(li);

            // Push a new nesting context for potential children
            const subList = document.createElement('ul');
            subList.className = 'toc-list';
            li.appendChild(subList);
            stack.push({ list: subList, level: heading.level });
        }

        // Remove any empty trailing <ul> elements that were never populated
        this._pruneEmptyLists(root);

        return root;
    }

    /**
     * Recursively removes empty `<ul>` elements from the tree.
     * @param {HTMLElement} el
     */
    _pruneEmptyLists(el) {
        const lists = el.querySelectorAll('ul');
        for (let i = lists.length - 1; i >= 0; i--) {
            const ul = lists[i];
            if (ul.children.length === 0) {
                ul.remove();
            }
        }
    }

    /**
     * Scrolls the editor so that the heading with the given node ID is
     * positioned at the top of the scrollable container, and places the
     * cursor at the start of that heading.
     * @param {string} nodeId
     */
    _scrollToHeading(nodeId) {
        // Move the editor cursor to the target heading.  Only re-render
        // the previously-focused node and the new target — there is no
        // reason to rebuild the entire DOM.
        const oldNodeId = this.editor.treeCursor?.nodeId;
        this.editor.treeCursor = { nodeId, offset: 0 };
        this.editor.container.focus({ preventScroll: true });

        const updated = [nodeId];
        if (oldNodeId && oldNodeId !== nodeId) updated.push(oldNodeId);
        this.editor.renderNodesAndPlaceCursor({ updated });
        this.editor._lastRenderedNodeId = nodeId;

        // Lock the ToC highlight to the clicked heading until the
        // user scrolls the document themselves.
        this._lockedHeadingId = nodeId;
        this._setActiveLink(nodeId);

        // Defer the scroll to the next animation frame so it runs
        // *after* any browser-initiated scroll-into-view triggered by
        // the selection change above.  This guarantees our scroll
        // position wins.
        this._programmaticScroll = true;
        requestAnimationFrame(() => {
            const target = this.editor.container.querySelector(`[data-node-id="${nodeId}"]`);
            if (!target) return;

            const scrollContainer = this.editor.container.parentElement;
            if (scrollContainer) {
                const containerRect = scrollContainer.getBoundingClientRect();
                const headingRect = target.getBoundingClientRect();
                scrollContainer.scrollTo({
                    top: scrollContainer.scrollTop + (headingRect.top - containerRect.top),
                    behavior: 'instant',
                });
            }

            // Clear the programmatic-scroll flag after the browser has
            // finished processing the scroll.
            requestAnimationFrame(() => {
                this._programmaticScroll = false;
            });
        });
    }

    /**
     * Shows or hides the TOC sidebar.
     * @param {boolean} visible
     */
    setVisible(visible) {
        this._visible = visible;
        this.container.classList.toggle('hidden', !visible);
    }

    /**
     * Returns whether the TOC is currently visible.
     * @returns {boolean}
     */
    isVisible() {
        return this._visible;
    }

    /**
     * Sets the sidebar position (left or right of the editor).
     * @param {TocPosition} position
     */
    setPosition(position) {
        this._position = position;
        const wrapper = this.container.parentElement;
        if (wrapper) {
            wrapper.classList.toggle('toc-position-left', position === 'left');
            wrapper.classList.toggle('toc-position-right', position === 'right');
        }
    }

    /**
     * Returns the current sidebar position.
     * @returns {TocPosition}
     */
    getPosition() {
        return this._position;
    }

    /**
     * Sets the sidebar width via CSS custom property.
     * @param {number} width - Width in pixels
     */
    setWidth(width) {
        const clamped = Math.max(120, Math.min(400, width));
        document.documentElement.style.setProperty('--toc-width', `${clamped}px`);
    }

    /**
     * Returns the current sidebar width in pixels.
     * @returns {number}
     */
    getWidth() {
        return this.container.offsetWidth;
    }

    /**
     * Sets up the drag-to-resize handle on the sidebar edge adjacent to the
     * editor.
     */
    _initResizeHandle() {
        const handle = this.container.querySelector('.toc-resize-handle');
        if (!handle) return;

        /** @type {boolean} */
        let dragging = false;

        /** @param {MouseEvent} e */
        const onMouseMove = (e) => {
            if (!dragging) return;
            e.preventDefault();

            const containerRect = this.container.getBoundingClientRect();
            let newWidth;

            if (this._position === 'right') {
                // Sidebar on the right: drag the left edge
                newWidth = containerRect.right - e.clientX;
            } else {
                // Sidebar on the left: drag the right edge
                newWidth = e.clientX - containerRect.left;
            }

            this.setWidth(newWidth);
        };

        const onMouseUp = () => {
            if (!dragging) return;
            dragging = false;
            handle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // Persist the final width
            this._persistWidth();
        };

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            dragging = true;
            handle.classList.add('dragging');
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    /**
     * Saves the current sidebar width to the settings database.
     */
    async _persistWidth() {
        if (!window.electronAPI) return;
        const width = this.getWidth();
        try {
            await window.electronAPI.setSetting('tocWidth', width);
        } catch {
            // Non-critical — ignore
        }
    }

    /**
     * Tears down the observer and scroll listener.
     */
    destroy() {
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
        if (this._scrollHandler) {
            const scrollContainer = this.editor.container.parentElement;
            if (scrollContainer) {
                scrollContainer.removeEventListener('scroll', this._scrollHandler);
            }
            this._scrollHandler = null;
        }
    }
}

/**
 * Applies the TOC visibility setting.
 * @param {boolean} visible
 * @param {TableOfContents|null} toc
 */
export function applyTocVisible(visible, toc) {
    if (toc) {
        toc.setVisible(visible);
    }
}

/**
 * Applies the TOC position setting.
 * @param {TocPosition} position
 * @param {TableOfContents|null} toc
 */
export function applyTocPosition(position, toc) {
    if (toc) {
        toc.setPosition(position);
    }
}

/**
 * Applies the TOC width setting.
 * @param {number} width - Width in pixels
 * @param {TableOfContents|null} toc
 */
export function applyTocWidth(width, toc) {
    if (toc) {
        toc.setWidth(width);
    }
}
