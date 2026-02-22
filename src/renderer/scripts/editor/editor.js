/**
 * @fileoverview Main Editor class.
 * Manages the document, view modes, and user interactions.
 *
 * All edits flow through the parse tree: user input is intercepted at the
 * keydown level, applied to the tree, and then the DOM is re-rendered from
 * the tree. The DOM is never the source of truth for content.
 *
 * The heavy lifting is delegated to focused manager classes; this file
 * wires them together and exposes the public API consumed by the toolbar,
 * IPC handlers, and tests.
 */

/// <reference path="../../../types.d.ts" />

import { DFAParser } from '../parser/dfa-parser.js';
import { MarkdownParser } from '../parser/markdown-parser.js';
import { SyntaxNode, SyntaxTree } from '../parser/syntax-tree.js';
import { ClipboardHandler } from './clipboard-handler.js';
import { CursorManager } from './cursor-manager.js';
import { EditOperations } from './edit-operations.js';
import { EventHandler } from './event-handler.js';
import { ImageHelper } from './image-helper.js';
import { InputHandler } from './input-handler.js';
import { LinkHelper } from './link-helper.js';
import { RangeOperations } from './range-operations.js';
import { FocusedRenderer } from './renderers/focused-renderer.js';
import { SourceRenderer } from './renderers/source-renderer.js';
import { SelectionManager } from './selection-manager.js';
import { TableManager } from './table-manager.js';
import { UndoManager } from './undo-manager.js';

/**
 * @typedef {'source' | 'focused'} ViewMode
 */

/**
 * @typedef {Object} TreeCursor
 * @property {string} nodeId - The ID of the node the cursor is in
 * @property {number} offset - The character offset within the node's content
 * @property {'opening'|'closing'} [tagPart] - If set, cursor is on an
 *     html-block container's opening or closing tag line (source view only).
 * @property {number} [cellRow] - Row index for table cell editing (0 = header).
 * @property {number} [cellCol] - Column index for table cell editing.
 */

/**
 * Represents a non-collapsed selection range mapped to tree coordinates.
 * Both endpoints are expressed as (nodeId, offset) pairs.
 * @typedef {Object} TreeRange
 * @property {string} startNodeId - The ID of the node the range starts in
 * @property {number} startOffset - Character offset within the start node's content
 * @property {string} endNodeId - The ID of the node the range ends in
 * @property {number} endOffset - Character offset within the end node's content
 */

/**
 * Main editor class that manages the markdown editing experience.
 */
export class Editor {
    /**
     * @param {HTMLElement} container - The editor container element
     */
    constructor(container) {
        /** @type {HTMLElement} */
        this.container = container;

        /** @type {MarkdownParser|DFAParser} */
        this.parser = new MarkdownParser();

        /** @type {'regex'|'dfa'} */
        this._parserType = 'regex';

        /** @type {SyntaxTree|null} */
        this.syntaxTree = null;

        /** @type {SourceRenderer} */
        this.sourceRenderer = new SourceRenderer(this);

        /** @type {FocusedRenderer} */
        this.focusedRenderer = new FocusedRenderer(this);

        /** @type {UndoManager} */
        this.undoManager = new UndoManager();

        /** @type {SelectionManager} */
        this.selectionManager = new SelectionManager(this);

        // ── Task managers ──

        /** @type {CursorManager} */
        this.cursorManager = new CursorManager(this);

        /** @type {TableManager} */
        this.tableManager = new TableManager(this);

        /** @type {InputHandler} */
        this.inputHandler = new InputHandler(this);

        /** @type {EditOperations} */
        this.editOperations = new EditOperations(this);

        /** @type {RangeOperations} */
        this.rangeOperations = new RangeOperations(this);

        /** @type {ClipboardHandler} */
        this.clipboardHandler = new ClipboardHandler(this);

        /** @type {EventHandler} */
        this.eventHandler = new EventHandler(this);

        /** @type {ImageHelper} */
        this.imageHelper = new ImageHelper(this);

        /** @type {LinkHelper} */
        this.linkHelper = new LinkHelper(this);

        // ── Editor state ──

        /** @type {ViewMode} */
        this.viewMode = 'focused';

        /** @type {boolean} */
        this._hasUnsavedChanges = false;

        /** @type {string|null} */
        this.currentFilePath = null;

        /** @type {boolean} Whether to auto-rewrite downstream image paths to relative form. */
        this.ensureLocalPaths = true;

        /** @type {boolean} Whether &lt;details&gt; blocks default to collapsed in focused view. */
        this.detailsClosed = false;

        /**
         * Tree-based cursor position.
         * @type {TreeCursor|null}
         */
        this.treeCursor = null;

        /**
         * Whether we are currently rendering (used to suppress input events).
         * @type {boolean}
         */
        this._isRendering = false;

        /**
         * Non-collapsed selection range mapped to tree coordinates.
         * null when the selection is collapsed (i.e. just a cursor).
         * @type {TreeRange|null}
         */
        this.treeRange = null;

        /**
         * The node ID that was last rendered as "active" in focused mode.
         * Used by handleSelectionChange / handleClick to detect node
         * transitions reliably — reading from treeCursor is unreliable
         * because syncCursorFromDOM mutates it before the re-render
         * decision is made.
         * @type {string|null}
         */
        this._lastRenderedNodeId = null;

        /**
         * Bound event handlers, keyed by event name.
         * Stored so they can be detached/reattached when swapping containers.
         * @type {Record<string, EventListener>}
         */
        this._boundHandlers = {};
    }

