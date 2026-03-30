/**
 * @fileoverview Source View V2 renderer.
 * Renders the syntax tree as plain markdown text inside a <textarea>.
 * There is no per-node DOM correspondence — the textarea is the entire
 * editing surface.
 */

/// <reference path="../../../../types.d.ts" />

/**
 * Renders the syntax tree as plain markdown in a textarea.
 */
export class SourceRendererV2 {
  /**
   * @param {Editor} editor - The editor instance
   */
  constructor(editor) {
    /** @type {Editor} */
    this.editor = editor;

    /** @type {HTMLTextAreaElement|null} */
    this.textarea = null;
  }

  /**
   * Renders the syntax tree to the container by placing the full
   * markdown text into a textarea element.
   * @param {SyntaxTree} syntaxTree - The syntax tree to render
   * @param {HTMLElement} container - The container element
   */
  fullRender(syntaxTree, container) {
    const markdown = syntaxTree.toMarkdown();

    container.innerHTML = ``;
    container.classList.add(`source-view-v2`);
    container.classList.remove(`source-view`);
    container.classList.remove(`writing-view`);

    const textarea = document.createElement(`textarea`);
    textarea.value = markdown;
    container.appendChild(textarea);

    this.textarea = textarea;
  }

  /**
   * Returns the current text content of the textarea.
   * @returns {string}
   */
  getContent() {
    return this.textarea?.value ?? ``;
  }
}
