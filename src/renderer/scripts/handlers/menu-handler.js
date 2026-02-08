/**
 * @fileoverview Menu Handler for processing menu actions.
 * Coordinates between menu events and editor operations.
 */

/// <reference path="../../../types.d.ts" />

import { PreferencesModal } from '../preferences/preferences-modal.js';

/**
 * Handles menu actions from the main process.
 */
export class MenuHandler {
    /**
     * @param {import('../editor/editor.js').Editor} editor - The editor instance
     * @param {import('../toolbar/toolbar.js').Toolbar} toolbar - The toolbar instance
     */
    constructor(editor, toolbar) {
        /** @type {import('../editor/editor.js').Editor} */
        this.editor = editor;

        /** @type {import('../toolbar/toolbar.js').Toolbar} */
        this.toolbar = toolbar;

        /** @type {function|null} */
        this.cleanupMenuListener = null;
    }

    /**
     * Initializes the menu handler.
     */
    initialize() {
        if (!window.electronAPI) {
            console.warn('electronAPI not available, menu handler will not work');
            return;
        }

        // Register for menu actions
        this.cleanupMenuListener = window.electronAPI.onMenuAction(
            this.handleMenuAction.bind(this),
        );
    }

    /**
     * Cleans up event listeners.
     */
    destroy() {
        if (this.cleanupMenuListener) {
            this.cleanupMenuListener();
            this.cleanupMenuListener = null;
        }
    }

    /**
     * Handles a menu action.
     * @param {string} action - The action identifier
     * @param {...any} args - Additional arguments
     */
    handleMenuAction(action, ...args) {
        switch (action) {
            case 'file:new':
                this.handleNew();
                break;
            case 'file:loaded':
                this.handleLoaded(args[0]);
                break;
            case 'file:save':
                this.handleSave();
                break;
            case 'file:saveAs':
                this.handleSaveAs();
                break;
            case 'edit:undo':
                this.handleUndo();
                break;
            case 'edit:redo':
                this.handleRedo();
                break;
            case 'view:source':
                this.handleViewSource();
                break;
            case 'view:focused':
                this.handleViewFocused();
                break;
            case 'edit:preferences':
                this.handlePreferences();
                break;
            case 'element:changeType':
                this.handleChangeType(args[0]);
                break;
            case 'element:format':
                this.handleFormat(args[0]);
                break;
            default:
                console.warn(`Unknown menu action: ${action}`);
        }
    }

    /**
     * Handles the New action.
     */
    handleNew() {
        this.editor.reset();
    }

    /**
     * Handles the Loaded action.
     * @param {{success: boolean, content?: string, filePath?: string}} result
     */
    handleLoaded(result) {
        if (result.success && result.content !== undefined) {
            this.editor.currentFilePath = result.filePath || null;
            this.editor.loadMarkdown(result.content);
            this.editor.updateWindowTitle();
        }
    }

    /**
     * Handles the Save action.
     */
    async handleSave() {
        if (!window.electronAPI) return;

        const content = this.editor.getMarkdown();
        const result = await window.electronAPI.saveFile(content);

        if (result.success) {
            this.editor.currentFilePath = result.filePath || null;
            this.editor.setUnsavedChanges(false);
        }
    }

    /**
     * Handles the Save As action.
     */
    async handleSaveAs() {
        if (!window.electronAPI) return;

        const content = this.editor.getMarkdown();
        const result = await window.electronAPI.saveFileAs(content);

        if (result.success) {
            this.editor.currentFilePath = result.filePath || null;
            this.editor.setUnsavedChanges(false);
        }
    }

    /**
     * Handles the Undo action.
     */
    handleUndo() {
        this.editor.undo();
    }

    /**
     * Handles the Redo action.
     */
    handleRedo() {
        this.editor.redo();
    }

    /**
     * Handles switching to Source view.
     */
    handleViewSource() {
        this.editor.setViewMode('source');
        this.toolbar.setViewMode('source');
    }

    /**
     * Handles switching to Focused Writing view.
     */
    handleViewFocused() {
        this.editor.setViewMode('focused');
        this.toolbar.setViewMode('focused');
    }

    /**
     * Handles changing the element type.
     * @param {string} elementType - The new element type
     */
    handleChangeType(elementType) {
        this.editor.changeElementType(elementType);
    }

    /**
     * Handles applying formatting.
     * @param {string} format - The format to apply
     */
    handleFormat(format) {
        this.editor.applyFormat(format);
    }

    /**
     * Handles opening the Preferences modal.
     */
    handlePreferences() {
        if (!this._preferencesModal) {
            this._preferencesModal = new PreferencesModal();
        }
        this._preferencesModal.open();
    }
}