    // ──────────────────────────────────────────────
    //  Parser management
    // ──────────────────────────────────────────────

    /**
     * Switches the parser engine. If a document is loaded and the type
     * actually changed, re-parses it with the new parser and re-renders.
     * @param {'regex'|'dfa'} type
     */
    setParser(type) {
        if (type !== 'regex' && type !== 'dfa') {
            throw new Error(`Unknown parser type: ${type}`);
        }

        // Nothing to do if the type hasn't changed.
        if (type === this._parserType) return;

        if (type === 'regex') {
            this.parser = new MarkdownParser();
        } else {
            this.parser = new DFAParser();
        }
        this._parserType = type;

        // Re-parse the current document if one is loaded
        if (this.syntaxTree) {
            const markdown = this.syntaxTree.toMarkdown();
            this.loadMarkdown(markdown);
        }
    }

    /**
     * Re-parses a single markdown line to detect type changes during
     * editing. Delegates to the appropriate parser API.
     * @param {string} text
     * @returns {SyntaxNode|null}
     */
    _reparseLine(text) {
        if (this._parserType === 'regex') {
            return /** @type {MarkdownParser} */ (this.parser).parseSingleLine(text);
        }
        if (this._parserType === 'dfa') {
            return this.parser.parse(text).children[0] ?? null;
        }
        throw new Error(`Unknown parser type: ${this._parserType}`);
    }

    /**
     * Parses a multi-line markdown string (e.g. from a paste) into an
     * array of nodes. Delegates to the appropriate parser API.
     * @param {string} combined - The full markdown string to parse.
     * @returns {SyntaxNode[]}
     */
    _parseMultiLine(combined) {
        if (this._parserType === 'regex') {
            const lines = combined.split('\n');
            /** @type {SyntaxNode[]} */
            const nodes = [];
            let i = 0;
            while (i < lines.length) {
                const result = /** @type {MarkdownParser} */ (this.parser).parseLine(lines, i);
                if (result.node) {
                    nodes.push(result.node);
                }
                i = result.nextIndex;
            }
            return nodes;
        }
        if (this._parserType === 'dfa') {
            return [...this.parser.parse(combined).children];
        }
        throw new Error(`Unknown parser type: ${this._parserType}`);
    }

    // ──────────────────────────────────────────────
    //  Initialization
    // ──────────────────────────────────────────────

    /**
     * Initializes the editor.
     */
    async initialize() {
        // Set up initial empty document with one empty paragraph
        this.syntaxTree = new SyntaxTree();
        const initialNode = new SyntaxNode('paragraph', '');
        this.syntaxTree.appendChild(initialNode);
        this.treeCursor = { nodeId: initialNode.id, offset: 0 };

        // Set up event listeners
        this.setupEventListeners();

        // Render initial state
        this.fullRender();
        this.placeCursor();
    }

