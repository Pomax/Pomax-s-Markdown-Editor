/**
 * @fileoverview Textarea-based formatter for source view 2 mode.
 * Operates directly on the textarea's text and selection, applying
 * markdown syntax without going through the syntax tree.
 * Implements the {@link Formatter} interface.
 */

/// <reference path="../../../../types.d.ts" />

/**
 * Maps inline format names to their markdown delimiter pairs.
 * @type {Record<string, {open: string, close: string}>}
 */
const INLINE_DELIMITERS = {
  bold: { open: `**`, close: `**` },
  italic: { open: `*`, close: `*` },
  strikethrough: { open: `~~`, close: `~~` },
  code: { open: `\``, close: `\`` },
  subscript: { open: `<sub>`, close: `</sub>` },
  superscript: { open: `<sup>`, close: `</sup>` },
};

/**
 * Maps block element types to their line prefix.
 * @type {Record<string, string>}
 */
const BLOCK_PREFIXES = {
  heading1: `# `,
  heading2: `## `,
  heading3: `### `,
  heading4: `#### `,
  heading5: `##### `,
  heading6: `###### `,
  blockquote: `> `,
  paragraph: ``,
};

/**
 * Maps list kinds to their line prefix.
 * @type {Record<string, string>}
 */
const LIST_PREFIXES = {
  unordered: `- `,
  ordered: `1. `,
  checklist: `- [ ] `,
};

/**
 * Returns the start and end indices of the line containing `pos`
 * within `text`.
 * @param {string} text
 * @param {number} pos - Character offset
 * @returns {{ lineStart: number, lineEnd: number }}
 */
function getLineRange(text, pos) {
  let lineStart = text.lastIndexOf(`\n`, pos - 1) + 1;
  let lineEnd = text.indexOf(`\n`, pos);
  if (lineEnd === -1) lineEnd = text.length;
  return { lineStart, lineEnd };
}

/**
 * Returns the start of the first line and end of the last line
 * covered by [selStart, selEnd].
 * @param {string} text
 * @param {number} selStart
 * @param {number} selEnd
 * @returns {{ rangeStart: number, rangeEnd: number }}
 */
function getFullLineRange(text, selStart, selEnd) {
  const { lineStart: rangeStart } = getLineRange(text, selStart);
  const { lineEnd: rangeEnd } = getLineRange(text, selEnd);
  return { rangeStart, rangeEnd };
}

/**
 * Checks whether a line has any list prefix.
 * @param {string} lineText
 * @returns {boolean}
 */
function hasListPrefix(lineText) {
  return /^(\d+\. |- \[[ xX]\] |- )/.test(lineText);
}

/**
 * Returns the current line prefix (heading, blockquote, list marker)
 * matched from a known set.
 * @param {string} lineText
 * @returns {{ prefix: string, rest: string }}
 */
