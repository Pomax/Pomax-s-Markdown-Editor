/**
 * @fileoverview Image-related helpers: inserting/updating image nodes,
 * opening the image edit modal, rewriting paths to relative form.
 */

/// <reference path="../../../types.d.ts" />

import { ImageModal } from '../image/image-modal.js';
import { SyntaxNode } from '../parser/syntax-tree.js';

/**
 * Manages image-related operations for the editor.
 */
export class ImageHelper {
    /**
     * @param {import('./editor.js').Editor} editor
     */
    constructor(editor) {
        /** @type {import('./editor.js').Editor} */
        this.editor = editor;

        /**
         * Lazily-created image modal for click-to-edit in writing mode.
         * @type {ImageModal|null}
         */
        this._imageModal = null;
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
        if (!this.editor.currentFilePath || !imagePath || !window.electronAPI) return imagePath;
        return window.electronAPI.toRelativeImagePath(imagePath, this.editor.currentFilePath);
    }

    /**
     * Walks every image node in the syntax tree and rewrites absolute paths
     * that are downstream-relative to the current document to their minimal
     * relative form.  Only runs when `editor.ensureLocalPaths` is true and the
     * document has been saved to disk.
     *
     * @returns {Promise<string[]>} IDs of nodes whose paths were rewritten.
     */
    async rewriteImagePaths() {
        /** @type {string[]} */
        const changedIds = [];
        if (
            !this.editor.ensureLocalPaths ||
            !this.editor.currentFilePath ||
            !this.editor.syntaxTree
        )
            return changedIds;

        for (const node of this.editor.syntaxTree.children) {
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
     * @param {string} [style] - Optional inline style
     */
    insertOrUpdateImage(alt, src, href, style = '') {
        if (!this.editor.syntaxTree) return;

        const before = this.editor.syntaxTree.toMarkdown();
        const currentNode = this.editor.getCurrentBlockNode();
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
            this.editor.syntaxTree.treeCursor = { nodeId: currentNode.id, offset: alt.length };
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
                const siblings = this.editor.getSiblings(currentNode);
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
                this.editor.syntaxTree.appendChild(imageNode);
                renderHints = { added: [imageNode.id] };
            }

            this.editor.syntaxTree.treeCursor = { nodeId: imageNode.id, offset: alt.length };
        }

        this.editor.recordAndRender(before, renderHints);
    }

    /**
     * Returns the shared ImageModal instance, creating it lazily.
     * Both the toolbar and editor use this to avoid duplicate dialogs.
     * @returns {ImageModal}
     */
    getImageModal() {
        if (!this._imageModal) {
            this._imageModal = new ImageModal();
        }
        return this._imageModal;
    }

    /**
     * Opens the image modal pre-filled with the given image node's data,
     * and applies any edits back to the parse tree.
     * Used when clicking an image in writing mode.
     * @param {SyntaxNode} node - The image node to edit
     */
    async openImageModalForNode(node) {
        const modal = this.getImageModal();

        const existing = {
            alt: node.attributes.alt ?? node.content,
            src: node.attributes.url ?? '',
            href: node.attributes.href ?? '',
            style: node.attributes.style ?? '',
        };

        const result = await modal.open(existing);
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
        if (this.editor.ensureLocalPaths) {
            src = await this.toRelativeImagePath(src);
        }

        // Update the node directly — after the modal closes the cursor
        // may have moved, so we cannot rely on insertOrUpdateImage which
        // reads getCurrentBlockNode().
        if (!this.editor.syntaxTree) return;
        const before = this.editor.syntaxTree.toMarkdown();
        node.content = result.alt;
        node.attributes = { alt: result.alt, url: src };
        if (result.href) {
            node.attributes.href = result.href;
        }
        if (result.style) {
            node.attributes.style = result.style;
        }
        this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: result.alt.length };
        this.editor.recordAndRender(before, { updated: [node.id] });
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
}
