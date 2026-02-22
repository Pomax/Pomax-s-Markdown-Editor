/**
 * @fileoverview Range (selection) operations: deleting a selected range
 * and handling Ctrl+A (select all within context).
 */

/// <reference path="../../../types.d.ts" />

import { SyntaxNode } from '../parser/syntax-tree.js';

/**
 * Handles selection-range operations on the syntax tree.
 */
export class RangeOperations {
    /**
     * @param {import('./editor.js').Editor} editor
     */
    constructor(editor) {
        /** @type {import('./editor.js').Editor} */
        this.editor = editor;

        /**
         * Tracks the current select-all cycling level.
         * 0 = no select-all active, 1 = node, 2 = parent group, 3 = document.
         * @type {number}
         */
        this._selectAllLevel = 0;
    }

    /**
     * Resets the select-all cycling level. Call this whenever the cursor
     * moves, content changes, or any non-select-all action occurs.
     */
    resetSelectAllLevel() {
        this._selectAllLevel = 0;
    }

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
     * Deletes the currently selected range (stored in `editor.treeRange`)
     * from the syntax tree.  Handles same-node and cross-node selections.
     *
     * After deletion the cursor is placed at the join point and
     * `editor.treeRange` is cleared.
     *
     * @returns {{ before: string, hints: { updated?: string[], added?: string[], removed?: string[] } } | null}
     *     The markdown snapshot before the edit and render hints, or null
     *     if there was no range to delete.
     */
    deleteSelectedRange() {
        if (!this.editor.treeRange || !this.editor.syntaxTree) return null;

        const { startNodeId, startOffset, endNodeId, endOffset } = this.editor.treeRange;
        const startNode = this.editor.syntaxTree.findNodeById(startNodeId);
        const endNode = this.editor.syntaxTree.findNodeById(endNodeId);
        if (!startNode || !endNode) return null;

        const before = this.editor.syntaxTree.toMarkdown();

        // ── Same-node selection ──
        if (startNodeId === endNodeId) {
            const left = startNode.content.substring(0, startOffset);
            const right = startNode.content.substring(endOffset);
            startNode.content = left + right;
            this.editor.treeCursor = { nodeId: startNode.id, offset: startOffset };
            this.editor.syntaxTree.treeCursor = { nodeId: startNode.id, offset: startOffset };
            this.editor.treeRange = null;
            return { before, hints: { updated: [startNode.id] } };
        }

        // ── Cross-node selection ──
        // Both nodes must share the same parent (sibling list).
        const siblings = this.editor.getSiblings(startNode);
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

        this.editor.treeCursor = { nodeId: firstNode.id, offset: firstOffset };
        this.editor.syntaxTree.treeCursor = { nodeId: firstNode.id, offset: firstOffset };
        this.editor.treeRange = null;
        return { before, hints: { updated: [firstNode.id], removed: removedIds } };
    }

    /**
     * Handles Ctrl+A — cycles through increasingly broad selections:
     *
     * 1. First press: select the current node's content
     * 2. Second press: if the node has a "content parent" (e.g., list run
     *    for a list-item, html-block for its children), select that group.
     *    If there is no content parent, jump straight to document.
     * 3. Third press (or second if no parent): select the entire document.
     *
     * The cycling level resets whenever the cursor moves or an edit occurs.
     */
    handleSelectAll() {
        this.editor.syncCursorFromDOM();
        const node = this.editor.getCurrentNode();
        if (!node) return;

        this._selectAllLevel++;

        // Determine whether this node has a "content parent" group.
        const hasParentGroup = this._hasContentParent(node);

        // Level 1 → select the current node
        if (this._selectAllLevel === 1) {
            this._selectNode(node);
            return;
        }

        // Level 2 → select parent group (if any), otherwise document
        if (this._selectAllLevel === 2) {
            if (hasParentGroup) {
                this._selectContentParent(node);
                return;
            }
            // No parent group — fall through to document selection
        }

        // Level 3 (or 2 when no parent) → select entire document
        this._selectAllLevel = hasParentGroup ? 3 : 2;
        this._selectDocument();
    }

    /**
     * Returns true if the node belongs to a content-parent group that
     * should be selectable as an intermediate cycling level.
     * @param {SyntaxNode} node
     * @returns {boolean}
     */
    _hasContentParent(node) {
        // List items belong to a contiguous list run
        if (node.type === 'list-item') return true;
        // Nodes inside an html-block container (e.g., children of <details>)
        if (node.parent && node.parent.type === 'html-block') return true;
        return false;
    }

