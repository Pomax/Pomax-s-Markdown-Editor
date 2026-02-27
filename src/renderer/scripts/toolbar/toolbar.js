/**
 * @fileoverview Toolbar component for WYSIWYG editing.
 * Provides element-specific formatting buttons.
 */

import { TableModal } from '../table/table-modal.js';
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

        /** @type {HTMLButtonElement|null} */
        this.viewModeToggle = null;

        /** @type {TableModal|null} */
        this.tableModal = null;

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
                    'list-item',
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
                    'list-item',
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
                    'list-item',
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
                    'list-item',
                ],
            },
            {
                id: 'blockquote',
                label: 'Quote',
                icon: '"',
                action: 'changeType:blockquote',
                applicableTo: ['paragraph', 'heading1', 'heading2', 'heading3', 'list-item'],
            },
            {
                id: 'code-block',
                label: 'Code Block',
                icon: '</>',
                action: 'changeType:code-block',
                applicableTo: ['paragraph', 'list-item'],
            },
            {
                id: 'image',
                label: 'Image',
                icon: '🖼',
                action: 'image:insert',
                applicableTo: ['paragraph', 'image', 'list-item'],
            },
            {
                id: 'table',
                label: 'Table',
                icon: '▦',
                action: 'table:insert',
                applicableTo: ['paragraph', 'table', 'list-item'],
            },
            {
                id: 'unordered-list',
                label: 'Bullet List',
                icon: '•',
                action: 'list:unordered',
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
                id: 'ordered-list',
                label: 'Numbered List',
                icon: '1.',
                action: 'list:ordered',
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
                id: 'checklist',
                label: 'Checklist',
                icon: '☑',
                action: 'list:checklist',
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
                id: 'subscript',
                label: 'Subscript',
                icon: 'ₓ',
                action: 'format:subscript',
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
                id: 'superscript',
                label: 'Superscript',
                icon: 'ˣ',
                action: 'format:superscript',
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
        ];
    }

    /**
     * Initializes the toolbar.
     */
    initialize() {
        // ── File-button group (grid-area: left) ──
        this._createFileButtonGroup();

        // ── Content toolbar (grid-area: center) ──
        this.toolbarElement = document.createElement('div');
        this.toolbarElement.className = 'toolbar';
        this.toolbarElement.setAttribute('role', 'toolbar');
        this.toolbarElement.setAttribute('aria-label', 'Formatting toolbar');

        // Create view mode toggle
        const viewModeGroup = this._createViewModeToggle();
        this.toolbarElement.appendChild(viewModeGroup);

        // Separator after toggle
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

        // Scale toolbar down when container is narrower than the toolbar's
        // natural width.  Never scale up beyond 1.
        this._resizeObserver = new ResizeObserver(() => this._scaleToolbar());
        this._resizeObserver.observe(this.container);

        // Listen for selection changes on document so tab switches
        // (which swap editor.container) keep working.
        document.addEventListener(
            'editor:selectionchange',
            /** @type {EventListener} */ (this.handleSelectionChange.bind(this)),
        );

        // Initial state
        this.updateButtonStates(null);
    }

    /**
     * Scales the toolbar element down uniformly when the container is narrower
     * than the toolbar's natural (unwrapped) width.  Never scales above 1.
     * Uses uniform scale so icons keep their aspect ratio.
     */
    _scaleToolbar() {
        if (!this.toolbarElement) return;

        // Reset so we can measure the natural width
        this.toolbarElement.style.transform = '';
        this.container.style.height = '';

        const containerWidth = this.container.clientWidth;
        const padding =
            Number.parseFloat(getComputedStyle(this.container).paddingLeft) +
            Number.parseFloat(getComputedStyle(this.container).paddingRight);
        const available = containerWidth - padding;
        const natural = this.toolbarElement.scrollWidth;

        if (natural > available && available > 0) {
            const scale = available / natural;
            this.toolbarElement.style.transform = `scale(${scale})`;
            // Adjust container height since transform doesn't affect layout
            const naturalHeight = this.toolbarElement.offsetHeight;
            this.container.style.height = `${naturalHeight * scale + Number.parseFloat(getComputedStyle(this.container).paddingTop) + Number.parseFloat(getComputedStyle(this.container).paddingBottom)}px`;
        }
    }

    /**
     * View mode display labels.
     * @type {Record<string, string>}
     */
    static VIEW_MODE_LABELS = {
        writing: 'Writing View',
        source: 'Source View',
    };

    /**
     * File-button definitions: id, label, and click handler.
     * @type {{id: string, label: string, handler: () => void}[]}
     */
    static FILE_BUTTONS = [
        {
            id: 'file-new',
            label: 'New File',
            handler: () => document.dispatchEvent(new CustomEvent('file:new')),
        },
        {
            id: 'file-open',
            label: 'Open File',
            handler: async () => {
                if (!window.electronAPI) return;
                const result = await window.electronAPI.loadFile();
                if (result?.success && result.content !== undefined) {
                    document.dispatchEvent(new CustomEvent('file:loaded', { detail: result }));
                }
            },
        },
        {
            id: 'file-save',
            label: 'Save File',
            handler: () => document.dispatchEvent(new CustomEvent('file:save')),
        },
    ];

    /**
     * Creates the file-button group and appends it to the container.
     * These buttons live in the grid "left" area.
     */
    _createFileButtonGroup() {
        const group = document.createElement('div');
        group.className = 'toolbar-file-group';

        for (const def of Toolbar.FILE_BUTTONS) {
            const btn = new ToolbarButton(
                { id: def.id, label: def.label, icon: '', action: '' },
                () => def.handler(),
            );
            group.appendChild(btn.element);
        }

        this.container.appendChild(group);
    }

    /**
     * Creates the view-mode toggle button with a label.
     * @returns {HTMLElement}
     */
    _createViewModeToggle() {
        const wrapper = document.createElement('div');
        wrapper.className = 'toolbar-view-mode-group';

        const label = document.createElement('span');
        label.className = 'toolbar-view-mode-label';
        label.textContent = 'View:';
        wrapper.appendChild(label);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'toolbar-view-mode-toggle';
        button.setAttribute('aria-label', 'Toggle view mode');

        const currentMode = this.editor.getViewMode();
        button.textContent = Toolbar.VIEW_MODE_LABELS[currentMode] ?? currentMode;

        button.addEventListener('click', () => {
            const newMode = this.editor.getViewMode() === 'writing' ? 'source' : 'writing';
            this.editor.setViewMode(
                /** @type {import('../editor/editor.js').ViewMode} */ (newMode),
            );
            button.textContent = Toolbar.VIEW_MODE_LABELS[newMode] ?? newMode;
        });

        wrapper.appendChild(button);
        this.viewModeToggle = button;

        return wrapper;
    }

    /**
     * Updates the view-mode toggle to reflect the current mode.
     * Call this after the view mode changes externally (e.g. via the menu).
     * @param {string} mode
     */
    setViewMode(mode) {
        if (this.viewModeToggle) {
            this.viewModeToggle.textContent = Toolbar.VIEW_MODE_LABELS[mode] ?? mode;
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
            case 'list':
                this.editor.toggleList(
                    /** @type {'unordered' | 'ordered' | 'checklist'} */ (actionValue),
                );
                break;
            case 'image':
                this.handleImageAction();
                break;
            case 'table':
                this.handleTableAction();
                break;
        }
    }

    /**
     * Handles the image button action.
     * If the cursor is on an image node, opens the modal for editing.
     * Otherwise opens it for insertion.
     */
    async handleImageAction() {
        const imageModal = this.editor.getImageModal();

        // Check if cursor is on an image node
        const currentNode = this.editor.getCurrentBlockNode();
        /** @type {Partial<import('../image/image-modal.js').ImageData>|undefined} */
        let existing;

        if (currentNode?.type === 'image') {
            existing = {
                alt: currentNode.attributes.alt ?? currentNode.content,
                src: currentNode.attributes.url ?? '',
                href: currentNode.attributes.href ?? '',
                style: currentNode.attributes.style ?? '',
            };
        }

        const result = await imageModal.open(existing);
        if (!result) return;

        let src = result.src;

        // Handle file rename if the filename changed
        if (result.rename && window.electronAPI) {
            const originalFilename = this._extractFilename(src);
            if (result.rename !== originalFilename) {
                const renameResult = await window.electronAPI.renameImage(
                    this._resolveImagePath(src),
                    result.rename,
                );
                if (renameResult.success && renameResult.newPath) {
                    // Update the src to reflect the new filename
                    src = this._replaceFilename(src, result.rename);
                }
            }
        }

        // Use a relative path when the setting is enabled
        if (this.editor.ensureLocalPaths) {
            src = await this.editor.toRelativeImagePath(src);
        }

        this.editor.insertOrUpdateImage(result.alt, src, result.href, result.style);
    }

    /**
     * Extracts the filename from a path or URL.
     * @param {string} src
     * @returns {string}
     */
    _extractFilename(src) {
        if (!src) return '';
        const clean = src.split('?')[0].split('#')[0];
        const parts = clean.split(/[/\\]/);
        return parts[parts.length - 1] || '';
    }

    /**
     * Replaces the filename portion of a path or URL.
     * @param {string} src - Original path
     * @param {string} newName - New filename
     * @returns {string}
     */
    _replaceFilename(src, newName) {
        const lastSlash = Math.max(src.lastIndexOf('/'), src.lastIndexOf('\\'));
        if (lastSlash === -1) return newName;
        return src.substring(0, lastSlash + 1) + newName;
    }

    /**
     * Resolves an image src to an absolute file path for rename operations.
     * Strips file:/// prefix and decodes URI encoding.
     * @param {string} src
     * @returns {string}
     */
    _resolveImagePath(src) {
        let resolved = src;
        if (resolved.startsWith('file:///')) {
            resolved = resolved.slice(8); // Remove 'file:///'
        }
        resolved = decodeURIComponent(resolved);
        // Convert forward slashes back to backslashes on Windows
        resolved = resolved.replace(/\//g, '\\');
        return resolved;
    }

    /**
     * Handles the table button action.
     * If the cursor is on a table node, opens the modal pre-populated for editing.
     * Otherwise opens it for insertion.
     */
    async handleTableAction() {
        if (!this.tableModal) {
            this.tableModal = new TableModal();
        }

        const currentNode = this.editor.getCurrentBlockNode();
        /** @type {import('../table/table-modal.js').TableData|null} */
        let existing = null;

        if (currentNode?.type === 'table') {
            existing = TableModal.parseTableContent(currentNode.content);
        }

        const result = await this.tableModal.open(existing);
        if (!result) return;

        this.editor.insertOrUpdateTable(result);
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
     * Maps inline node types to the toolbar button IDs they activate.
     * `bold-italic` activates both `bold` and `italic`.
     * @type {Record<string, string[]>}
     */
    static INLINE_TYPE_TO_BUTTONS = {
        bold: ['bold'],
        italic: ['italic'],
        'bold-italic': ['bold', 'italic'],
        strikethrough: ['strikethrough'],
        sub: ['subscript'],
        sup: ['superscript'],
        'inline-code': ['code'],
        link: ['link'],
        // HTML tag equivalents
        strong: ['bold'],
        b: ['bold'],
        em: ['italic'],
        i: ['italic'],
        del: ['strikethrough'],
        s: ['strikethrough'],
    };

    /**
     * Updates button states based on the current node.
     *
     * When the cursor is inside inline formatting, `node` is the inline
     * child (e.g. a `bold` SyntaxNode).  We walk up to the block parent
     * to determine block-level state (heading, list, etc.) and collect
     * the set of active inline formats along the way.
     *
     * @param {import('../parser/syntax-tree.js').SyntaxNode|null} node - The current node
     */
    updateButtonStates(node) {
        // Walk from the (potentially inline) node up to its block parent,
        // collecting every inline format type encountered on the way.
        /** @type {Set<string>} */
        const activeFormats = new Set();
        let blockNode = node;
        if (node?.isInlineNode()) {
            /** @type {import('../parser/syntax-tree.js').SyntaxNode|null} */
            let walk = node;
            while (walk?.isInlineNode()) {
                const buttons = Toolbar.INLINE_TYPE_TO_BUTTONS[walk.type];
                if (buttons) buttons.forEach((b) => activeFormats.add(b));
                walk = walk.parent;
            }
            blockNode = walk;
        }

        const blockType = blockNode?.type || 'paragraph';

        for (const button of this.buttons) {
            const config = button.config;

            // Applicable-to checks use the block-level type.
            if (config.applicableTo) {
                const isApplicable = config.applicableTo.includes(blockType);
                button.setEnabled(isApplicable);
            }

            // Block-type active state.
            if (config.action.startsWith('changeType:')) {
                const targetType = config.action.split(':')[1];
                button.setActive(targetType === blockType);
            } else if (config.action === 'list:unordered') {
                button.setActive(
                    blockType === 'list-item' &&
                        !blockNode?.attributes?.ordered &&
                        typeof blockNode?.attributes?.checked !== 'boolean',
                );
            } else if (config.action === 'list:ordered') {
                button.setActive(blockType === 'list-item' && !!blockNode?.attributes?.ordered);
            } else if (config.action === 'list:checklist') {
                button.setActive(
                    blockType === 'list-item' &&
                        typeof blockNode?.attributes?.checked === 'boolean',
                );
            }

            // Inline format active state.
            if (config.action.startsWith('format:')) {
                button.setActive(activeFormats.has(config.id));
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
