/**
 * @fileoverview Source View V2 renderer.
 * Renders the syntax tree as plain markdown text inside a <textarea>
 * with an overlapping <pre> mirror element for pixel-accurate
 * coordinate lookups via the Range API.
 */

/// <reference path="../../../../types.d.ts" />

/**
 * Syncs the pre mirror scroll position to match the textarea.
 * @param {HTMLTextAreaElement} textarea
 * @param {HTMLPreElement} pre
 */
function syncScroll(textarea, pre) {
  pre.scrollTop = textarea.scrollTop;
  pre.scrollLeft = textarea.scrollLeft;
}

/**
 * Renders the syntax tree as plain markdown in a textarea with
 * an overlapping pre mirror for coordinate lookups.
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

    /** @type {HTMLPreElement|null} */
    this.pre = null;

    /** @type {boolean} */
    this.mirrorDirty = false;
  }

  /**
   * Renders the syntax tree to the container by placing the full
   * markdown text into a textarea with an overlapping pre mirror.
   * @param {SyntaxTree} syntaxTree - The syntax tree to render
   * @param {HTMLElement} container - The container element
   */
  fullRender(syntaxTree, container) {
    const markdown = syntaxTree.toMarkdown();

    container.innerHTML = ``;
    container.classList.add(`source-view-v2`);
    container.classList.remove(`source-view`);
    container.classList.remove(`writing-view`);

    const wrapper = document.createElement(`div`);
    wrapper.classList.add(`source-v2-wrapper`);

    const textarea = document.createElement(`textarea`);
    textarea.value = markdown;

    const pre = document.createElement(`pre`);
    pre.setAttribute(`aria-hidden`, `true`);
    pre.textContent = markdown + `\n`;

    textarea.addEventListener(`input`, () => {
      this.mirrorDirty = true;
    });
    textarea.addEventListener(`scroll`, () => syncScroll(textarea, pre));

    wrapper.appendChild(textarea);
    wrapper.appendChild(pre);
    container.appendChild(wrapper);

    this.textarea = textarea;
    this.pre = pre;
    this.mirrorDirty = false;
  }

  /**
   * Ensures the pre mirror content matches the textarea value.
   * Only performs the update if the mirror has been marked dirty.
   */
  syncMirror() {
    if (!this.mirrorDirty || !this.textarea || !this.pre) return;
    this.pre.textContent = this.textarea.value + `\n`;
    this.mirrorDirty = false;
  }

  /**
   * Returns the current text content of the textarea.
   * @returns {string}
   */
  getContent() {
    return this.textarea?.value ?? ``;
  }

  /**
   * Returns the bounding client rect for a character offset in the
   * textarea by querying the equivalent position in the pre mirror.
   * Syncs the mirror first if it is dirty.
   * @param {number} offset - Character offset into the textarea value
   * @returns {DOMRect|null}
   */
  getCaretRect(offset) {
    if (!this.pre) return null;

    this.syncMirror();

    const textNode = this.pre.firstChild;
    if (!textNode || !textNode.textContent) return null;

    const clamped = Math.max(0, Math.min(offset, textNode.textContent.length));
    const range = document.createRange();
    range.setStart(textNode, clamped);
    range.setEnd(textNode, clamped);
    return range.getBoundingClientRect();
  }
}