    /**
     * Sets up event listeners for the editor.
     */
    setupEventListeners() {
        // Store bound handlers so they can be removed/reattached
        // when swapping to a different container element.
        this._boundHandlers = {
            keydown: /** @type {EventListener} */ (
                this.inputHandler.handleKeyDown.bind(this.inputHandler)
            ),
            beforeinput: /** @type {EventListener} */ (
                this.inputHandler.handleBeforeInput.bind(this.inputHandler)
            ),
            mousedown: /** @type {EventListener} */ (
                this.eventHandler.handleMouseDown.bind(this.eventHandler)
            ),
            click: /** @type {EventListener} */ (
                this.eventHandler.handleClick.bind(this.eventHandler)
            ),
            focus: /** @type {EventListener} */ (
                this.eventHandler.handleFocus.bind(this.eventHandler)
            ),
            blur: /** @type {EventListener} */ (
                this.eventHandler.handleBlur.bind(this.eventHandler)
            ),
            cut: /** @type {EventListener} */ (
                this.clipboardHandler.handleCut.bind(this.clipboardHandler)
            ),
            copy: /** @type {EventListener} */ (
                this.clipboardHandler.handleCopy.bind(this.clipboardHandler)
            ),
            dragover: /** @type {EventListener} */ (
                this.eventHandler.handleDragOver.bind(this.eventHandler)
            ),
            drop: /** @type {EventListener} */ (
                /** @type {unknown} */ (this.eventHandler.handleDrop.bind(this.eventHandler))
            ),
        };

        this._attachContainerListeners();

        document.addEventListener(
            'selectionchange',
            this.eventHandler.handleSelectionChange.bind(this.eventHandler),
        );
    }

    /**
     * Attaches the stored event handlers to the current container.
     */
    _attachContainerListeners() {
        for (const [event, handler] of Object.entries(this._boundHandlers)) {
            this.container.addEventListener(event, handler);
        }
    }

    /**
     * Detaches the stored event handlers from the current container.
     */
    _detachContainerListeners() {
        for (const [event, handler] of Object.entries(this._boundHandlers)) {
            this.container.removeEventListener(event, handler);
        }
    }

    /**
     * Swaps the editor's active container to a different element.
     * Moves event listeners from the old container to the new one.
     * @param {HTMLElement} newContainer
     */
    swapContainer(newContainer) {
        this._detachContainerListeners();
        this.container = newContainer;
        this._attachContainerListeners();
    }

    // ──────────────────────────────────────────────
    //  Tree cursor helpers
    // ──────────────────────────────────────────────

    /**
     * Returns the SyntaxNode that the tree cursor currently points at.
     * @returns {SyntaxNode|null}
     */
    getCurrentNode() {
        if (!this.treeCursor || !this.syntaxTree) return null;
        return this.syntaxTree.findNodeById(this.treeCursor.nodeId);
    }

    /**
     * Returns the sibling list that contains the given node.
     * For top-level nodes this is `syntaxTree.children`; for nodes
     * inside a container (e.g. html-block) it is `node.parent.children`.
     * @param {SyntaxNode} node
     * @returns {SyntaxNode[]}
     */
    getSiblings(node) {
        if (node.parent) return node.parent.children;
        return this.syntaxTree?.children ?? [];
    }

    /**
     * Returns the index of a node inside its sibling list.
     * Works for both top-level nodes and nodes nested inside containers.
     * @param {SyntaxNode} node
     * @returns {number}
     */
    getNodeIndex(node) {
        return this.getSiblings(node).indexOf(node);
    }

    // ──────────────────────────────────────────────
    //  Cursor delegation
    // ──────────────────────────────────────────────

    /** Syncs the tree cursor/range from the current DOM selection. */
    syncCursorFromDOM() {
        this.cursorManager.syncCursorFromDOM();
    }

    /** Places the DOM cursor at the position described by `this.treeCursor`. */
    placeCursor() {
        this.cursorManager.placeCursor();
    }

    // ──────────────────────────────────────────────
    //  Rendering
    // ──────────────────────────────────────────────

    /**
     * Full re-render: tears down the entire DOM and rebuilds it from
     * the syntax tree.  Use only for operations that affect the whole
     * document (initial load, file open, view-mode switch, undo/redo).
     */
    fullRender() {
        if (!this.syntaxTree) return;

        this._isRendering = true;
        try {
            const renderer =
                this.viewMode === 'source' ? this.sourceRenderer : this.focusedRenderer;
            renderer.fullRender(this.syntaxTree, this.container);
        } finally {
            this._isRendering = false;
        }
        document.dispatchEvent(new CustomEvent('editor:renderComplete'));
    }

    /**
     * Incremental render: updates only the DOM elements for the nodes
     * listed in `hints`.  Falls back to a full render in source mode
     * (the source renderer does not yet support incremental updates).
     *
     * @param {{ updated?: string[], added?: string[], removed?: string[] }} hints
     */
    renderNodes(hints) {
        if (!this.syntaxTree) return;

        if (this.viewMode === 'focused') {
            this._isRendering = true;
            try {
                this.focusedRenderer.renderNodes(this.container, hints);
            } finally {
                this._isRendering = false;
            }
            document.dispatchEvent(new CustomEvent('editor:renderComplete'));
        } else {
            this.fullRender();
        }
    }

