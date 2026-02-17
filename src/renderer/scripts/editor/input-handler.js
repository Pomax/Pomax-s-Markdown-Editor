/**
 * @fileoverview Keyboard and beforeinput event dispatch.
 *
 * This is the single entry-point for all keyboard-driven edits: the
 * default browser action is always prevented, and instead the edit is
 * applied to the tree, which is then re-rendered.
 */

/// <reference path="../../../types.d.ts" />

/**
 * Dispatches keyboard and beforeinput events to the appropriate editor
 * operations.
 */
export class InputHandler {
    /**
     * @param {import('./editor.js').Editor} editor
     */
    constructor(editor) {
        /** @type {import('./editor.js').Editor} */
        this.editor = editor;
    }

    /**
     * Catches `beforeinput` as a safety net: any input that was not already
     * handled by `handleKeyDown` is prevented so the DOM stays in sync with
     * the tree.  Paste is handled here as well.
     * @param {InputEvent} event
     */
    handleBeforeInput(event) {
        if (this.editor._isRendering) {
            event.preventDefault();
            return;
        }

        // Handle paste
        if (event.inputType === 'insertFromPaste') {
            event.preventDefault();
            const text = event.dataTransfer?.getData('text/plain') ?? '';
            if (text) {
                this.editor.editOperations.insertTextAtCursor(text);
            }
            return;
        }

        // Handle cut — the clipboard was already written by the 'cut'
        // event handler; here we just delete the selected range via the tree.
        if (event.inputType === 'deleteByCut') {
            event.preventDefault();
            this.editor.syncCursorFromDOM();
            if (this.editor.treeRange) {
                const rangeResult = this.editor.rangeOperations.deleteSelectedRange();
                if (rangeResult) {
                    this.editor.recordAndRender(rangeResult.before, rangeResult.hints);
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
                this.editor.undo();
                return;
            }
            if ((event.key === 'z' && event.shiftKey) || event.key === 'y') {
                event.preventDefault();
                this.editor.redo();
                return;
            }
            // ── Select All (Ctrl+A) — context-restricted ──
            if (event.key === 'a') {
                event.preventDefault();
                this.editor.rangeOperations.handleSelectAll();
                return;
            }
        }

        // ── Enter ──
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.editor.editOperations.handleEnterKey();
            return;
        }

        // ── Backspace ──
        if (event.key === 'Backspace') {
            event.preventDefault();
            this.editor.editOperations.handleBackspace();
            return;
        }

        // ── Delete ──
        if (event.key === 'Delete') {
            event.preventDefault();
            this.editor.editOperations.handleDelete();
            return;
        }

        // ── Printable characters ──
        // A printable key is a single character that is not modified by Ctrl/Meta.
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            this.editor.editOperations.insertTextAtCursor(event.key);
            return;
        }

        // ── Tab / Shift+Tab inside a table ──
        if (event.key === 'Tab' && this.editor.viewMode === 'focused') {
            this.editor.syncCursorFromDOM();
            const node = this.editor.getCurrentNode();
            if (node?.type === 'table' && this.editor.treeCursor?.cellRow !== undefined) {
                event.preventDefault();
                this.editor.tableManager.handleTableTab(event.shiftKey);
                return;
            }
        }

        // Navigation keys (arrows, Home, End, Page Up/Down), Tab, Escape, etc.
        // are left to their default browser behaviour so the cursor moves
        // naturally.  After the key is processed, `selectionchange` will fire
        // and we update the tree cursor from the DOM.
    }
}
