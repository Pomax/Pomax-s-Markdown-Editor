/**
 * @fileoverview Main application entry point for the renderer process.
 * Initializes the editor, toolbar, and sets up event handlers.
 */

/// <reference path="../../types.d.ts" />

import { Editor } from './editor/editor.js';
import { KeyboardHandler } from './handlers/keyboard-handler.js';
import { MenuHandler } from './handlers/menu-handler.js';
import { applyColors, applyMargins, applyPageWidth } from './preferences/preferences-modal.js';
import { TabBar } from './tab-bar/tab-bar.js';
import { TableOfContents } from './toc/toc.js';
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

        /** @type {TableOfContents|null} */
        this.toc = null;

        /** @type {TabBar|null} */
        this.tabBar = null;
    }

    /**
     * Initializes the application.
     */
    async initialize() {
        // Get container elements
        const editorContainer = document.getElementById('editor');
        const toolbarContainer = document.getElementById('toolbar-container');
        const tocContainer = document.getElementById('toc-sidebar');

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

        // Initialize Table of Contents sidebar
        if (tocContainer) {
            this.toc = new TableOfContents(tocContainer, this.editor);
            this.toc.initialize();
        }

        // Initialize tab bar
        const tabBarContainer = document.getElementById('tab-bar');
        if (tabBarContainer) {
            this.tabBar = new TabBar(tabBarContainer);
            this.tabBar.initialize();
            this.tabBar.addTab('tab-1', null, true);
        }

        // Listen for TOC settings changes from the preferences modal
        document.addEventListener('toc:settingsChanged', (e) => {
            const detail = /** @type {CustomEvent} */ (e).detail;
            if (this.toc && detail) {
                this.toc.setVisible(detail.visible);
                this.toc.setPosition(detail.position);
            }
        });

        // Listen for image handling settings changes from the preferences modal
        document.addEventListener('imageHandling:settingsChanged', (e) => {
            const detail = /** @type {CustomEvent} */ (e).detail;
            if (this.editor && detail) {
                this.editor.ensureLocalPaths = !!detail.ensureLocalPaths;
                if (this.editor.ensureLocalPaths) {
                    this.editor.rewriteImagePaths().then(() => {
                        this.editor?.renderAndPlaceCursor();
                    });
                }
            }
        });

        // Expose API for main process queries
        this.exposeEditorAPI();

        // Set up external API handler
        this.setupExternalAPIHandler();

        // Load persisted settings (e.g. margins) and apply them
        await this.loadSettings();

        console.log('Markdown Editor initialized');
    }

    /**
     * Loads persisted settings from the database and applies them.
     */
    async loadSettings() {
        if (!window.electronAPI) return;

        try {
            const result = await window.electronAPI.getSetting('defaultView');
            if (result.success && result.value) {
                this.editor?.setViewMode(result.value);
                this.toolbar?.setViewMode(result.value);
            }
        } catch {
            // Use hardcoded default (focused)
        }

        try {
            const result = await window.electronAPI.getSetting('pageWidth');
            if (result.success && result.value) {
                applyPageWidth(result.value);
            }
        } catch {
            // Use CSS defaults
        }

        try {
            const result = await window.electronAPI.getSetting('margins');
            if (result.success && result.value) {
                applyMargins(result.value);
            }
        } catch {
            // Use CSS defaults
        }

        try {
            const result = await window.electronAPI.getSetting('colors');
            if (result.success && result.value) {
                applyColors(result.value);
            }
        } catch {
            // Use CSS defaults
        }

        try {
            const result = await window.electronAPI.getSetting('tocVisible');
            if (result.success && result.value !== undefined && result.value !== null) {
                this.toc?.setVisible(!!result.value);
            }
        } catch {
            // Default is visible
        }

        try {
            const result = await window.electronAPI.getSetting('tocPosition');
            if (result.success && result.value) {
                this.toc?.setPosition(result.value === 'right' ? 'right' : 'left');
            }
        } catch {
            // Default is left
        }

        try {
            const result = await window.electronAPI.getSetting('tocWidth');
            if (result.success && result.value) {
                this.toc?.setWidth(Number(result.value));
            }
        } catch {
            // Default width from CSS
        }

        try {
            const result = await window.electronAPI.getSetting('ensureLocalPaths');
            if (result.success && result.value !== undefined && result.value !== null) {
                if (this.editor) {
                    this.editor.ensureLocalPaths = !!result.value;
                }
            }
        } catch {
            // Default is false
        }
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
            setUnsavedChanges: (v) => this.editor?.setUnsavedChanges(v),
        };

        // Expose file path and cursor info as globals so the reload handler
        // can read them via executeJavaScript before the page unloads.
        Object.defineProperty(window, '__editorFilePath', {
            get: () => this.editor?.currentFilePath ?? null,
            set: (v) => {
                if (this.editor) this.editor.currentFilePath = v;
            },
            configurable: true,
        });
        Object.defineProperty(window, '__editorCursorNodeId', {
            get: () => this.editor?.treeCursor?.nodeId ?? null,
            configurable: true,
        });
        Object.defineProperty(window, '__editorCursorOffset', {
            get: () => this.editor?.treeCursor?.offset ?? 0,
            configurable: true,
        });

        // Listen for view-mode restore after a reload
        window.addEventListener('__restoreViewMode', (e) => {
            const detail = /** @type {CustomEvent} */ (e).detail;
            if (this.editor && detail) {
                this.editor.setViewMode(detail);
            }
        });

        // Listen for cursor-position restore after a reload
        window.addEventListener('__restoreCursor', (e) => {
            const detail = /** @type {CustomEvent} */ (e).detail;
            if (this.editor && detail?.nodeId) {
                this.editor.treeCursor = {
                    nodeId: detail.nodeId,
                    offset: detail.offset ?? 0,
                };
                this.editor.placeCursor();
            }
        });
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
            case 'app:reload':
                // Trigger the reload via the main process IPC handler
                window.electronAPI?.reload();
                break;
            case 'file:getRecentFiles':
                // Handled directly via IPC, no renderer action needed
                break;
            case 'edit:preferences':
                this.menuHandler?.handlePreferences();
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