    /**
     * Full render followed by cursor placement.
     */
    fullRenderAndPlaceCursor() {
        this.fullRender();
        this._lastRenderedNodeId = this.treeCursor?.nodeId ?? null;
        this.placeCursor();
    }

    /**
     * Incremental render followed by cursor placement.
     * @param {{ updated?: string[], added?: string[], removed?: string[] }} hints
     */
    renderNodesAndPlaceCursor(hints) {
        this.renderNodes(hints);
        this.placeCursor();
    }

    // ──────────────────────────────────────────────
    //  Helpers for tree-level edits
    // ──────────────────────────────────────────────

    /**
     * Builds the full markdown source line for a node, including its syntax
     * prefix (e.g. `# ` for heading1).  This is fed to `parseSingleLine` so
     * the parser can detect type transitions.
     *
     * @param {string} type
     * @param {string} content
     * @param {import('../parser/syntax-tree.js').NodeAttributes} attributes
     * @returns {string}
     */
    buildMarkdownLine(type, content, attributes) {
        switch (type) {
            case 'heading1':
                return `# ${content}`;
            case 'heading2':
                return `## ${content}`;
            case 'heading3':
                return `### ${content}`;
            case 'heading4':
                return `#### ${content}`;
            case 'heading5':
                return `##### ${content}`;
            case 'heading6':
                return `###### ${content}`;
            case 'blockquote':
                return `> ${content}`;
            case 'list-item': {
                const indent = '  '.repeat(attributes?.indent || 0);
                const marker = attributes?.ordered ? `${attributes?.number || 1}. ` : '- ';
                return `${indent}${marker}${content}`;
            }
            case 'image': {
                const imgAlt = attributes?.alt ?? content;
                const imgSrc = attributes?.url ?? '';
                if (attributes?.href) {
                    return `[![${imgAlt}](${imgSrc})](${attributes.href})`;
                }
                return `![${imgAlt}](${imgSrc})`;
            }
            default:
                return content;
        }
    }

    /**
     * Returns the character length of the syntax prefix for a given node type.
     * E.g. heading1 → 2 (`# `), heading2 → 3 (`## `), paragraph → 0.
     *
     * @param {string} type
     * @param {import('../parser/syntax-tree.js').NodeAttributes} [attributes]
     * @returns {number}
     */
    getPrefixLength(type, attributes) {
        switch (type) {
            case 'heading1':
                return 2;
            case 'heading2':
                return 3;
            case 'heading3':
                return 4;
            case 'heading4':
                return 5;
            case 'heading5':
                return 6;
            case 'heading6':
                return 7;
            case 'blockquote':
                return 2;
            case 'list-item': {
                const indent = '  '.repeat(attributes?.indent || 0);
                const marker = attributes?.ordered ? `${attributes?.number || 1}. ` : '- ';
                return indent.length + marker.length;
            }
            case 'image':
                return 0;
            default:
                return 0;
        }
    }

    /**
     * Records an undo entry, marks the document dirty, renders, and places
     * the cursor.
     * @param {string} before - The markdown content before the edit
     * @param {{ updated?: string[], added?: string[], removed?: string[] }} [hints]
     */
    recordAndRender(before, hints) {
        if (!this.syntaxTree) return;

        const addedPara = this._ensureTrailingParagraph();
        if (addedPara && hints) {
            if (!hints.added) hints.added = [];
            hints.added.push(addedPara.id);
        }

        const after = this.syntaxTree.toMarkdown();
        if (before !== after) {
            this.undoManager.recordChange({ type: 'input', before, after });
            this.setUnsavedChanges(true);
        }

        if (hints) {
            this.renderNodesAndPlaceCursor(hints);
        } else {
            this.fullRenderAndPlaceCursor();
        }
    }

    /**
     * Ensures that the document does not end with an html-block container.
     * In focused view there is no way to place the cursor after a trailing
     * `</details>` block, so we append an empty paragraph whenever the last
     * top-level node is a container html-block.
     */
    _ensureTrailingParagraph() {
        if (!this.syntaxTree) return null;
        const children = this.syntaxTree.children;
        if (children.length === 0) return null;
        const last = children[children.length - 1];
        if (last.type === 'html-block' && last.children.length > 0) {
            const para = new SyntaxNode('paragraph', '');
            this.syntaxTree.appendChild(para);
            return para;
        }
        return null;
    }

    // ──────────────────────────────────────────────
    //  Public API (used by toolbar, IPC, tests, …)
    // ──────────────────────────────────────────────

