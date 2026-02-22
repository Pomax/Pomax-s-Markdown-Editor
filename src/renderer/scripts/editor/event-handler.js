/**
 * @fileoverview Non-editing event handlers: click, mousedown, focus, blur,
 * selectionchange, drag-and-drop.
 */

/// <reference path="../../../types.d.ts" />

import { SyntaxNode } from '../parser/syntax-tree.js';

/**
 * Handles non-editing DOM events for the editor.
 */
export class EventHandler {
    /**
     * @param {import('./editor.js').Editor} editor
     */
    constructor(editor) {
        /** @type {import('./editor.js').Editor} */
        this.editor = editor;

        /**
         * Stashed anchor element from mousedown, in case selectionchange
         * re-renders the node before the click event fires.
         * @type {HTMLElement|null}
         */
        this._mouseDownAnchor = null;

        /**
         * Set to true when the editor loses focus to a modal dialog,
         * so handleFocus can restore the caret when the modal closes.
         * @type {boolean}
         */
        this._blurredByModal = false;
    }

    /**
     * Captures the anchor element (if any) under the pointer at mousedown
     * time.  A selectionchange between mousedown and click may re-render
     * the node and destroy the <a>, so we stash a reference while it still
     * exists in the DOM.
     * @param {MouseEvent} event
     */
    handleMouseDown(event) {
        this._mouseDownAnchor =
            event.target instanceof HTMLElement && event.target.tagName === 'A'
                ? event.target
                : null;
    }