    /**
     * Selects the content of a single node (level 1).
     * For table cells in focused mode, selects only the cell content.
     * @param {SyntaxNode} node
     */
    _selectNode(node) {
        // ── Table cell: select just the cell content ──
        if (
            node.type === 'table' &&
            this.editor.viewMode === 'focused' &&
            this.editor.syntaxTree?.treeCursor?.cellRow !== undefined &&
            this.editor.syntaxTree?.treeCursor?.cellCol !== undefined
        ) {
            const cellText = this.editor.tableManager.getTableCellText(
                node,
                this.editor.syntaxTree.treeCursor.cellRow,
                this.editor.syntaxTree.treeCursor.cellCol,
            );
            const nodeEl = this.editor.container.querySelector(`[data-node-id="${node.id}"]`);
            if (nodeEl) {
                this.editor.tableManager.placeTableCellCursor(
                    /** @type {HTMLElement} */ (nodeEl),
                    this.editor.syntaxTree.treeCursor.cellRow,
                    this.editor.syntaxTree.treeCursor.cellCol,
                    0,
                );
                const sel = window.getSelection();
                if (sel && cellText.length > 0) {
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
            this.editor.syncCursorFromDOM();
            return;
        }

        // For all other block-level nodes, select the entire node content.
        const nodeEl = this.editor.container.querySelector(`[data-node-id="${node.id}"]`);
        if (!nodeEl) return;

        const contentEl = nodeEl.querySelector('.md-content') ?? nodeEl;
        const sel = window.getSelection();
        if (!sel) return;

        const domRange = document.createRange();
        domRange.selectNodeContents(contentEl);
        sel.removeAllRanges();
        sel.addRange(domRange);

        this.editor.syncCursorFromDOM();
    }

    /**
     * Selects the content-parent group of a node (level 2).
     * - List items: selects the entire contiguous list run.
     * - html-block children: selects all children of the html-block parent.
     * @param {SyntaxNode} node
     */
    _selectContentParent(node) {
        if (node.type === 'list-item') {
            const siblings = this.editor.getSiblings(node);
            const run = this.editor._getContiguousListRun(siblings, node);
            if (run.length > 0) {
                this._selectNodeRange(run[0], run[run.length - 1]);
                return;
            }
        }

        if (node.parent && node.parent.type === 'html-block') {
            const children = node.parent.children;
            if (children.length > 0) {
                this._selectNodeRange(children[0], children[children.length - 1]);
                return;
            }
        }
    }

    /**
     * Selects the entire document content (final cycling level).
     */
    _selectDocument() {
        const children = this.editor.syntaxTree?.children;
        if (!children || children.length === 0) return;

        // Find the first and last leaf nodes that have DOM elements
        const first = this._firstLeaf(children[0]);
        const last = this._lastLeaf(children[children.length - 1]);
        this._selectNodeRange(first, last);
    }

    /**
     * Returns the first leaf (deepest first-child) of a node.
     * For nodes with children (html-blocks), descends into children.
     * @param {SyntaxNode} node
     * @returns {SyntaxNode}
     */
    _firstLeaf(node) {
        let current = node;
        while (current.children.length > 0) {
            current = current.children[0];
        }
        return current;
    }

    /**
     * Returns the last leaf (deepest last-child) of a node.
     * @param {SyntaxNode} node
     * @returns {SyntaxNode}
     */
    _lastLeaf(node) {
        let current = node;
        while (current.children.length > 0) {
            current = current.children[current.children.length - 1];
        }
        return current;
    }

    /**
     * Sets a DOM selection spanning from the start of `firstNode` to
     * the end of `lastNode`, then syncs back to tree coordinates.
     * @param {SyntaxNode} firstNode
     * @param {SyntaxNode} lastNode
     */
    _selectNodeRange(firstNode, lastNode) {
        const firstEl = this.editor.container.querySelector(`[data-node-id="${firstNode.id}"]`);
        const lastEl = this.editor.container.querySelector(`[data-node-id="${lastNode.id}"]`);
        if (!firstEl || !lastEl) return;

        const firstContent = firstEl.querySelector('.md-content') ?? firstEl;
        const lastContent = lastEl.querySelector('.md-content') ?? lastEl;

        const sel = window.getSelection();
        if (!sel) return;

        const domRange = document.createRange();
        domRange.setStart(firstContent, 0);
        domRange.setEndAfter(lastContent.lastChild ?? lastContent);
        sel.removeAllRanges();
        sel.addRange(domRange);

        this.editor.syncCursorFromDOM();
    }
}