    /**
     * Loads markdown content into the editor.
     * @param {string} markdown - The markdown content to load
     */
    loadMarkdown(markdown) {
        // Normalise excessive blank lines so that toMarkdown() / toBareText()
        // always produce exactly one blank line between blocks.
        const normalised = markdown.replace(/\n{3,}/g, '\n\n');
        this.syntaxTree = this.parser.parse(normalised);

        // Ensure there is at least one node so the editor is never empty
        if (this.syntaxTree.children.length === 0) {
            const node = new SyntaxNode('paragraph', '');
            this.syntaxTree.appendChild(node);
        }

        // Ensure the document doesn't end with a container html-block
        // (the user would have no way to place the cursor after it in
        // focused view).
        this._ensureTrailingParagraph();

        const first = this.syntaxTree.children[0];
        this.treeCursor = { nodeId: first.id, offset: 0 };

        this.undoManager.clear();
        this.setUnsavedChanges(false);

        // Rewrite absolute image paths to relative when the setting is enabled,
        // then render.  Because the rewrite is async (IPC round-trip) we render
        // once immediately and incrementally update only the image nodes whose
        // paths changed after the rewrite completes.
        this.fullRenderAndPlaceCursor();
        this.container.focus();
        this.imageHelper.rewriteImagePaths().then((changedIds) => {
            if (changedIds.length > 0) {
                this.renderNodesAndPlaceCursor({ updated: changedIds });
            }
        });
    }

    /**
     * Gets the current document as markdown.
     * @returns {string}
     */
    getMarkdown() {
        return this.syntaxTree?.toMarkdown() ?? '';
    }

    /**
     * Resets the editor to an empty document.
     */
    reset() {
        this.syntaxTree = new SyntaxTree();
        const node = new SyntaxNode('paragraph', '');
        this.syntaxTree.appendChild(node);
        this.treeCursor = { nodeId: node.id, offset: 0 };
        this.undoManager.clear();
        this.currentFilePath = null;
        this.setUnsavedChanges(false);
        this.fullRenderAndPlaceCursor();
    }

    /**
     * Sets the view mode.
     * @param {ViewMode} mode
     */
    setViewMode(mode) {
        if (mode !== 'source' && mode !== 'focused') {
            console.warn(`Invalid view mode: ${mode}`);
            return;
        }

        // Nothing to do if already in the requested mode.
        if (mode === this.viewMode) return;

        // Anchor on the cursor's node if one exists, since that is what
        // the user is focused on.  Fall back to the node closest to the
        // viewport centre so content doesn't jump when there is no cursor.
        const scrollContainer = this.container.parentElement;
        /** @type {string|null} */
        let anchorNodeId = null;
        let savedOffsetFromTop = null;

        if (scrollContainer) {
            const containerRect = scrollContainer.getBoundingClientRect();

            // Prefer the cursor's node as anchor.
            if (this.treeCursor) {
                const cursorEl = this.container.querySelector(
                    `[data-node-id="${this.treeCursor.nodeId}"]`,
                );
                if (cursorEl) {
                    anchorNodeId = this.treeCursor.nodeId;
                    savedOffsetFromTop = cursorEl.getBoundingClientRect().top - containerRect.top;
                }
            }

            // Fallback: node closest to the viewport centre.
            if (!anchorNodeId) {
                const centreY = containerRect.top + containerRect.height / 2;
                const nodeEls = this.container.querySelectorAll('[data-node-id]');
                let bestDistance = Number.POSITIVE_INFINITY;

                for (const el of nodeEls) {
                    const rect = el.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    const dist = Math.abs(mid - centreY);
                    if (dist < bestDistance) {
                        bestDistance = dist;
                        anchorNodeId = /** @type {HTMLElement} */ (el).dataset.nodeId ?? null;
                        savedOffsetFromTop = rect.top - containerRect.top;
                    }
                }
            }
        }

        this.viewMode = mode;
        this.container.dataset.viewMode = mode;
        this.fullRenderAndPlaceCursor();

        // Restore scroll so the anchor node sits at the same viewport offset.
        if (anchorNodeId && scrollContainer && savedOffsetFromTop !== null) {
            const el = this.container.querySelector(`[data-node-id="${anchorNodeId}"]`);
            if (el) {
                const containerRect = scrollContainer.getBoundingClientRect();
                const currentOffsetFromTop = el.getBoundingClientRect().top - containerRect.top;
                scrollContainer.scrollTop += currentOffsetFromTop - savedOffsetFromTop;
            }
        }
    }

    /**
     * Gets the current view mode.
     * @returns {ViewMode}
     */
    getViewMode() {
        return this.viewMode;
    }

