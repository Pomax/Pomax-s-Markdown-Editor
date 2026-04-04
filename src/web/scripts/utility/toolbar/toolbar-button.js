import { icons } from './icons.js';
import { ToolbarButtonData } from '../../editor/types.js';

const isMac = navigator.platform.toUpperCase().includes(`MAC`);

/**
 * Resolves a platform-agnostic shortcut string for display.
 * Replaces "Mod" with "⌘" on macOS and "Ctrl" elsewhere.
 * @param {string} shortcut - e.g. "Mod+B", "Mod+Shift+Q"
 * @returns {string}
 */
function formatShortcut(shortcut) {
  return shortcut.replace(`Mod`, isMac ? `⌘` : `Ctrl`);
}

/**
 * Represents a single toolbar button.
 */
export class ToolbarButton extends ToolbarButtonData {
  /**
   * @param {ButtonConfig} config - The button configuration
   * @param {function(ButtonConfig): void} onClick - Click handler
   */
  constructor(config, onClick) {
    super();
    this.config = config;
    this.onClick = onClick;
    this.element = this.createElement();
  }

  /**
   * Creates the button element.
   * @returns {HTMLButtonElement}
   */
  createElement() {
    const button = document.createElement(`button`);
    button.className = `toolbar-button`;
    button.type = `button`;
    button.setAttribute(`aria-label`, this.config.label);
    const tooltip = this.config.shortcut
      ? `${this.config.label} (${formatShortcut(this.config.shortcut)})`
      : this.config.label;
    button.dataset.tooltip = tooltip;
    button.dataset.buttonId = this.config.id;

    // Create icon/label content
    const content = document.createElement(`span`);
    content.className = `toolbar-button-content`;
    const svg = icons[this.config.id];
    if (svg) {
      content.innerHTML = svg;
    } else {
      content.textContent = this.config.icon;
    }
    button.appendChild(content);

    // Prevent mousedown from stealing focus away from the editor.
    // Without this, clicking a toolbar button fires the editor's
    // handleBlur (which clears treeCursor) before the click handler
    // runs, so the toolbar can no longer tell which node was active.
    button.addEventListener(`mousedown`, (e) => e.preventDefault());

    // Add click handler
    button.addEventListener(`click`, this.handleClick.bind(this));

    return button;
  }

  /**
   * Handles click events.
   * @param {MouseEvent} event
   */
  handleClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (this.isEnabled) {
      this.onClick(this.config);
    }
  }

  /**
   * Sets whether the button is enabled.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    this.element.disabled = !enabled;
    this.element.classList.toggle(`disabled`, !enabled);
  }

  /**
   * Sets whether the button is active (pressed state).
   * @param {boolean} active
   */
  setActive(active) {
    this.isActive = active;
    this.element.classList.toggle(`active`, active);
    this.element.setAttribute(`aria-pressed`, active.toString());
  }

  /**
   * Updates the button's icon.
   * @param {string} icon
   */
  setIcon(icon) {
    const content = this.element.querySelector(`.toolbar-button-content`);
    if (content) {
      const svg = icons[icon];
      if (svg) {
        content.innerHTML = svg;
      } else {
        content.textContent = icon;
      }
    }
  }

  /**
   * Updates the button's label/title.
   * @param {string} label
   */
  setLabel(label) {
    this.element.dataset.tooltip = label;
    this.element.setAttribute(`aria-label`, label);
  }
}
