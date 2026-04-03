/**
 * @fileoverview Tree-based formatter for writing view mode.
 * Delegates all formatting operations to the editor's existing tree-based
 * methods. Implements the {@link Formatter} interface.
 */

/// <reference path="../../../../types.d.ts" />

/**
 * Formatter that operates on the syntax tree via the editor's existing methods.
 * Used for `writing` view mode.
 * @implements {Formatter}
 */
export class TreeFormatter {
  /**
   * @param {Editor} editor
   */
  constructor(editor) {
    /** @type {Editor} */
    this.editor = editor;
  }

  /**
   * Applies an inline format to the current selection.
   * @param {string} format
   */
  applyFormat(format) {
    this.editor.applyFormat(format);
  }

  /**
   * Changes the block type of the current element.
   * @param {string} elementType
   */
  changeElementType(elementType) {
    this.editor.changeElementType(elementType);
  }

  /**
   * Toggles list formatting on the current node.
   * @param {'unordered' | 'ordered' | 'checklist'} kind
   * @returns {Promise<void>}
   */
  async toggleList(kind) {
    await this.editor.toggleList(kind);
  }

  /**
   * Inserts or updates an image at the cursor.
   * @param {string} alt
   * @param {string} src
   * @param {string} href
   * @param {string} [style]
   */
  insertOrUpdateImage(alt, src, href, style = ``) {
    this.editor.insertOrUpdateImage(alt, src, href, style);
  }

  /**
   * Inserts or updates a table at the cursor.
   * @param {TableData} tableData
   */
  insertOrUpdateTable(tableData) {
    this.editor.insertOrUpdateTable(tableData);
  }
}
