/**
 * @fileoverview Main application entry point for the renderer process.
 * Initializes the editor, toolbar, and sets up event handlers.
 */

/// <reference path="../../types.d.ts" />

import { Editor } from './editor/editor.js';
import { KeyboardHandler } from './handlers/keyboard-handler.js';
import { MenuHandler } from './handlers/menu-handler.js';
import { Toolbar } from './toolbar/toolbar.js';

/**
 * Main application class.
 * Coordinates all editor components.
 */
class App {
    constructor() {
        /** @type {Editor|null} */
        this.editor = null;

        /** @type {Toolbar|null} */
        this.toolbar = null;

        /** @type {MenuHandler|null} */
        this.menuHandler = null;

        /** @type {KeyboardHandler|null} */
        this.keyboardHandler = null;
    }

    /**
     * Initializes the application.
     */
    async initialize() {
        // Get container elements
        const editorContainer = document.getElementById('editor');
        const toolbarContainer = document.getElementById('toolbar-container');

        if (!editorContainer || !toolbarContainer) {
            console.error('Required container elements not found');
            return;
        }

        // Initialize editor
        this.editor = new Editor(editorContainer);
        await this.editor.initialize();

        // Initialize toolbar
        this.toolbar = new Toolbar(toolbarContainer, this.editor);
        this.toolbar.initialize();

        // Initialize handlers
        this.menuHandler = new MenuHandler(this.editor, this.toolbar);
        this.menuHandler.initialize();

        this.keyboardHandler = new KeyboardHandler(this.editor);
        this.keyboardHandler.initialize();

        // Expose API for main process queries
        this.exposeEditorAPI();

        // Set up external API handler
        this.setupExternalAPIHandler();

        console.log('Markdown Editor initialized');
    }

    /**
     * Exposes the editor API to the main process.
     */
    exposeEditorAPI() {
        window.editorAPI = {
            hasUnsavedChanges: () => this.editor?.hasUnsavedChanges() ?? false,
            getContent: () => this.editor?.getMarkdown() ?? '',
            setContent: (content) => this.editor?.loadMarkdown(content),
            getViewMode: () => this.editor?.getViewMode() ?? 'source',
        };
    }

    /**
     * Sets up the handler for external API calls.
     */
    setupExternalAPIHandler() {
        if (!window.electronAPI) {
            console.warn('electronAPI not available');
            return;
        }

        window.electronAPI.onExternalAPI((method, ...args) => {
            this.handleExternalAPI(method, args);
        });
    }

    /**
     * Handles external API calls.
     * @param {string} method - The API method name
     * @param {any[]} args - The method arguments
     */
    handleExternalAPI(method, args) {
        if (!this.editor || !this.menuHandler) {
            console.warn('Editor or MenuHandler not initialized');
            return;
        }

        switch (method) {
            case 'file:new':
                this.editor.reset();
                break;
            case 'file:save':
                this.menuHandler.handleSave();
                break;
            case 'file:saveAs':
                this.menuHandler.handleSaveAs();
                break;
            case 'edit:undo':
                this.editor.undo();
                break;
            case 'edit:redo':
                this.editor.redo();
                break;
            case 'view:source':
                this.editor.setViewMode('source');
                break;
            case 'view:focused':
                this.editor.setViewMode('focused');
                break;
            case 'document:getContent':
                // Response would be handled via IPC
                break;
            case 'document:setContent':
                this.editor.loadMarkdown(args[0]);
                break;
            case 'document:insertText':
                this.editor.insertText(args[0]);
                break;
            case 'element:changeType':
                this.editor.changeElementType(args[0]);
                break;
            case 'element:format':
                this.editor.applyFormat(args[0]);
                break;
            case 'cursor:setPosition':
                this.editor.setCursorPosition(args[0], args[1]);
                break;
            case 'selection:set':
                this.editor.setSelection(args[0]);
                break;
            default:
                console.warn(`Unknown external API method: ${method}`);
        }
    }
}

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    const app = new App();
    await app.initialize();
});
