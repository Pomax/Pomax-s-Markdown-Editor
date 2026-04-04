import { KeyboardHandlerData } from '../types.js';

/**
 * Handles keyboard shortcuts for the editor.
 */
export class KeyboardHandler extends KeyboardHandlerData {
  /**
   * @param {Editor} editor - The editor instance
   */
  constructor(editor) {
    super();
    this.editor = editor;
    this.shortcuts = this.getShortcuts();
  }

  /**
   * Gets the list of keyboard shortcuts.
   * @returns {ShortcutConfig[]}
   */
  getShortcuts() {
    return [
      // Formatting shortcuts
      { key: `b`, ctrl: true, action: `format:bold` },
      { key: `i`, ctrl: true, action: `format:italic` },
      { key: `k`, ctrl: true, action: `insert:link` },
      { key: `\``, ctrl: true, action: `format:code` },
      { key: `-`, code: `Minus`, ctrl: true, shift: true, action: `format:strikethrough` },
      { key: `ArrowDown`, ctrl: true, shift: true, action: `format:subscript` },
      { key: `ArrowUp`, ctrl: true, shift: true, action: `format:superscript` },

      // Heading shortcuts
      { key: `1`, ctrl: true, alt: true, action: `changeType:heading1` },
      { key: `2`, ctrl: true, alt: true, action: `changeType:heading2` },
      { key: `3`, ctrl: true, alt: true, action: `changeType:heading3` },
      { key: `4`, ctrl: true, alt: true, action: `changeType:heading4` },
      { key: `5`, ctrl: true, alt: true, action: `changeType:heading5` },
      { key: `6`, ctrl: true, alt: true, action: `changeType:heading6` },
      { key: `0`, ctrl: true, alt: true, action: `changeType:paragraph` },

      // Block shortcuts
      { key: `q`, ctrl: true, shift: true, action: `changeType:blockquote` },
      { key: `c`, ctrl: true, shift: true, action: `changeType:code-block` },

      // Insert shortcuts
      { key: `i`, ctrl: true, shift: true, action: `insert:image` },
      { key: `t`, ctrl: true, shift: true, action: `insert:table` },

      // List shortcuts
      { key: `b`, ctrl: true, shift: true, action: `list:unordered-list` },
      { key: `n`, ctrl: true, shift: true, action: `list:ordered-list` },
      { key: `x`, ctrl: true, shift: true, action: `list:checklist` },

      // Search
      { key: `f`, ctrl: true, action: `search:open` },
    ];
  }

  /**
   * Initializes the keyboard handler.
   */
  initialize() {
    this.keydownHandler = /** @type {(event: KeyboardEvent) => void} */ (
      this.handleKeyDown.bind(this)
    );
    document.addEventListener(`keydown`, this.keydownHandler);
  }

  /**
   * Cleans up event listeners.
   */
  destroy() {
    if (this.keydownHandler) {
      document.removeEventListener(`keydown`, this.keydownHandler);
      this.keydownHandler = null;
    }
  }

  /**
   * Handles keydown events.
   * @param {KeyboardEvent} event - The keyboard event
   */
  handleKeyDown(event) {
    // Escape dismisses the search bar from anywhere.
    if (event.key === `Escape`) {
      document.dispatchEvent(new CustomEvent(`search:close`));
      return;
    }

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
    // Check key (use event.code when Shift transforms the character)
    const keyMatches = shortcut.code
      ? event.code === shortcut.code
      : event.key.toLowerCase() === shortcut.key.toLowerCase();
    if (!keyMatches) {
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
   * Executes an action from a shortcut by clicking the corresponding
   * toolbar button, so that keyboard shortcuts and button clicks share
   * a single code path.
   * @param {string} action - The action to execute
   */
  executeAction(action) {
    const [actionType, actionValue] = action.split(`:`);

    if (actionType === `search`) {
      document.dispatchEvent(new CustomEvent(`search:open`));
      return;
    }

    const button = /** @type {HTMLElement|null} */ (
      document.querySelector(`.toolbar-button[data-button-id="${actionValue}"]`)
    );
    if (button) {
      button.click();
    }
  }
}
