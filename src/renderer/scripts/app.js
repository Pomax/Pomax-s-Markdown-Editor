/**
 * @fileoverview Main application entry point for the renderer process.
 * Initializes the editor, toolbar, and sets up event handlers.
 */

/// <reference path="../../types.d.ts" />

import { crc32 } from './editor/crc32.js';
import { cursorToAbsoluteOffset } from './editor/cursor-persistence.js';
import { Editor } from './editor/editor.js';
import { initPageResizeHandles } from './editor/page-resize.js';
import { KeyboardHandler } from './handlers/keyboard-handler.js';
import { MenuHandler } from './handlers/menu-handler.js';
import { applyColors, applyMargins, applyPageWidth } from './preferences/preferences-modal.js';
import { SearchBar } from './search/search-bar.js';
import { TabBar, getDisambiguatedLabels } from './tab-bar/tab-bar.js';
import { TableOfContents } from './toc/toc.js';
import { Toolbar } from './toolbar/toolbar.js';

/**
 * @typedef {Object} DocumentState
 * @property {string} content - The markdown content
 * @property {string|null} filePath - Full file path or null for untitled
 * @property {boolean} modified - Whether there are unsaved changes
 * @property {import('./editor/editor.js').TreeCursor|null} cursor - Cursor position
 * @property {number} cursorOffset - Absolute character offset in markdown source
 * @property {number} contentHash - CRC32 hash of the markdown content
 * @property {import('./parser/syntax-tree.js').SyntaxTree|null} syntaxTree - The parsed syntax tree
 * @property {number} scrollTop - Scroll position of the scroll container
 * @property {string|null} tocActiveHeadingId - The active ToC heading node ID
 * @property {any[]} undoStack - Undo history
 * @property {any[]} redoStack - Redo history
 */

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

        /** @type {SearchBar|null} */
        this.searchBar = null;

        /** @type {TableOfContents|null} */
        this.toc = null;

        /** @type {TabBar|null} */
        this.tabBar = null;

        /**
         * Per-tab document state storage.
         * @type {Map<string, DocumentState>}
         */
        this._documentStates = new Map();

        /**
         * Per-tab contenteditable container elements.
         * Each tab gets its own div; only the active one is visible.
         * @type {Map<string, HTMLElement>}
         */
        this._tabContainers = new Map();

        /**
         * The scroll container (parent of contenteditable divs).
         * scrollTop is saved/restored per-tab since it's shared.
         * @type {HTMLElement|null}
         */
        this._scrollContainer = null;

        /** @type {number} Counter for generating unique tab IDs */
        this._tabCounter = 0;

        /** @type {ReturnType<typeof setTimeout>|null} */
        this._cursorDebounce = null;
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

        // The scroll container is `#editor-container`; each tab will
        // get its own contenteditable div inside it.
        this._scrollContainer = editorContainer.parentElement;

        // Initialize editor with the original contenteditable div
        this.editor = new Editor(editorContainer);
        await this.editor.initialize();

        // Initialize page resize handles (focused mode only)
        initPageResizeHandles(editorContainer);

        // Initialize toolbar
        this.toolbar = new Toolbar(toolbarContainer, this.editor);
        this.toolbar.initialize();

        // Initialize handlers
        this.menuHandler = new MenuHandler(this.editor, this.toolbar);
        this.menuHandler.initialize();

        this.keyboardHandler = new KeyboardHandler(this.editor);
        this.keyboardHandler.initialize();

        // Initialize search bar
        this.searchBar = new SearchBar(this.editor);
        this.searchBar.initialize();

        document.addEventListener('search:open', () => {
            this.searchBar?.open();
        });

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

            // Register the initial #editor element as the first tab's container
            const firstTabId = this._nextTabId();
            this.tabBar.addTab(firstTabId, null, true);
            this._tabContainers.set(firstTabId, editorContainer);

            this.tabBar.onTabSelect = (tabId) => this._switchToTab(tabId);
            this.tabBar.onTabClose = (tabId) => this._closeTab(tabId);
        }

        // Keep cursor position in sync with the main process so that
        // saveOpenFiles() always has a fresh offset.  Debounce to avoid
        // excessive IPC on rapid cursor movement.
        document.addEventListener('selectionchange', () => {
            if (this._cursorDebounce) clearTimeout(this._cursorDebounce);
            this._cursorDebounce = setTimeout(() => this._notifyOpenFiles(), 500);
        });

        // Flush any pending cursor update before the window closes so
        // that saveOpenFiles() in main always has the latest offset.
        window.addEventListener('beforeunload', () => {
            if (this._cursorDebounce) {
                clearTimeout(this._cursorDebounce);
                this._cursorDebounce = null;
            }
            this._notifyOpenFiles();
        });

        // Keep tab bar in sync with editor file state
        document.addEventListener('editor:fileStateChanged', (e) => {
            const detail = /** @type {CustomEvent} */ (e).detail;
            if (this.tabBar?.activeTabId && detail) {
                this.tabBar.updateTabPath(this.tabBar.activeTabId, detail.filePath);
                this.tabBar.setModified(this.tabBar.activeTabId, detail.modified);
                this._notifyOpenFiles();
            }
        });

        // Handle file switching from the View menu
        document.addEventListener('view:switchFile', (e) => {
            const detail = /** @type {CustomEvent} */ (e).detail;
            if (detail?.tabId) {
                this._switchToTab(detail.tabId);
            } else if (detail?.filePath && this.tabBar) {
                const tab = this.tabBar.tabs.find((t) => t.filePath === detail.filePath);
                if (tab) {
                    this._switchToTab(tab.id);
                }
            }
        });

        // Handle File → New: create a new tab with an empty document
        document.addEventListener('file:new', () => {
            this._createNewTab(null, '');
        });

        // Handle File → Load / Open Recent: open in a new tab (or switch
        // to an existing tab if the file is already open)
        document.addEventListener('file:loaded', (e) => {
            const detail = /** @type {CustomEvent} */ (e).detail;
            if (!detail) return;
            const filePath = detail.filePath || null;
            // If this file is already open in another tab, switch to it
            if (filePath && this.tabBar) {
                const existing = this.tabBar.tabs.find((t) => t.filePath === filePath);
                if (existing) {
                    this._switchToTab(existing.id);
                    return;
                }
            }

            // If the active tab is a pristine empty document, reuse it
            // instead of opening a new tab alongside it
            if (this._isActiveTabPristine()) {
                this._loadIntoCurrentTab(filePath, detail.content ?? '');
            } else {
                this._createNewTab(filePath, detail.content ?? '');
            }
        });

        // Handle File → Close: close the active tab
        document.addEventListener('file:close', () => {
            if (this.tabBar?.activeTabId) {
                this._closeTab(this.tabBar.activeTabId);
            }
        });

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
                    this.editor.rewriteImagePaths().then((changedIds) => {
                        if (this.editor && changedIds && changedIds.length > 0) {
                            this.editor.renderNodesAndPlaceCursor({ updated: changedIds });
                        }
                    });
                }
            }
        });

        // Listen for content settings changes from the preferences modal
        document.addEventListener('content:settingsChanged', (e) => {
            const detail = /** @type {CustomEvent} */ (e).detail;
            if (this.editor && detail) {
                this.editor.detailsClosed = !!detail.detailsClosed;

                // Switch parser engine if changed
                if (detail.parser === 'regex' || detail.parser === 'dfa') {
                    this.editor.setParser(detail.parser);
                }

                // Only re-render <details> html-block nodes.
                const detailsIds = [];
                if (this.editor.syntaxTree) {
                    for (const node of this.editor.syntaxTree.children) {
                        if (node.type === 'html-block' && node.attributes.tagName === 'details') {
                            detailsIds.push(node.id);
                        }
                    }
                }
                if (detailsIds.length > 0) {
                    this.editor.renderNodesAndPlaceCursor({ updated: detailsIds });
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

    // ──────────────────────────────────────────────
    //  Multi-file tab management
    // ──────────────────────────────────────────────

    /**
     * Generates a unique tab identifier.
     * @returns {string}
     */
    _nextTabId() {
        this._tabCounter++;
        return `tab-${this._tabCounter}`;
    }

    /**
     * Saves the current editor state for the active tab.
     */
    _saveCurrentState() {
        const tabId = this.tabBar?.activeTabId;
        if (!tabId || !this.editor) return;

        const md = this.editor.getMarkdown();
        let absOffset = 0;
        if (this.editor.syntaxTree?.treeCursor) {
            absOffset = cursorToAbsoluteOffset(
                this.editor.syntaxTree,
                this.editor.syntaxTree.treeCursor,
                this.editor.buildMarkdownLine.bind(this.editor),
                this.editor.getPrefixLength.bind(this.editor),
            );
        }

        const hash = crc32(md);

        // Capture the currently highlighted ToC heading so it can be
        // restored without recomputing viewport-based highlighting.
        let tocHeadingId = this.toc?._lockedHeadingId ?? null;
        if (!tocHeadingId && this.toc) {
            const activeLink = this.toc.container.querySelector('.toc-active');
            if (activeLink) {
                tocHeadingId = /** @type {HTMLElement} */ (activeLink).dataset.nodeId ?? null;
            }
        }

        this._documentStates.set(tabId, {
            content: md,
            filePath: this.editor.currentFilePath,
            modified: this.editor.hasUnsavedChanges(),
            cursor: this.editor.syntaxTree?.treeCursor
                ? { ...this.editor.syntaxTree.treeCursor }
                : null,
            cursorOffset: absOffset,
            contentHash: hash,
            syntaxTree: this.editor.syntaxTree,
            scrollTop: this._scrollContainer ? this._scrollContainer.scrollTop : 0,
            tocActiveHeadingId: tocHeadingId,
            undoStack: [...this.editor.undoManager.undoStack],
            redoStack: [...this.editor.undoManager.redoStack],
        });

        // Hide the current tab's container (DOM stays intact)
        this.editor.container.style.display = 'none';
    }

    /**
     * Restores the editor state for a given tab.
     * @param {string} tabId
     */
    _restoreState(tabId) {
        if (!this.editor) return;

        const targetContainer = this._tabContainers.get(tabId);
        const state = this._documentStates.get(tabId);

        if (targetContainer) {
            // Suppress the ToC's scroll handler while we swap containers
            if (this.toc) {
                this.toc._programmaticScroll = true;
            }

            // Swap the editor to the target tab's container
            this.editor.swapContainer(targetContainer);
            targetContainer.style.display = '';

            // Restore editor state
            if (state) {
                this.editor.currentFilePath = state.filePath;
                this.editor.syntaxTree = state.syntaxTree;
                if (this.editor.syntaxTree)
                    this.editor.syntaxTree.treeCursor = state.cursor ? { ...state.cursor } : null;
                this.editor._lastRenderedNodeId =
                    this.editor.syntaxTree?.treeCursor?.nodeId ?? null;
                this.editor.undoManager.undoStack = [...state.undoStack];
                this.editor.undoManager.redoStack = [...state.redoStack];
                this.editor.setUnsavedChanges(state.modified);
            }

            // Restore scroll position on the shared scroll container
            if (this._scrollContainer && state?.scrollTop !== undefined) {
                this._scrollContainer.scrollTop = state.scrollTop;
            }

            // Place cursor and focus — DOM is already intact so no
            // browser auto-scroll fight.
            this.editor.placeCursor();
            this.editor.container.focus({ preventScroll: true });

            if (this.toc) {
                // Lock the ToC to the heading that was active when we
                // left this tab so refresh() doesn't recompute it from
                // viewport geometry.
                this.toc._lockedHeadingId = state?.tocActiveHeadingId ?? null;
                this.toc.reobserve();
                // Keep the programmatic-scroll flag active until the
                // next frame — scroll events from scrollTop / placeCursor
                // are dispatched asynchronously and would otherwise clear
                // the locked heading.
                requestAnimationFrame(() => {
                    if (this.toc) {
                        this.toc._programmaticScroll = false;
                    }
                });
            }
        } else {
            this.editor.reset();
        }
    }

    /**
     * Returns true when the active tab is an untouched empty document —
     * no file path, no unsaved changes, and no content.  Loading a file
     * into such a tab should reuse it rather than opening a second tab.
     * @returns {boolean}
     */
    _isActiveTabPristine() {
        if (!this.editor || !this.tabBar?.activeTabId) return false;

        const tab = this.tabBar.tabs.find((t) => t.id === this.tabBar?.activeTabId);
        if (!tab) return false;

        return (
            tab.filePath === null &&
            !this.editor.hasUnsavedChanges() &&
            this.editor.getMarkdown().trim() === ''
        );
    }

    /**
     * Scrolls the element for the given tree node into view within the
     * scroll container.
     * @param {string} nodeId
     */
    _scrollToNode(nodeId) {
        if (!this.editor) return;
        requestAnimationFrame(() => {
            const el = this.editor?.container.querySelector(`[data-node-id="${nodeId}"]`);
            if (el) {
                el.scrollIntoView({ block: 'start' });
            }
        });
    }

    /**
     * Loads a file into the current (active) tab, replacing its content
     * without creating a new tab.
     * @param {string|null} filePath
     * @param {string} content
     */
    _loadIntoCurrentTab(filePath, content) {
        if (!this.editor || !this.tabBar?.activeTabId) return;

        this.tabBar.updateTabPath(this.tabBar.activeTabId, filePath);

        this.editor.currentFilePath = filePath;
        this.editor.loadMarkdown(content);

        this.editor.updateWindowTitle();

        this._notifyOpenFiles();
    }

    /**
     * Creates a new tab and loads content into it.
     * @param {string|null} filePath - File path, or null for untitled
     * @param {string} content - Markdown content to load
     */
    _createNewTab(filePath, content) {
        if (!this.editor || !this.tabBar || !this._scrollContainer) return;

        // Save the current tab's state before switching
        this._saveCurrentState();

        const tabId = this._nextTabId();
        this.tabBar.addTab(tabId, filePath, true);

        // Create a new contenteditable div for this tab
        const newContainer = document.createElement('div');
        newContainer.className = 'editor';
        newContainer.contentEditable = 'true';
        newContainer.spellcheck = false;
        newContainer.dataset.viewMode = this.editor.viewMode;
        this._scrollContainer.appendChild(newContainer);

        // Swap the editor to the new container and register it
        this.editor.swapContainer(newContainer);
        this._tabContainers.set(tabId, newContainer);

        // Load the new content into the editor
        this.editor.currentFilePath = filePath;
        this.editor.loadMarkdown(content);

        // Re-attach the ToC observer to the new container so it picks
        // up the freshly rendered content.
        this.toc?.reobserve();

        // Reset scroll for the new tab
        this._scrollContainer.scrollTop = 0;

        this.editor.updateWindowTitle();

        this._notifyOpenFiles();
    }

    /**
     * Switches to a different tab, saving and restoring state.
     * @param {string} tabId
     */
    _switchToTab(tabId) {
        if (!this.editor || !this.tabBar) return;
        if (tabId === this.tabBar.activeTabId) {
            // Already on this tab — just ensure the ToC reflects
            // the current container (needed after multi-file restore).
            this.toc?.reobserve();
            return;
        }

        // Save current tab's state
        this._saveCurrentState();

        // Activate the new tab
        this.tabBar.setActiveTab(tabId);

        // Restore the target tab's state
        this._restoreState(tabId);

        this._notifyOpenFiles();
    }

    /**
     * Closes a tab. If the document has unsaved changes, prompts the
     * user to save, discard, or cancel before closing.
     * If it's the last tab, resets to a fresh untitled document.
     * @param {string} tabId
     */
    async _closeTab(tabId) {
        if (!this.tabBar || !this.editor) return;

        const tab = this.tabBar.tabs.find((t) => t.id === tabId);
        if (!tab) return;

        // Check whether this tab has unsaved changes.  For the active
        // tab we ask the editor directly; for background tabs we check
        // the saved document-state snapshot.
        const isActive = tabId === this.tabBar.activeTabId;
        const isModified = isActive
            ? this.editor.hasUnsavedChanges()
            : (this._documentStates.get(tabId)?.modified ?? false);

        if (isModified && window.electronAPI) {
            // If we're closing a background tab, switch to it first so
            // the user can see what they're being asked about.
            if (!isActive) {
                this._switchToTab(tabId);
            }

            const { action } = await window.electronAPI.confirmClose();

            if (action === 'cancel') return;

            if (action === 'save') {
                const content = this.editor.getMarkdown();
                const result = await window.electronAPI.saveFile(content);
                if (!result.success) return; // save dialog was cancelled
            } else if (action === 'saveAs') {
                const content = this.editor.getMarkdown();
                const result = await window.electronAPI.saveFileAs(content);
                if (!result.success) return;
            }
            // 'discard' falls through to the removal below
        }

        this._documentStates.delete(tabId);

        // Remove the tab's container element from the DOM
        const closedContainer = this._tabContainers.get(tabId);
        if (closedContainer) {
            closedContainer.remove();
            this._tabContainers.delete(tabId);
        }

        // Re-check active state — it may have changed if we switched above
        const wasActive = tabId === this.tabBar.activeTabId;
        this.tabBar.removeTab(tabId);

        if (this.tabBar.tabs.length === 0) {
            // Last tab was closed — create a fresh untitled tab
            const newId = this._nextTabId();
            this.tabBar.addTab(newId, null, true);

            // Create a new container for the fresh tab
            const newContainer = document.createElement('div');
            newContainer.className = 'editor';
            newContainer.contentEditable = 'true';
            newContainer.spellcheck = false;
            newContainer.dataset.viewMode = this.editor.viewMode;
            if (this._scrollContainer) {
                this._scrollContainer.appendChild(newContainer);
            }
            this.editor.swapContainer(newContainer);
            this._tabContainers.set(newId, newContainer);
            this.editor.reset();
        } else if (wasActive && this.tabBar.activeTabId) {
            // removeTab already picked a new active tab; restore its state
            this._restoreState(this.tabBar.activeTabId);
        }

        this._notifyOpenFiles();
    }

    /**
     * Sends the current list of open files to the main process
     * so the View menu can be rebuilt.  Includes cursor position and
     * content hash for session restore.
     */
    _notifyOpenFiles() {
        if (!this.tabBar || !window.electronAPI) return;

        const labels = getDisambiguatedLabels(this.tabBar.tabs);
        const activeTabId = this.tabBar.activeTabId;

        const files = this.tabBar.tabs.map((tab) => {
            const entry = {
                id: tab.id,
                filePath: tab.filePath,
                label: labels.get(tab.id) ?? tab.label,
                active: tab.active,
                cursorOffset: 0,
                contentHash: 0,
                scrollTop: 0,
                cursorPath: /** @type {number[]|null} */ (null),
            };

            if (tab.id === activeTabId && this.editor?.syntaxTree?.treeCursor) {
                // Active tab — read live state from the editor
                const md = this.editor.getMarkdown();
                entry.contentHash = crc32(md);
                entry.cursorOffset = cursorToAbsoluteOffset(
                    this.editor.syntaxTree,
                    this.editor.syntaxTree.treeCursor,
                    this.editor.buildMarkdownLine.bind(this.editor),
                    this.editor.getPrefixLength.bind(this.editor),
                );
                entry.cursorPath = this.editor.syntaxTree.getPathToCursor();
                entry.scrollTop = this._scrollContainer ? this._scrollContainer.scrollTop : 0;
            } else {
                // Background tab — read from cached document state
                const state = this._documentStates.get(tab.id);
                if (state) {
                    entry.cursorOffset = state.cursorOffset;
                    entry.contentHash = state.contentHash;
                    entry.scrollTop = state.scrollTop ?? 0;
                    entry.cursorPath = state.syntaxTree?.getPathToCursor() ?? null;
                }
            }

            return entry;
        });

        return window.electronAPI.notifyOpenFiles(files);
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

        try {
            const result = await window.electronAPI.getSetting('detailsClosed');
            if (result.success && result.value !== undefined && result.value !== null) {
                if (this.editor) {
                    this.editor.detailsClosed = !!result.value;
                }
            }
        } catch {
            // Default is false (open)
        }

        try {
            const result = await window.electronAPI.getSetting('parser');
            if (result.success && (result.value === 'regex' || result.value === 'dfa')) {
                if (this.editor) {
                    this.editor.setParser(result.value);
                }
            }
        } catch {
            // Default is 'regex'
        }
    }

    /**
     * Exposes the editor API to the main process.
     */
    exposeEditorAPI() {
        /** @type {any} */ (window).__editor = this.editor;
        window.editorAPI = {
            hasUnsavedChanges: () => this.editor?.hasUnsavedChanges() ?? false,
            getContent: () => this.editor?.getMarkdown() ?? '',
            setContent: (content) => {
                this.editor?.loadMarkdown(content);
            },
            getViewMode: () => this.editor?.getViewMode() ?? 'source',
            setViewMode: (/** @type {string} */ mode) => {
                this.editor?.setViewMode(
                    /** @type {import('./editor/editor.js').ViewMode} */ (mode),
                );
                this.toolbar?.setViewMode(mode);
            },
            setUnsavedChanges: (v) => this.editor?.setUnsavedChanges(v),
            placeCursorAtNode: (/** @type {string} */ nodeId, /** @type {number} */ offset) => {
                if (this.editor) {
                    if (this.editor.syntaxTree)
                        this.editor.syntaxTree.treeCursor = { nodeId, offset: offset ?? 0 };
                    this.editor.fullRenderAndPlaceCursor();
                    this._scrollToNode(nodeId);
                }
            },
        };

        // Expose a flush function the main process can call via
        // executeJavaScript before persisting open-files state.
        /** @type {any} */ (window).__flushOpenFiles = () => {
            if (this._cursorDebounce) {
                clearTimeout(this._cursorDebounce);
                this._cursorDebounce = null;
            }
            return this._notifyOpenFiles();
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
            get: () => this.editor?.syntaxTree?.treeCursor?.nodeId ?? null,
            configurable: true,
        });
        Object.defineProperty(window, '__editorCursorOffset', {
            get: () => this.editor?.syntaxTree?.treeCursor?.offset ?? 0,
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
                if (this.editor.syntaxTree)
                    this.editor.syntaxTree.treeCursor = {
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
                this._createNewTab(null, '');
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
                this.toolbar?.setViewMode('source');
                break;
            case 'view:focused':
                this.editor.setViewMode('focused');
                this.toolbar?.setViewMode('focused');
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
