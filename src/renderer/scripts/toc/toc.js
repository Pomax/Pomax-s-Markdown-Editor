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
    }

    /**
     * Builds the initial DOM and sets up observation so the TOC refreshes
     * whenever the editor re-renders.
     */
    initialize() {
        this.container.innerHTML =
            '<h3 class="toc-title">Table of Contents</h3><nav class="toc-nav"></nav>';

        // Observe child-list changes on the editor container so we can
        // refresh the TOC whenever the document is re-rendered.
        this._observer = new MutationObserver(() => this.refresh());
        this._observer.observe(this.editor.container, {
            childList: true,
            subtree: true,
            characterData: true,
        });

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

        const list = this._buildNestedList(headings);
        nav.replaceChildren(list);
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

        for (const node of tree.children) {
            const level = this._headingLevel(node.type);
            if (level >= 1 && level <= 3) {
                headings.push({
                    id: node.id,
                    level,
                    text: node.content || '(empty)',
                });
            }
        }

        return headings;
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
        // Move the editor cursor to the target heading and force an
        // immediate render so the DOM is in its final state (in focused
        // mode the active node switches to raw-markdown display, which
        // changes element sizes).
        this.editor.treeCursor = { nodeId, offset: 0 };
        this.editor.container.focus({ preventScroll: true });
        this.editor.renderAndPlaceCursor();

        // Defer the scroll to the next animation frame so it runs
        // *after* any browser-initiated scroll-into-view triggered by
        // the selection change above.  This guarantees our scroll
        // position wins.
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
     * Tears down the observer.
     */
    destroy() {
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
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
