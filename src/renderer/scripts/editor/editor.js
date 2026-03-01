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
import { SyntaxNode, SyntaxTree } from '../parser/syntax-tree.js';
import { ClipboardHandler } from './clipboard-handler.js';
import { CursorManager } from './cursor-manager.js';
import { EditOperations } from './edit-operations.js';
import { EventHandler } from './event-handler.js';
import { ImageHelper } from './image-helper.js';
import { InputHandler } from './input-handler.js';
import { LinkHelper } from './link-helper.js';
import { RangeOperations } from './range-operations.js';
import { SourceRenderer } from './renderers/source-renderer.js';
import { WritingRenderer } from './renderers/writing-renderer.js';
import { SelectionManager } from './selection-manager.js';
import { TableManager } from './table-manager.js';
import { UndoManager } from './undo-manager.js';

/**
 * @typedef {'source' | 'writing'} ViewMode
 */

/**
 * @typedef {Object} TreeCursor
 * @property {string} nodeId - The ID of the node the cursor is in.  When the
 *     cursor is inside an inline formatting element (bold, italic, etc.),
 *     this is the inline child node's ID.  Otherwise it is the block
 *     node's ID.
 * @property {string} [blockNodeId] - The ID of the enclosing block-level
 *     node (paragraph, heading, list-item, etc.).  Set by DOM cursor sync
 *     when the cursor is inside an inline formatting element.  When absent,
 *     `nodeId` is itself the block node.
 * @property {number} offset - The character offset within the block node's
 *     raw content string (always relative to the block, not the inline).
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

        /** @type {DFAParser} */
        this.parser = new DFAParser();

        /** @type {SyntaxTree|null} */
        this.syntaxTree = null;

        /** @type {SourceRenderer} */
        this.sourceRenderer = new SourceRenderer(this);

        /** @type {WritingRenderer} */
        this.writingRenderer = new WritingRenderer(this);

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
        this.viewMode = 'writing';
        this.container.dataset.viewMode = 'writing';

        /** @type {boolean} */
        this._hasUnsavedChanges = false;

        /** @type {string|null} */
        this.currentFilePath = null;

        /** @type {boolean} Whether to auto-rewrite downstream image paths to relative form. */
        this.ensureLocalPaths = true;

        /** @type {boolean} Whether &lt;details&gt; blocks default to collapsed in writing view. */
        this.detailsClosed = false;

        /**
         * Whether we are currently rendering (used to suppress input events).
         * @type {boolean}
         */
        this._isRendering = false;

        /**
         * Set by mousedown / keydown on the editor container to signal that
         * the next selectionchange was caused by an in-editor interaction.
         * handleSelectionChange reads (and clears) this flag to decide
         * whether a collapsed selection should clear treeRange.
         * @type {boolean}
         */
        this._editorInteractionPending = false;

        /**
         * Non-collapsed selection range mapped to tree coordinates.
         * null when the selection is collapsed (i.e. just a cursor).
         * @type {TreeRange|null}
         */
        this.treeRange = null;

        /**
         * The node ID that was last rendered as "active" in writing mode.
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
    //  Parser helpers
    // ──────────────────────────────────────────────

    /**
     * Re-parses a single markdown line to detect type changes during
     * editing.
     * @param {string} text
     * @returns {SyntaxNode|null}
     */
    _reparseLine(text) {
        return this.parser.parse(text).children[0] ?? null;
    }

    /**
     * Parses a multi-line markdown string (e.g. from a paste) into an
     * array of nodes. Delegates to the appropriate parser API.
     * @param {string} combined - The full markdown string to parse.
     * @returns {SyntaxNode[]}
     */
    _parseMultiLine(combined) {
        return [...this.parser.parse(combined).children];
    }

    /**
     * Finalizes source-edit mode for a code-block node.  The raw text
     * stored in `_sourceEditText` is reparsed through the DFA parser.
     *
     * - If the result is still a single code-block, the node's `content`
     *   and `attributes` are updated in place.
     * - If the text no longer parses as a code-block (e.g. the user
     *   deleted the fences), the node is replaced with whatever the
     *   parser produces (possibly multiple nodes).
     *
     * @param {SyntaxNode} node - The code-block node to finalize.
     * @returns {{ updated: string[], added?: string[], removed?: string[] } | null}
     *   Render hints, or null if the node was not in source-edit mode.
     */
    finalizeCodeBlockSourceEdit(node) {
        const text = node.exitSourceEditMode();
        if (text === null) return null;

        const parsed = this._parseMultiLine(text);

        if (parsed.length === 1 && parsed[0].type === 'code-block') {
            // Still a valid code block — update attributes in place.
            node.content = parsed[0].content;
            node.attributes = parsed[0].attributes;
            return { updated: [node.id] };
        }

        // The text is no longer a single code block.  Replace this node
        // with whatever the parser produced.
        const siblings = this.getSiblings(node);
        const idx = siblings.indexOf(node);
        if (idx === -1) {
            // Shouldn't happen, but fall back gracefully.
            node.content = text;
            node.type = 'paragraph';
            node.attributes = {};
            return { updated: [node.id] };
        }

        // First parsed node replaces the current node in-place.
        const first = parsed[0];
        node.type = first.type;
        node.content = first.content;
        node.attributes = first.attributes;
        node._sourceEditText = null;

        const addedIds = [];
        for (let j = 1; j < parsed.length; j++) {
            const newNode = parsed[j];
            if (node.parent) newNode.parent = node.parent;
            siblings.splice(idx + j, 0, newNode);
            addedIds.push(newNode.id);
        }

        /** @type {{ updated: string[], added?: string[] }} */
        const hints = { updated: [node.id] };
        if (addedIds.length > 0) hints.added = addedIds;
        return hints;
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
        this.syntaxTree.treeCursor = { nodeId: initialNode.id, offset: 0 };

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
     * When the cursor is inside inline formatting, this returns the
     * inline child node.
     * @returns {SyntaxNode|null}
     */
    getCurrentNode() {
        if (!this.syntaxTree?.treeCursor) return null;
        return this.syntaxTree.findNodeById(this.syntaxTree.treeCursor.nodeId);
    }

    /**
     * Returns the block-level node ID from the tree cursor.
     * Uses `blockNodeId` when set (cursor is inside inline formatting),
     * otherwise falls back to `nodeId`.
     * @returns {string|null}
     */
    getBlockNodeId() {
        if (!this.syntaxTree?.treeCursor) return null;
        return this.syntaxTree.treeCursor.blockNodeId ?? this.syntaxTree.treeCursor.nodeId;
    }

    /**
     * Resolves an arbitrary node ID to its block-level parent ID.
     * If the node is already block-level, returns the same ID.
     * @param {string|null} nodeId
     * @returns {string|null}
     */
    resolveBlockId(nodeId) {
        if (!nodeId || !this.syntaxTree) return null;
        const node = this.syntaxTree.findNodeById(nodeId);
        if (!node) return nodeId;
        return node.getBlockParent().id;
    }

    /**
     * Returns the block-level SyntaxNode for the current cursor position.
     * When the cursor is inside inline formatting, this resolves through
     * `blockNodeId` to return the paragraph/heading/list-item that owns
     * the raw content string.
     * @returns {SyntaxNode|null}
     */
    getCurrentBlockNode() {
        const blockId = this.getBlockNodeId();
        if (!blockId || !this.syntaxTree) return null;
        return this.syntaxTree.findNodeById(blockId);
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

    /**
     * Syncs the tree cursor/range from the current DOM selection.
     * @param {{ preserveRange?: boolean }} [options]
     */
    syncCursorFromDOM({ preserveRange = false } = {}) {
        this.cursorManager.syncCursorFromDOM({ preserveRange });
    }

    /** Places the DOM cursor at the position described by `this.syntaxTree.treeCursor`. */
    placeCursor() {
        this.cursorManager.placeCursor();
    }

    /**
     * Rebuilds the DOM selection from the tree's treeRange (if set).
     * Called after operations (e.g. view-mode switch) that destroy and
     * re-create the DOM so the user's selection is visually restored.
     */
    placeSelection() {
        this.cursorManager.placeSelection();
    }

    // ──────────────────────────────────────────────
    //  Phantom paragraph promotion
    // ──────────────────────────────────────────────

    /**
     * Checks whether the DOM selection is inside the phantom paragraph
     * (a view-only element appended after a trailing code block).  If so,
     * promotes it to a real SyntaxNode in the tree, re-renders it as a
     * normal paragraph, and places the cursor inside it.
     *
     * @returns {boolean} `true` if a phantom was promoted.
     */
    _promotePhantomParagraph() {
        const phantom = this.container.querySelector('.md-phantom-paragraph');
        if (!phantom) return false;

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return false;

        // Is the selection anchor inside the phantom?
        let node = /** @type {Node|null} */ (selection.anchorNode);
        let inside = false;
        while (node) {
            if (node === phantom) {
                inside = true;
                break;
            }
            node = node.parentNode;
        }
        if (!inside) return false;

        // Create a real paragraph node and append it to the tree.
        const para = new SyntaxNode('paragraph', '');
        this.syntaxTree?.appendChild(para);

        // Replace the phantom DOM element with a properly rendered node.
        const element =
            this.viewMode === 'source'
                ? this.sourceRenderer.renderNode(para)
                : this.writingRenderer.renderNode(para, true);
        if (element) {
            phantom.replaceWith(element);
        }

        // Point the cursor at the new node.
        if (this.syntaxTree) {
            this.syntaxTree.treeCursor = { nodeId: para.id, offset: 0 };
        }
        this.placeCursor();

        return true;
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
                this.viewMode === 'source' ? this.sourceRenderer : this.writingRenderer;
            renderer.fullRender(this.syntaxTree, this.container);
        } finally {
            this._isRendering = false;
        }
        document.dispatchEvent(new CustomEvent('editor:renderComplete'));
    }

    /**
     * Incremental render: updates only the DOM elements for the nodes
     * listed in `hints`.
     *
     * @param {{ updated?: string[], added?: string[], removed?: string[] }} hints
     */
    renderNodes(hints) {
        if (!this.syntaxTree) return;

        const renderer = this.viewMode === 'writing' ? this.writingRenderer : this.sourceRenderer;

        this._isRendering = true;
        try {
            renderer.renderNodes(this.container, hints);
        } finally {
            this._isRendering = false;
        }
        document.dispatchEvent(new CustomEvent('editor:renderComplete'));
    }

    /**
     * Full render followed by cursor placement.
     */
    fullRenderAndPlaceCursor() {
        this.fullRender();
        this._lastRenderedNodeId = this.syntaxTree?.treeCursor?.nodeId ?? null;
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
                const checkbox =
                    typeof attributes?.checked === 'boolean'
                        ? attributes.checked
                            ? '[x] '
                            : '[ ] '
                        : '';
                return `${indent}${marker}${checkbox}${content}`;
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
                const checkbox = typeof attributes?.checked === 'boolean' ? '[ ] ' : '';
                return indent.length + marker.length + checkbox.length;
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
     * In writing view there is no way to place the cursor after a trailing
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
        // writing view).
        this._ensureTrailingParagraph();

        const first = this.syntaxTree.children[0];
        this.syntaxTree.treeCursor = { nodeId: first.id, offset: 0 };

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
        this.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
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
        if (mode !== 'source' && mode !== 'writing') {
            console.warn(`Invalid view mode: ${mode}`);
            return;
        }

        // Nothing to do if already in the requested mode.
        if (mode === this.viewMode) return;

        // Finalize any code-block that is still in source-edit mode
        // before switching views, so the tree is clean for the new renderer.
        if (this.syntaxTree) {
            for (const child of this.syntaxTree.children) {
                if (child.type === 'code-block' && child._sourceEditText !== null) {
                    this.finalizeCodeBlockSourceEdit(child);
                }
            }
        }

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
            if (this.syntaxTree?.treeCursor) {
                const blockId = this.getBlockNodeId();
                const cursorEl = blockId
                    ? this.container.querySelector(`[data-node-id="${blockId}"]`)
                    : null;
                if (cursorEl && blockId) {
                    anchorNodeId = blockId;
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

        // If the tree owns a non-collapsed selection, rebuild it in the
        // new DOM so the user's selection survives the view-mode switch.
        if (this.treeRange) {
            this.placeSelection();
        }

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
            this.syntaxTree.treeCursor = { nodeId: first.id, offset: 0 };
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
            this.syntaxTree.treeCursor = { nodeId: last.id, offset: last.content.length };
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
        const currentNode = this.getCurrentBlockNode();
        let renderHints;

        if (currentNode?.type === 'table') {
            // Update existing table
            currentNode.content = markdown;
            this.syntaxTree.treeCursor = { nodeId: currentNode.id, offset: 0 };
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

            this.syntaxTree.treeCursor = { nodeId: tableNode.id, offset: 0 };
        }

        this.recordAndRender(before, renderHints);
    }

    /**
     * Changes the type of the current element.
     * @param {string} elementType
     */
    changeElementType(elementType) {
        const currentNode = this.getCurrentBlockNode();
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
     * - Non-list → list-item (of the requested kind)
     * - List-item of same kind → paragraph (toggle off)
     * - List-item of different kind → switch to new kind
     *
     * The three list kinds are:
     * - `'unordered'` — bullet list (`- text`)
     * - `'ordered'`   — numbered list (`1. text`)
     * - `'checklist'` — checklist (`- [ ] text` / `- [x] text`)
     *
     * @param {'unordered' | 'ordered' | 'checklist'} kind
     */
    async toggleList(kind) {
        const currentNode = this.getCurrentBlockNode();
        if (!currentNode || !this.syntaxTree) return;

        // html-block containers are structural nodes, not convertible.
        if (currentNode.type === 'html-block' && currentNode.children.length > 0) return;

        const before = this.getMarkdown();

        /**
         * Returns the list kind for a list-item node.
         * @param {import('../parser/syntax-tree.js').SyntaxNode} n
         * @returns {'unordered' | 'ordered' | 'checklist'}
         */
        const getListKind = (n) => {
            if (typeof n.attributes.checked === 'boolean') return 'checklist';
            return n.attributes.ordered ? 'ordered' : 'unordered';
        };

        /**
         * Applies list-item attributes for a given kind.
         * @param {import('../parser/syntax-tree.js').SyntaxNode} n
         * @param {'unordered' | 'ordered' | 'checklist'} k
         * @param {number} [num]
         */
        const applyKind = (n, k, num) => {
            n.type = 'list-item';
            switch (k) {
                case 'ordered':
                    n.attributes = {
                        ordered: true,
                        indent: n.attributes.indent || 0,
                        number: num || 1,
                    };
                    break;
                case 'checklist':
                    n.attributes = {
                        ordered: false,
                        indent: n.attributes.indent || 0,
                        checked: false,
                    };
                    break;
                default:
                    n.attributes = { ordered: false, indent: n.attributes.indent || 0 };
                    break;
            }
        };

        // Multi-node selection: convert each node in the range to a list item.
        if (this.treeRange && this.treeRange.startNodeId !== this.treeRange.endNodeId) {
            const nodes = this._getNodesInRange(
                this.treeRange.startNodeId,
                this.treeRange.endNodeId,
            );

            // Detect nodes that live inside html-block containers.
            // Converting them requires dissolving their parent wrapper.
            const htmlBlockParents = new Set();
            for (const n of nodes) {
                if (n.parent && n.parent.type === 'html-block') {
                    htmlBlockParents.add(n.parent);
                }
            }

            if (htmlBlockParents.size > 0) {
                const tagNames = [...htmlBlockParents]
                    .map(
                        (p) =>
                            `<${/** @type {import('../parser/syntax-tree.js').SyntaxNode} */ (p).attributes.tagName ?? 'html'}>`,
                    )
                    .join(', ');
                const result = await /** @type {any} */ (globalThis).electronAPI?.confirmDialog({
                    type: 'warning',
                    title: 'Destructive Conversion',
                    message: `This selection includes content inside HTML block elements (${tagNames}) that will be removed by this conversion.`,
                    detail: 'The HTML wrapper tags will be permanently lost. Do you want to proceed?',
                    buttons: ['Convert', 'Cancel'],
                    defaultId: 0,
                    cancelId: 1,
                });
                if (!result || result.response !== 0) return;

                for (const htmlBlock of htmlBlockParents) {
                    const parent = /** @type {import('../parser/syntax-tree.js').SyntaxNode} */ (
                        htmlBlock
                    );
                    const treeChildren = this.syntaxTree.children;
                    const idx = treeChildren.indexOf(parent);
                    if (idx === -1) continue;
                    const lifted = parent.children.slice();
                    // Splice the children into the tree at the html-block's position
                    treeChildren.splice(idx, 1, ...lifted);
                    for (const child of lifted) {
                        child.parent = null;
                    }
                }
            }

            const updatedIds = [];
            let num = 1;
            for (const n of nodes) {
                if (n.type === 'html-block' && n.children.length > 0) continue;
                if (n.type === 'table' || n.type === 'image' || n.type === 'linked-image') continue;
                applyKind(n, kind, num);
                if (kind === 'ordered') num++;
                updatedIds.push(n.id);
            }
            if (updatedIds.length === 0) return;

            this.treeRange = null;
            this.syntaxTree.treeCursor = {
                nodeId: updatedIds[0],
                blockNodeId: updatedIds[0],
                offset: 0,
            };
            this.undoManager.recordChange({
                type: 'changeType',
                before,
                after: this.getMarkdown(),
            });
            this.container.focus();
            this.renderNodesAndPlaceCursor({ updated: updatedIds });

            // Scroll the first converted node into view so the top of
            // the list is visible after a large multi-node conversion.
            const firstEl = this.container.querySelector(`[data-node-id="${updatedIds[0]}"]`);
            if (firstEl) {
                firstEl.scrollIntoView({ block: 'nearest', behavior: 'instant' });
            }

            this.setUnsavedChanges(true);
            return;
        }

        // Single node toggle — when on a list item, affect the entire
        // contiguous run of list items (the "list").
        if (currentNode.type === 'list-item') {
            const siblings = this.getSiblings(currentNode);
            const run = this._getContiguousListRun(siblings, currentNode);
            const currentKind = getListKind(currentNode);

            if (currentKind === kind) {
                // Same list kind → convert entire run back to paragraphs
                for (const n of run) {
                    n.type = 'paragraph';
                    n.attributes = {};
                }
            } else {
                // Different list kind → switch entire run
                let num = 1;
                for (const n of run) {
                    applyKind(n, kind, num);
                    if (kind === 'ordered') num++;
                }
            }

            this.syntaxTree.treeCursor = {
                nodeId: currentNode.id,
                blockNodeId: currentNode.id,
                offset: this.syntaxTree.treeCursor?.offset ?? 0,
            };
            this.undoManager.recordChange({
                type: 'changeType',
                before,
                after: this.getMarkdown(),
            });
            this.container.focus();
            this.renderNodesAndPlaceCursor({ updated: run.map((n) => n.id) });
            this.setUnsavedChanges(true);
            return;
        }
        applyKind(currentNode, kind, 1);

        this.syntaxTree.treeCursor = {
            nodeId: currentNode.id,
            blockNodeId: currentNode.id,
            offset: this.syntaxTree.treeCursor?.offset ?? 0,
        };
        this.undoManager.recordChange({
            type: 'changeType',
            before,
            after: this.getMarkdown(),
        });
        this.container.focus();
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

        /**
         * Walks children (recursing into html-block containers) and
         * collects all leaf block nodes between startId and endId.
         * @param {import('../parser/syntax-tree.js').SyntaxNode[]} children
         * @param {{collecting: boolean, done: boolean}} state
         * @param {import('../parser/syntax-tree.js').SyntaxNode[]} result
         */
        const walk = (children, state, result) => {
            for (const child of children) {
                if (state.done) break;
                // Recurse into html-block containers
                if (child.type === 'html-block' && child.children.length > 0) {
                    walk(child.children, state, result);
                    continue;
                }
                if (child.id === startId) state.collecting = true;
                if (state.collecting) result.push(child);
                if (child.id === endId) {
                    state.done = true;
                    break;
                }
            }
        };

        const state = { collecting: false, done: false };
        /** @type {import('../parser/syntax-tree.js').SyntaxNode[]} */
        const result = [];
        walk(this.syntaxTree.children, state, result);
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
        const nodeId = this.getBlockNodeId();
        const node = this.getCurrentBlockNode();
        if (!nodeId || !node || !this.syntaxTree?.treeCursor) return;
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
            startOffset = this.syntaxTree.treeCursor.offset;
            endOffset = this.syntaxTree.treeCursor.offset;
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
        if (this.syntaxTree?.treeCursor) this.syntaxTree.treeCursor.offset = newCursorOffset;
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
