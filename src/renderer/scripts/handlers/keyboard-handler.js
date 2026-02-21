/**
 * @fileoverview Keyboard Handler for processing keyboard shortcuts.
 * Manages keyboard-based interactions with the editor.
 */

/**
 * @typedef {Object} ShortcutConfig
 * @property {string} key - The key code
 * @property {boolean} [ctrl] - Whether Ctrl is required
 * @property {boolean} [shift] - Whether Shift is required
 * @property {boolean} [alt] - Whether Alt is required
 * @property {boolean} [meta] - Whether Meta (Cmd on Mac) is required
 * @property {string} action - The action to perform
 */

/**
 * Handles keyboard shortcuts for the editor.
 */
export class KeyboardHandler {
    /**
     * @param {import('../editor/editor.js').Editor} editor - The editor instance
     */
    constructor(editor) {
        /** @type {import('../editor/editor.js').Editor} */
        this.editor = editor;

        /** @type {ShortcutConfig[]} */
        this.shortcuts = this.getShortcuts();

        /** @type {((event: KeyboardEvent) => void)|null} */
        this._keydownHandler = null;
    }

    /**
     * Gets the list of keyboard shortcuts.
     * @returns {ShortcutConfig[]}
     */
    getShortcuts() {
        return [
            // Formatting shortcuts
            { key: 'b', ctrl: true, action: 'format:bold' },
            { key: 'i', ctrl: true, action: 'format:italic' },
            { key: 'k', ctrl: true, action: 'format:link' },
            { key: '`', ctrl: true, action: 'format:code' },

            // Heading shortcuts
            { key: '1', ctrl: true, alt: true, action: 'changeType:heading1' },
            { key: '2', ctrl: true, alt: true, action: 'changeType:heading2' },
            { key: '3', ctrl: true, alt: true, action: 'changeType:heading3' },
            { key: '4', ctrl: true, alt: true, action: 'changeType:heading4' },
            { key: '5', ctrl: true, alt: true, action: 'changeType:heading5' },
            { key: '6', ctrl: true, alt: true, action: 'changeType:heading6' },
            { key: '0', ctrl: true, alt: true, action: 'changeType:paragraph' },

            // Block shortcuts
            { key: 'q', ctrl: true, shift: true, action: 'changeType:blockquote' },
            { key: 'c', ctrl: true, shift: true, action: 'changeType:code-block' },

            // Search
            { key: 'f', ctrl: true, action: 'search:open' },
        ];
    }

    /**
     * Initializes the keyboard handler.
     */
    initialize() {
        this._keydownHandler = /** @type {(event: KeyboardEvent) => void} */ (
            this.handleKeyDown.bind(this)
        );
        document.addEventListener('keydown', this._keydownHandler);
    }

    /**
     * Cleans up event listeners.
     */
    destroy() {
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }
    }

    /**
     * Handles keydown events.
     * @param {KeyboardEvent} event - The keyboard event
     */
    handleKeyDown(event) {
        // Find matching shortcut
        const shortcut = this.findMatchingShortcut(event);

        if (shortcut) {
            event.preventDefault();
            this.executeAction(shortcut.action);
        }
    }

    /**
     * Finds a shortcut that matches the keyboard event.
     * @param {KeyboardEvent} event - The keyboard event
     * @returns {ShortcutConfig|null}
     */
    findMatchingShortcut(event) {
        for (const shortcut of this.shortcuts) {
            if (this.matchesShortcut(event, shortcut)) {
                return shortcut;
            }
        }
        return null;
    }

    /**
     * Checks if an event matches a shortcut configuration.
     * @param {KeyboardEvent} event - The keyboard event
     * @param {ShortcutConfig} shortcut - The shortcut configuration
     * @returns {boolean}
     */
    matchesShortcut(event, shortcut) {
        // Check key
        if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) {
            return false;
        }

        // Check modifiers
        const ctrlRequired = shortcut.ctrl || false;
        const shiftRequired = shortcut.shift || false;
        const altRequired = shortcut.alt || false;
        const metaRequired = shortcut.meta || false;

        // On Mac, Cmd is metaKey; on Windows/Linux, Ctrl is ctrlKey
        const ctrlPressed = event.ctrlKey || event.metaKey;

        if (ctrlRequired !== ctrlPressed) return false;
        if (shiftRequired !== event.shiftKey) return false;
        if (altRequired !== event.altKey) return false;

        return true;
    }

    /**
     * Executes an action from a shortcut.
     * @param {string} action - The action to execute
     */
    executeAction(action) {
        const [actionType, actionValue] = action.split(':');

        switch (actionType) {
            case 'format':
                this.editor.applyFormat(actionValue);
                break;
            case 'changeType':
                this.editor.changeElementType(actionValue);
                break;
            case 'search':
                document.dispatchEvent(new CustomEvent('search:open'));
                break;
            default:
                console.warn(`Unknown action type: ${actionType}`);
        }
    }
}
