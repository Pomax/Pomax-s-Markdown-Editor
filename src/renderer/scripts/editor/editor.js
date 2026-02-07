/**
 * @fileoverview Main Editor class.
 * Manages the document, view modes, and user interactions.
 */

/// <reference path="../../../types.d.ts" />

import { MarkdownParser } from '../parser/markdown-parser.js';
import { SyntaxTree } from '../parser/syntax-tree.js';
import { FocusedRenderer } from './renderers/focused-renderer.js';
import { SourceRenderer } from './renderers/source-renderer.js';
import { SelectionManager } from './selection-manager.js';
import { UndoManager } from './undo-manager.js';

/**
 * @typedef {'source' | 'focused'} ViewMode
 */

/**
 * Main editor class that manages the markdown editing experience.
 */
export class Editor {
    /**
     * @param {HTMLElement} container - The editor container element
     */
    constructor(container) {
        /** @type {HTMLElement} */
        this.container = container;

        /** @type {MarkdownParser} */
        this.parser = new MarkdownParser();

        /** @type {SyntaxTree|null} */
        this.syntaxTree = null;

        /** @type {SourceRenderer} */
        this.sourceRenderer = new SourceRenderer(this);

        /** @type {FocusedRenderer} */
        this.focusedRenderer = new FocusedRenderer(this);

        /** @type {UndoManager} */
        this.undoManager = new UndoManager();

        /** @type {SelectionManager} */
        this.selectionManager = new SelectionManager(this);

        /** @type {ViewMode} */
        this.viewMode = 'source';

        /** @type {boolean} */
        this._hasUnsavedChanges = false;

        /** @type {string|null} */
        this.currentFilePath = null;

        /** @type {((event: Event) => void)|null} */
        this._inputHandler = null;
    }

    /**
     * Initializes the editor.
     */
    async initialize() {
        // Set up initial empty document
        this.syntaxTree = new SyntaxTree();

        // Set up event listeners
        this.setupEventListeners();

        // Render initial state
        this.render();
    }

    /**
     * Sets up event listeners for the editor.
     */
    setupEventListeners() {
        this._inputHandler = /** @type {(event: Event) => void} */ (this.handleInput.bind(this));
        this.container.addEventListener('input', this._inputHandler);

        this.container.addEventListener('keydown', this.handleKeyDown.bind(this));
        this.container.addEventListener('click', this.handleClick.bind(this));
        this.container.addEventListener('focus', this.handleFocus.bind(this));
        this.container.addEventListener('blur', this.handleBlur.bind(this));

        // Selection change listener
        document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
    }

    /**
     * Handles input events.
     * @param {InputEvent} event - The input event
     */
    handleInput(event) {
        // Save current state for undo before making changes
        const previousContent = this.syntaxTree?.toMarkdown() ?? '';

        // Get the current content from the editor
        const currentContent = this.getEditorContent();

        // Parse the new content
        this.syntaxTree = this.parser.parse(currentContent);

        // Record change for undo
        this.undoManager.recordChange({
            type: 'input',
            before: previousContent,
            after: currentContent,
        });

        // Mark as having unsaved changes
        this.setUnsavedChanges(true);

        // Update rendering if in focused mode
        if (this.viewMode === 'focused') {
            this.render();
        }
    }

    /**
     * Handles keydown events.
     * @param {KeyboardEvent} event - The keyboard event
     */
    handleKeyDown(event) {
        // Handle undo/redo shortcuts
        if (event.ctrlKey || event.metaKey) {
            if (event.key === 'z' && !event.shiftKey) {
                event.preventDefault();
                this.undo();
            } else if ((event.key === 'z' && event.shiftKey) || event.key === 'y') {
                event.preventDefault();
                this.redo();
            }
        }
    }

    /**
     * Handles click events.
     * @param {MouseEvent} event - The click event
     */
    handleClick(event) {
        this.selectionManager.updateFromDOM();
    }

    /**
     * Handles focus events.
     */
    handleFocus() {
        this.container.classList.add('focused');
    }

    /**
     * Handles blur events.
     */
    handleBlur() {
        this.container.classList.remove('focused');
    }

    /**
     * Handles selection change events.
     */
    handleSelectionChange() {
        if (document.activeElement === this.container) {
            this.selectionManager.updateFromDOM();
        }
    }

    /**
     * Gets the current content from the editor element.
     * @returns {string} The current content
     */
    getEditorContent() {
        return this.container.innerText;
    }

    /**
     * Renders the document based on current view mode.
     */
    render() {
        if (!this.syntaxTree) return;

        const renderer = this.viewMode === 'source' ? this.sourceRenderer : this.focusedRenderer;

        renderer.render(this.syntaxTree, this.container);
    }

