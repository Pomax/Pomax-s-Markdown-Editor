/**
 * @fileoverview Main Editor class.
 * Manages the document, view modes, and user interactions.
 *
 * All edits flow through the parse tree: user input is intercepted at the
 * keydown level, applied to the tree, and then the DOM is re-rendered from
 * the tree. The DOM is never the source of truth for content.
 */

/// <reference path="../../../types.d.ts" />

import { MarkdownParser } from '../parser/markdown-parser.js';
import { SyntaxNode, SyntaxTree } from '../parser/syntax-tree.js';
import { FocusedRenderer } from './renderers/focused-renderer.js';
import { SourceRenderer } from './renderers/source-renderer.js';
import { SelectionManager } from './selection-manager.js';
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
        this.render();
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

        this.container.addEventListener('click', this.handleClick.bind(this));
        this.container.addEventListener('focus', this.handleFocus.bind(this));
        this.container.addEventListener('blur', this.handleBlur.bind(this));

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
     */
    syncCursorFromDOM() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);

        // Walk up from the selection anchor to find the nearest element with a
        // data-node-id attribute, which maps it back to a tree node.
        /** @type {Node|null} */
        let el = range.startContainer;
        while (el && el !== this.container) {
            if (el.nodeType === Node.ELEMENT_NODE) {
                const htmlEl = /** @type {HTMLElement} */ (el);
                const nodeId = htmlEl.dataset?.nodeId;
                if (nodeId) {
                    const offset = this.computeOffsetInContent(
                        htmlEl,
                        range.startContainer,
                        range.startOffset,
                    );
                    /** @type {TreeCursor} */
                    const cursor = { nodeId, offset };
                    // If this element represents an html-block tag line in
                    // source view, record which part so edit methods can
                    // route changes to the correct attribute.
                    const tagPart = htmlEl.dataset?.tagPart;
                    if (tagPart === 'opening' || tagPart === 'closing') {
                        cursor.tagPart = tagPart;
                    }
                    this.treeCursor = cursor;
                    return;
                }
            }
            el = el.parentNode;
        }
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
                return offset + cursorOffset;
            }
            offset += node.textContent?.length ?? 0;
            node = walker.nextNode();
        }

        // cursorNode was not a text node inside the content element (e.g. the
        // cursor is on the element itself).  Clamp to content length.
        return Math.min(cursorOffset, offset);
    }

    // ──────────────────────────────────────────────
    //  Rendering
    // ──────────────────────────────────────────────

    /**
     * Renders the document based on current view mode.
     */
    render() {
        if (!this.syntaxTree) return;

        this._isRendering = true;
        try {
            const renderer =
                this.viewMode === 'source' ? this.sourceRenderer : this.focusedRenderer;
            renderer.render(this.syntaxTree, this.container);
        } finally {
            this._isRendering = false;
        }
    }

    /**
     * Renders the tree and then places the DOM cursor according to `treeCursor`.
     */
    renderAndPlaceCursor() {
        this.render();
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

        const contentEl = nodeElement.querySelector('.md-content') ?? nodeElement;

        const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null);
        let remaining = this.treeCursor.offset;
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

        // Navigation keys (arrows, Home, End, Page Up/Down), Tab, Escape, etc.
        // are left to their default browser behaviour so the cursor moves
        // naturally.  After the key is processed, `selectionchange` will fire
        // and we update the tree cursor from the DOM.
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
        const node = this.getCurrentNode();
        if (!node || !this.syntaxTree || !this.treeCursor) return;

        // When the cursor is on an html-block tag line (source view), edit
        // the openingTag / closingTag attribute directly.
        if (node.type === 'html-block' && this.treeCursor.tagPart) {
            const before = this.syntaxTree.toMarkdown();
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
            this.recordAndRender(before);
            return;
        }

        // html-block containers without tagPart are structural (focused view).
        if (node.type === 'html-block' && node.children.length > 0) return;

        const before = this.syntaxTree.toMarkdown();
        const oldType = node.type;

        // Insert the text into the node's content at the cursor offset
        const left = node.content.substring(0, this.treeCursor.offset);
        const right = node.content.substring(this.treeCursor.offset);
        const newContent = left + text + right;

        // Re-parse the full markdown line to detect type changes
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
        this.recordAndRender(before);
    }

    /**
     * Handles the Backspace key.
     */
    handleBackspace() {
        this.syncCursorFromDOM();
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
                this.recordAndRender(before);
            }
            return;
        }

        // html-block containers without tagPart are structural (focused view).
        if (node.type === 'html-block' && node.children.length > 0) return;

        const before = this.syntaxTree.toMarkdown();

        if (this.treeCursor.offset > 0) {
            // Delete one character before the cursor inside this node's content
            const left = node.content.substring(0, this.treeCursor.offset - 1);
            const right = node.content.substring(this.treeCursor.offset);
            const newContent = left + right;
            const oldType = node.type;

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
                    const prevLen = prev.content.length;
                    prev.content += node.content;
                    siblings.splice(idx, 1);
                    node.parent = null;
                    this.treeCursor = { nodeId: prev.id, offset: prevLen };
                }
                // If idx === 0 there is nothing to merge into — do nothing.
            }
        }

        this.recordAndRender(before);
    }

    /**
     * Handles the Delete key.
     */
    handleDelete() {
        this.syncCursorFromDOM();
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
                this.recordAndRender(before);
            }
            return;
        }

        // html-block containers without tagPart are structural (focused view).
        if (node.type === 'html-block' && node.children.length > 0) return;

        const before = this.syntaxTree.toMarkdown();

        if (this.treeCursor.offset < node.content.length) {
            // Delete one character after the cursor
            const left = node.content.substring(0, this.treeCursor.offset);
            const right = node.content.substring(this.treeCursor.offset + 1);
            const newContent = left + right;
            const oldType = node.type;

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
                const curLen = node.content.length;
                node.content += next.content;
                siblings.splice(idx + 1, 1);
                next.parent = null;
                this.treeCursor = { nodeId: node.id, offset: curLen };
            }
        }

        this.recordAndRender(before);
    }

    /**
     * Handles the Enter key — splits the current node at the cursor.
     */
    handleEnterKey() {
        this.syncCursorFromDOM();
        const node = this.getCurrentNode();
        if (!node || !this.syntaxTree || !this.treeCursor) return;

        // html-block tag lines and containers are not splittable.
        if (node.type === 'html-block' && (this.treeCursor.tagPart || node.children.length > 0)) {
            return;
        }

        const before = this.syntaxTree.toMarkdown();

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

        this.recordAndRender(before);
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
     */
    recordAndRender(before) {
        if (!this.syntaxTree) return;

        const after = this.syntaxTree.toMarkdown();
        if (before !== after) {
            this.undoManager.recordChange({ type: 'input', before, after });
            this.setUnsavedChanges(true);
        }

        this.renderAndPlaceCursor();
    }

    // ──────────────────────────────────────────────
    //  Non-editing event handlers
    // ──────────────────────────────────────────────

    /**
     * Handles click events — syncs tree cursor from wherever the user clicked.
     * In focused view, re-renders when the cursor moves to a different node
     * so the source-syntax decoration follows the cursor.
     * @param {MouseEvent} event
     */
    handleClick(event) {
        const previousNodeId = this.treeCursor?.nodeId ?? null;
        this.syncCursorFromDOM();

        // Clicking on replaced/void elements like <img> or <hr> doesn't
        // create a text selection, so syncCursorFromDOM won't update the
        // cursor.  Fall back to walking up from the click target to find
        // the nearest element with a data-node-id attribute.
        if (
            (!this.treeCursor || this.treeCursor.nodeId === previousNodeId) &&
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

        // In focused view the active node shows raw markdown syntax, so we
        // must re-render whenever the cursor moves to a different node.
        if (
            this.viewMode === 'focused' &&
            this.treeCursor &&
            this.treeCursor.nodeId !== previousNodeId
        ) {
            this.renderAndPlaceCursor();
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
    }

    /** Handles blur events. */
    handleBlur() {
        this.container.classList.remove('focused');
    }

    /** Handles selection change events. */
    handleSelectionChange() {
        if (this._isRendering) return;
        if (document.activeElement === this.container) {
            const previousNodeId = this.treeCursor?.nodeId ?? null;
            this.syncCursorFromDOM();
            this.selectionManager.updateFromDOM();

            // In focused view the active node shows raw markdown syntax, so we
            // must re-render whenever the cursor moves to a different node.
            const newNodeId = this.treeCursor?.nodeId ?? null;
            if (this.viewMode === 'focused' && newNodeId && newNodeId !== previousNodeId) {
                console.log(
                    `[selectionchange] node changed: ${previousNodeId} -> ${newNodeId}, re-rendering`,
                );
                this.renderAndPlaceCursor();
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

        const first = this.syntaxTree.children[0];
        this.treeCursor = { nodeId: first.id, offset: 0 };

        this.undoManager.clear();
        this.setUnsavedChanges(false);

        // Rewrite absolute image paths to relative when the setting is enabled,
        // then render.  Because the rewrite is async (IPC round-trip) we render
        // once immediately and a second time after paths have been rewritten.
        this.renderAndPlaceCursor();
        this.rewriteImagePaths().then(() => this.renderAndPlaceCursor());
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
        this.renderAndPlaceCursor();
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
        this.renderAndPlaceCursor();

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
            this.renderAndPlaceCursor();
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
            this.renderAndPlaceCursor();
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
    async rewriteImagePaths() {
        if (!this.ensureLocalPaths || !this.currentFilePath || !this.syntaxTree) return;

        for (const node of this.syntaxTree.children) {
            if (node.type !== 'image' && node.type !== 'linked-image') continue;

            const url = node.attributes.url;
            if (!url) continue;

            const rewritten = await this.toRelativeImagePath(url);
            if (rewritten !== url) {
                node.attributes.url = rewritten;
            }
        }
    }

    /**
     * Inserts a new image node or updates the existing image node at the cursor.
     * @param {string} alt - Alt text
     * @param {string} src - Image source path or URL
     * @param {string} href - Optional link URL (empty string for no link)
     */
    insertOrUpdateImage(alt, src, href) {
        if (!this.syntaxTree) return;

        const before = this.syntaxTree.toMarkdown();
        const currentNode = this.getCurrentNode();

        if (currentNode?.type === 'image') {
            // Update existing image node
            currentNode.content = alt;
            currentNode.attributes = { alt, url: src };
            if (href) {
                currentNode.attributes.href = href;
            }
            this.treeCursor = { nodeId: currentNode.id, offset: alt.length };
        } else {
            // Insert a new image node
            const imageNode = new SyntaxNode('image', alt);
            imageNode.attributes = { alt, url: src };
            if (href) {
                imageNode.attributes.href = href;
            }

            if (currentNode) {
                const siblings = this.getSiblings(currentNode);
                const idx = siblings.indexOf(currentNode);
                // If the current node is an empty paragraph, replace it
                if (currentNode.type === 'paragraph' && currentNode.content === '') {
                    siblings.splice(idx, 1, imageNode);
                    imageNode.parent = currentNode.parent;
                    currentNode.parent = null;
                } else {
                    // Insert after current node
                    siblings.splice(idx + 1, 0, imageNode);
                    imageNode.parent = currentNode.parent;
                }
            } else {
                this.syntaxTree.appendChild(imageNode);
            }

            this.treeCursor = { nodeId: imageNode.id, offset: alt.length };
        }

        this.recordAndRender(before);
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

        if (currentNode?.type === 'table') {
            // Update existing table
            currentNode.content = markdown;
            this.treeCursor = { nodeId: currentNode.id, offset: 0 };
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
                } else {
                    siblings.splice(idx + 1, 0, tableNode);
                    tableNode.parent = currentNode.parent;
                }
            } else {
                this.syntaxTree.appendChild(tableNode);
            }

            this.treeCursor = { nodeId: tableNode.id, offset: 0 };
        }

        this.recordAndRender(before);
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
        const currentNode = this.selectionManager.getCurrentNode();
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

        this.renderAndPlaceCursor();
        this.setUnsavedChanges(true);
    }

    /**
     * Applies formatting to the current selection.
     * @param {string} format
     */
    applyFormat(format) {
        const selection = this.selectionManager.getSelection();
        if (!selection || !this.syntaxTree) return;

        const beforeContent = this.getMarkdown();
        this.syntaxTree.applyFormat(selection, format);

        this.undoManager.recordChange({
            type: 'format',
            before: beforeContent,
            after: this.getMarkdown(),
        });

        this.renderAndPlaceCursor();
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
