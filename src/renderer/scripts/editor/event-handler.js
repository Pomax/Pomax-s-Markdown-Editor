/**
 * @fileoverview Non-editing event handlers: click, mousedown, focus, blur,
 * selectionchange, drag-and-drop.
 */

/// <reference path="../../../types.d.ts" />

import { CodeLanguageModal } from '../code-language/code-language-modal.js';
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
         * Stashed language-tag span from mousedown, in case selectionchange
         * re-renders the code block before the click event fires.
         * @type {HTMLElement|null}
         */
        this._mouseDownLanguageTag = null;

        /**
         * Lazily-created modal for editing code-block language tags.
         * @type {CodeLanguageModal|null}
         */
        this._codeLanguageModal = null;

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
        // Signal that the next selectionchange was caused by an
        // in-editor interaction, so treeRange may be cleared.
        this.editor._editorInteractionPending = true;

        this._mouseDownAnchor =
            event.target instanceof HTMLElement && event.target.tagName === 'A'
                ? event.target
                : null;

        this._mouseDownLanguageTag =
            event.target instanceof HTMLElement &&
            event.target.classList.contains('md-code-language-tag')
                ? event.target
                : null;
    }

    /**
     * Handles click events — syncs tree cursor from wherever the user clicked.
     * In writing view, re-renders when the cursor moves to a different node
     * so the source-syntax decoration follows the cursor.
     * @param {MouseEvent} event
     */
    handleClick(event) {
        this.editor.rangeOperations.resetSelectAllLevel();

        // If the click landed on the phantom paragraph (the view-only
        // element after a trailing code block), promote it to a real
        // tree node so the cursor can be placed there.
        this.editor._promotePhantomParagraph();

        // In writing view, clicking a language tag span opens the language
        // editing modal so the user can set or change the code fence language.
        // This check must happen *before* syncCursorFromDOM — the tag span
        // is not a text node, so syncing would fall through to the
        // data-node-id fallback and overwrite treeCursor.offset with 0,
        // losing the user's cursor position inside the code content.
        // The tag may no longer be in the DOM (selectionchange can re-render
        // the code block between mousedown and click), so fall back to the
        // reference captured in handleMouseDown.
        if (this.editor.viewMode === 'writing') {
            const langTag =
                (event.target instanceof HTMLElement &&
                    event.target.classList.contains('md-code-language-tag') &&
                    event.target) ||
                this._mouseDownLanguageTag;
            this._mouseDownLanguageTag = null;
            if (langTag) {
                event.preventDefault();
                // Resolve the code-block node from the tag's ancestor
                // (we haven't synced the cursor yet, so getCurrentBlockNode
                // would return the previously focused node).
                const codeBlockEl = /** @type {HTMLElement|null} */ (
                    langTag.closest?.('.md-code-block') ?? null
                );
                const nodeId = codeBlockEl?.dataset?.nodeId;
                const node = nodeId ? this.editor.syntaxTree?.findNodeById(nodeId) : null;
                if (node?.type === 'code-block') {
                    this._openCodeLanguageModal(node);
                }
                return;
            }
        }

        const prevCursor = this.editor.syntaxTree?.treeCursor;
        this.editor.syncCursorFromDOM();

        // Clicking on replaced/void elements like <img> or <hr> doesn't
        // create a text selection, so syncCursorFromDOM won't update the
        // cursor.  Fall back to walking up from the click target to find
        // the nearest element with a data-node-id attribute.
        // We compare by reference: syncCursorFromDOM always assigns a new
        // object, so if the reference is unchanged the sync was a no-op.
        if (
            this.editor.syntaxTree?.treeCursor === prevCursor &&
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

        // In writing view, clicking an image opens the edit modal directly.
        if (this.editor.viewMode === 'writing' && this.editor.syntaxTree?.treeCursor) {
            const clickedNode = this.editor.getCurrentBlockNode();
            if (clickedNode?.type === 'image' || clickedNode?.type === 'linked-image') {
                this.editor.imageHelper.openImageModalForNode(clickedNode);
                return;
            }
        }

        // In writing view, clicking a link prevents navigation and opens
        // the edit modal so the user can change the text or URL.
        // The anchor may no longer be in the DOM (selectionchange can
        // re-render the node between mousedown and click), so fall back
        // to the reference captured in handleMouseDown.
        if (this.editor.viewMode === 'writing') {
            const anchor =
                (event.target instanceof HTMLElement &&
                    event.target.tagName === 'A' &&
                    event.target) ||
                this._mouseDownAnchor;
            this._mouseDownAnchor = null;
            if (anchor) {
                event.preventDefault();
                const node = this.editor.getCurrentBlockNode();
                if (node) {
                    this.editor.linkHelper.openLinkModalForNode(
                        node,
                        /** @type {HTMLAnchorElement} */ (anchor),
                    );
                }
                return;
            }
        }

        // In writing view the active node shows raw markdown syntax, so we
        // must re-render whenever the cursor moves to a different block.
        // Compare block parents of the old and new node IDs — moving
        // between inline children inside the same block should not
        // trigger a re-render.
        const newNodeId = this.editor.syntaxTree?.treeCursor?.nodeId ?? null;
        const newBlockId = this.editor.resolveBlockId(newNodeId);
        const oldBlockId = this.editor.resolveBlockId(this.editor._lastRenderedNodeId);

        // Finalize source-edit mode for code-blocks on click away.
        if (oldBlockId && oldBlockId !== newBlockId) {
            const oldNode = this.editor.syntaxTree?.findNodeById(oldBlockId);
            if (oldNode?.type === 'code-block' && oldNode._sourceEditText !== null) {
                const hints = this.editor.finalizeCodeBlockSourceEdit(oldNode);
                if (hints) {
                    this.editor.renderNodes(hints);
                }
            }
        }

        if (this.editor.viewMode === 'writing' && newBlockId && newBlockId !== oldBlockId) {
            const nodesToUpdate = [newBlockId];
            if (oldBlockId) nodesToUpdate.push(oldBlockId);
            this.editor._lastRenderedNodeId = newNodeId;
            this.editor.renderNodesAndPlaceCursor({ updated: nodesToUpdate });
        } else {
            this.editor._lastRenderedNodeId = newNodeId;
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

        const currentNode = this.editor.getCurrentBlockNode();
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
        // Suppress selectionchange during placement — the DOM→tree
        // round-trip in syncCursorFromDOM is lossy and would overwrite
        // the preserved offset with a slightly different value.
        if (this._blurredByModal) {
            this._blurredByModal = false;
            if (this.editor.syntaxTree?.treeCursor) {
                this.editor._isRendering = true;
                this.editor.placeCursor();
                this.editor._isRendering = false;
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
    }

    /** Handles selection change events. */
    handleSelectionChange() {
        if (this.editor._isRendering) return;
        if (document.activeElement === this.editor.container) {
            // If the selection is inside the phantom paragraph (no tree
            // node), skip all cursor syncing — handleClick will promote
            // it when the click event arrives.
            const phantom = this.editor.container.querySelector('.md-phantom-paragraph');
            if (phantom) {
                const sel = window.getSelection();
                if (sel?.anchorNode) {
                    let n = /** @type {Node|null} */ (sel.anchorNode);
                    while (n) {
                        if (n === phantom) return;
                        n = n.parentNode;
                    }
                }
            }

            // Only allow treeRange to be cleared when the selection
            // change was caused by a direct in-editor interaction
            // (mousedown or keydown on the editor container).  External
            // events — toolbar clicks, ToC navigation, menu actions —
            // must never invalidate the tree's selection.
            const fromEditor = this.editor._editorInteractionPending;
            this.editor._editorInteractionPending = false;

            this.editor.syncCursorFromDOM({ preserveRange: !fromEditor });
            this.editor.selectionManager.updateFromDOM();

            // When the user is extending a selection (non-collapsed), skip
            // the writing-mode re-render — re-rendering would destroy the
            // in-progress DOM selection and place a collapsed cursor.
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) return;

            // In writing view the active node shows raw markdown syntax, so we
            // must re-render whenever the cursor moves to a different block.
            // Compare block parents of the old and new node IDs — moving
            // between inline children inside the same block should not
            // trigger a re-render.
            const newNodeId = this.editor.syntaxTree?.treeCursor?.nodeId ?? null;
            const newBlockId = this.editor.resolveBlockId(newNodeId);
            const oldBlockId = this.editor.resolveBlockId(this.editor._lastRenderedNodeId);

            // ── Finalize source-edit mode for code-blocks ──
            // When the cursor moves to a different block and the previous
            // block was a code-block in source-edit mode, reparse its text
            // back into tree properties (fenceCount, language, content).
            if (oldBlockId && oldBlockId !== newBlockId) {
                const oldNode = this.editor.syntaxTree?.findNodeById(oldBlockId);
                if (oldNode?.type === 'code-block' && oldNode._sourceEditText !== null) {
                    const hints = this.editor.finalizeCodeBlockSourceEdit(oldNode);
                    if (hints) {
                        this.editor.renderNodes(hints);
                    }
                }
            }

            if (this.editor.viewMode === 'writing' && newBlockId && newBlockId !== oldBlockId) {
                const nodesToUpdate = [newBlockId];
                if (oldBlockId) nodesToUpdate.push(oldBlockId);
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
                    const node = this.editor.getCurrentBlockNode();
                    if (node) {
                        this.editor.linkHelper.openLinkModalForNode(node, anchor);
                    }
                }

                // Same pattern for language-tag spans: the re-render
                // destroyed the span so the browser won't fire click.
                if (this._mouseDownLanguageTag) {
                    this._mouseDownLanguageTag = null;
                    const node = this.editor.getCurrentBlockNode();
                    if (node?.type === 'code-block') {
                        this._openCodeLanguageModal(node);
                    }
                }
            } else {
                this.editor._lastRenderedNodeId = newNodeId;
            }
        }
    }

    /**
     * Opens the code-language modal for a code-block node and applies
     * the result when the user submits.
     *
     * @param {import('../parser/syntax-tree.js').SyntaxNode} node
     */
    async _openCodeLanguageModal(node) {
        if (!this._codeLanguageModal) {
            this._codeLanguageModal = new CodeLanguageModal();
        }

        const attrs = /** @type {import('../parser/syntax-tree.js').NodeAttributes} */ (
            node.attributes
        );
        const currentLanguage = attrs.language || '';

        // Save both the cursor and any active selection *before* the
        // dialog opens.  The dialog steals focus, which eventually
        // triggers a selectionchange whose syncCursorFromDOM round-trip
        // is lossy for code blocks.  We need the pre-dialog state so
        // we can restore it afterward.
        const savedCursor = this.editor.syntaxTree?.treeCursor
            ? { ...this.editor.syntaxTree.treeCursor }
            : null;
        const savedRange = this.editor.treeRange ? { ...this.editor.treeRange } : null;

        const result = await this._codeLanguageModal.open({
            language: currentLanguage,
        });
        if (!result) {
            // Restore cursor/selection even on cancel — focus
            // restoration may have fired a selectionchange that
            // corrupted the state.
            if (savedCursor && this.editor.syntaxTree) {
                this.editor.syntaxTree.treeCursor = savedCursor;
            }
            this.editor.treeRange = savedRange;
            return;
        }

        if (!this.editor.syntaxTree) return;
        const before = this.editor.syntaxTree.toMarkdown();

        attrs.language = result.language || '';
        this.editor.recordAndRender(before, { updated: [node.id] });

        // Restore cursor + selection and suppress the pending async
        // selectionchange that placeCursor() will have queued.
        if (savedCursor) {
            this.editor.syntaxTree.treeCursor = savedCursor;
        }
        this.editor.treeRange = savedRange;

        // Rebuild the DOM selection from the restored tree state.
        this.editor._isRendering = true;
        if (savedRange) {
            this.editor.placeSelection();
        } else if (savedCursor) {
            this.editor.placeCursor();
        }
        queueMicrotask(() => {
            this.editor._isRendering = false;
        });
    }
}