    /** Undoes the last action. */
    undo() {
        const change = this.undoManager.undo();
        if (change) {
            this.syntaxTree = this.parser.parse(change.before);
            if (this.syntaxTree.children.length === 0) {
                const node = new SyntaxNode('paragraph', '');
                this.syntaxTree.appendChild(node);
            }
            const first = this.syntaxTree.children[0];
            this.treeCursor = { nodeId: first.id, offset: 0 };
            this.fullRenderAndPlaceCursor();
            this.setUnsavedChanges(true);
        }
    }

    /** Redoes the last undone action. */
    redo() {
        const change = this.undoManager.redo();
        if (change) {
            this.syntaxTree = this.parser.parse(change.after);
            if (this.syntaxTree.children.length === 0) {
                const node = new SyntaxNode('paragraph', '');
                this.syntaxTree.appendChild(node);
            }
            const last = this.syntaxTree.children[this.syntaxTree.children.length - 1];
            this.treeCursor = { nodeId: last.id, offset: last.content.length };
            this.fullRenderAndPlaceCursor();
            this.setUnsavedChanges(true);
        }
    }

    /**
     * Inserts text at the current cursor position (public API).
     * @param {string} text
     */
    insertText(text) {
        this.editOperations.insertTextAtCursor(text);
    }

    /**
     * Returns the shared ImageModal instance, creating it lazily.
     * Both the toolbar and editor use this to avoid duplicate dialogs.
     * @returns {import('../image/image-modal.js').ImageModal}
     */
    getImageModal() {
        return this.imageHelper.getImageModal();
    }

    /**
     * Inserts a new image node or updates the existing image node at the cursor.
     * @param {string} alt - Alt text
     * @param {string} src - Image source path or URL
     * @param {string} href - Optional link URL (empty string for no link)
     * @param {string} [style] - Optional inline style
     */
    insertOrUpdateImage(alt, src, href, style = '') {
        this.imageHelper.insertOrUpdateImage(alt, src, href, style);
    }

    /**
     * Converts an absolute image path to a relative path.
     * @param {string} imagePath
     * @returns {Promise<string>}
     */
    async toRelativeImagePath(imagePath) {
        return this.imageHelper.toRelativeImagePath(imagePath);
    }

    /**
     * Rewrites absolute image paths to relative paths.
     * @returns {Promise<string[]>} IDs of nodes whose paths were rewritten.
     */
    async rewriteImagePaths() {
        return this.imageHelper.rewriteImagePaths();
    }

    /**
     * Inserts a new table node or updates the existing table node at the cursor.
     * @param {{rows: number, columns: number, cells: string[][]}} tableData
     */
    insertOrUpdateTable(tableData) {
        if (!this.syntaxTree) return;

        // Build markdown from the cells
        const markdown = this.tableManager.buildTableMarkdown(tableData);

        const before = this.syntaxTree.toMarkdown();
        const currentNode = this.getCurrentNode();
        let renderHints;

        if (currentNode?.type === 'table') {
            // Update existing table
            currentNode.content = markdown;
            this.treeCursor = { nodeId: currentNode.id, offset: 0 };
            renderHints = { updated: [currentNode.id] };
        } else {
            // Insert a new table node
            const tableNode = new SyntaxNode('table', markdown);

            if (currentNode) {
                const siblings = this.getSiblings(currentNode);
                const idx = siblings.indexOf(currentNode);
                if (currentNode.type === 'paragraph' && currentNode.content === '') {
                    siblings.splice(idx, 1, tableNode);
                    tableNode.parent = currentNode.parent;
                    currentNode.parent = null;
                    renderHints = { added: [tableNode.id], removed: [currentNode.id] };
                } else {
                    siblings.splice(idx + 1, 0, tableNode);
                    tableNode.parent = currentNode.parent;
                    renderHints = { added: [tableNode.id] };
                }
            } else {
                this.syntaxTree.appendChild(tableNode);
                renderHints = { added: [tableNode.id] };
            }

            this.treeCursor = { nodeId: tableNode.id, offset: 0 };
        }

        this.recordAndRender(before, renderHints);
    }

