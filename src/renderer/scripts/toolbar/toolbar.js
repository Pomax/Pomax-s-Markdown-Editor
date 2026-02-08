/**
 * @fileoverview Toolbar component for WYSIWYG editing.
 * Provides element-specific formatting buttons.
 */

import { ToolbarButton } from './toolbar-button.js';

/**
 * @typedef {Object} ButtonConfig
 * @property {string} id - Button identifier
 * @property {string} label - Display label
 * @property {string} icon - Icon or symbol
 * @property {string} action - Action to perform
 * @property {string[]} [applicableTo] - Element types this button applies to
 */

/**
 * Toolbar component for the markdown editor.
 */
export class Toolbar {
    /**
     * @param {HTMLElement} container - The toolbar container element
     * @param {import('../editor/editor.js').Editor} editor - The editor instance
     */
    constructor(container, editor) {
        /** @type {HTMLElement} */
        this.container = container;

        /** @type {import('../editor/editor.js').Editor} */
        this.editor = editor;

        /** @type {HTMLElement|null} */
        this.toolbarElement = null;

        /** @type {ToolbarButton[]} */
        this.buttons = [];

        /** @type {HTMLSelectElement|null} */
        this.viewModeSelect = null;

        /** @type {ButtonConfig[]} */
        this.buttonConfigs = this.getButtonConfigs();
    }

    /**
     * Gets the button configurations.
     * @returns {ButtonConfig[]}
     */
    getButtonConfigs() {
        return [
            // Block-level transformations
            {
                id: 'heading1',
                label: 'Heading 1',
                icon: 'H1',
                action: 'changeType:heading1',
                applicableTo: [
                    'paragraph',
                    'heading1',
                    'heading2',
                    'heading3',
                    'heading4',
                    'heading5',
                    'heading6',
                ],
            },
            {
                id: 'heading2',
                label: 'Heading 2',
                icon: 'H2',
                action: 'changeType:heading2',
                applicableTo: [
                    'paragraph',
                    'heading1',
                    'heading2',
                    'heading3',
                    'heading4',
                    'heading5',
                    'heading6',
                ],
            },
            {
                id: 'heading3',
                label: 'Heading 3',
                icon: 'H3',
                action: 'changeType:heading3',
                applicableTo: [
                    'paragraph',
                    'heading1',
                    'heading2',
                    'heading3',
                    'heading4',
                    'heading5',
                    'heading6',
                ],
            },
            {
                id: 'paragraph',
                label: 'Paragraph',
                icon: '¶',
                action: 'changeType:paragraph',
                applicableTo: [
                    'heading1',
                    'heading2',
                    'heading3',
                    'heading4',
                    'heading5',
                    'heading6',
                    'blockquote',
                ],
            },
            {
                id: 'blockquote',
                label: 'Quote',
                icon: '"',
                action: 'changeType:blockquote',
                applicableTo: ['paragraph', 'heading1', 'heading2', 'heading3'],
            },
            {
                id: 'code-block',
                label: 'Code Block',
                icon: '</>',
                action: 'changeType:code-block',
                applicableTo: ['paragraph'],
            },
            {
                id: 'separator1',
                label: '',
                icon: '',
                action: 'separator',
            },
            // Inline formatting
            {
                id: 'bold',
                label: 'Bold',
                icon: 'B',
                action: 'format:bold',
                applicableTo: [
                    'paragraph',
                    'heading1',
                    'heading2',
                    'heading3',
                    'heading4',
                    'heading5',
                    'heading6',
                    'blockquote',
                    'list-item',
                ],
            },
            {
                id: 'italic',
                label: 'Italic',
                icon: 'I',
                action: 'format:italic',
                applicableTo: [
                    'paragraph',
                    'heading1',
                    'heading2',
                    'heading3',
                    'heading4',
                    'heading5',
                    'heading6',
                    'blockquote',
                    'list-item',
                ],
            },
            {
                id: 'strikethrough',
                label: 'Strikethrough',
                icon: 'S̶',
                action: 'format:strikethrough',
                applicableTo: [
                    'paragraph',
                    'heading1',
                    'heading2',
                    'heading3',
                    'blockquote',
                    'list-item',
                ],
            },
            {
                id: 'code',
                label: 'Inline Code',
                icon: '`',
                action: 'format:code',
                applicableTo: [
                    'paragraph',
                    'heading1',
                    'heading2',
                    'heading3',
                    'blockquote',
                    'list-item',
                ],
            },
            {
                id: 'link',
                label: 'Link',
                icon: '🔗',
                action: 'format:link',
                applicableTo: [
                    'paragraph',
                    'heading1',
                    'heading2',
                    'heading3',
                    'blockquote',
                    'list-item',
                ],
            },
            {
                id: 'separator2',
                label: '',
                icon: '',
                action: 'separator',
            },
            // List operations
            {
                id: 'unordered-list',
                label: 'Bullet List',
                icon: '•',
                action: 'changeType:list-item',
                applicableTo: ['paragraph'],
            },
            {
                id: 'ordered-list',
                label: 'Numbered List',
                icon: '1.',
                action: 'changeType:ordered-list-item',
                applicableTo: ['paragraph'],
            },
        ];
    }

