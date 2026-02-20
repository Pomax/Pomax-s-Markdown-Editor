/**
 * @fileoverview Manages the cursor: mapping between DOM selections and
 * tree coordinates, and placing the DOM caret from tree coordinates.
 */

/// <reference path="../../../types.d.ts" />

import { rawOffsetToRenderedOffset, renderedOffsetToRawOffset } from './offset-mapping.js';

/**
 * Manages cursor synchronization between the DOM and the syntax tree.
 */
export class CursorManager {
    /**
     * @param {import('./editor.js').Editor} editor
     */
    constructor(editor) {
        /** @type {import('./editor.js').Editor} */
        this.editor = editor;
    }

    /**
     * Updates the tree cursor by reading the current DOM selection and mapping
     * it back to a (nodeId, offset) pair.  This is the **only** place where we
     * read positional information from the DOM — and it only updates the cursor,
     * never content.
     *
     * When the selection is non-collapsed, also populates `editor.treeRange`
     * with start/end tree coordinates.  When collapsed, clears `treeRange`.
     */
    syncCursorFromDOM() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);

        // Map the start (anchor) position to tree coordinates.
        const startInfo = this._mapDOMPositionToTree(range.startContainer, range.startOffset);
        if (!startInfo) return;

        this.editor.treeCursor = startInfo.cursor;

        // If the selection is collapsed there is no range.
        if (selection.isCollapsed) {
            this.editor.treeRange = null;
            return;
        }

        // Map the end (focus) position to tree coordinates.
        const endInfo = this._mapDOMPositionToTree(range.endContainer, range.endOffset);
        if (!endInfo) {
            this.editor.treeRange = null;
            return;
        }

        this.editor.treeRange = {
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
     * @returns {{ cursor: import('./editor.js').TreeCursor } | null}
     */
    _mapDOMPositionToTree(domNode, domOffset) {
        /** @type {Node|null} */
        let el = domNode;
        while (el && el !== this.editor.container) {
            if (el.nodeType === Node.ELEMENT_NODE) {
                const htmlEl = /** @type {HTMLElement} */ (el);
                const nodeId = htmlEl.dataset?.nodeId;
                if (nodeId) {
                    // Check if the cursor is inside a table cell
                    const node = this.editor.syntaxTree?.findNodeById(nodeId);
                    if (node?.type === 'table' && this.editor.viewMode === 'focused') {
                        const pos = this.editor.tableManager.computeTableCellPosition(
                            htmlEl,
                            domNode,
                            domOffset,
                        );
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
                    /** @type {import('./editor.js').TreeCursor} */
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
                const afterFmt = this._isOutsideFormatting(cursorNode, contentEl);
                return this._toRawOffset(nodeElement, renderedOff, afterFmt);
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
     *
     * When {@link afterFormatting} is true the cursor sits outside all
     * inline formatting wrappers in the DOM, so at an exact boundary
     * the raw offset must advance past any invisible closing delimiters
     * to avoid the cursor being placed *inside* the formatted range on
     * the next keystroke.
     *
     * @param {HTMLElement} nodeElement - The element with `data-node-id`
     * @param {number} renderedOffset - The offset in rendered text
     * @param {boolean} [afterFormatting] - True when the cursor is not
     *   inside any inline formatting element in the DOM.
     * @returns {number}
     */
    _toRawOffset(nodeElement, renderedOffset, afterFormatting = false) {
        if (this.editor.viewMode !== 'focused') return renderedOffset;
        const nodeId = nodeElement.dataset?.nodeId;
        if (!nodeId) return renderedOffset;
        const syntaxNode = this.editor.syntaxTree?.findNodeById(nodeId);
        if (!syntaxNode) return renderedOffset;
        if (!this._hasInlineFormatting(syntaxNode.type)) return renderedOffset;

        let rawOffset = renderedOffsetToRawOffset(syntaxNode.content, renderedOffset);

        // Forward-affinity: advance past any invisible closing delimiters
        // that map to the same rendered offset.  This ensures the cursor
        // ends up *after* the formatted run in the raw markdown.
        if (afterFormatting) {
            const content = syntaxNode.content;
            while (rawOffset < content.length) {
                const next = rawOffsetToRenderedOffset(content, rawOffset + 1);
                if (next === rawOffsetToRenderedOffset(content, rawOffset)) {
                    rawOffset++;
                } else {
                    break;
                }
            }
        }

        return rawOffset;
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

    /**
     * Places the DOM cursor at the position described by `editor.treeCursor`.
     */
    placeCursor() {
        if (!this.editor.treeCursor) return;

        // When the cursor targets a tag line (source view), there may be
        // multiple elements with the same data-node-id (opening & closing).
        // Select the one matching the tagPart.
        /** @type {Element|null} */
        let nodeElement = null;
        if (this.editor.treeCursor.tagPart) {
            nodeElement = this.editor.container.querySelector(
                `[data-node-id="${this.editor.treeCursor.nodeId}"][data-tag-part="${this.editor.treeCursor.tagPart}"]`,
            );
        }
        if (!nodeElement) {
            nodeElement = this.editor.container.querySelector(
                `[data-node-id="${this.editor.treeCursor.nodeId}"]`,
            );
        }
        if (!nodeElement) return;

        // ── Table cell cursor placement ──
        if (
            this.editor.viewMode === 'focused' &&
            this.editor.treeCursor.cellRow !== undefined &&
            this.editor.treeCursor.cellCol !== undefined
        ) {
            this.editor.tableManager.placeTableCellCursor(
                /** @type {HTMLElement} */ (nodeElement),
                this.editor.treeCursor.cellRow,
                this.editor.treeCursor.cellCol,
                this.editor.treeCursor.offset,
            );
            return;
        }

        const contentEl = nodeElement.querySelector('.md-content') ?? nodeElement;

        // In focused mode the DOM shows rendered text (no markdown syntax),
        // so we must convert the raw tree offset to a rendered offset.
        // Only applies to node types that render inline formatting (paragraph,
        // heading, blockquote, list-item).  Other types (table, code-block,
        // image, horizontal-rule) don't use inline markup rendering.
        let cursorOffset = this.editor.treeCursor.offset;
        if (this.editor.viewMode === 'focused') {
            const node = this.editor.getCurrentNode();
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
            // Use strict < so that when remaining === len the cursor
            // advances past the current text node.  This gives "forward
            // affinity": after a closing delimiter the cursor lands in
            // the empty text node *after* the formatting element rather
            // than at the end of the text node *inside* it.
            if (remaining < len || (remaining === 0 && len === 0)) {
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

    // ── Formatting-affinity helpers ─────────────────────────────────

    /** @type {Set<string>} */
    static _FORMATTING_TAGS = new Set([
        'EM',
        'STRONG',
        'DEL',
        'A',
        'CODE',
        'SUB',
        'SUP',
        'MARK',
        'U',
        'B',
        'I',
        'S',
    ]);

    /**
     * Returns true when {@link node} is NOT inside any inline formatting
     * wrapper element (em, strong, del, etc.) between itself and
     * {@link contentEl}.  Used to determine forward-affinity when mapping
     * a DOM position back to a raw offset.
     *
     * @param {Node} node
     * @param {Node} contentEl
     * @returns {boolean}
     */
    _isOutsideFormatting(node, contentEl) {
        /** @type {Node|null} */
        let el = node.parentNode;
        while (el && el !== contentEl) {
            if (
                el.nodeType === Node.ELEMENT_NODE &&
                CursorManager._FORMATTING_TAGS.has(/** @type {Element} */ (el).tagName)
            ) {
                return false;
            }
            el = el.parentNode;
        }
        return el === contentEl;
    }
}
