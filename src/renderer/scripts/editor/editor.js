/**
 * @fileoverview Main Editor class.
 * Manages the document, view modes, and user interactions.
 *
 * All edits flow through the parse tree: user input is intercepted at the
 * keydown level, applied to the tree, and then the DOM is re-rendered from
 * the tree. The DOM is never the source of truth for content.
 */

/// <reference path="../../../types.d.ts" />

import { ImageModal } from '../image/image-modal.js';
import { LinkModal } from '../link/link-modal.js';
import { tokenizeInline } from '../parser/inline-tokenizer.js';
import { MarkdownParser } from '../parser/markdown-parser.js';
import { SyntaxNode, SyntaxTree } from '../parser/syntax-tree.js';
import { TableModal } from '../table/table-modal.js';
import { FocusedRenderer } from './renderers/focused-renderer.js';
import { SourceRenderer } from './renderers/source-renderer.js';
import { SelectionManager } from './selection-manager.js';
import { UndoManager } from './undo-manager.js';

// ── Offset mapping (raw ↔ rendered) ─────────────────────────────────
// Uses the same tokenizer as FocusedRenderer.renderInlineParts() so
// that offset mapping is always in sync with the rendered DOM.

/**
 * Given a raw markdown string and an offset into that raw string,
 * returns the corresponding offset in the rendered (visible) text —
 * i.e. the text the user sees after inline formatting markers have been
 * hidden by renderInlineParts.
 *
 * Walks the flat token list produced by `tokenizeInline`.  Delimiter
 * tokens (bold-open, html-close, etc.) are invisible in the rendered
 * output, so they advance the raw position only.  Text tokens advance
 * both positions equally.  Code tokens skip the backtick delimiters.
 *
 * @param {string} content     - Raw markdown content of the node
 * @param {number} rawOffset   - Offset in the raw content
 * @returns {number}
 */
function rawOffsetToRenderedOffset(content, rawOffset) {
    if (!content || rawOffset <= 0) return 0;

    const tokens = tokenizeInline(content);
    let rawPos = 0;
    let renderedPos = 0;

    for (const token of tokens) {
        const rawLen = token.raw.length;

        if (token.type === 'text') {
            // Visible text: raw length == rendered length.
            if (rawOffset <= rawPos + rawLen) {
                return renderedPos + (rawOffset - rawPos);
            }
            rawPos += rawLen;
            renderedPos += rawLen;
        } else if (token.type === 'code') {
            // Code span: `content` — backticks are invisible.
            const contentLen = token.content?.length ?? 0;
            const openDelim = 1;
            if (rawOffset <= rawPos + openDelim) {
                return renderedPos;
            }
            if (rawOffset <= rawPos + openDelim + contentLen) {
                return renderedPos + (rawOffset - rawPos - openDelim);
            }
            if (rawOffset < rawPos + rawLen) {
                return renderedPos + contentLen;
            }
            rawPos += rawLen;
            renderedPos += contentLen;
        } else {
            // Invisible delimiter (bold-open, html-close, link-open, etc.).
            if (rawOffset < rawPos + rawLen) {
                return renderedPos;
            }
            rawPos += rawLen;
        }
    }

    return renderedPos;
}

/**
 * Given a raw markdown string and an offset in the rendered (visible)
 * text, returns the corresponding offset in the raw string.
 *
 * Inverse of {@link rawOffsetToRenderedOffset}.
 *
 * @param {string} content          - Raw markdown content of the node
 * @param {number} renderedOffset   - Offset in the rendered text
 * @returns {number}
 */