function parseLinePrefix(lineText) {
  const headingMatch = lineText.match(/^(#{1,6} )/);
  if (headingMatch)
    return { prefix: headingMatch[1], rest: lineText.slice(headingMatch[1].length) };

  if (lineText.startsWith(`> `)) return { prefix: `> `, rest: lineText.slice(2) };

  const listMatch = lineText.match(/^(\d+\. |- \[[ xX]\] |- )/);
  if (listMatch) return { prefix: listMatch[1], rest: lineText.slice(listMatch[1].length) };

  return { prefix: ``, rest: lineText };
}

/**
 * Replaces text in a textarea using execCommand so the edit
 * participates in the browser's native undo/redo stack.
 * @param {HTMLTextAreaElement} textarea
 * @param {number} replaceStart - Start of region to replace
 * @param {number} replaceEnd - End of region to replace
 * @param {string} replacement - New text
 * @param {number} cursorStart - New selectionStart
 * @param {number} cursorEnd - New selectionEnd
 */
function applyTextareaEdit(
  textarea,
  replaceStart,
  replaceEnd,
  replacement,
  cursorStart,
  cursorEnd,
) {
  textarea.focus();
  textarea.selectionStart = replaceStart;
  textarea.selectionEnd = replaceEnd;
  const ok = document.execCommand(`insertText`, false, replacement);
  if (!ok) {
    const before = textarea.value.substring(0, replaceStart);
    const after = textarea.value.substring(replaceEnd);
    textarea.value = before + replacement + after;
  }
  textarea.selectionStart = cursorStart;
  textarea.selectionEnd = cursorEnd;
}

/**
 * Formatter that operates on the textarea's text and selection directly.
 * Used for `source2` view mode.
 * @implements {Formatter}
 */
export class Source2Formatter {
  /**
   * @param {import('../renderers/source-renderer-v2.js').SourceRendererV2} renderer
   */
  constructor(renderer) {
    /** @type {import('../renderers/source-renderer-v2.js').SourceRendererV2} */
    this.renderer = renderer;
    /** @type {number} */
    this.savedSelectionStart = 0;
    /** @type {number} */
    this.savedSelectionEnd = 0;
  }

  /**
   * Returns the textarea element.
   * @returns {HTMLTextAreaElement|null}
   */
  getTextarea() {
    return this.renderer.textarea;
  }

  /**
   * Saves the textarea's current cursor/selection position.
   * Call before opening a modal that will steal focus.
   */
  saveCursorPosition() {
    const textarea = this.getTextarea();
    if (!textarea) return;
    this.savedSelectionStart = textarea.selectionStart;
    this.savedSelectionEnd = textarea.selectionEnd;
  }

  /**
   * Restores the previously saved cursor/selection position.
   * Call after a modal closes, before performing an edit.
   */
  restoreCursorPosition() {
    const textarea = this.getTextarea();
    if (!textarea) return;
    textarea.focus();
    textarea.selectionStart = this.savedSelectionStart;
    textarea.selectionEnd = this.savedSelectionEnd;
  }

  /**
   * Applies an inline format to the current selection or cursor position.
   * @param {string} format
   */
  applyFormat(format) {
    const textarea = this.getTextarea();
    if (!textarea) return;

    const delims = INLINE_DELIMITERS[format];
    if (!delims) return;

    // Sub and sup are mutually exclusive: strip the opposite first.
    /** @type {Record<string, string>} */
    const EXCLUSIVE = { subscript: `superscript`, superscript: `subscript` };
    const opposite = EXCLUSIVE[format];
    if (opposite) {
      this.stripInlineFormat(textarea, INLINE_DELIMITERS[opposite]);
    }

    const { selectionStart, selectionEnd, value } = textarea;
    const hasSelection = selectionStart !== selectionEnd;

    if (hasSelection) {
      this.toggleInlineSelection(textarea, value, selectionStart, selectionEnd, delims);
    } else {
      this.toggleInlineCollapsed(textarea, value, selectionStart, delims);
    }
  }

  /**
   * Toggles inline formatting around a non-collapsed selection.
   * @param {HTMLTextAreaElement} textarea
   * @param {string} text
   * @param {number} start
   * @param {number} end
   * @param {{ open: string, close: string }} delims
   */
  toggleInlineSelection(textarea, text, start, end, delims) {
    const { open, close } = delims;
    const beforeSel = text.substring(start - open.length, start);
    const afterSel = text.substring(end, end + close.length);

    if (beforeSel === open && afterSel === close) {
      applyTextareaEdit(
        textarea,
        start - open.length,
        end + close.length,
        text.substring(start, end),
        start - open.length,
        end - open.length,
      );
    } else {
      const selected = text.substring(start, end);
      const leadingSpace = /** @type {RegExpMatchArray} */ (selected.match(/^(\s*)/))[1];
      const trailingSpace = /** @type {RegExpMatchArray} */ (selected.match(/(\s*)$/))[1];
      const trimmed = selected.slice(
        leadingSpace.length,
        selected.length - trailingSpace.length || undefined,
      );
      const wrapped = leadingSpace + open + trimmed + close + trailingSpace;
      applyTextareaEdit(
        textarea,
        start,
        end,
        wrapped,
        start + leadingSpace.length + open.length,
        end + open.length - trailingSpace.length,
      );
    }
  }

  /**
   * Toggles inline formatting at a collapsed cursor position.
   * If the cursor is inside an existing formatted span, removes the delimiters.
   * If the cursor is on a word, wraps that word. Otherwise inserts empty
   * delimiters and places the cursor between them.
   * @param {HTMLTextAreaElement} textarea
   * @param {string} text
   * @param {number} pos
   * @param {{ open: string, close: string }} delims
   */
  toggleInlineCollapsed(textarea, text, pos, delims) {
    const { open, close } = delims;
    const beforeCursor = text.substring(Math.max(0, pos - open.length), pos);
    const afterCursor = text.substring(pos, pos + close.length);

    if (beforeCursor === open && afterCursor === close) {
      applyTextareaEdit(
        textarea,
        pos - open.length,
        pos + close.length,
        ``,
        pos - open.length,
        pos - open.length,
      );
      return;
    }

    const wordRange = this.getWordAtPosition(text, pos);
    if (wordRange) {
      const { start, end } = wordRange;

      // Check if the word is already wrapped with these delimiters.
      const beforeWord = text.substring(start - open.length, start);
      const afterWord = text.substring(end, end + close.length);
      if (beforeWord === open && afterWord === close) {
        // Toggle off: remove the delimiters around the word.
        const word = text.substring(start, end);
        applyTextareaEdit(
          textarea,
          start - open.length,
          end + close.length,
          word,
          pos - open.length,
          pos - open.length,
        );
      } else {
        const word = text.substring(start, end);
        const wrapped = open + word + close;
        applyTextareaEdit(textarea, start, end, wrapped, pos + open.length, pos + open.length);
      }
    } else {
      const insertion = open + close;
      applyTextareaEdit(textarea, pos, pos, insertion, pos + open.length, pos + open.length);
    }
  }

  /**
   * Strips an inline format around the current selection or cursor word
   * if present. Used to remove a mutually exclusive format before
   * applying a new one (e.g. remove sub before adding sup).
   * @param {HTMLTextAreaElement} textarea
   * @param {{ open: string, close: string }} delims
   */
  stripInlineFormat(textarea, delims) {
    const { open, close } = delims;
    const { selectionStart, selectionEnd, value } = textarea;

    if (selectionStart !== selectionEnd) {
      // Selection: check whether the delimiters wrap the selection.
      const before = value.substring(selectionStart - open.length, selectionStart);
      const after = value.substring(selectionEnd, selectionEnd + close.length);
      if (before === open && after === close) {
        const inner = value.substring(selectionStart, selectionEnd);
        applyTextareaEdit(
          textarea,
          selectionStart - open.length,
          selectionEnd + close.length,
          inner,
          selectionStart - open.length,
          selectionEnd - open.length,
        );
      }
    } else {
      // Collapsed cursor: look for delimiters around the word at the cursor.
      const wordRange = this.getWordAtPosition(value, selectionStart);
      if (!wordRange) return;

      const before = value.substring(wordRange.start - open.length, wordRange.start);
      const after = value.substring(wordRange.end, wordRange.end + close.length);
      if (before === open && after === close) {
        const word = value.substring(wordRange.start, wordRange.end);
        applyTextareaEdit(
          textarea,
          wordRange.start - open.length,
          wordRange.end + close.length,
          word,
          selectionStart - open.length,
          selectionStart - open.length,
        );
      }
    }
  }

  /**
   * Finds the word surrounding the given position using \b boundaries.
   * Returns null if the cursor is not on a word character.
   * @param {string} text
   * @param {number} pos
   * @returns {{ start: number, end: number } | null}
   */
  getWordAtPosition(text, pos) {
    if (pos >= text.length || /\W/.test(text[pos])) {
      if (pos === 0 || /\W/.test(text[pos - 1])) return null;
    }

    let start = pos;
    while (start > 0 && /\w/.test(text[start - 1])) start--;
    let end = pos;
    while (end < text.length && /\w/.test(text[end])) end++;

    return start < end ? { start, end } : null;
  }

  /**
   * Returns prefill data for the link modal based on the current
   * selection or word under the cursor.
   * @returns {Partial<LinkData>}
   */
  getLinkPrefill() {
    const textarea = this.getTextarea();
    if (!textarea) return {};

    const { selectionStart, selectionEnd, value } = textarea;

    if (selectionStart !== selectionEnd) {
      return { text: value.substring(selectionStart, selectionEnd) };
    }

    const wordRange = this.getWordAtPosition(value, selectionStart);
    if (wordRange) {
      return { text: value.substring(wordRange.start, wordRange.end) };
    }

    return {};
  }

  /**
   * Inserts a link at the current cursor position or replaces the
   * current selection / word under cursor with a markdown link.
   * @param {string} text - The link display text
   * @param {string} url - The link URL
   */
  insertOrUpdateLink(text, url) {
    const textarea = this.getTextarea();
    if (!textarea) return;

    const { selectionStart, selectionEnd, value } = textarea;
    const link = `[${text}](${url})`;

    if (selectionStart !== selectionEnd) {
      applyTextareaEdit(
        textarea,
        selectionStart,
        selectionEnd,
        link,
        selectionStart + link.length,
        selectionStart + link.length,
      );
    } else {
      const wordRange = this.getWordAtPosition(value, selectionStart);
      if (wordRange) {
        applyTextareaEdit(
          textarea,
          wordRange.start,
          wordRange.end,
          link,
          wordRange.start + link.length,
          wordRange.start + link.length,
        );
      } else {
        applyTextareaEdit(
          textarea,
          selectionStart,
          selectionStart,
          link,
          selectionStart + link.length,
          selectionStart + link.length,
        );
      }
    }
  }

  /**
   * Changes the block type of the current line (or first selected line
   * for headings).  For `paragraph`, handles multi-line selections so
   * that list items can be split out, inserting blank lines next to
   * adjacent list items.
   * @param {string} elementType
   */
  changeElementType(elementType) {
    const textarea = this.getTextarea();
    if (!textarea) return;

    if (elementType === `code-block`) {
      this.toggleCodeBlock(textarea);
      return;
    }

    const { selectionStart, selectionEnd, value } = textarea;

    if (elementType === `paragraph`) {
      const { rangeStart, rangeEnd } = getFullLineRange(value, selectionStart, selectionEnd);
      const regionText = value.substring(rangeStart, rangeEnd);
      const lines = regionText.split(`\n`);

      // Track how much the cursor position shifts due to prefix removal.
      let charsBefore = 0;
      let prefixRemoved = 0;
      const newLines = [];
      for (const line of lines) {
        const { prefix, rest } = parseLinePrefix(line);
        newLines.push(rest);
        const lineEnd = charsBefore + line.length;
        const cursorInRegion = selectionStart - rangeStart;
        if (lineEnd < cursorInRegion) {
          prefixRemoved += prefix.length;
        } else if (charsBefore <= cursorInRegion) {
          const cursorCol = cursorInRegion - charsBefore;
          prefixRemoved += Math.min(prefix.length, cursorCol);
        }
        charsBefore += line.length + 1;
      }

      let result = newLines.join(`\n\n`);

      const before = value.substring(0, rangeStart);
      const after = value.substring(rangeEnd);

      const prevLineMatch = before.match(/([^\n]*)\n$/);
      const prevLine = prevLineMatch ? prevLineMatch[1] : ``;

      const nextLineMatch = after.match(/^\n([^\n]*)/);
      const nextLine = nextLineMatch ? nextLineMatch[1] : ``;

      let leadingExtra = 0;
      if (prevLine && hasListPrefix(prevLine)) {
        result = `\n` + result;
        leadingExtra = 1;
      }
      if (nextLine && hasListPrefix(nextLine)) {
        result = result + `\n`;
      }

      // Account for extra blank lines inserted between former list items.
      // Each original \n becomes \n\n, adding (lines.length - 1) extra chars
      // for lines before the cursor.
      let extraNewlines = 0;
      let pos = 0;
      const cursorInRegion = selectionStart - rangeStart;
      for (let i = 0; i < lines.length - 1; i++) {
        pos += lines[i].length + 1;
        if (pos <= cursorInRegion) extraNewlines++;
      }

      const newCursorPos =
        rangeStart + leadingExtra + (selectionStart - rangeStart) - prefixRemoved + extraNewlines;
      applyTextareaEdit(textarea, rangeStart, rangeEnd, result, newCursorPos, newCursorPos);
      return;
    }

    // For non-paragraph block types (headings, blockquote), apply to first line only.
    const { lineStart, lineEnd } = getLineRange(value, selectionStart);
    const lineText = value.substring(lineStart, lineEnd);
    const { prefix: oldPrefix, rest } = parseLinePrefix(lineText);
    const newPrefix = BLOCK_PREFIXES[elementType] ?? ``;
    const newLine = newPrefix + rest;

    const cursorOffset = selectionStart - lineStart;
    const newCursorPos =
      lineStart + Math.max(0, cursorOffset - oldPrefix.length + newPrefix.length);

    applyTextareaEdit(textarea, lineStart, lineEnd, newLine, newCursorPos, newCursorPos);
  }

  /**
   * Toggles a code block fence around the current line or selection.
   * @param {HTMLTextAreaElement} textarea
   */
  toggleCodeBlock(textarea) {
    const { selectionStart, selectionEnd, value } = textarea;
    const { lineStart } = getLineRange(value, selectionStart);
    const { lineEnd } = getLineRange(value, selectionEnd);
    const selectedLines = value.substring(lineStart, lineEnd);

    const fenceOpen = `\`\`\`\n`;
    const fenceClose = `\n\`\`\``;

    const beforeStart = value.substring(Math.max(0, lineStart - fenceOpen.length), lineStart);
    const afterEnd = value.substring(lineEnd, lineEnd + fenceClose.length);

    if (beforeStart === fenceOpen && afterEnd === fenceClose) {
      applyTextareaEdit(
        textarea,
        lineStart - fenceOpen.length,
        lineEnd + fenceClose.length,
        selectedLines,
        lineStart - fenceOpen.length,
        lineEnd - fenceOpen.length,
      );
    } else {
      const wrapped = fenceOpen + selectedLines + fenceClose;
      applyTextareaEdit(
        textarea,
        lineStart,
        lineEnd,
        wrapped,
        lineStart + fenceOpen.length,
        lineEnd + fenceOpen.length,
      );
    }
  }

  /**
   * Toggles list formatting on selected lines.
   * When multiple lines are selected, each line is toggled.
   * Removing a list prefix inserts blank lines around the resulting
   * paragraph if adjacent lines are still list items.
   * @param {'unordered' | 'ordered' | 'checklist'} kind
   * @returns {Promise<void>}
   */
  async toggleList(kind) {
    const textarea = this.getTextarea();
    if (!textarea) return;

    const { selectionStart, selectionEnd, value } = textarea;
    const { rangeStart, rangeEnd } = getFullLineRange(value, selectionStart, selectionEnd);
    const regionText = value.substring(rangeStart, rangeEnd);
    const lines = regionText.split(`\n`);
    const targetPrefix = LIST_PREFIXES[kind];

    const nonEmptyLines = lines.filter((line) => line.trim() !== ``);

    const allMatch = nonEmptyLines.every((line) =>
      this.isListPrefix(parseLinePrefix(line).prefix, kind),
    );

    const newLines = [];
    for (let i = 0; i < lines.length; i++) {
      if (allMatch) {
        if (lines[i].trim() === ``) continue;
        newLines.push(parseLinePrefix(lines[i]).rest);
      } else {
        if (lines[i].trim() === ``) continue;
        newLines.push(targetPrefix + parseLinePrefix(lines[i]).rest);
      }
    }

    let result = newLines.join(`\n`);

    if (allMatch) {
      const before = value.substring(0, rangeStart);
      const after = value.substring(rangeEnd);
      const prevLine = before.endsWith(`\n`)
        ? before.substring(before.lastIndexOf(`\n`, before.length - 2) + 1, before.length - 1)
        : ``;
      const nextLineEnd = after.indexOf(`\n`);
      const nextLine = after.startsWith(`\n`)
        ? after.substring(1, nextLineEnd === -1 ? after.length : after.indexOf(`\n`, 1))
        : ``;

      if (prevLine && hasListPrefix(prevLine)) {
        result = `\n` + result;
      }
      if (nextLine && hasListPrefix(nextLine)) {
        result = result + `\n`;
      }
    }

    applyTextareaEdit(
      textarea,
      rangeStart,
      rangeEnd,
      result,
      rangeStart,
      rangeStart + result.length,
    );
  }

  /**
   * Checks whether a line prefix matches a given list kind.
   * @param {string} prefix
   * @param {'unordered' | 'ordered' | 'checklist'} kind
   * @returns {boolean}
   */
  isListPrefix(prefix, kind) {
    switch (kind) {
      case `unordered`:
        return prefix === `- `;
      case `ordered`:
        return /^\d+\. $/.test(prefix);
      case `checklist`:
        return /^- \[[ xX]\] $/.test(prefix);
      default:
        return false;
    }
  }

  /**
   * Inserts or updates an image at the cursor position.
   * @param {string} alt
   * @param {string} src
   * @param {string} href
   * @param {string} [style]
   */
  insertOrUpdateImage(alt, src, href, style = ``) {
    const textarea = this.getTextarea();
    if (!textarea) return;

    let markdown;
    if (style) {
      markdown = `<img src="${src}" alt="${alt}"${href ? ` href="${href}"` : ``} style="${style}">`;
    } else if (href) {
      markdown = `[![${alt}](${src})](${href})`;
    } else {
      markdown = `![${alt}](${src})`;
    }

    const { selectionStart, selectionEnd } = textarea;
    const cursorPos = selectionStart + 2;
    applyTextareaEdit(
      textarea,
      selectionStart,
      selectionEnd,
      markdown,
      cursorPos,
      cursorPos + alt.length,
    );
  }

  /**
   * Inserts or updates a table at the cursor position.
   * @param {TableData} tableData
   */
  insertOrUpdateTable(tableData) {
    const textarea = this.getTextarea();
    if (!textarea) return;

    const lines = [];
    for (let r = 0; r < tableData.cells.length; r++) {
      const row = tableData.cells[r].map((cell) => (/^Header \d+$/.test(cell) ? `` : cell));
      lines.push(`| ${row.join(` | `)} |`);
      if (r === 0) {
        lines.push(`| ${row.map(() => `---`).join(` | `)} |`);
      }
    }
    const markdown = lines.join(`\n`);

    const { selectionStart, selectionEnd } = textarea;
    const cursorPos = selectionStart + 2;
    applyTextareaEdit(textarea, selectionStart, selectionEnd, markdown, cursorPos, cursorPos);
  }
}