    /**
     * Handles click events — syncs tree cursor from wherever the user clicked.
     * In focused view, re-renders when the cursor moves to a different node
     * so the source-syntax decoration follows the cursor.
     * @param {MouseEvent} event
     */
    handleClick(event) {
        this.editor.rangeOperations.resetSelectAllLevel();
        this.editor.syncCursorFromDOM();

        // Clicking on replaced/void elements like <img> or <hr> doesn't
        // create a text selection, so syncCursorFromDOM won't update the
        // cursor.  Fall back to walking up from the click target to find
        // the nearest element with a data-node-id attribute.
        if (
            (!this.editor.syntaxTree?.treeCursor ||
                this.editor.syntaxTree.treeCursor.nodeId === this.editor._lastRenderedNodeId) &&
            event.target instanceof HTMLElement
        ) {
            let el = /** @type {HTMLElement|null} */ (event.target);
            while (el && el !== this.editor.container) {
                if (el.dataset?.nodeId) {
                    if (this.editor.syntaxTree)
                        this.editor.syntaxTree.treeCursor = {
                            nodeId: el.dataset.nodeId,
                            offset: 0,
                        };
                    break;
                }
                el = el.parentElement;
            }
        }

        this.editor.selectionManager.updateFromDOM();

        // In focused view, clicking an image opens the edit modal directly.
        if (this.editor.viewMode === 'focused' && this.editor.syntaxTree?.treeCursor) {
            const clickedNode = this.editor.getCurrentNode();
            if (clickedNode?.type === 'image' || clickedNode?.type === 'linked-image') {
                this.editor.imageHelper.openImageModalForNode(clickedNode);
                return;
            }
        }

        // In focused view, clicking a link prevents navigation and opens
        // the edit modal so the user can change the text or URL.
        // The anchor may no longer be in the DOM (selectionchange can
        // re-render the node between mousedown and click), so fall back
        // to the reference captured in handleMouseDown.
        if (this.editor.viewMode === 'focused') {
            const anchor =
                (event.target instanceof HTMLElement &&
                    event.target.tagName === 'A' &&
                    event.target) ||
                this._mouseDownAnchor;
            this._mouseDownAnchor = null;
            if (anchor) {
                event.preventDefault();
                const node = this.editor.getCurrentNode();
                if (node) {
                    this.editor.linkHelper.openLinkModalForNode(
                        node,
                        /** @type {HTMLAnchorElement} */ (anchor),
                    );
                }
                return;
            }
        }

        // In focused view the active node shows raw markdown syntax, so we
        // must re-render whenever the cursor moves to a different node.
        // Compare against _lastRenderedNodeId for the same reason as in
        // handleSelectionChange — treeCursor was already mutated.
        if (
            this.editor.viewMode === 'focused' &&
            this.editor.syntaxTree?.treeCursor &&
            this.editor.syntaxTree.treeCursor.nodeId !== this.editor._lastRenderedNodeId
        ) {
            const nodesToUpdate = [this.editor.syntaxTree.treeCursor.nodeId];
            if (this.editor._lastRenderedNodeId)
                nodesToUpdate.push(this.editor._lastRenderedNodeId);
            this.editor._lastRenderedNodeId = this.editor.syntaxTree.treeCursor.nodeId;
            this.editor.renderNodesAndPlaceCursor({ updated: nodesToUpdate });
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
        if (!event.dataTransfer?.files?.length || !this.editor.syntaxTree) return;

        const files = [...event.dataTransfer.files];
        const imageFiles = files.filter((f) => {
            const ext = f.name.includes('.') ? `.${f.name.split('.').pop()?.toLowerCase()}` : '';
            return EventHandler.IMAGE_EXTENSIONS.has(ext);
        });

        if (imageFiles.length === 0) return;

        // We're handling this — prevent the browser from doing anything else.
        event.preventDefault();

        const before = this.editor.syntaxTree.toMarkdown();

        for (const file of imageFiles) {
            // Use the Electron webUtils bridge to get the real filesystem path.
            const filePath = window.electronAPI?.getPathForFile(file) ?? file.name;

            await this._insertDroppedImage(filePath, file.name);
        }

        this.editor.recordAndRender(before);
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
        if (!this.editor.syntaxTree) return;

        const currentNode = this.editor.getCurrentNode();
        const alt = fileName.replace(/\.[^.]+$/, '');

        // Convert the absolute path to a file:// URL so the image resolves
        // regardless of where the current document is saved.
        const fileUrl = filePath.startsWith('file://')
            ? filePath
            : `file:///${filePath.replace(/\\/g, '/')}`;

        // Use a relative path when the setting is enabled
        const src = this.editor.ensureLocalPaths
            ? await this.editor.imageHelper.toRelativeImagePath(fileUrl)
            : fileUrl;

        const imageNode = new SyntaxNode('image', alt);
        imageNode.attributes = { alt, url: src };

        if (!currentNode) {
            // No cursor node — append to the tree
            this.editor.syntaxTree.appendChild(imageNode);
        } else if (currentNode.type === 'paragraph' && currentNode.content === '') {
            // Cursor is already on an empty paragraph — replace it
            const siblings = this.editor.getSiblings(currentNode);
            const idx = siblings.indexOf(currentNode);
            siblings.splice(idx, 1, imageNode);
            imageNode.parent = currentNode.parent;
            currentNode.parent = null;
        } else {
            // Cursor is on a non-empty element — insert image after it
            const siblings = this.editor.getSiblings(currentNode);
            const idx = siblings.indexOf(currentNode);
            siblings.splice(idx + 1, 0, imageNode);
            imageNode.parent = currentNode.parent;
        }

        // Ensure an empty paragraph follows the image for continued editing
        const imgSiblings = this.editor.getSiblings(imageNode);
        const imgIdx = imgSiblings.indexOf(imageNode);
        const nextNode = imgSiblings[imgIdx + 1];
        if (!nextNode || !(nextNode.type === 'paragraph' && nextNode.content === '')) {
            const trailingParagraph = new SyntaxNode('paragraph', '');
            imgSiblings.splice(imgIdx + 1, 0, trailingParagraph);
            trailingParagraph.parent = imageNode.parent;
        }

        // Place the cursor on the trailing empty paragraph
        const afterNode = imgSiblings[imgIdx + 1];
        this.editor.syntaxTree.treeCursor = { nodeId: afterNode.id, offset: 0 };
    }

    /** Handles focus events. */
    handleFocus() {
        this.editor.container.classList.add('focused');

        // When returning from a modal dialog (link/image/table), the
        // tree cursor was intentionally preserved (see handleBlur).
        // Restore the browser caret so the user sees their cursor again.
        if (this._blurredByModal) {
            this._blurredByModal = false;
            if (this.editor.syntaxTree?.treeCursor) {
                this.editor.placeCursor();
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

        // When focus moves to a toolbar button (e.g. the view-mode toggle)
        // or the tab bar, preserve the tree cursor so the toolbar action
        // or tab-switch logic can operate on the correct cursor position.
        if (related?.closest?.('#toolbar-container') || related?.closest?.('#tab-bar')) {
            return;
        }

        this.editor.container.classList.remove('focused');

        // In focused view the active node shows raw markdown syntax.
        // When the user clicks outside the editor we clear the tree
        // cursor and re-render the previously focused node so it shows
        // its "unfocused" presentation.  Clicking back into the editor
        // will restore the cursor via handleClick / handleSelectionChange.
        if (this.editor.viewMode === 'focused' && this.editor.syntaxTree?.treeCursor) {
            const previousNodeId = this.editor.syntaxTree.treeCursor.nodeId;
            if (this.editor.syntaxTree) this.editor.syntaxTree.treeCursor = null;
            this.editor.renderNodes({ updated: [previousNodeId] });
        }
    }

    /** Handles selection change events. */
    handleSelectionChange() {
        if (this.editor._isRendering) return;
        if (document.activeElement === this.editor.container) {
            this.editor.syncCursorFromDOM();
            this.editor.selectionManager.updateFromDOM();

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
            const newNodeId = this.editor.syntaxTree?.treeCursor?.nodeId ?? null;
            if (
                this.editor.viewMode === 'focused' &&
                newNodeId &&
                newNodeId !== this.editor._lastRenderedNodeId
            ) {
                const nodesToUpdate = [newNodeId];
                if (this.editor._lastRenderedNodeId)
                    nodesToUpdate.push(this.editor._lastRenderedNodeId);
                this.editor._lastRenderedNodeId = newNodeId;
                this.editor.renderNodes({ updated: nodesToUpdate });
                this.editor.placeCursor();

                // If the user mousedown'd on an <a> and selectionchange moved
                // focus to a different node, the re-render above destroyed the
                // <a> so the browser will never fire a click event.  Open the
                // link modal now instead.
                if (this._mouseDownAnchor) {
                    const anchor = /** @type {HTMLAnchorElement} */ (this._mouseDownAnchor);
                    this._mouseDownAnchor = null;
                    const node = this.editor.getCurrentNode();
                    if (node) {
                        this.editor.linkHelper.openLinkModalForNode(node, anchor);
                    }
                }
            }
        }
    }
}