function renderedOffsetToRawOffset(content, renderedOffset) {
    if (!content || renderedOffset <= 0) return 0;

    const tokens = tokenizeInline(content);
    let rawPos = 0;
    let renderedPos = 0;

    for (const token of tokens) {
        const rawLen = token.raw.length;

        if (token.type === 'text') {
            if (renderedOffset <= renderedPos + rawLen) {
                return rawPos + (renderedOffset - renderedPos);
            }
            rawPos += rawLen;
            renderedPos += rawLen;
        } else if (token.type === 'code') {
            const contentLen = token.content?.length ?? 0;
            const openDelim = 1;
            if (renderedOffset < renderedPos + contentLen) {
                return rawPos + openDelim + (renderedOffset - renderedPos);
            }
            rawPos += rawLen;
            renderedPos += contentLen;
        } else {
            // Invisible delimiter — advance raw position only.
            rawPos += rawLen;
        }
    }

    return rawPos;
}

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

        /** @type {MarkdownParser} */
        this.parser = new MarkdownParser();

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
         * Lazily-created image modal for click-to-edit in focused mode.
         * @type {ImageModal|null}
         */
        this._imageModal = null;

        /**
         * Lazily-created link modal for click-to-edit in focused mode.
         * @type {LinkModal|null}
         */
        this._linkModal = null;

        /**
         * Set to true when the editor loses focus to a modal dialog,
         * so handleFocus can restore the caret when the modal closes.
         * @type {boolean}
         */
        this._blurredByModal = false;

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
    }

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
        // Intercept all input at the keydown level so edits go through the tree
        this.container.addEventListener('keydown', this.handleKeyDown.bind(this));

        // Suppress any input events that the browser fires despite preventDefault,
        // and also catch composition/IME and paste events as a safety net.
        this.container.addEventListener('beforeinput', this.handleBeforeInput.bind(this));

        this.container.addEventListener('mousedown', this._handleMouseDown.bind(this));
        this.container.addEventListener('click', this.handleClick.bind(this));
        this.container.addEventListener('focus', this.handleFocus.bind(this));
        this.container.addEventListener('blur', this.handleBlur.bind(this));

        // Cut handling: write the selected range's markdown to the clipboard
        // before the browser's default action.  The actual tree mutation is
        // handled by the beforeinput handler for 'deleteByCut'.
        this.container.addEventListener('cut', this._handleCut.bind(this));

        // Copy handling: override the browser default to write the raw
        // markdown of the selected range to the clipboard.
        this.container.addEventListener('copy', this._handleCopy.bind(this));

        // Drag-and-drop image support
        this.container.addEventListener('dragover', this.handleDragOver.bind(this));
        this.container.addEventListener('drop', this.handleDrop.bind(this));

        // Selection change listener
        document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
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

    /**
     * Updates the tree cursor by reading the current DOM selection and mapping
     * it back to a (nodeId, offset) pair.  This is the **only** place where we
     * read positional information from the DOM — and it only updates the cursor,
     * never content.
     *
     * When the selection is non-collapsed, also populates `this.treeRange`
     * with start/end tree coordinates.  When collapsed, clears `treeRange`.
     */
    syncCursorFromDOM() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);

        // Map the start (anchor) position to tree coordinates.
        const startInfo = this._mapDOMPositionToTree(range.startContainer, range.startOffset);
        if (!startInfo) return;

        this.treeCursor = startInfo.cursor;

        // If the selection is collapsed there is no range.
        if (selection.isCollapsed) {
            this.treeRange = null;
            return;
        }

        // Map the end (focus) position to tree coordinates.
        const endInfo = this._mapDOMPositionToTree(range.endContainer, range.endOffset);
        if (!endInfo) {
            this.treeRange = null;
            return;
        }

        this.treeRange = {
            startNodeId: startInfo.cursor.nodeId,
            startOffset: startInfo.cursor.offset,
            endNodeId: endInfo.cursor.nodeId,
            endOffset: endInfo.cursor.offset,
        };
    }

    /**
     * Maps a DOM position (node + offset) to tree coordinates by walking up
     * to the nearest element with a `data-node-id` attribute.
     *
     * @param {Node} domNode - The DOM node the position is in
     * @param {number} domOffset - The offset within `domNode`
     * @returns {{ cursor: TreeCursor } | null}
     */
    _mapDOMPositionToTree(domNode, domOffset) {
        /** @type {Node|null} */
        let el = domNode;
        while (el && el !== this.container) {
            if (el.nodeType === Node.ELEMENT_NODE) {
                const htmlEl = /** @type {HTMLElement} */ (el);
                const nodeId = htmlEl.dataset?.nodeId;
                if (nodeId) {
                    // Check if the cursor is inside a table cell
                    const node = this.syntaxTree?.findNodeById(nodeId);
                    if (node?.type === 'table' && this.viewMode === 'focused') {
                        const pos = this._computeTableCellPosition(htmlEl, domNode, domOffset);
                        return {
                            cursor: {
                                nodeId,
                                offset: pos.offset,
                                cellRow: pos.cellRow,
                                cellCol: pos.cellCol,
                            },
                        };
                    }

                    const offset = this.computeOffsetInContent(htmlEl, domNode, domOffset);
                    /** @type {TreeCursor} */
                    const cursor = { nodeId, offset };
                    // If this element represents an html-block tag line in
                    // source view, record which part so edit methods can
                    // route changes to the correct attribute.
                    const tagPart = htmlEl.dataset?.tagPart;
                    if (tagPart === 'opening' || tagPart === 'closing') {
                        cursor.tagPart = tagPart;
                    }
                    return { cursor };
                }
            }
            el = el.parentNode;
        }
        return null;
    }

    /**
     * Computes the character offset inside the *content* portion of a node
     * element (i.e. inside `.md-content`, skipping any `.md-syntax` marker).
     *
     * @param {HTMLElement} nodeElement  - The element with `data-node-id`
     * @param {Node}        cursorNode  - The DOM node the browser cursor is in
     * @param {number}      cursorOffset - The offset inside `cursorNode`
     * @returns {number}
     */
    computeOffsetInContent(nodeElement, cursorNode, cursorOffset) {
        // If cursor is inside a syntax marker span, treat offset as 0
        /** @type {Node|null} */
        let parent = cursorNode.parentNode;
        while (parent && parent !== nodeElement) {
            if (parent.nodeType === Node.ELEMENT_NODE) {
                const parentEl = /** @type {Element} */ (parent);
                if (parentEl.classList?.contains('md-syntax')) {
                    return 0;
                }
            }
            parent = parent.parentNode;
        }

        // Determine which sub-element holds the editable content
        const contentEl = nodeElement.querySelector('.md-content') ?? nodeElement;

        if (!contentEl.contains(cursorNode)) {
            return 0;
        }

        // Walk the text nodes inside the content element and sum up lengths
        // until we reach the cursor node.
        const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null);
        let offset = 0;
        let node = walker.nextNode();

        // If there are no text nodes (e.g. the element only contains a <br>),
        // the content is empty so the offset is 0.
        if (!node) {
            return 0;
        }

        while (node) {
            if (node === cursorNode) {
                const renderedOff = offset + cursorOffset;
                return this._toRawOffset(nodeElement, renderedOff);
            }
            offset += node.textContent?.length ?? 0;
            node = walker.nextNode();
        }

        // cursorNode was not a text node inside the content element — this
        // happens when the DOM range targets an element container directly
        // (e.g. after selectNodeContents).  In that case `cursorOffset` is a
        // child-node index, not a character offset.  Sum the text content of
        // all children before the target index to compute the character offset.
        if (cursorNode.nodeType === Node.ELEMENT_NODE) {
            const children = cursorNode.childNodes;
            let charOffset = 0;
            for (let i = 0; i < cursorOffset && i < children.length; i++) {
                charOffset += children[i].textContent?.length ?? 0;
            }
            // Clamp to total text length in case cursorOffset >= child count.
            const total = cursorNode.textContent?.length ?? 0;
            const renderedOff = Math.min(charOffset, total);
            return this._toRawOffset(nodeElement, renderedOff);
        }

        // Fallback: clamp to content length.
        const renderedOff = Math.min(cursorOffset, offset);
        return this._toRawOffset(nodeElement, renderedOff);
    }

    /**
     * Converts a rendered (DOM) offset back to a raw (markdown) offset.
     * In source mode the offset is returned as-is.
     * @param {HTMLElement} nodeElement - The element with `data-node-id`
     * @param {number} renderedOffset - The offset in rendered text
     * @returns {number}
     */
    _toRawOffset(nodeElement, renderedOffset) {
        if (this.viewMode !== 'focused') return renderedOffset;
        const nodeId = nodeElement.dataset?.nodeId;
        if (!nodeId) return renderedOffset;
        const syntaxNode = this.syntaxTree?.findNodeById(nodeId);
        if (!syntaxNode) return renderedOffset;
        if (!this._hasInlineFormatting(syntaxNode.type)) return renderedOffset;
        return renderedOffsetToRawOffset(syntaxNode.content, renderedOffset);
    }

    /**
     * Returns whether a node type renders inline formatting via
     * `renderInlineContent` / `renderInlineParts` and therefore needs
     * offset mapping between raw markdown and rendered DOM text.
     * @param {string} type
     * @returns {boolean}
     */
    _hasInlineFormatting(type) {
        switch (type) {
            case 'paragraph':
            case 'heading1':
            case 'heading2':
            case 'heading3':
            case 'heading4':
            case 'heading5':
            case 'heading6':
            case 'blockquote':
            case 'list-item':
                return true;
            default:
                return false;
        }
    }

    // ──────────────────────────────────────────────
    //  Table cell helpers
    // ──────────────────────────────────────────────

    /**
     * Returns the text of a specific table cell.
     * @param {import('../parser/syntax-tree.js').SyntaxNode} node
     * @param {number} row - Row index (0 = header row)
     * @param {number} col - Column index
     * @returns {string}
     */
    _getTableCellText(node, row, col) {
        const data = TableModal.parseTableContent(node.content);
        return data.cells[row]?.[col] ?? '';
    }

    /**
     * Replaces a single cell's text and rebuilds the table markdown.
     * @param {import('../parser/syntax-tree.js').SyntaxNode} node
     * @param {number} row - Row index (0 = header)
     * @param {number} col - Column index
     * @param {string} newText - New cell content
     */
    _setTableCellText(node, row, col, newText) {
        const data = TableModal.parseTableContent(node.content);
        if (data.cells[row]) {
            data.cells[row][col] = newText;
        }
        node.content = this._buildTableMarkdown(data);
    }

    /**
     * Returns the dimensions of a table node.
     * @param {import('../parser/syntax-tree.js').SyntaxNode} node
     * @returns {{totalRows: number, columns: number}}
     */
    _getTableDimensions(node) {
        const data = TableModal.parseTableContent(node.content);
        return { totalRows: data.cells.length, columns: data.columns };
    }

    /**
     * Appends an empty row to a table node and rebuilds the markdown.
     * @param {import('../parser/syntax-tree.js').SyntaxNode} node
     * @returns {number} The row index of the new row
     */
    _tableAddRow(node) {
        const data = TableModal.parseTableContent(node.content);
        const newRow = Array.from({ length: data.columns }, () => '');
        data.cells.push(newRow);
        data.rows++;
        node.content = this._buildTableMarkdown(data);
        return data.cells.length - 1;
    }

    /**
     * Determines the cell (row, col) the DOM cursor is in for a table node.
     * Walks up from the cursor node to find the `<th>` or `<td>` element,
     * then counts its position within the table.
     * @param {HTMLElement} nodeElement - The `[data-node-id]` wrapper
     * @param {Node} cursorNode - The DOM node the cursor is in
     * @param {number} cursorOffset - The offset within cursorNode
     * @returns {{cellRow: number, cellCol: number, offset: number}}
     */
    _computeTableCellPosition(nodeElement, cursorNode, cursorOffset) {
        // Walk up to find the <th> or <td>
        /** @type {HTMLElement|null} */
        let cell = null;
        /** @type {Node|null} */
        let el = cursorNode;
        while (el && el !== nodeElement) {
            if (el.nodeType === Node.ELEMENT_NODE) {
                const tag = /** @type {HTMLElement} */ (el).tagName;
                if (tag === 'TH' || tag === 'TD') {
                    cell = /** @type {HTMLElement} */ (el);
                    break;
                }
            }
            el = el.parentNode;
        }

        if (!cell) {
            return { cellRow: 0, cellCol: 0, offset: 0 };
        }

        // Determine column index
        const row = /** @type {HTMLTableRowElement} */ (cell.parentNode);
        const cellCol = Array.from(row.cells).indexOf(/** @type {HTMLTableCellElement} */ (cell));

        // Determine row index (header row = 0, body rows = 1+)
        let cellRow = 0;
        const thead = nodeElement.querySelector('thead');
        const tbody = nodeElement.querySelector('tbody');
        if (cell.tagName === 'TH') {
            cellRow = 0;
        } else if (tbody) {
            const bodyRow = /** @type {HTMLTableRowElement} */ (cell.parentNode);
            cellRow = Array.from(tbody.rows).indexOf(bodyRow) + 1;
        }

        // Compute text offset within the cell
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null);
        let offset = 0;
        let textNode = walker.nextNode();
        while (textNode) {
            if (textNode === cursorNode) {
                return { cellRow, cellCol, offset: offset + cursorOffset };
            }
            offset += textNode.textContent?.length ?? 0;
            textNode = walker.nextNode();
        }

        return { cellRow, cellCol, offset: Math.min(cursorOffset, offset) };
    }

    /**
     * Places the DOM cursor inside a specific table cell.
     * @param {HTMLElement} nodeElement - The `[data-node-id]` wrapper
     * @param {number} row - Row index (0 = header)
     * @param {number} col - Column index
     * @param {number} offset - Character offset within the cell text
     */
    _placeTableCellCursor(nodeElement, row, col, offset) {
        /** @type {HTMLTableCellElement|null} */
        let cell = null;
        if (row === 0) {
            const thead = nodeElement.querySelector('thead');
            if (thead) {
                const headerRow = thead.querySelector('tr');
                cell = headerRow?.cells[col] ?? null;
            }
        } else {
            const tbody = nodeElement.querySelector('tbody');
            if (tbody) {
                const bodyRow = tbody.rows[row - 1];
                cell = bodyRow?.cells[col] ?? null;
            }
        }
        if (!cell) return;

        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null);
        let remaining = offset;
        let textNode = walker.nextNode();

        // If the cell is empty, place cursor at the start of the cell element
        if (!textNode) {
            const sel = window.getSelection();
            if (sel) {
                const range = document.createRange();
                range.selectNodeContents(cell);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
            return;
        }

        while (textNode) {
            const len = textNode.textContent?.length ?? 0;
            if (remaining <= len) {
                const sel = window.getSelection();
                if (sel) {
                    const range = document.createRange();
                    range.setStart(textNode, remaining);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
                return;
            }
            remaining -= len;
            textNode = walker.nextNode();
        }

        // Offset beyond available text — place at end
        const sel = window.getSelection();
        if (sel) {
            const range = document.createRange();
            range.selectNodeContents(cell);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
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

    /**
     * Places the DOM cursor at the position described by `this.treeCursor`.
     */
    placeCursor() {
        if (!this.treeCursor) return;

        // When the cursor targets a tag line (source view), there may be
        // multiple elements with the same data-node-id (opening & closing).
        // Select the one matching the tagPart.
        /** @type {Element|null} */
        let nodeElement = null;
        if (this.treeCursor.tagPart) {
            nodeElement = this.container.querySelector(
                `[data-node-id="${this.treeCursor.nodeId}"][data-tag-part="${this.treeCursor.tagPart}"]`,
            );
        }
        if (!nodeElement) {
            nodeElement = this.container.querySelector(
                `[data-node-id="${this.treeCursor.nodeId}"]`,
            );
        }
        if (!nodeElement) return;

        // ── Table cell cursor placement ──
        if (
            this.viewMode === 'focused' &&
            this.treeCursor.cellRow !== undefined &&
            this.treeCursor.cellCol !== undefined
        ) {
            this._placeTableCellCursor(
                /** @type {HTMLElement} */ (nodeElement),
                this.treeCursor.cellRow,
                this.treeCursor.cellCol,
                this.treeCursor.offset,
            );
            return;
        }

        const contentEl = nodeElement.querySelector('.md-content') ?? nodeElement;

        // In focused mode the DOM shows rendered text (no markdown syntax),
        // so we must convert the raw tree offset to a rendered offset.
        // Only applies to node types that render inline formatting (paragraph,
        // heading, blockquote, list-item).  Other types (table, code-block,
        // image, horizontal-rule) don't use inline markup rendering.
        let cursorOffset = this.treeCursor.offset;
        if (this.viewMode === 'focused') {
            const node = this.getCurrentNode();
            if (node && this._hasInlineFormatting(node.type)) {
                cursorOffset = rawOffsetToRenderedOffset(node.content, cursorOffset);
            }
        }

        const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null);
        let remaining = cursorOffset;
        let textNode = walker.nextNode();
        let placed = false;

        while (textNode) {
            const len = textNode.textContent?.length ?? 0;
            if (remaining <= len) {
                const sel = window.getSelection();
                if (sel) {
                    const range = document.createRange();
                    range.setStart(textNode, remaining);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
                placed = true;
                break;
            }
            remaining -= len;
            textNode = walker.nextNode();
        }

        if (!placed) {
            // Offset is beyond available text — place at end
            const sel = window.getSelection();
            if (sel) {
                const range = document.createRange();
                range.selectNodeContents(contentEl);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    }

    // ──────────────────────────────────────────────
    //  Input interception
    // ──────────────────────────────────────────────

    /**
     * Catches `beforeinput` as a safety net: any input that was not already
     * handled by `handleKeyDown` is prevented so the DOM stays in sync with
     * the tree.  Paste is handled here as well.
     * @param {InputEvent} event
     */
    handleBeforeInput(event) {
        if (this._isRendering) {
            event.preventDefault();
            return;
        }

        // Handle paste
        if (event.inputType === 'insertFromPaste') {
            event.preventDefault();
            const text = event.dataTransfer?.getData('text/plain') ?? '';
            if (text) {
                this.insertTextAtCursor(text);
            }
            return;
        }

        // Handle cut — the clipboard was already written by the 'cut'
        // event handler; here we just delete the selected range via the tree.
        if (event.inputType === 'deleteByCut') {
            event.preventDefault();
            this.syncCursorFromDOM();
            if (this.treeRange) {
                const rangeResult = this.deleteSelectedRange();
                if (rangeResult) {
                    this.recordAndRender(rangeResult.before, rangeResult.hints);
                }
            }
            return;
        }

        // All other mutations are prevented — we drive edits through the tree.
        event.preventDefault();
    }

    /**
     * Handles keydown events.  This is the single entry-point for all
     * keyboard-driven edits: the default browser action is always prevented,
     * and instead the edit is applied to the tree, which is then re-rendered.
     * @param {KeyboardEvent} event
     */
    handleKeyDown(event) {
        // ── Undo / Redo ──
        if (event.ctrlKey || event.metaKey) {
            if (event.key === 'z' && !event.shiftKey) {
                event.preventDefault();
                this.undo();
                return;
            }
            if ((event.key === 'z' && event.shiftKey) || event.key === 'y') {
                event.preventDefault();
                this.redo();
                return;
            }
            // ── Select All (Ctrl+A) — context-restricted ──
            if (event.key === 'a') {
                event.preventDefault();
                this.handleSelectAll();
                return;
            }
        }

        // ── Enter ──
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.handleEnterKey();
            return;
        }

        // ── Backspace ──
        if (event.key === 'Backspace') {
            event.preventDefault();
            this.handleBackspace();
            return;
        }

        // ── Delete ──
        if (event.key === 'Delete') {
            event.preventDefault();
            this.handleDelete();
            return;
        }

        // ── Printable characters ──
        // A printable key is a single character that is not modified by Ctrl/Meta.
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            this.insertTextAtCursor(event.key);
            return;
        }

        // ── Tab / Shift+Tab inside a table ──
        if (event.key === 'Tab' && this.viewMode === 'focused') {
            this.syncCursorFromDOM();
            const node = this.getCurrentNode();
            if (node?.type === 'table' && this.treeCursor?.cellRow !== undefined) {
                event.preventDefault();
                this.handleTableTab(event.shiftKey);
                return;
            }
        }

        // Navigation keys (arrows, Home, End, Page Up/Down), Tab, Escape, etc.
        // are left to their default browser behaviour so the cursor moves
        // naturally.  After the key is processed, `selectionchange` will fire
        // and we update the tree cursor from the DOM.
    }

    // ──────────────────────────────────────────────
    //  Range (selection) operations
    // ──────────────────────────────────────────────

    /**
     * Returns an ordered flat list of leaf nodes within the given sibling
     * list, optionally restricted to the range between `startId` and `endId`.
     * Both endpoints are inclusive.  Only considers nodes at the same
     * nesting level (siblings).
     *
     * @param {SyntaxNode[]} siblings
     * @param {string} startId
     * @param {string} endId
     * @returns {SyntaxNode[]}
     */
    _getNodesBetween(siblings, startId, endId) {
        const result = [];
        let collecting = false;
        for (const node of siblings) {
            if (node.id === startId) {
                collecting = true;
            }
            if (collecting) {
                result.push(node);
            }
            if (node.id === endId) {
                break;
            }
        }
        return result;
    }

    /**
     * Deletes the currently selected range (stored in `this.treeRange`)
     * from the syntax tree.  Handles same-node and cross-node selections.
     *
     * After deletion the cursor is placed at the join point and
     * `this.treeRange` is cleared.
     *
     * @returns {{ before: string, hints: { updated?: string[], added?: string[], removed?: string[] } } | null}
     *     The markdown snapshot before the edit and render hints, or null
     *     if there was no range to delete.
     */
    deleteSelectedRange() {
        if (!this.treeRange || !this.syntaxTree) return null;

        const { startNodeId, startOffset, endNodeId, endOffset } = this.treeRange;
        const startNode = this.syntaxTree.findNodeById(startNodeId);
        const endNode = this.syntaxTree.findNodeById(endNodeId);
        if (!startNode || !endNode) return null;

        const before = this.syntaxTree.toMarkdown();

        // ── Same-node selection ──
        if (startNodeId === endNodeId) {
            const left = startNode.content.substring(0, startOffset);
            const right = startNode.content.substring(endOffset);
            startNode.content = left + right;
            this.treeCursor = { nodeId: startNode.id, offset: startOffset };
            this.treeRange = null;
            return { before, hints: { updated: [startNode.id] } };
        }

        // ── Cross-node selection ──
        // Both nodes must share the same parent (sibling list).
        const siblings = this.getSiblings(startNode);
        const startIdx = siblings.indexOf(startNode);
        const endIdx = siblings.indexOf(endNode);

        // Safety: if nodes are not in the same sibling list, bail.
        if (startIdx === -1 || endIdx === -1) return null;

        // Ensure correct ordering (startIdx should be < endIdx).
        // The DOM selection direction is always start < end in document
        // order, so this should hold, but guard just in case.
        const [firstIdx, firstNode, firstOffset, lastIdx, lastNode, lastOffset] =
            startIdx <= endIdx
                ? [startIdx, startNode, startOffset, endIdx, endNode, endOffset]
                : [endIdx, endNode, endOffset, startIdx, startNode, startOffset];

        // Trim the first node: keep content before the selection start.
        const leftContent = firstNode.content.substring(0, firstOffset);

        // Trim the last node: keep content after the selection end.
        const rightContent = lastNode.content.substring(lastOffset);

        // Merge: first node gets left + right content
        firstNode.content = leftContent + rightContent;

        // Collect IDs of intermediate and end nodes to remove.
        /** @type {string[]} */
        const removedIds = [];
        for (let i = firstIdx + 1; i <= lastIdx; i++) {
            removedIds.push(siblings[i].id);
            siblings[i].parent = null;
        }
        // Remove them from the siblings array.
        siblings.splice(firstIdx + 1, lastIdx - firstIdx);

        this.treeCursor = { nodeId: firstNode.id, offset: firstOffset };
        this.treeRange = null;
        return { before, hints: { updated: [firstNode.id], removed: removedIds } };
    }

    /**
     * Handles Ctrl+A — selects all content within the current block-level
     * context rather than the entire document.
     *
     * Context scoping:
     * - Code block → selects all code inside the block
     * - List item → selects the list item text
     * - Paragraph / heading / blockquote → selects the whole element
     * - Text inside inline formatting (bold, italic…) in focused mode →
     *   selects the containing block-level node, not just the span
     * - Table cell → selects the cell content
     */
    handleSelectAll() {
        this.syncCursorFromDOM();
        const node = this.getCurrentNode();
        if (!node) return;

        // ── Table cell: select just the cell content ──
        if (
            node.type === 'table' &&
            this.viewMode === 'focused' &&
            this.treeCursor?.cellRow !== undefined &&
            this.treeCursor?.cellCol !== undefined
        ) {
            const cellText = this._getTableCellText(
                node,
                this.treeCursor.cellRow,
                this.treeCursor.cellCol,
            );
            // Place selection spanning the whole cell via DOM
            const nodeEl = this.container.querySelector(`[data-node-id="${node.id}"]`);
            if (nodeEl) {
                this._placeTableCellCursor(
                    /** @type {HTMLElement} */ (nodeEl),
                    this.treeCursor.cellRow,
                    this.treeCursor.cellCol,
                    0,
                );
                // Extend to end
                const sel = window.getSelection();
                if (sel && cellText.length > 0) {
                    // Re-select the full cell range using the DOM
                    const range = sel.getRangeAt(0);
                    const contentEl = range.startContainer.parentElement?.closest('td, th');
                    if (contentEl) {
                        const domRange = document.createRange();
                        domRange.selectNodeContents(contentEl);
                        sel.removeAllRanges();
                        sel.addRange(domRange);
                    }
                }
            }
            // Update treeRange from the new DOM selection.
            this.syncCursorFromDOM();
            return;
        }

        // For all other block-level nodes, select the entire node content
        // by setting a DOM range over the content element.
        const nodeEl = this.container.querySelector(`[data-node-id="${node.id}"]`);
        if (!nodeEl) return;

        const contentEl = nodeEl.querySelector('.md-content') ?? nodeEl;
        const sel = window.getSelection();
        if (!sel) return;

        const domRange = document.createRange();
        domRange.selectNodeContents(contentEl);
        sel.removeAllRanges();
        sel.addRange(domRange);

        // Refresh tree cursor/range from the new DOM selection.
        this.syncCursorFromDOM();
    }

    // ──────────────────────────────────────────────
    //  Tree-level edit operations
    // ──────────────────────────────────────────────

    /**
     * Inserts text at the current tree cursor position, re-parses the affected
     * line to detect type changes (e.g. `# ` → heading), and re-renders.
     * @param {string} text
     */
    insertTextAtCursor(text) {
        this.syncCursorFromDOM();

        // If there is a non-collapsed selection, delete it first so the
        // typed text replaces the selection.
        /** @type {string|null} */
        let rangeDeleteBefore = null;
        /** @type {string[]} */
        let rangeRemovedIds = [];
        if (this.treeRange) {
            const rangeResult = this.deleteSelectedRange();
            if (rangeResult) {
                rangeDeleteBefore = rangeResult.before;
                rangeRemovedIds = rangeResult.hints.removed ?? [];
                if (!text) {
                    this.recordAndRender(rangeResult.before, rangeResult.hints);
                    return;
                }
                // Fall through — treeCursor is at the join point and we
                // will insert the text there.  Use the pre-deletion
                // snapshot for the undo entry.
            }
        }

        const node = this.getCurrentNode();
        if (!node || !this.syntaxTree || !this.treeCursor) return;

        // When the cursor is on an html-block tag line (source view), edit
        // the openingTag / closingTag attribute directly.
        if (node.type === 'html-block' && this.treeCursor.tagPart) {
            const before = rangeDeleteBefore ?? this.syntaxTree.toMarkdown();
            const attr = this.treeCursor.tagPart === 'opening' ? 'openingTag' : 'closingTag';
            const old = node.attributes[attr] || '';
            const left = old.substring(0, this.treeCursor.offset);
            const right = old.substring(this.treeCursor.offset);
            node.attributes[attr] = left + text + right;
            this.treeCursor = {
                nodeId: node.id,
                offset: left.length + text.length,
                tagPart: this.treeCursor.tagPart,
            };
            this.recordAndRender(before, { updated: [node.id] });
            return;
        }

        // html-block containers without tagPart are structural (focused view).
        if (node.type === 'html-block' && node.children.length > 0) return;

        const before = rangeDeleteBefore ?? this.syntaxTree.toMarkdown();

        // ── Table cell editing ──
        if (
            node.type === 'table' &&
            this.treeCursor.cellRow !== undefined &&
            this.treeCursor.cellCol !== undefined
        ) {
            const { cellRow, cellCol, offset } = this.treeCursor;
            const cellText = this._getTableCellText(node, cellRow, cellCol);
            const left = cellText.substring(0, offset);
            const right = cellText.substring(offset);
            this._setTableCellText(node, cellRow, cellCol, left + text + right);
            this.treeCursor = {
                nodeId: node.id,
                offset: left.length + text.length,
                cellRow,
                cellCol,
            };
            this.recordAndRender(before, { updated: [node.id] });
            return;
        }

        const oldType = node.type;

        // Insert the text into the node's content at the cursor offset
        const left = node.content.substring(0, this.treeCursor.offset);
        const right = node.content.substring(this.treeCursor.offset);
        const newContent = left + text + right;

        // Code-block content is raw code, not markdown — skip re-parsing
        // to avoid misidentifying code lines as headings, lists, etc.
        if (node.type === 'code-block') {
            node.content = newContent;
            this.treeCursor = { nodeId: node.id, offset: left.length + text.length };
            this.recordAndRender(before, { updated: [node.id] });
            return;
        }

        // Re-parse the full markdown line to detect type changes
        let newOffset;
        const wasBareText = !!node.attributes.bareText;
        const fullLine = this.buildMarkdownLine(node.type, newContent, node.attributes);
        const parsed = this.parser.parseSingleLine(fullLine);

        if (parsed) {
            // Suppress code-block fence conversion during typing — the
            // fence pattern (```) is converted on Enter instead.
            if (parsed.type === 'code-block' && oldType !== 'code-block') {
                node.content = newContent;
            } else {
                node.type = parsed.type;
                node.content = parsed.content;
                node.attributes = parsed.attributes;
            }
        } else {
            node.content = newContent;
        }

        // Preserve the bareText flag — it is not part of the markdown syntax
        // that parseSingleLine can reconstruct, so it would be lost.
        if (wasBareText) {
            node.attributes.bareText = true;
        }

        // Compute cursor position in the new content.
        // If the type didn't change, the cursor is simply after the inserted text.
        // If it changed (e.g. paragraph "# " → heading1 ""), we need to account
        // for the prefix that was absorbed by the type change.
        if (oldType === node.type) {
            newOffset = left.length + text.length;
        } else {
            // The old content up to cursor was `left + text`.  In the old type's
            // markdown line, that corresponds to `oldPrefix + left + text`.
            // In the new type's markdown line, the prefix changed.  The cursor
            // position in the new content = old raw cursor pos − new prefix len.
            const oldPrefix = this.getPrefixLength(oldType, node.attributes);
            const newPrefix = this.getPrefixLength(node.type, node.attributes);
            const rawCursorPos = oldPrefix + left.length + text.length;
            newOffset = Math.max(0, rawCursorPos - newPrefix);
        }

        this.treeCursor = { nodeId: node.id, offset: newOffset };
        /** @type {{ updated: string[], removed?: string[] }} */
        const hints = { updated: [node.id] };
        if (rangeRemovedIds.length > 0) hints.removed = rangeRemovedIds;
        this.recordAndRender(before, hints);
    }

    /**
     * Handles the Backspace key.
     */
    handleBackspace() {
        this.syncCursorFromDOM();

        // If there is a non-collapsed selection, delete the entire range
        // instead of a single character.
        if (this.treeRange) {
            const rangeResult = this.deleteSelectedRange();
            if (rangeResult) {
                this.recordAndRender(rangeResult.before, rangeResult.hints);
                return;
            }
        }

        const node = this.getCurrentNode();
        if (!node || !this.syntaxTree || !this.treeCursor) return;

        // When the cursor is on an html-block tag line (source view), edit
        // the openingTag / closingTag attribute directly.
        if (node.type === 'html-block' && this.treeCursor.tagPart) {
            if (this.treeCursor.offset > 0) {
                const before = this.syntaxTree.toMarkdown();
                const attr = this.treeCursor.tagPart === 'opening' ? 'openingTag' : 'closingTag';
                const old = node.attributes[attr] || '';
                const left = old.substring(0, this.treeCursor.offset - 1);
                const right = old.substring(this.treeCursor.offset);
                node.attributes[attr] = left + right;
                this.treeCursor = {
                    nodeId: node.id,
                    offset: left.length,
                    tagPart: this.treeCursor.tagPart,
                };
                this.recordAndRender(before, { updated: [node.id] });
            }
            return;
        }

        // html-block containers without tagPart are structural (focused view).
        if (node.type === 'html-block' && node.children.length > 0) return;

        // ── Table cell backspace ──
        if (
            node.type === 'table' &&
            this.treeCursor.cellRow !== undefined &&
            this.treeCursor.cellCol !== undefined
        ) {
            const { cellRow, cellCol, offset } = this.treeCursor;
            if (offset > 0) {
                const before = this.syntaxTree.toMarkdown();
                const cellText = this._getTableCellText(node, cellRow, cellCol);
                const left = cellText.substring(0, offset - 1);
                const right = cellText.substring(offset);
                this._setTableCellText(node, cellRow, cellCol, left + right);
                this.treeCursor = {
                    nodeId: node.id,
                    offset: left.length,
                    cellRow,
                    cellCol,
                };
                this.recordAndRender(before, { updated: [node.id] });
            }
            // At offset 0 — no-op (don't merge cells or break table)
            return;
        }

        const before = this.syntaxTree.toMarkdown();
        /** @type {{ updated?: string[], added?: string[], removed?: string[] }} */
        let renderHints = { updated: [node.id] };

        if (this.treeCursor.offset > 0) {
            // Delete one character before the cursor inside this node's content
            const left = node.content.substring(0, this.treeCursor.offset - 1);
            const right = node.content.substring(this.treeCursor.offset);
            const newContent = left + right;
            const oldType = node.type;

            // Code-block content is raw code — skip re-parsing.
            if (node.type === 'code-block') {
                node.content = newContent;
                this.treeCursor = { nodeId: node.id, offset: left.length };
                this.recordAndRender(before, { updated: [node.id] });
                return;
            }

            // Re-parse to detect type changes
            let newOffset;
            const wasBareText = !!node.attributes.bareText;
            const fullLine = this.buildMarkdownLine(node.type, newContent, node.attributes);
            const parsed = this.parser.parseSingleLine(fullLine);

            if (parsed) {
                node.type = parsed.type;
                node.content = parsed.content;
                node.attributes = parsed.attributes;
            } else {
                node.content = newContent;
            }

            // Preserve the bareText flag (see insertTextAtCursor).
            if (wasBareText) {
                node.attributes.bareText = true;
            }

            // Compute new cursor offset
            if (oldType === node.type) {
                newOffset = left.length;
            } else {
                const oldPrefix = this.getPrefixLength(oldType, node.attributes);
                const newPrefix = this.getPrefixLength(node.type, node.attributes);
                newOffset = Math.max(0, oldPrefix + left.length - newPrefix);
            }

            this.treeCursor = { nodeId: node.id, offset: newOffset };
        } else {
            // Cursor is at the start of the node.
            // If this is a heading (or blockquote, list-item, etc.) with an
            // empty content, convert it back to an empty paragraph.
            if (node.type !== 'paragraph' && node.content === '') {
                node.type = 'paragraph';
                node.content = '';
                node.attributes = {};
                this.treeCursor = { nodeId: node.id, offset: 0 };
            } else if (node.type !== 'paragraph') {
                // Non-paragraph with content and cursor at start: demote to paragraph,
                // keeping the content.
                node.type = 'paragraph';
                node.attributes = {};
                this.treeCursor = { nodeId: node.id, offset: 0 };
            } else {
                // Merge with the previous node (if any)
                const siblings = this.getSiblings(node);
                const idx = siblings.indexOf(node);
                if (idx > 0) {
                    const prev = siblings[idx - 1];

                    if (prev.type === 'html-block' && prev.children.length > 0) {
                        // Previous sibling is a container html-block.
                        if (this.viewMode === 'source') {
                            // In source view the container boundary is
                            // structural — backspace is a no-op.
                        } else {
                            // In focused view, merge into the last child
                            // of the html-block container.
                            const lastChild = prev.children[prev.children.length - 1];
                            const lastChildLen = lastChild.content.length;
                            lastChild.content += node.content;
                            siblings.splice(idx, 1);
                            node.parent = null;
                            this.treeCursor = { nodeId: lastChild.id, offset: lastChildLen };
                            renderHints = { updated: [lastChild.id], removed: [node.id] };
                        }
                    } else {
                        const prevLen = prev.content.length;
                        prev.content += node.content;
                        siblings.splice(idx, 1);
                        node.parent = null;
                        this.treeCursor = { nodeId: prev.id, offset: prevLen };
                        renderHints = { updated: [prev.id], removed: [node.id] };
                    }
                }
                // If idx === 0 there is nothing to merge into — do nothing.
            }
        }

        this.recordAndRender(before, renderHints);
    }

    /**
     * Handles the Delete key.
     */
    handleDelete() {
        this.syncCursorFromDOM();

        // If there is a non-collapsed selection, delete the entire range
        // instead of a single character.
        if (this.treeRange) {
            const rangeResult = this.deleteSelectedRange();
            if (rangeResult) {
                this.recordAndRender(rangeResult.before, rangeResult.hints);
                return;
            }
        }

        const node = this.getCurrentNode();
        if (!node || !this.syntaxTree || !this.treeCursor) return;

        // When the cursor is on an html-block tag line (source view), edit
        // the openingTag / closingTag attribute directly.
        if (node.type === 'html-block' && this.treeCursor.tagPart) {
            const attr = this.treeCursor.tagPart === 'opening' ? 'openingTag' : 'closingTag';
            const old = node.attributes[attr] || '';
            if (this.treeCursor.offset < old.length) {
                const before = this.syntaxTree.toMarkdown();
                const left = old.substring(0, this.treeCursor.offset);
                const right = old.substring(this.treeCursor.offset + 1);
                node.attributes[attr] = left + right;
                this.treeCursor = {
                    nodeId: node.id,
                    offset: left.length,
                    tagPart: this.treeCursor.tagPart,
                };
                this.recordAndRender(before, { updated: [node.id] });
            }
            return;
        }

        // html-block containers without tagPart are structural (focused view).
        if (node.type === 'html-block' && node.children.length > 0) return;

        // ── Table cell delete ──
        if (
            node.type === 'table' &&
            this.treeCursor.cellRow !== undefined &&
            this.treeCursor.cellCol !== undefined
        ) {
            const { cellRow, cellCol, offset } = this.treeCursor;
            const cellText = this._getTableCellText(node, cellRow, cellCol);
            if (offset < cellText.length) {
                const before = this.syntaxTree.toMarkdown();
                const left = cellText.substring(0, offset);
                const right = cellText.substring(offset + 1);
                this._setTableCellText(node, cellRow, cellCol, left + right);
                this.treeCursor = {
                    nodeId: node.id,
                    offset,
                    cellRow,
                    cellCol,
                };
                this.recordAndRender(before, { updated: [node.id] });
            }
            // At end of cell — no-op
            return;
        }

        const before = this.syntaxTree.toMarkdown();
        /** @type {{ updated?: string[], added?: string[], removed?: string[] }} */
        let renderHints = { updated: [node.id] };

        if (this.treeCursor.offset < node.content.length) {
            // Delete one character after the cursor
            const left = node.content.substring(0, this.treeCursor.offset);
            const right = node.content.substring(this.treeCursor.offset + 1);
            const newContent = left + right;
            const oldType = node.type;

            // Code-block content is raw code — skip re-parsing.
            if (node.type === 'code-block') {
                node.content = newContent;
                this.treeCursor = { nodeId: node.id, offset: left.length };
                this.recordAndRender(before, { updated: [node.id] });
                return;
            }

            // Re-parse to detect type changes
            let newOffset;
            const wasBareText = !!node.attributes.bareText;
            const fullLine = this.buildMarkdownLine(node.type, newContent, node.attributes);
            const parsed = this.parser.parseSingleLine(fullLine);

            if (parsed) {
                node.type = parsed.type;
                node.content = parsed.content;
                node.attributes = parsed.attributes;
            } else {
                node.content = newContent;
            }

            // Preserve the bareText flag (see insertTextAtCursor).
            if (wasBareText) {
                node.attributes.bareText = true;
            }

            if (oldType === node.type) {
                newOffset = left.length;
            } else {
                const oldPrefix = this.getPrefixLength(oldType, node.attributes);
                const newPrefix = this.getPrefixLength(node.type, node.attributes);
                newOffset = Math.max(0, oldPrefix + left.length - newPrefix);
            }

            this.treeCursor = { nodeId: node.id, offset: newOffset };
        } else {
            // Cursor is at the end — merge with the next node
            const siblings = this.getSiblings(node);
            const idx = siblings.indexOf(node);
            if (idx < siblings.length - 1) {
                const next = siblings[idx + 1];

                if (next.type === 'html-block' && next.children.length > 0) {
                    // Next sibling is a container html-block.
                    if (this.viewMode === 'source') {
                        // In source view the container boundary is
                        // structural — delete is a no-op.
                    } else {
                        // In focused view, merge the first child of the
                        // html-block container into this node.
                        const firstChild = next.children[0];
                        const curLen = node.content.length;
                        node.content += firstChild.content;
                        next.children.splice(0, 1);
                        firstChild.parent = null;
                        // If the html-block is now empty, remove it too.
                        if (next.children.length === 0) {
                            siblings.splice(idx + 1, 1);
                            next.parent = null;
                        }
                        this.treeCursor = { nodeId: node.id, offset: curLen };
                        renderHints =
                            next.children.length === 0
                                ? { updated: [node.id], removed: [next.id] }
                                : { updated: [node.id, next.id] };
                    }
                } else {
                    const curLen = node.content.length;
                    node.content += next.content;
                    siblings.splice(idx + 1, 1);
                    next.parent = null;
                    this.treeCursor = { nodeId: node.id, offset: curLen };
                    renderHints = { updated: [node.id], removed: [next.id] };
                }
            }
        }

        this.recordAndRender(before, renderHints);
    }

    /**
     * Handles the Enter key — splits the current node at the cursor.
     */
    handleEnterKey() {
        this.syncCursorFromDOM();

        // If there is a non-collapsed selection, delete it first, then
        // split at the resulting cursor position.
        /** @type {string|null} */
        let rangeDeleteBefore = null;
        /** @type {string[]} */
        let rangeRemovedIds = [];
        if (this.treeRange) {
            const rangeResult = this.deleteSelectedRange();
            if (rangeResult) {
                rangeDeleteBefore = rangeResult.before;
                rangeRemovedIds = rangeResult.hints.removed ?? [];
                // Fall through — treeCursor now points at the join point.
            }
        }

        const node = this.getCurrentNode();
        if (!node || !this.syntaxTree || !this.treeCursor) return;

        // html-block tag lines and containers are not splittable.
        if (node.type === 'html-block' && (this.treeCursor.tagPart || node.children.length > 0)) {
            return;
        }

        // ── Enter inside a table → move to next row, same column ──
        if (node.type === 'table' && this.treeCursor.cellRow !== undefined) {
            const { cellRow, cellCol } = this.treeCursor;
            const { totalRows } = this._getTableDimensions(node);
            if (cellRow < totalRows - 1) {
                this.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow: cellRow + 1,
                    cellCol,
                };
                this.placeCursor();
            }
            // On last row — no-op
            return;
        }

        const before = rangeDeleteBefore ?? this.syntaxTree.toMarkdown();

        // ── Early conversion: ```lang + Enter → code block ──
        const fenceMatch = node.type === 'paragraph' && node.content.match(/^```(\w*)$/);
        if (fenceMatch) {
            node.type = 'code-block';
            node.content = '';
            node.attributes = { language: fenceMatch[1] || '' };
            this.treeCursor = { nodeId: node.id, offset: 0 };
            this.recordAndRender(before, { updated: [node.id] });
            return;
        }

        // ── Enter inside a code block → insert newline ──
        if (node.type === 'code-block') {
            const left = node.content.substring(0, this.treeCursor.offset);
            const right = node.content.substring(this.treeCursor.offset);
            node.content = `${left}\n${right}`;
            this.treeCursor = { nodeId: node.id, offset: left.length + 1 };
            this.recordAndRender(before, { updated: [node.id] });
            return;
        }

        const contentBefore = node.content.substring(0, this.treeCursor.offset);
        const contentAfter = node.content.substring(this.treeCursor.offset);

        // Current node keeps the text before the cursor
        node.content = contentBefore;

        // If the node was bare text inside an HTML container, splitting it
        // means it is no longer a single bare-text line — clear the flag.
        if (node.attributes?.bareText) {
            node.attributes.bareText = undefined;
        }

        // New node is always a paragraph
        const newNode = new SyntaxNode('paragraph', contentAfter);
        const siblings = this.getSiblings(node);
        const idx = siblings.indexOf(node);
        siblings.splice(idx + 1, 0, newNode);
        if (node.parent) newNode.parent = node.parent;

        this.treeCursor = { nodeId: newNode.id, offset: 0 };

        /** @type {{ updated: string[], added: string[], removed?: string[] }} */
        const hints = { updated: [node.id], added: [newNode.id] };
        if (rangeRemovedIds.length > 0) hints.removed = rangeRemovedIds;
        this.recordAndRender(before, hints);
    }

    /**
     * Handles Tab / Shift+Tab inside a table — moves between cells.
     * Tab on the last cell creates a new row.
     * @param {boolean} shiftKey - True for Shift+Tab (move backward)
     */
    handleTableTab(shiftKey) {
        const node = this.getCurrentNode();
        if (
            !node ||
            !this.treeCursor ||
            !this.syntaxTree ||
            this.treeCursor.cellRow === undefined ||
            this.treeCursor.cellCol === undefined
        )
            return;

        const { cellRow, cellCol } = this.treeCursor;
        const { totalRows, columns } = this._getTableDimensions(node);

        if (shiftKey) {
            // Move to previous cell
            if (cellCol > 0) {
                this.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow,
                    cellCol: cellCol - 1,
                };
            } else if (cellRow > 0) {
                this.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow: cellRow - 1,
                    cellCol: columns - 1,
                };
            }
            // On first cell — no-op
        } else {
            // Move to next cell
            if (cellCol < columns - 1) {
                this.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow,
                    cellCol: cellCol + 1,
                };
            } else if (cellRow < totalRows - 1) {
                this.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow: cellRow + 1,
                    cellCol: 0,
                };
            } else {
                // Last cell — add a new row
                const before = this.syntaxTree.toMarkdown();
                const newRowIdx = this._tableAddRow(node);
                this.treeCursor = {
                    nodeId: node.id,
                    offset: 0,
                    cellRow: newRowIdx,
                    cellCol: 0,
                };
                this.recordAndRender(before, { updated: [node.id] });
                return;
            }
        }

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
    //  Non-editing event handlers
    // ──────────────────────────────────────────────

    /**
     * Returns the raw markdown text for the current selection range.
     * For same-node selections, returns the selected substring.
     * For cross-node selections, returns the full markdown of the
     * selected region (trimmed start/end, full intermediate nodes).
     *
     * @returns {string} The markdown text of the selection, or empty string.
     */
    _getSelectedMarkdown() {
        this.syncCursorFromDOM();
        if (!this.treeRange || !this.syntaxTree) return '';

        const { startNodeId, startOffset, endNodeId, endOffset } = this.treeRange;
        const startNode = this.syntaxTree.findNodeById(startNodeId);
        const endNode = this.syntaxTree.findNodeById(endNodeId);
        if (!startNode || !endNode) return '';

        // Same node — just the selected substring.
        if (startNodeId === endNodeId) {
            return startNode.content.substring(startOffset, endOffset);
        }

        // Cross-node: collect the tail of the first node, full intermediate
        // nodes, and the head of the last node.
        const siblings = this.getSiblings(startNode);
        const startIdx = siblings.indexOf(startNode);
        const endIdx = siblings.indexOf(endNode);
        if (startIdx === -1 || endIdx === -1) return '';

        const parts = [];
        parts.push(startNode.content.substring(startOffset));
        for (let i = startIdx + 1; i < endIdx; i++) {
            parts.push(siblings[i].toMarkdown());
        }
        parts.push(endNode.content.substring(0, endOffset));
        return parts.join('\n\n');
    }

    /**
     * Handles the `cut` event by writing the selected markdown to the
     * clipboard.  The actual DOM/tree mutation is handled by
     * `handleBeforeInput` for the `deleteByCut` input type.
     * @param {ClipboardEvent} event
     */
    _handleCut(event) {
        this.syncCursorFromDOM();
        if (!this.treeRange) return; // nothing selected — let browser handle

        event.preventDefault();
        const markdown = this._getSelectedMarkdown();
        if (event.clipboardData) {
            event.clipboardData.setData('text/plain', markdown);
        }
        // After this event, the browser fires beforeinput with inputType
        // 'deleteByCut', which we intercept to delete through the tree.
        // However, since we preventDefault'd the cut, no beforeinput fires.
        // Do the deletion here directly.
        const rangeResult = this.deleteSelectedRange();
        if (rangeResult) {
            this.recordAndRender(rangeResult.before, rangeResult.hints);
        }
    }

    /**
     * Handles the `copy` event by writing the selected markdown to the
     * clipboard instead of the browser's default rendered-text copy.
     * @param {ClipboardEvent} event
     */
    _handleCopy(event) {
        this.syncCursorFromDOM();
        if (!this.treeRange) return; // nothing selected — let browser handle

        event.preventDefault();
        const markdown = this._getSelectedMarkdown();
        if (event.clipboardData) {
            event.clipboardData.setData('text/plain', markdown);
        }
    }

    /**
     * Handles click events — syncs tree cursor from wherever the user clicked.
     * In focused view, re-renders when the cursor moves to a different node
     * so the source-syntax decoration follows the cursor.
     * @param {MouseEvent} event
     */
    /**
     * Captures the anchor element (if any) under the pointer at mousedown
     * time.  A selectionchange between mousedown and click may re-render
     * the node and destroy the <a>, so we stash a reference while it still
     * exists in the DOM.
     * @param {MouseEvent} event
     */
    _handleMouseDown(event) {
        this._mouseDownAnchor =
            event.target instanceof HTMLElement && event.target.tagName === 'A'
                ? event.target
                : null;
    }

    /** @param {MouseEvent} event */
    handleClick(event) {
        this.syncCursorFromDOM();

        // Clicking on replaced/void elements like <img> or <hr> doesn't
        // create a text selection, so syncCursorFromDOM won't update the
        // cursor.  Fall back to walking up from the click target to find
        // the nearest element with a data-node-id attribute.
        if (
            (!this.treeCursor || this.treeCursor.nodeId === this._lastRenderedNodeId) &&
            event.target instanceof HTMLElement
        ) {
            let el = /** @type {HTMLElement|null} */ (event.target);
            while (el && el !== this.container) {
                if (el.dataset?.nodeId) {
                    this.treeCursor = { nodeId: el.dataset.nodeId, offset: 0 };
                    break;
                }
                el = el.parentElement;
            }
        }

        this.selectionManager.updateFromDOM();

        // In focused view, clicking an image opens the edit modal directly.
        if (this.viewMode === 'focused' && this.treeCursor) {
            const clickedNode = this.getCurrentNode();
            if (clickedNode?.type === 'image' || clickedNode?.type === 'linked-image') {
                this._openImageModalForNode(clickedNode);
                return;
            }
        }

        // In focused view, clicking a link prevents navigation and opens
        // the edit modal so the user can change the text or URL.
        // The anchor may no longer be in the DOM (selectionchange can
        // re-render the node between mousedown and click), so fall back
        // to the reference captured in _handleMouseDown.
        if (this.viewMode === 'focused') {
            const anchor =
                (event.target instanceof HTMLElement &&
                    event.target.tagName === 'A' &&
                    event.target) ||
                this._mouseDownAnchor;
            this._mouseDownAnchor = null;
            if (anchor) {
                event.preventDefault();
                const node = this.getCurrentNode();
                if (node) {
                    this._openLinkModalForNode(node, /** @type {HTMLAnchorElement} */ (anchor));
                }
                return;
            }
        }

        // In focused view the active node shows raw markdown syntax, so we
        // must re-render whenever the cursor moves to a different node.
        // Compare against _lastRenderedNodeId for the same reason as in
        // handleSelectionChange — treeCursor was already mutated.
        if (
            this.viewMode === 'focused' &&
            this.treeCursor &&
            this.treeCursor.nodeId !== this._lastRenderedNodeId
        ) {
            const nodesToUpdate = [this.treeCursor.nodeId];
            if (this._lastRenderedNodeId) nodesToUpdate.push(this._lastRenderedNodeId);
            this._lastRenderedNodeId = this.treeCursor.nodeId;
            this.renderNodesAndPlaceCursor({ updated: nodesToUpdate });
        }
    }

    /**
     * Handles dragover events — allows image files to be dropped.
     * @param {DragEvent} event
     */
    handleDragOver(event) {
        if (!event.dataTransfer) return;

        // Check whether the drag payload contains files
        if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        }
    }

    /**
     * Image file extensions accepted for drag-and-drop.
     * @type {Set<string>}
     */
    static IMAGE_EXTENSIONS = new Set([
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.bmp',
        '.webp',
        '.svg',
        '.ico',
        '.avif',
    ]);

    /**
     * Handles drop events — inserts dropped image files into the document.
     *
     * When an image file is dropped the editor:
     * 1. Moves the cursor to an empty paragraph (creating one if needed).
     * 2. Inserts an image node referencing the file's original path.
     * 3. Ensures an empty paragraph follows the image for continued editing.
     *
     * @param {DragEvent} event
     */
    async handleDrop(event) {
        if (!event.dataTransfer?.files?.length || !this.syntaxTree) return;

        const files = [...event.dataTransfer.files];
        const imageFiles = files.filter((f) => {
            const ext = f.name.includes('.') ? `.${f.name.split('.').pop()?.toLowerCase()}` : '';
            return Editor.IMAGE_EXTENSIONS.has(ext);
        });

        if (imageFiles.length === 0) return;

        // We're handling this — prevent the browser from doing anything else.
        event.preventDefault();

        const before = this.syntaxTree.toMarkdown();

        for (const file of imageFiles) {
            // Use the Electron webUtils bridge to get the real filesystem path.
            const filePath = window.electronAPI?.getPathForFile(file) ?? file.name;

            await this._insertDroppedImage(filePath, file.name);
        }

        this.recordAndRender(before);
    }

    /**
     * Inserts a dropped image into the syntax tree at the current cursor
     * position, ensuring the cursor is on an empty paragraph first and that
     * an empty paragraph follows the image node.
     *
     * @param {string} filePath - Absolute path to the image file
     * @param {string} fileName - The file name (used as fallback alt text)
     */
    async _insertDroppedImage(filePath, fileName) {
        if (!this.syntaxTree) return;

        const currentNode = this.getCurrentNode();
        const alt = fileName.replace(/\.[^.]+$/, '');

        // Convert the absolute path to a file:// URL so the image resolves
        // regardless of where the current document is saved.
        const fileUrl = filePath.startsWith('file://')
            ? filePath
            : `file:///${filePath.replace(/\\/g, '/')}`;

        // Use a relative path when the setting is enabled
        const src = this.ensureLocalPaths ? await this.toRelativeImagePath(fileUrl) : fileUrl;

        const imageNode = new SyntaxNode('image', alt);
        imageNode.attributes = { alt, url: src };

        if (!currentNode) {
            // No cursor node — append to the tree
            this.syntaxTree.appendChild(imageNode);
        } else if (currentNode.type === 'paragraph' && currentNode.content === '') {
            // Cursor is already on an empty paragraph — replace it
            const siblings = this.getSiblings(currentNode);
            const idx = siblings.indexOf(currentNode);
            siblings.splice(idx, 1, imageNode);
            imageNode.parent = currentNode.parent;
            currentNode.parent = null;
        } else {
            // Cursor is on a non-empty element — insert image after it
            const siblings = this.getSiblings(currentNode);
            const idx = siblings.indexOf(currentNode);
            siblings.splice(idx + 1, 0, imageNode);
            imageNode.parent = currentNode.parent;
        }

        // Ensure an empty paragraph follows the image for continued editing
        const imgSiblings = this.getSiblings(imageNode);
        const imgIdx = imgSiblings.indexOf(imageNode);
        const nextNode = imgSiblings[imgIdx + 1];
        if (!nextNode || !(nextNode.type === 'paragraph' && nextNode.content === '')) {
            const trailingParagraph = new SyntaxNode('paragraph', '');
            imgSiblings.splice(imgIdx + 1, 0, trailingParagraph);
            trailingParagraph.parent = imageNode.parent;
        }

        // Place the cursor on the trailing empty paragraph
        const afterNode = imgSiblings[imgIdx + 1];
        this.treeCursor = { nodeId: afterNode.id, offset: 0 };
    }

    /** Handles focus events. */
    handleFocus() {
        this.container.classList.add('focused');

        // When returning from a modal dialog (link/image/table), the
        // tree cursor was intentionally preserved (see handleBlur).
        // Restore the browser caret so the user sees their cursor again.
        if (this._blurredByModal) {
            this._blurredByModal = false;
            if (this.treeCursor) {
                this.placeCursor();
            }
        }
    }

    /** Handles blur events — clears the active node highlight.
     *  @param {FocusEvent} event
     */
    handleBlur(event) {
        // When focus moves to a modal dialog (link / image / table edit),
        // preserve the tree cursor and the focused-node rendering so they
        // can be seamlessly restored when the modal closes.
        const related = /** @type {HTMLElement|null} */ (event.relatedTarget);
        if (related?.closest?.('dialog')) {
            this._blurredByModal = true;
            return;
        }

        // When focus moves to a toolbar button (e.g. the view-mode toggle),
        // preserve the tree cursor so the toolbar action can operate on
        // the correct cursor position.
        if (related?.closest?.('#toolbar-container')) {
            return;
        }

        this.container.classList.remove('focused');

        // In focused view the active node shows raw markdown syntax.
        // When the user clicks outside the editor we clear the tree
        // cursor and re-render the previously focused node so it shows
        // its "unfocused" presentation.  Clicking back into the editor
        // will restore the cursor via handleClick / handleSelectionChange.
        if (this.viewMode === 'focused' && this.treeCursor) {
            const previousNodeId = this.treeCursor.nodeId;
            this.treeCursor = null;
            this.renderNodes({ updated: [previousNodeId] });
        }
    }

    /** Handles selection change events. */
    handleSelectionChange() {
        if (this._isRendering) return;
        if (document.activeElement === this.container) {
            this.syncCursorFromDOM();
            this.selectionManager.updateFromDOM();

            // When the user is extending a selection (non-collapsed), skip
            // the focused-mode re-render — re-rendering would destroy the
            // in-progress DOM selection and place a collapsed cursor.
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) return;

            // In focused view the active node shows raw markdown syntax, so we
            // must re-render whenever the cursor moves to a different node.
            // Only the two affected nodes need updating.
            // We compare against _lastRenderedNodeId (not treeCursor before
            // sync) because syncCursorFromDOM already mutated treeCursor and
            // the non-collapsed guard above may have skipped earlier renders.
            const newNodeId = this.treeCursor?.nodeId ?? null;
            if (
                this.viewMode === 'focused' &&
                newNodeId &&
                newNodeId !== this._lastRenderedNodeId
            ) {
                const nodesToUpdate = [newNodeId];
                if (this._lastRenderedNodeId) nodesToUpdate.push(this._lastRenderedNodeId);
                this._lastRenderedNodeId = newNodeId;
                this.renderNodes({ updated: nodesToUpdate });
                this.placeCursor();

                // If the user mousedown'd on an <a> and selectionchange moved
                // focus to a different node, the re-render above destroyed the
                // <a> so the browser will never fire a click event.  Open the
                // link modal now instead.
                if (this._mouseDownAnchor) {
                    const anchor = /** @type {HTMLAnchorElement} */ (this._mouseDownAnchor);
                    this._mouseDownAnchor = null;
                    const node = this.getCurrentNode();
                    if (node) {
                        this._openLinkModalForNode(node, anchor);
                    }
                }
            }
        }
    }

    // ──────────────────────────────────────────────
    //  Public API (used by toolbar, IPC, tests, …)
    // ──────────────────────────────────────────────

    /**
     * Loads markdown content into the editor.
     * @param {string} markdown - The markdown content to load
     */
    loadMarkdown(markdown) {
        this.syntaxTree = this.parser.parse(markdown);

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
        this.rewriteImagePaths().then((changedIds) => {
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

        // Find the node element closest to the vertical centre of the visible
        // viewport and remember its offset from the container top.  This keeps
        // the content the user is looking at in the same place after re-render.
        const scrollContainer = this.container.parentElement;
        /** @type {string|null} */
        let anchorNodeId = null;
        let savedOffsetFromTop = null;

        if (scrollContainer) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const centreY = containerRect.top + containerRect.height / 2;

            const nodeEls = this.container.querySelectorAll('[data-node-id]');
            let bestDistance = Number.POSITIVE_INFINITY;

            for (const el of nodeEls) {
                const rect = el.getBoundingClientRect();
                // Distance from the element's vertical midpoint to the viewport centre
                const mid = rect.top + rect.height / 2;
                const dist = Math.abs(mid - centreY);
                if (dist < bestDistance) {
                    bestDistance = dist;
                    anchorNodeId = /** @type {HTMLElement} */ (el).dataset.nodeId ?? null;
                    savedOffsetFromTop = rect.top - containerRect.top;
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
                const elRect = el.getBoundingClientRect();
                const currentOffsetFromTop = elRect.top - containerRect.top;
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
        this.insertTextAtCursor(text);
    }

    /**
     * Converts an absolute image path to a relative path when the image lives
     * in the same directory as (or a subdirectory of) the current document.
     * Returns the original path unchanged if no document is open or the image
     * is not downstream of the document's folder.
     *
     * Handles both raw filesystem paths and `file:///` URLs.
     * Delegates to the main process which uses Node's `path` module for
     * filesystem-correct comparison.
     *
     * @param {string} imagePath - The absolute image path or file:// URL
     * @returns {Promise<string>} A relative path (using forward slashes) or the original value
     */
    async toRelativeImagePath(imagePath) {
        if (!this.currentFilePath || !imagePath || !window.electronAPI) return imagePath;
        return window.electronAPI.toRelativeImagePath(imagePath, this.currentFilePath);
    }

    /**
     * Walks every image node in the syntax tree and rewrites absolute paths
     * that are downstream-relative to the current document to their minimal
     * relative form.  Only runs when `this.ensureLocalPaths` is true and the
     * document has been saved to disk.
     */
    /**
     * Rewrites absolute image paths to relative paths.
     * @returns {Promise<string[]>} IDs of nodes whose paths were rewritten.
     */
    async rewriteImagePaths() {
        /** @type {string[]} */
        const changedIds = [];
        if (!this.ensureLocalPaths || !this.currentFilePath || !this.syntaxTree) return changedIds;

        for (const node of this.syntaxTree.children) {
            if (node.type !== 'image' && node.type !== 'linked-image') continue;

            const url = node.attributes.url;
            if (!url) continue;

            const rewritten = await this.toRelativeImagePath(url);
            if (rewritten !== url) {
                node.attributes.url = rewritten;
                changedIds.push(node.id);
            }
        }
        return changedIds;
    }

    /**
     * Inserts a new image node or updates the existing image node at the cursor.
     * @param {string} alt - Alt text
     * @param {string} src - Image source path or URL
     * @param {string} href - Optional link URL (empty string for no link)
     */
    insertOrUpdateImage(alt, src, href, style = '') {
        if (!this.syntaxTree) return;

        const before = this.syntaxTree.toMarkdown();
        const currentNode = this.getCurrentNode();
        let renderHints;

        if (currentNode?.type === 'image') {
            // Update existing image node
            currentNode.content = alt;
            currentNode.attributes = { alt, url: src };
            if (href) {
                currentNode.attributes.href = href;
            }
            if (style) {
                currentNode.attributes.style = style;
            }
            this.treeCursor = { nodeId: currentNode.id, offset: alt.length };
            renderHints = { updated: [currentNode.id] };
        } else {
            // Insert a new image node
            const imageNode = new SyntaxNode('image', alt);
            imageNode.attributes = { alt, url: src };
            if (href) {
                imageNode.attributes.href = href;
            }
            if (style) {
                imageNode.attributes.style = style;
            }

            if (currentNode) {
                const siblings = this.getSiblings(currentNode);
                const idx = siblings.indexOf(currentNode);
                // If the current node is an empty paragraph, replace it
                if (currentNode.type === 'paragraph' && currentNode.content === '') {
                    siblings.splice(idx, 1, imageNode);
                    imageNode.parent = currentNode.parent;
                    currentNode.parent = null;
                    renderHints = { added: [imageNode.id], removed: [currentNode.id] };
                } else {
                    // Insert after current node
                    siblings.splice(idx + 1, 0, imageNode);
                    imageNode.parent = currentNode.parent;
                    renderHints = { added: [imageNode.id] };
                }
            } else {
                this.syntaxTree.appendChild(imageNode);
                renderHints = { added: [imageNode.id] };
            }

            this.treeCursor = { nodeId: imageNode.id, offset: alt.length };
        }

        this.recordAndRender(before, renderHints);
    }

    /**
     * Opens the image modal pre-filled with the given image node's data,
     * and applies any edits back to the parse tree.
     * Used when clicking an image in focused mode.
     * @param {SyntaxNode} node - The image node to edit
     */
    async _openImageModalForNode(node) {
        if (!this._imageModal) {
            this._imageModal = new ImageModal();
        }

        const existing = {
            alt: node.attributes.alt ?? node.content,
            src: node.attributes.url ?? '',
            href: node.attributes.href ?? '',
            style: node.attributes.style ?? '',
        };

        const result = await this._imageModal.open(existing);
        if (!result) return;

        let src = result.src;

        // Handle file rename if the filename changed
        if (result.rename && window.electronAPI) {
            const originalFilename = this._extractFilename(src);
            if (result.rename !== originalFilename) {
                const renameResult = await window.electronAPI.renameImage(
                    this._resolveImagePath(src),
                    result.rename,
                );
                if (renameResult.success && renameResult.newPath) {
                    src = this._replaceFilename(src, result.rename);
                }
            }
        }

        // Use a relative path when the setting is enabled
        if (this.ensureLocalPaths) {
            src = await this.toRelativeImagePath(src);
        }

        // Update the node directly — after the modal closes the cursor
        // may have moved, so we cannot rely on insertOrUpdateImage which
        // reads getCurrentNode().
        if (!this.syntaxTree) return;
        const before = this.syntaxTree.toMarkdown();
        node.content = result.alt;
        node.attributes = { alt: result.alt, url: src };
        if (result.href) {
            node.attributes.href = result.href;
        }
        if (result.style) {
            node.attributes.style = result.style;
        }
        this.treeCursor = { nodeId: node.id, offset: result.alt.length };
        this.recordAndRender(before, { updated: [node.id] });
    }

    /**
     * Extracts the filename from a path or URL.
     * @param {string} src
     * @returns {string}
     */
    _extractFilename(src) {
        if (!src) return '';
        const clean = src.split('?')[0].split('#')[0];
        const parts = clean.split(/[/\\]/);
        return parts[parts.length - 1] || '';
    }

    /**
     * Replaces the filename portion of a path or URL.
     * @param {string} src - Original path
     * @param {string} newName - New filename
     * @returns {string}
     */
    _replaceFilename(src, newName) {
        const lastSlash = Math.max(src.lastIndexOf('/'), src.lastIndexOf('\\'));
        if (lastSlash === -1) return newName;
        return src.substring(0, lastSlash + 1) + newName;
    }

    /**
     * Resolves an image src to an absolute file path for rename operations.
     * Strips file:/// prefix and decodes URI encoding.
     * @param {string} src
     * @returns {string}
     */
    _resolveImagePath(src) {
        let resolved = src;
        if (resolved.startsWith('file:///')) {
            resolved = resolved.slice(8);
        }
        resolved = decodeURIComponent(resolved);
        resolved = resolved.replace(/\//g, '\\');
        return resolved;
    }

    /**
     * Opens the link-editing modal pre-filled with the link data extracted
     * from the clicked `<a>` element and, on submit, replaces it in the
     * node's raw content.
     *
     * @param {import('../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLAnchorElement} anchor - The clicked `<a>` element
     */
    async _openLinkModalForNode(node, anchor) {
        if (!this._linkModal) {
            this._linkModal = new LinkModal();
        }

        const clickedUrl = anchor.getAttribute('href') ?? '';

        // Find the link in the raw markdown by matching the URL, which is
        // more reliable than anchor.textContent (the latter loses nested
        // formatting like **bold**).
        const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
        let oldMarkdown = '';
        let oldText = '';
        for (const match of node.content.matchAll(linkRe)) {
            if (match[2] === clickedUrl) {
                oldMarkdown = match[0];
                oldText = match[1];
                break;
            }
        }

        if (!oldMarkdown) return;

        const result = await this._linkModal.open({ text: oldText, url: clickedUrl });
        if (!result) return;

        if (!this.syntaxTree) return;
        const before = this.syntaxTree.toMarkdown();

        const newMarkdown = `[${result.text}](${result.url})`;
        node.content = node.content.replace(oldMarkdown, newMarkdown);

        this.treeCursor = { nodeId: node.id, offset: 0 };
        this.recordAndRender(before, { updated: [node.id] });
    }

    /**
     * Inserts a new table node or updates the existing table node at the cursor.
     * @param {{rows: number, columns: number, cells: string[][]}} tableData
     */
    insertOrUpdateTable(tableData) {
        if (!this.syntaxTree) return;

        // Build markdown from the cells
        const markdown = this._buildTableMarkdown(tableData);

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
     * Converts table data (cells array) to markdown table text.
     * @param {{rows: number, columns: number, cells: string[][]}} data
     * @returns {string}
     */
    _buildTableMarkdown(data) {
        const { columns, cells } = data;
        const lines = [];

        for (let r = 0; r < cells.length; r++) {
            const row = cells[r];
            const paddedCells = [];

            for (let c = 0; c < columns; c++) {
                paddedCells.push(` ${row[c] ?? ''} `);
            }

            lines.push(`|${paddedCells.join('|')}|`);

            // After the header row, insert the separator line
            if (r === 0) {
                const sep = [];
                for (let c = 0; c < columns; c++) {
                    sep.push('---');
                }
                lines.push(`| ${sep.join(' | ')} |`);
            }
        }

        return lines.join('\n');
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

        const beforeContent = this.getMarkdown();
        this.syntaxTree.changeNodeType(currentNode, elementType);

        this.undoManager.recordChange({
            type: 'changeType',
            before: beforeContent,
            after: this.getMarkdown(),
        });

        this.renderNodesAndPlaceCursor({ updated: [currentNode.id] });
        this.setUnsavedChanges(true);
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