    /**
     * Changes the type of the current element.
     * @param {string} elementType
     */
    changeElementType(elementType) {
        const currentNode = this.getCurrentNode();
        if (!currentNode || !this.syntaxTree) return;

        // html-block containers are structural nodes, not type-changeable.
        if (currentNode.type === 'html-block' && currentNode.children.length > 0) return;

        const wasListItem = currentNode.type === 'list-item';
        const siblings = this.getSiblings(currentNode);
        const idx = siblings.indexOf(currentNode);

        const beforeContent = this.getMarkdown();
        this.syntaxTree.changeNodeType(currentNode, elementType);

        // If a list item was removed from a run, renumber the remaining items.
        /** @type {string[]} */
        let renumbered = [];
        if (wasListItem && currentNode.type !== 'list-item') {
            renumbered = this.renumberAdjacentList(siblings, idx);
        }

        this.undoManager.recordChange({
            type: 'changeType',
            before: beforeContent,
            after: this.getMarkdown(),
        });

        const updatedIds = [currentNode.id, ...renumbered];
        this.renderNodesAndPlaceCursor({ updated: updatedIds });
        this.setUnsavedChanges(true);
    }

    /**
     * Toggles list formatting on the current node.
     *
     * - Non-list → list-item (ordered or unordered)
     * - List-item of same type → paragraph (toggle off)
     * - List-item of other type → switch ordered ↔ unordered
     *
     * @param {boolean} ordered - `true` for numbered, `false` for bullet
     */
    toggleList(ordered) {
        const currentNode = this.getCurrentNode();
        if (!currentNode || !this.syntaxTree) return;

        // html-block containers are structural nodes, not convertible.
        if (currentNode.type === 'html-block' && currentNode.children.length > 0) return;

        const before = this.getMarkdown();

        // Multi-node selection: convert each node in the range to a list item.
        if (this.treeRange && this.treeRange.startNodeId !== this.treeRange.endNodeId) {
            const nodes = this._getNodesInRange(
                this.treeRange.startNodeId,
                this.treeRange.endNodeId,
            );
            const updatedIds = [];
            let num = 1;
            for (const n of nodes) {
                if (n.type === 'html-block' && n.children.length > 0) continue;
                if (n.type === 'table' || n.type === 'image' || n.type === 'linked-image') continue;
                n.type = 'list-item';
                n.attributes = { ordered, indent: 0 };
                if (ordered) {
                    n.attributes.number = num++;
                }
                updatedIds.push(n.id);
            }
            if (updatedIds.length === 0) return;

            this.treeRange = null;
            this.undoManager.recordChange({
                type: 'changeType',
                before,
                after: this.getMarkdown(),
            });
            this.renderNodesAndPlaceCursor({ updated: updatedIds });
            this.setUnsavedChanges(true);
            return;
        }

        // Single node toggle — when on a list item, affect the entire
        // contiguous run of list items (the "list").
        if (currentNode.type === 'list-item') {
            const siblings = this.getSiblings(currentNode);
            const run = this._getContiguousListRun(siblings, currentNode);

            if (!!currentNode.attributes.ordered === ordered) {
                // Same list type → convert entire run back to paragraphs
                for (const n of run) {
                    n.type = 'paragraph';
                    n.attributes = {};
                }
            } else {
                // Different list type → switch entire run
                let num = 1;
                for (const n of run) {
                    n.attributes.ordered = ordered;
                    if (ordered) {
                        n.attributes.number = num++;
                    } else {
                        n.attributes.number = undefined;
                    }
                }
            }

            this.undoManager.recordChange({
                type: 'changeType',
                before,
                after: this.getMarkdown(),
            });
            this.renderNodesAndPlaceCursor({ updated: run.map((n) => n.id) });
            this.setUnsavedChanges(true);
            return;
        }
        currentNode.type = 'list-item';
        currentNode.attributes = { ordered, indent: 0 };
        if (ordered) {
            currentNode.attributes.number = 1;
        }

        this.undoManager.recordChange({
            type: 'changeType',
            before,
            after: this.getMarkdown(),
        });

        this.renderNodesAndPlaceCursor({ updated: [currentNode.id] });
        this.setUnsavedChanges(true);
    }

    /**
     * Returns the contiguous run of `list-item` nodes surrounding `node`
     * within the given sibling list.
     *
     * @param {import('../parser/syntax-tree.js').SyntaxNode[]} siblings
     * @param {import('../parser/syntax-tree.js').SyntaxNode} node
     * @returns {import('../parser/syntax-tree.js').SyntaxNode[]}
     */
    _getContiguousListRun(siblings, node) {
        const idx = siblings.indexOf(node);
        let start = idx;
        let end = idx;
        while (start > 0 && siblings[start - 1].type === 'list-item') start--;
        while (end < siblings.length - 1 && siblings[end + 1].type === 'list-item') end++;
        return siblings.slice(start, end + 1);
    }

