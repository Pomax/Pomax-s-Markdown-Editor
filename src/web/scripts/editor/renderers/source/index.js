/**
 * @fileoverview Source View V2 renderer.
 * Renders the syntax tree as plain markdown text inside a <textarea>
 * with an overlapping <pre> mirror element for pixel-accurate
 * coordinate lookups via the Range API.
 */

/// <reference path="../../../../../types.d.ts" />

import { parser } from '../../../../../parsers/old/dfa-parser.js';
import { SyntaxNode } from '../../../../../parsers/old/syntax-node.js';
import { absoluteOffsetToCursor } from '../../managers/cursor-persistence.js';
import { SourceRendererV2Data } from '../../types.js';

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
export class SourceRendererV2 extends SourceRendererV2Data {
  /**
   * @param {Editor} editor - The editor instance
   */
  constructor(editor) {
    super();
    this.editor = editor;
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
    this.originalMarkdown = markdown;
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
   * Returns whether the textarea content differs from the original.
   * @returns {boolean}
   */
  hasChanges() {
    return this.getContent() !== this.originalMarkdown;
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

  /**
   * Capture caret position and reparse textarea content so that edits
   * made in source2 mode are reflected in the syntax tree.
   * @returns {Promise<ViewSwitchData>}
   */
  async leaveView() {
    const editor = this.editor;

    // Capture the textarea caret's pixel position so we can restore
    // it after re-rendering in writing mode.
    let savedCaretTop = null;
    const scrollContainer = editor.container.parentElement;
    if (scrollContainer) {
      const offset = this.textarea?.selectionStart ?? 0;
      const caretRect = this.getCaretRect(offset);
      if (caretRect) {
        const containerRect = scrollContainer.getBoundingClientRect();
        savedCaretTop = caretRect.top - containerRect.top;
      }
    }

    // Reparse the textarea content into a fresh syntax tree so that
    // edits made in source2 mode are reflected in writing view.
    // Skip reparse when nothing changed.
    if (editor.syntaxTree) {
      const selectionStart = this.textarea?.selectionStart ?? 0;

      if (this.hasChanges()) {
        const rawText = this.getContent();
        const normalised = rawText.replace(/\n{3,}/g, `\n\n`);

        const newTree = await parser.parse(normalised);
        editor.syntaxTree.updateUsing(newTree);

        // Ensure there is at least one node so the editor is never empty
        if (editor.syntaxTree.children.length === 0) {
          const node = new SyntaxNode(`paragraph`, ``);
          editor.syntaxTree.appendChild(node);
        }

        editor.ensureTrailingParagraph();
        editor.setUnsavedChanges(true);
      }

      // Always restore the cursor position from the textarea caret
      // offset, even if the content didn't change (the user may have
      // moved the caret without editing).
      editor.syntaxTree.treeCursor = absoluteOffsetToCursor(
        editor.syntaxTree,
        selectionStart,
        editor.getPrefixLength.bind(editor),
      ) ?? { nodeId: editor.syntaxTree.children[0].id, offset: 0 };
    }

    return {
      absoluteCursorOffset: null,
      savedCaretTop,
      anchorNodeId: null,
      savedOffsetFromTop: null,
    };
  }

  /**
   * Activate source2 view: remove contenteditable, render, place the
   * textarea caret, and scroll-preserve.
   * @param {ViewSwitchData} data
   */
  enterView(data) {
    const editor = this.editor;
    const { absoluteCursorOffset, savedCaretTop } = data;
    const scrollContainer = editor.container.parentElement;

    // Remove contenteditable so the textarea can own focus and input.
    editor.container.removeAttribute(`contenteditable`);

    editor.viewMode = `source2`;
    editor.container.dataset.viewMode = `source2`;
    editor.fullRenderAndPlaceCursor();

    // Place the textarea caret at the previously computed offset.
    if (absoluteCursorOffset !== null && absoluteCursorOffset >= 0) {
      if (this.textarea) {
        this.textarea.selectionStart = absoluteCursorOffset;
        this.textarea.selectionEnd = absoluteCursorOffset;
        this.textarea.focus();
      }
    }

    // Scroll-preserve: use getCaretRect to find where the caret landed
    // and adjust scroll so it sits at the saved position.
    if (scrollContainer && savedCaretTop !== null && absoluteCursorOffset !== null) {
      const caretRect = this.getCaretRect(absoluteCursorOffset);
      if (caretRect) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const currentOffsetFromTop = caretRect.top - containerRect.top;
        scrollContainer.scrollTop += currentOffsetFromTop - savedCaretTop;
      }
    }

    // Notify the toolbar to update button states (no syntax tree node
    // to report — the toolbar will enable all buttons).
    document.dispatchEvent(new CustomEvent(`editor:selectionchange`, { detail: { node: null } }));
  }
}
