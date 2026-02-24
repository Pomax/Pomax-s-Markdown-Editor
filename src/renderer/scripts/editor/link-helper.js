/**
 * @fileoverview Link-editing helper: opens the link modal pre-filled
 * with data from the clicked anchor and replaces it in the node's
 * raw markdown content.
 */

/// <reference path="../../../types.d.ts" />

import { LinkModal } from '../link/link-modal.js';

/**
 * Manages link-editing operations for the editor.
 */
export class LinkHelper {
    /**
     * @param {import('./editor.js').Editor} editor
     */
    constructor(editor) {
        /** @type {import('./editor.js').Editor} */
        this.editor = editor;

        /**
         * Lazily-created link modal for click-to-edit in writing mode.
         * @type {LinkModal|null}
         */
        this._linkModal = null;
    }

    /**
     * Opens the link-editing modal pre-filled with the link data extracted
     * from the clicked `<a>` element and, on submit, replaces it in the
     * node's raw content.
     *
     * @param {import('../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLAnchorElement} anchor - The clicked `<a>` element
     */
    async openLinkModalForNode(node, anchor) {
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

        if (!this.editor.syntaxTree) return;
        const before = this.editor.syntaxTree.toMarkdown();

        const newMarkdown = `[${result.text}](${result.url})`;
        node.content = node.content.replace(oldMarkdown, newMarkdown);

        this.editor.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
        this.editor.recordAndRender(before, { updated: [node.id] });
    }
}