    /**
     * Initializes the toolbar.
     */
    initialize() {
        this.toolbarElement = document.createElement('div');
        this.toolbarElement.className = 'toolbar';
        this.toolbarElement.setAttribute('role', 'toolbar');
        this.toolbarElement.setAttribute('aria-label', 'Formatting toolbar');

        // Create view mode dropdown
        const viewModeGroup = this._createViewModeSelect();
        this.toolbarElement.appendChild(viewModeGroup);

        // Separator after dropdown
        const sep = document.createElement('div');
        sep.className = 'toolbar-separator';
        this.toolbarElement.appendChild(sep);

        // Create buttons
        for (const config of this.buttonConfigs) {
            if (config.action === 'separator') {
                const separator = document.createElement('div');
                separator.className = 'toolbar-separator';
                this.toolbarElement.appendChild(separator);
            } else {
                const button = new ToolbarButton(config, this.handleButtonClick.bind(this));
                this.buttons.push(button);
                this.toolbarElement.appendChild(button.element);
            }
        }

        this.container.appendChild(this.toolbarElement);

        // Listen for selection changes
        this.editor.container.addEventListener(
            'editor:selectionchange',
            /** @type {EventListener} */ (this.handleSelectionChange.bind(this)),
        );

        // Initial state
        this.updateButtonStates(null);
    }

    /**
     * Creates the view-mode dropdown with a label.
     * @returns {HTMLElement}
     */
    _createViewModeSelect() {
        const wrapper = document.createElement('div');
        wrapper.className = 'toolbar-view-mode-group';

        const label = document.createElement('label');
        label.className = 'toolbar-view-mode-label';
        label.textContent = 'View:';
        label.htmlFor = 'view-mode-select';
        wrapper.appendChild(label);

        const select = document.createElement('select');
        select.className = 'toolbar-view-mode';
        select.id = 'view-mode-select';
        select.setAttribute('aria-label', 'View mode');

        const modes = [
            { value: 'source', label: 'Source' },
            { value: 'focused', label: 'Focused' },
        ];

        for (const { value, label } of modes) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            select.appendChild(option);
        }

        select.value = this.editor.getViewMode();

        select.addEventListener('change', () => {
            this.editor.setViewMode(
                /** @type {import('../editor/editor.js').ViewMode} */ (select.value),
            );
        });

        wrapper.appendChild(select);
        this.viewModeSelect = select;

        return wrapper;
    }

    /**
     * Updates the view-mode dropdown to reflect the current mode.
     * Call this after the view mode changes externally (e.g. via the menu).
     * @param {string} mode
     */
    setViewMode(mode) {
        if (this.viewModeSelect) {
            this.viewModeSelect.value = mode;
        }
    }

    /**
     * Handles button clicks.
     * @param {ButtonConfig} config - The button configuration
     */
    handleButtonClick(config) {
        const [actionType, actionValue] = config.action.split(':');

        switch (actionType) {
            case 'changeType':
                this.editor.changeElementType(actionValue);
                break;
            case 'format':
                this.editor.applyFormat(actionValue);
                break;
        }
    }

    /**
     * Handles selection changes in the editor.
     * @param {CustomEvent} event - The selection change event
     */
    handleSelectionChange(event) {
        const { node } = event.detail;
        this.updateButtonStates(node);
    }

    /**
     * Updates button states based on the current node.
     * @param {import('../parser/syntax-tree.js').SyntaxNode|null} node - The current node
     */
    updateButtonStates(node) {
        const nodeType = node?.type || 'paragraph';

        for (const button of this.buttons) {
            const config = button.config;

            // Check if this button is applicable to the current node type
            if (config.applicableTo) {
                const isApplicable = config.applicableTo.includes(nodeType);
                button.setEnabled(isApplicable);
            }

            // Check if this button represents the current state
            if (config.action.startsWith('changeType:')) {
                const targetType = config.action.split(':')[1];
                button.setActive(targetType === nodeType);
            }
        }
    }

    /**
     * Shows the toolbar.
     */
    show() {
        if (this.toolbarElement) {
            this.toolbarElement.classList.remove('hidden');
        }
    }

    /**
     * Hides the toolbar.
     */
    hide() {
        if (this.toolbarElement) {
            this.toolbarElement.classList.add('hidden');
        }
    }
}
