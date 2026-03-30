/**
 * @fileoverview Keyboard and beforeinput event dispatch.
 *
 * This is the single entry-point for all keyboard-driven edits: the
 * default browser action is always prevented, and instead the edit is
 * applied to the tree, which is then re-rendered.
 */

/// <reference path="../../../../types.d.ts" />

/**
 * Dispatches keyboard and beforeinput events to the appropriate editor
 * operations.
 */
export class InputHandler {
  /**
   * @param {Editor} editor
   */
  constructor(editor) {
    /** @type {Editor} */
    this.editor = editor;
  }

  /**
   * Catches `beforeinput` as a safety net: any input that was not already
   * handled by `handleKeyDown` is prevented so the DOM stays in sync with
   * the tree.  Paste is handled here as well.
   * @param {InputEvent} event
   */
  async handleBeforeInput(event) {
    if (this.editor.isRendering) {
      event.preventDefault();
      return;
    }

    // If the cursor is inside the phantom paragraph, promote it
    // to a real tree node before processing any input.
    if (this.editor.promotePhantomParagraph()) {
      // For paste we still need to continue; for other input types
      // the keydown handler already drove the edit, so prevent.
      if (event.inputType !== `insertFromPaste`) {
        event.preventDefault();
        return;
      }
    }

    // Handle paste
    if (event.inputType === `insertFromPaste`) {
      event.preventDefault();
      const text = event.dataTransfer?.getData(`text/plain`) ?? ``;
      if (text) {
        await this.editor.editOperations.insertTextAtCursor(text);
      }
      return;
    }

    // Handle cut — the clipboard was already written by the 'cut'
    // event handler; here we just delete the selected range via the tree.
    if (event.inputType === `deleteByCut`) {
      event.preventDefault();
      this.editor.syncCursorFromDOM();
      if (this.editor.treeRange) {
        const rangeResult = this.editor.rangeOperations.deleteSelectedRange();
        if (rangeResult) {
          this.editor.editOperations.cleanupEmptyNodeAfterDelete(rangeResult);
          this.editor.recordAndRender(rangeResult.before, rangeResult.hints);
        }
      }
      return;
    }

    // All other mutations are prevented — we drive edits through the tree.
    event.preventDefault();
  }

  /**
   * Handles keydown events.  This is the single entry-point for all
   * keyboard-driven edits: the default browser action is always prevented,
   * and instead the edit is applied to the tree, which is then re-rendered.
   * @param {KeyboardEvent} event
   */
  async handleKeyDown(event) {
    // Signal that the next selectionchange was caused by an
    // in-editor interaction, so treeRange may be cleared.
    this.editor.editorInteractionPending = true;

    // If the cursor is inside the phantom paragraph (the view-only
    // element after a trailing code block), promote it to a real
    // tree node so that editing operations have a target.
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      this.editor.promotePhantomParagraph()
    ) {
      // The phantom was promoted and cursor placed.  Now let the
      // normal insertTextAtCursor path handle the character.
    }

    // Reset select-all cycling for any key that is not Ctrl/Cmd+A
    // and not a bare modifier key (pressing Ctrl alone should not
    // reset the cycle so that repeated Ctrl+A works).
    const isSelectAll = (event.ctrlKey || event.metaKey) && event.key === `a`;
    const isModifierOnly =
      event.key === `Control` ||
      event.key === `Shift` ||
      event.key === `Alt` ||
      event.key === `Meta`;
    if (!isSelectAll && !isModifierOnly) {
      this.editor.rangeOperations.resetSelectAllLevel();
    }

    if (event.ctrlKey || event.metaKey) {
      if (event.key === `z` && !event.shiftKey) {
        event.preventDefault();
        await this.editor.undo();
        return;
      }
      if ((event.key === `z` && event.shiftKey) || event.key === `y`) {
        event.preventDefault();
        await this.editor.redo();
        return;
      }

      if (event.key === `a`) {
        event.preventDefault();
        this.editor.rangeOperations.handleSelectAll();
        return;
      }

      if (event.key === `ArrowLeft` || event.key === `ArrowRight`) {
        event.preventDefault;
      }
    }

    if (event.key === `Enter` && !event.shiftKey) {
      event.preventDefault();
      // If the cursor is inside the phantom paragraph, promoting it
      // is all we need — an empty real paragraph already exists.
      if (this.editor.promotePhantomParagraph()) return;
      this.editor.editOperations.handleEnterKey();
      return;
    }

    if (event.key === `Backspace`) {
      event.preventDefault();
      await this.editor.editOperations.handleBackspace();
      return;
    }

    if (event.key === `Delete`) {
      event.preventDefault();
      await this.editor.editOperations.handleDelete();
      return;
    }

    // A printable key is a single character that is not modified by Ctrl/Meta.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      await this.editor.editOperations.insertTextAtCursor(event.key);
      return;
    }

    if (event.key === `Tab` && this.editor.viewMode === `writing`) {
      this.editor.syncCursorFromDOM();
      const node = this.editor.getCurrentBlockNode();
      if (node?.type === `table` && this.editor.syntaxTree?.treeCursor?.cellRow !== undefined) {
        event.preventDefault();
        this.editor.tableManager.handleTableTab(event.shiftKey);
        return;
      }
    }

    // Navigation keys (arrows, Home, End, Page Up/Down), Tab, Escape, etc.
    // are left to their default browser behaviour so the cursor moves
    // naturally.  After the key is processed, `selectionchange` will fire
    // and we update the tree cursor from the DOM.
  }
}