    /**
     * Renumbers all ordered list items in the contiguous run surrounding
     * `nearIndex` so they are sequential starting from 1.  Returns the
     * IDs of every node whose number was changed (for render hints).
     *
     * @param {import('../parser/syntax-tree.js').SyntaxNode[]} siblings
     * @param {number} nearIndex - Index of a node in or adjacent to the run
     * @returns {string[]} IDs of nodes that were renumbered
     */
    renumberAdjacentList(siblings, nearIndex) {
        // Find the start of the contiguous list-item run
        let start = nearIndex;
        while (start > 0 && siblings[start - 1]?.type === 'list-item') start--;
        // Find the end
        let end = nearIndex;
        while (end < siblings.length - 1 && siblings[end + 1]?.type === 'list-item') end++;

        const changed = [];
        let num = 1;
        for (let i = start; i <= end; i++) {
            const sib = siblings[i];
            if (sib.type !== 'list-item' || !sib.attributes.ordered) continue;
            if (sib.attributes.number !== num) {
                sib.attributes.number = num;
                changed.push(sib.id);
            }
            num++;
        }
        return changed;
    }

    /**
     * Gets all nodes between two node IDs (inclusive), walking the flat
     * top-level children of the syntax tree.
     *
     * @param {string} startId
     * @param {string} endId
     * @returns {import('../parser/syntax-tree.js').SyntaxNode[]}
     */
    _getNodesInRange(startId, endId) {
        if (!this.syntaxTree) return [];
        const children = this.syntaxTree.children;
        let collecting = false;
        const result = [];
        for (const child of children) {
            if (child.id === startId) collecting = true;
            if (collecting) result.push(child);
            if (child.id === endId) break;
        }
        return result;
    }

    /**
     * Applies formatting to the current selection.
     * @param {string} format
     */
    applyFormat(format) {
        if (!this.syntaxTree) return;

        // Use tree-coordinate selection (treeCursor / treeRange) — never
        // DOM-derived line/column data.
        const node = this.getCurrentNode();
        if (!node || !this.treeCursor) return;

        const nodeId = this.treeCursor.nodeId;
        let startOffset;
        let endOffset;

        if (this.treeRange) {
            // Non-collapsed selection — use the range offsets.
            // For now we only support single-node selections.
            if (this.treeRange.startNodeId !== nodeId || this.treeRange.endNodeId !== nodeId)
                return;
            startOffset = this.treeRange.startOffset;
            endOffset = this.treeRange.endOffset;
        } else {
            // Collapsed cursor — pass the cursor position; applyFormat will
            // detect the word boundaries or existing format span.
            startOffset = this.treeCursor.offset;
            endOffset = this.treeCursor.offset;
        }

        const beforeContent = this.getMarkdown();
        const newCursorOffset = this.syntaxTree.applyFormat(node, startOffset, endOffset, format);

        this.undoManager.recordChange({
            type: 'format',
            before: beforeContent,
            after: this.getMarkdown(),
        });

        // Place cursor at the end of the formatted/unformatted text and
        // collapse the selection — the old range is no longer valid.
        this.treeCursor.offset = newCursorOffset;
        this.treeRange = null;

        this.renderNodesAndPlaceCursor({ updated: [nodeId] });
        this.setUnsavedChanges(true);
    }

    /**
     * Sets the cursor position.
     * @param {number} line
     * @param {number} column
     */
    setCursorPosition(line, column) {
        this.selectionManager.setCursorPosition(line, column);
    }

    /**
     * Sets the selection range.
     * @param {{startLine: number, startColumn: number, endLine: number, endColumn: number}} range
     */
    setSelection(range) {
        this.selectionManager.setSelection(range);
    }

    /**
     * Sets whether there are unsaved changes.
     * @param {boolean} hasChanges
     */
    setUnsavedChanges(hasChanges) {
        this._hasUnsavedChanges = hasChanges;
        if (window.electronAPI) {
            window.electronAPI.setUnsavedChanges(hasChanges);
        }
        this.updateWindowTitle();
    }

    /**
     * Gets whether there are unsaved changes.
     * @returns {boolean}
     */
    hasUnsavedChanges() {
        return this._hasUnsavedChanges;
    }

    /**
     * Updates the window title to reflect the current state.
     * Dispatches a 'editor:fileStateChanged' event for other components.
     */
    updateWindowTitle() {
        const fileName = this.currentFilePath
            ? this.currentFilePath.split(/[\\/]/).pop()
            : 'Untitled';
        const modified = this._hasUnsavedChanges ? ' •' : '';
        document.title = `${fileName}${modified} - Markdown Editor`;

        document.dispatchEvent(
            new CustomEvent('editor:fileStateChanged', {
                detail: {
                    filePath: this.currentFilePath,
                    modified: this._hasUnsavedChanges,
                },
            }),
        );
    }
}
