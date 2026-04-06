/// <reference path="../../../../types.d.ts" />

import { PreferencesModal } from '../../utility/preferences/preferences-modal.js';
import { WordCountModal } from '../../utility/word-count/word-count-modal.js';
import { MenuHandlerData } from '../types.js';

/**
 * Handles menu actions from the main process.
 */
export class MenuHandler extends MenuHandlerData {
  /**
   * @param {Editor} editor - The editor instance
   * @param {Toolbar} toolbar - The toolbar instance
   */
  constructor(editor, toolbar) {
    super();
    this.editor = editor;
    this.toolbar = toolbar;
  }

  /**
   * Initializes the menu handler.
   */
  initialize() {
    if (!window.electronAPI) {
      console.warn(`electronAPI not available, menu handler will not work`);
      return;
    }

    // Register for menu actions
    this.cleanupMenuListener = window.electronAPI.onMenuAction(this.handleMenuAction.bind(this));
  }

  /**
   * Cleans up event listeners.
   */
  destroy() {
    if (this.cleanupMenuListener) {
      this.cleanupMenuListener();
      this.cleanupMenuListener = undefined;
    }
  }

  /**
   * Handles a menu action.
   * @param {string} action - The action identifier
   * @param {...any} args - Additional arguments
   */
  async handleMenuAction(action, ...args) {
    switch (action) {
      case `file:new`:
        this.handleNew();
        break;
      case `file:loaded`:
        this.handleLoaded(args[0]);
        break;
      case `file:save`:
        this.handleSave();
        break;
      case `file:saveAs`:
        this.handleSaveAs();
        break;
      case `file:close`:
        this.handleClose();
        break;
      case `file:wordCount`:
        this.handleWordCount();
        break;
      case `edit:undo`:
        await this.handleUndo();
        break;
      case `edit:redo`:
        await this.handleRedo();
        break;
      case `view:writing`:
        await this.handleViewWriting();
        break;
      case `view:source2`:
        await this.handleViewSource2();
        break;
      case `edit:preferences`:
        this.handlePreferences();
        break;
      case `view:switchFile`:
        this.handleSwitchFile(args[0]);
        break;
      case `session:restore`:
        document.dispatchEvent(new CustomEvent(`session:restore`, { detail: args[0] }));
        break;
      case `file:restructureHeadings`:
        this.editor.restructureHeadings();
        break;
      case `element:changeType`:
        this.handleChangeType(args[0]);
        break;
      case `element:format`:
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
    document.dispatchEvent(new CustomEvent(`file:new`));
  }

  /**
   * Handles the Close action.
   * Dispatches a 'file:close' event so the app can close the active tab.
   */
  handleClose() {
    document.dispatchEvent(new CustomEvent(`file:close`));
  }

  /**
   * Handles the Loaded action.
   * Dispatches a 'file:loaded' event so the app can create or switch tabs.
   * @param {{success: boolean, content?: string, filePath?: string}} result
   */
  handleLoaded(result) {
    if (result.success && result.content !== undefined) {
      document.dispatchEvent(new CustomEvent(`file:loaded`, { detail: result }));
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
      this.editor.currentFilePath = result.filePath;
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
      this.editor.currentFilePath = result.filePath;
      this.editor.setUnsavedChanges(false);
    }
  }

  /**
   * Handles the Undo action.
   */
  async handleUndo() {
    await this.editor.undo();
  }

  /**
   * Handles the Redo action.
   */
  async handleRedo() {
    await this.editor.redo();
  }

  /**
   * Handles switching to Writing view.
   */
  async handleViewWriting() {
    await this.editor.setViewMode(`writing`);
    this.toolbar.setViewMode(`writing`);
  }

  /**
   * Handles switching to Source2 view.
   */
  async handleViewSource2() {
    await this.editor.setViewMode(`source2`);
    this.toolbar.setViewMode(`source2`);
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
    if (!this.preferencesModal) {
      this.preferencesModal = new PreferencesModal();
    }
    this.preferencesModal.open();
  }

  /**
   * Handles switching to a different open file tab.
   * @param {string | {filePath: string}} arg - Tab ID or object with filePath
   */
  handleSwitchFile(arg) {
    // arg may be a tabId string (from menu clicks) or an object
    // with { filePath } (from session restore).
    if (typeof arg === `object` && arg?.filePath) {
      document.dispatchEvent(
        new CustomEvent(`view:switchFile`, { detail: { filePath: arg.filePath } }),
      );
    } else {
      document.dispatchEvent(new CustomEvent(`view:switchFile`, { detail: { tabId: arg } }));
    }
  }

  /**
   * Handles opening the Word Count modal.
   */
  handleWordCount() {
    if (!this.wordCountModal) {
      this.wordCountModal = new WordCountModal();
    }
    this.wordCountModal.open(this.editor.syntaxTree ?? undefined);
  }
}
