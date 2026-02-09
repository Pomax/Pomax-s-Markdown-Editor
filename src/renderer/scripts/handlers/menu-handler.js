/**
 * @fileoverview Menu Handler for processing menu actions.
 * Coordinates between menu events and editor operations.
 */

/// <reference path="../../../types.d.ts" />

import { PreferencesModal } from '../preferences/preferences-modal.js';
import { WordCountModal } from '../word-count/word-count-modal.js';

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
            case 'file:close':
                this.handleClose();
                break;
            case 'file:wordCount':
                this.handleWordCount();
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
            case 'view:switchFile':
                this.handleSwitchFile(args[0]);
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
     * Dispatches a 'file:new' event so the app can create a new tab.
     */
    handleNew() {
        document.dispatchEvent(new CustomEvent('file:new'));
    }

    /**
     * Handles the Close action.
     * Dispatches a 'file:close' event so the app can close the active tab.
     */
    handleClose() {
        document.dispatchEvent(new CustomEvent('file:close'));
    }

    /**
     * Handles the Loaded action.
     * Dispatches a 'file:loaded' event so the app can create or switch tabs.
     * @param {{success: boolean, content?: string, filePath?: string}} result
     */
    handleLoaded(result) {
        if (result.success && result.content !== undefined) {
            document.dispatchEvent(new CustomEvent('file:loaded', { detail: result }));
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

    /**
     * Handles switching to a different open file tab.
     * @param {string} tabId - The tab identifier to switch to
     */
    handleSwitchFile(tabId) {
        document.dispatchEvent(new CustomEvent('view:switchFile', { detail: { tabId } }));
    }

    /**
     * Handles opening the Word Count modal.
     */
    handleWordCount() {
        if (!this._wordCountModal) {
            this._wordCountModal = new WordCountModal();
        }
        this._wordCountModal.open(this.editor.syntaxTree);
    }
}