    /**
     * Loads markdown content into the editor.
     * @param {string} markdown - The markdown content to load
     */
    loadMarkdown(markdown) {
        this.syntaxTree = this.parser.parse(markdown);
        this.undoManager.clear();
        this.setUnsavedChanges(false);
        this.render();
    }

    /**
     * Gets the current document as markdown.
     * @returns {string} The markdown content
     */
    getMarkdown() {
        if (this.syntaxTree) {
            return this.syntaxTree.toMarkdown();
        }
        return this.getEditorContent();
    }

    /**
     * Resets the editor to an empty document.
     */
    reset() {
        this.syntaxTree = new SyntaxTree();
        this.undoManager.clear();
        this.currentFilePath = null;
        this.setUnsavedChanges(false);
        this.render();
    }

    /**
     * Sets the view mode.
     * @param {ViewMode} mode - The view mode to set
     */
    setViewMode(mode) {
        if (mode !== 'source' && mode !== 'focused') {
            console.warn(`Invalid view mode: ${mode}`);
            return;
        }

        this.viewMode = mode;
        this.container.dataset.viewMode = mode;
        this.render();
    }

    /**
     * Gets the current view mode.
     * @returns {ViewMode}
     */
    getViewMode() {
        return this.viewMode;
    }

    /**
     * Undoes the last action.
     */
    undo() {
        const change = this.undoManager.undo();
        if (change) {
            this.syntaxTree = this.parser.parse(change.before);
            this.render();
            this.setUnsavedChanges(true);
        }
    }

    /**
     * Redoes the last undone action.
     */
    redo() {
        const change = this.undoManager.redo();
        if (change) {
            this.syntaxTree = this.parser.parse(change.after);
            this.render();
            this.setUnsavedChanges(true);
        }
    }

    /**
     * Inserts text at the current cursor position.
     * @param {string} text - The text to insert
     */
    insertText(text) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));

        // Trigger input handling
        this.handleInput(new InputEvent('input'));
    }

    /**
     * Changes the type of the current element.
     * @param {string} elementType - The new element type
     */
    changeElementType(elementType) {
        const currentNode = this.selectionManager.getCurrentNode();
        if (!currentNode || !this.syntaxTree) return;

        // Record for undo
        const beforeContent = this.getMarkdown();

        // Change the node type
        this.syntaxTree.changeNodeType(currentNode, elementType);

        // Record change
        this.undoManager.recordChange({
            type: 'changeType',
            before: beforeContent,
            after: this.getMarkdown(),
        });

        this.render();
        this.setUnsavedChanges(true);
    }

    /**
     * Applies formatting to the current selection.
     * @param {string} format - The format to apply (bold, italic, etc.)
     */
    applyFormat(format) {
        const selection = this.selectionManager.getSelection();
        if (!selection || !this.syntaxTree) return;

        // Record for undo
        const beforeContent = this.getMarkdown();

        // Apply the format
        this.syntaxTree.applyFormat(selection, format);

        // Record change
        this.undoManager.recordChange({
            type: 'format',
            before: beforeContent,
            after: this.getMarkdown(),
        });

        this.render();
        this.setUnsavedChanges(true);
    }

    /**
     * Sets the cursor position.
     * @param {number} line - The line number (0-based)
     * @param {number} column - The column number (0-based)
     */
    setCursorPosition(line, column) {
        this.selectionManager.setCursorPosition(line, column);
    }

    /**
     * Sets the selection range.
     * @param {{startLine: number, startColumn: number, endLine: number, endColumn: number}} range
     */
    setSelection(range) {
        this.selectionManager.setSelection(range);
    }

    /**
     * Sets whether there are unsaved changes.
     * @param {boolean} hasChanges
     */
    setUnsavedChanges(hasChanges) {
        this._hasUnsavedChanges = hasChanges;

        if (window.electronAPI) {
            window.electronAPI.setUnsavedChanges(hasChanges);
        }

        // Update window title
        this.updateWindowTitle();
    }

    /**
     * Gets whether there are unsaved changes.
     * @returns {boolean}
     */
    hasUnsavedChanges() {
        return this._hasUnsavedChanges;
    }

    /**
     * Updates the window title to reflect the current state.
     */
    updateWindowTitle() {
        const fileName = this.currentFilePath
            ? this.currentFilePath.split(/[\\/]/).pop()
            : 'Untitled';
        const modified = this._hasUnsavedChanges ? ' •' : '';
        document.title = `${fileName}${modified} - Markdown Editor`;
    }
}
