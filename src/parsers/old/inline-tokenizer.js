/**
 * @fileoverview Inline tokenizer for markdown and HTML inline markup.
 *
 * Produces a flat list of tokens from a string containing mixed markdown
 * inline syntax (`**`, `*`, `_`, `__`, `~~`, `` ` ``, `[]()`) and HTML
 * inline tags (`<strong>`, `<em>`, `<sub>`, `<sup>`, etc.).
 *
 * The token list is then assembled into a tree of inline segments by
 * {@link buildInlineTree}, which a renderer can walk to produce DOM nodes.
 */

// Void HTML elements (self-closing, no closing tag needed)

/** @type {Set<string>} */
const VOID_HTML_ELEMENTS = new Set([
  `area`,
  `base`,
  `br`,
  `col`,
  `embed`,
  `hr`,
  `img`,
  `input`,
  `link`,
  `meta`,
  `param`,
  `source`,
  `track`,
  `wbr`,
]);

// HTML helpers

/**
 * Finds the closing '>' for a tag, skipping '>' inside quoted attributes.
 * @param {string} input
 * @param {number} start - Position after the '<'
 * @returns {number} Index of closing '>', or -1
 */
function findClosingAngle(input, start) {
  let inDouble = false;
  let inSingle = false;
  for (let j = start; j < input.length; j++) {
    const c = input[j];
    if (c === `"` && !inSingle) inDouble = !inDouble;
    else if (c === `'` && !inDouble) inSingle = !inSingle;
    else if (c === `>` && !inDouble && !inSingle) return j;
  }
  return -1;
}

/**
 * Parses HTML attribute key-value pairs from a string.
 * @param {string} str - e.g. 'src="x.png" alt="pic"'
 * @returns {Record<string, string>}
 */
function parseHTMLAttributes(str) {
  /** @type {Record<string, string>} */
  const attrs = {};
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? ``;
  }
  return attrs;
}

// HTML entity decoding

/**
 * Common named HTML entity map.
 * @type {Record<string, string>}
 */
const NAMED_ENTITIES = {
  amp: `&`,
  lt: `<`,
  gt: `>`,
  quot: `"`,
  apos: `'`,
  nbsp: `\u00A0`,
  ndash: `\u2013`,
  mdash: `\u2014`,
  lsquo: `\u2018`,
  rsquo: `\u2019`,
  ldquo: `\u201C`,
  rdquo: `\u201D`,
  bull: `\u2022`,
  hellip: `\u2026`,
  copy: `\u00A9`,
  reg: `\u00AE`,
  trade: `\u2122`,
  times: `\u00D7`,
  divide: `\u00F7`,
  laquo: `\u00AB`,
  raquo: `\u00BB`,
  cent: `\u00A2`,
  pound: `\u00A3`,
  yen: `\u00A5`,
  euro: `\u20AC`,
  deg: `\u00B0`,
  micro: `\u00B5`,
  para: `\u00B6`,
  middot: `\u00B7`,
  frac14: `\u00BC`,
  frac12: `\u00BD`,
  frac34: `\u00BE`,
  iexcl: `\u00A1`,
  iquest: `\u00BF`,
  sect: `\u00A7`,
  uml: `\u00A8`,
  macr: `\u00AF`,
  acute: `\u00B4`,
  cedil: `\u00B8`,
  ensp: `\u2002`,
  emsp: `\u2003`,
  thinsp: `\u2009`,
  zwnj: `\u200C`,
  zwj: `\u200D`,
  lrm: `\u200E`,
  rlm: `\u200F`,
};

/**
 * Decodes a single HTML entity reference to its character.
 * @param {string} raw - e.g. `&nbsp;`, `&#160;`, `&#x00A0;`
 * @returns {string} The decoded character, or the raw string if unrecognised.
 */
function decodeHTMLEntity(raw) {
  const inner = raw.slice(1, -1); // strip & and ;
  if (inner.startsWith(`#x`) || inner.startsWith(`#X`)) {
    const code = Number.parseInt(inner.slice(2), 16);
    return Number.isNaN(code) ? raw : String.fromCodePoint(code);
  }
  if (inner.startsWith(`#`)) {
    const code = Number.parseInt(inner.slice(1), 10);
    return Number.isNaN(code) ? raw : String.fromCodePoint(code);
  }
  return NAMED_ENTITIES[inner] ?? raw;
}

//  Tokenizer

/**
 * Tokenizes a string of inline markdown + HTML into a flat token list.
 *
 * @param {string} input
 * @returns {InlineToken[]}
 */
export function tokenizeInline(input) {
  /** @type {InlineToken[]} */
  const tokens = [];
  let i = 0;
  let textStart = 0;

  /** Flush accumulated plain text up to position `end`.
   * @param {number} end */
  function flushText(end) {
    if (end > textStart) {
      tokens.push({ type: `text`, raw: input.slice(textStart, end) });
    }
  }

  while (i < input.length) {
    const ch = input[i];

    //  Backtick: inline code (no nesting)
    if (ch === `\``) {
      const close = input.indexOf(`\``, i + 1);
      if (close > i + 1) {
        flushText(i);
        const raw = input.slice(i, close + 1);
        tokens.push({ type: `code`, raw, content: input.slice(i + 1, close) });
        i = close + 1;
        textStart = i;
        continue;
      }
    }

    //  **** or more: nonsense, treat as plain text
    if (ch === `*` && input[i + 1] === `*` && input[i + 2] === `*` && input[i + 3] === `*`) {
      // Count the full run of asterisks and leave them as text
      let end = i + 4;
      while (end < input.length && input[end] === `*`) end++;
      // Don't flush — let the asterisks accumulate in the text span
      i = end;
      continue;
    }

    //  *** bold+italic (single delimiter)
    if (ch === `*` && input[i + 1] === `*` && input[i + 2] === `*`) {
      flushText(i);
      const isClose = tokens.some(
        (t) =>
          t.type === `bold-italic-open` &&
          !tokens.some(
            (u) => u.type === `bold-italic-close` && tokens.indexOf(u) > tokens.indexOf(t),
          ),
      );
      tokens.push({ type: isClose ? `bold-italic-close` : `bold-italic-open`, raw: `***` });
      i += 3;
      textStart = i;
      continue;
    }

    //  ** bold
    if (ch === `*` && input[i + 1] === `*`) {
      // If *** is open, * and ** are just text — only *** can close it.
      const hasBoldItalicOpen = tokens.some(
        (t) =>
          t.type === `bold-italic-open` &&
          !tokens.some(
            (u) => u.type === `bold-italic-close` && tokens.indexOf(u) > tokens.indexOf(t),
          ),
      );
      if (hasBoldItalicOpen) {
        i++;
        continue;
      }
      flushText(i);
      // Determine open vs close: if we have an unclosed bold-open
      // on the stack, this is a close; otherwise it's an open.
      const isClose = tokens.some(
        (t) =>
          t.type === `bold-open` &&
          !tokens.some((u) => u.type === `bold-close` && tokens.indexOf(u) > tokens.indexOf(t)),
      );
      tokens.push({ type: isClose ? `bold-close` : `bold-open`, raw: `**` });
      i += 2;
      textStart = i;
      continue;
    }

    //  __ double-underscore emphasis
    if (ch === `_` && input[i + 1] === `_`) {
      // Only at word boundary
      const before = i > 0 ? input[i - 1] : ` `;
      const after = i + 2 < input.length ? input[i + 2] : ` `;
      if (/\W/.test(before) || /\W/.test(after)) {
        flushText(i);
        const isClose = tokens.some(
          (t) =>
            t.type === `italic-open` &&
            t.raw === `__` &&
            !tokens.some(
              (u) =>
                u.type === `italic-close` &&
                u.raw === `__` &&
                tokens.indexOf(u) > tokens.indexOf(t),
            ),
        );
        tokens.push({ type: isClose ? `italic-close` : `italic-open`, raw: `__` });
        i += 2;
        textStart = i;
        continue;
      }
    }

    //  ~~ strikethrough
    if (ch === `~` && input[i + 1] === `~`) {
      flushText(i);
      const isClose = tokens.some(
        (t) =>
          t.type === `strikethrough-open` &&
          !tokens.some(
            (u) => u.type === `strikethrough-close` && tokens.indexOf(u) > tokens.indexOf(t),
          ),
      );
      tokens.push({
        type: isClose ? `strikethrough-close` : `strikethrough-open`,
        raw: `~~`,
      });
      i += 2;
      textStart = i;
      continue;
    }

    //  * single-star italic
    if (ch === `*` && input[i + 1] !== `*`) {
      // If *** is open, * and ** are just text — only *** can close it.
      const hasBoldItalicOpen = tokens.some(
        (t) =>
          t.type === `bold-italic-open` &&
          !tokens.some(
            (u) => u.type === `bold-italic-close` && tokens.indexOf(u) > tokens.indexOf(t),
          ),
      );
      if (hasBoldItalicOpen) {
        i++;
        continue;
      }
      flushText(i);
      const isClose = tokens.some(
        (t) =>
          t.type === `italic-open` &&
          t.raw === `*` &&
          !tokens.some(
            (u) =>
              u.type === `italic-close` && u.raw === `*` && tokens.indexOf(u) > tokens.indexOf(t),
          ),
      );
      tokens.push({ type: isClose ? `italic-close` : `italic-open`, raw: `*` });
      i += 1;
      textStart = i;
      continue;
    }

    //  _ single-underscore italic (word-boundary only)
    if (ch === `_` && input[i + 1] !== `_`) {
      const before = i > 0 ? input[i - 1] : ` `;
      const after = i + 1 < input.length ? input[i + 1] : ` `;
      if (/\W/.test(before) || /\W/.test(after)) {
        flushText(i);
        const isClose = tokens.some(
          (t) =>
            t.type === `italic-open` &&
            t.raw === `_` &&
            !tokens.some(
              (u) =>
                u.type === `italic-close` && u.raw === `_` && tokens.indexOf(u) > tokens.indexOf(t),
            ),
        );
        tokens.push({ type: isClose ? `italic-close` : `italic-open`, raw: `_` });
        i += 1;
        textStart = i;
        continue;
      }
    }

    //  ![alt](src) image or [text](href) link
    if (ch === `[`) {
      // Check for image syntax: preceding '!' means this is ![alt](src)
      const isImage = i > 0 && input[i - 1] === `!`;

      // Look ahead for ](href)
      const closeBracket = input.indexOf(`]`, i + 1);
      if (closeBracket !== -1 && input[closeBracket + 1] === `(`) {
        const closeParen = input.indexOf(`)`, closeBracket + 2);
        if (closeParen !== -1) {
          if (isImage) {
            // Flush text up to (but not including) the '!'
            flushText(i - 1);
            const alt = input.slice(i + 1, closeBracket);
            const src = input.slice(closeBracket + 2, closeParen);
            tokens.push({
              type: `image`,
              raw: input.slice(i - 1, closeParen + 1),
              alt,
              src,
            });
            i = closeParen + 1;
            textStart = i;
            continue;
          }
          flushText(i);
          const linkText = input.slice(i + 1, closeBracket);
          const href = input.slice(closeBracket + 2, closeParen);
          tokens.push({ type: `link-open`, raw: `[` });
          // Tokenize the link text recursively for nested formatting
          const innerTokens = tokenizeInline(linkText);
          for (const t of innerTokens) {
            tokens.push(t);
          }
          tokens.push({ type: `link-close`, raw: `](${href})`, href });
          i = closeParen + 1;
          textStart = i;
          continue;
        }
      }
    }

    //  <tag> / </tag> / <tag /> HTML tags
    if (ch === `<`) {
      const closeAngle = findClosingAngle(input, i + 1);
      if (closeAngle !== -1) {
        const tagContent = input.slice(i + 1, closeAngle);
        // Closing tag: </tagname>
        const closeMatch = tagContent.match(/^\/([a-zA-Z][a-zA-Z0-9-]*)$/);
        if (closeMatch) {
          const tagName = closeMatch[1].toLowerCase();
          flushText(i);
          tokens.push({
            type: `html-close`,
            raw: input.slice(i, closeAngle + 1),
            tag: tagName,
          });
          i = closeAngle + 1;
          textStart = i;
          continue;
        }
        // Opening or void tag: <tagname ...> or <tagname ... />
        const openMatch = tagContent.match(/^([a-zA-Z][a-zA-Z0-9-]*)([\s/].*)?$/);
        if (openMatch) {
          const tagName = openMatch[1].toLowerCase();
          const rest = (openMatch[2] || ``).trim();
          const selfClosing = rest.endsWith(`/`);
          const attrString = selfClosing ? rest.slice(0, -1).trim() : rest;
          const attrs = attrString ? parseHTMLAttributes(attrString) : undefined;
          const isVoid = selfClosing || VOID_HTML_ELEMENTS.has(tagName);
          flushText(i);
          tokens.push({
            type: isVoid ? `html-void` : `html-open`,
            raw: input.slice(i, closeAngle + 1),
            tag: tagName,
            attrs,
          });
          i = closeAngle + 1;
          textStart = i;
          continue;
        }
      }
    }

    //  &entity; HTML entities
    if (ch === `&`) {
      const semi = input.indexOf(`;`, i + 1);
      if (semi !== -1 && semi - i <= 10) {
        const candidate = input.slice(i, semi + 1);
        if (/^&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);$/.test(candidate)) {
          flushText(i);
          tokens.push({ type: `html-entity`, raw: candidate });
          i = semi + 1;
          textStart = i;
          continue;
        }
      }
    }

    i++;
  }

  // Flush any remaining text.
  flushText(input.length);

  return tokens;
}

//  Matched-delimiter analysis

/**
 * Returns a Set of token indices whose delimiters are successfully
 * paired (open ↔ close) and will therefore be rendered as invisible
 * formatting wrappers by {@link buildInlineTree}.  Unmatched
 * delimiters are rendered as visible text, so offset-mapping must
 * treat them the same as text tokens.
 *
 * The pairing logic mirrors {@link buildInlineTree} exactly.
 *
 * @param {InlineToken[]} tokens
 * @returns {Set<number>}
 */
export function findMatchedTokenIndices(tokens) {
  /** @type {Set<number>} */
  const matched = new Set();

  /**
   * Stack tracking open delimiters.
   * @type {Array<{closeType: string, tokenIndex: number}>}
   */
  const openStack = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === `text` || token.type === `code`) continue;

    // Image and void HTML tokens are self-contained — always matched.
    if (token.type === `image` || token.type === `html-void` || token.type === `html-entity`) {
      matched.add(i);
      continue;
    }

    //  Markdown open tokens
    if (CLOSE_TYPE_FOR[token.type]) {
      openStack.push({ closeType: CLOSE_TYPE_FOR[token.type], tokenIndex: i });
      continue;
    }

    //  HTML open tags
    if (token.type === `html-open`) {
      const tag = /** @type {string} */ (token.tag);
      openStack.push({ closeType: `html-close:${tag}`, tokenIndex: i });
      continue;
    }

    //  Markdown close tokens
    if (
      token.type === `bold-close` ||
      token.type === `italic-close` ||
      token.type === `bold-italic-close` ||
      token.type === `strikethrough-close`
    ) {
      const idx = _findOpenIdx(openStack, token.type);
      if (idx !== -1) {
        matched.add(openStack[idx].tokenIndex);
        matched.add(i);
        openStack.splice(idx);
      }
      continue;
    }

    //  Link close
    if (token.type === `link-close`) {
      const idx = _findOpenIdx(openStack, `link-close`);
      if (idx !== -1) {
        matched.add(openStack[idx].tokenIndex);
        matched.add(i);
        openStack.splice(idx);
      }
      continue;
    }

    //  HTML close tags
    if (token.type === `html-close`) {
      const tag = /** @type {string} */ (token.tag);
      const closeKey = `html-close:${tag}`;
      const idx = _findOpenIdx(openStack, closeKey);
      if (idx !== -1) {
        matched.add(openStack[idx].tokenIndex);
        matched.add(i);
        openStack.splice(idx);
      }
    }
  }

  return matched;
}

/**
 * Finds the most recent entry on the open-stack whose closeType
 * matches the given value.
 *
 * @param {Array<{closeType: string}>} openStack
 * @param {string} closeType
 * @returns {number} Index into openStack, or -1
 */
function _findOpenIdx(openStack, closeType) {
  for (let i = openStack.length - 1; i >= 0; i--) {
    if (openStack[i].closeType === closeType) {
      return i;
    }
  }
  return -1;
}

//  Tree builder

/**
 * An inline segment: either plain text, a code span, or a formatted
 * container with children.
 */

/**
 * Map from open token type to the corresponding close token type.
 * @type {Record<string, string>}
 */
const CLOSE_TYPE_FOR = {
  'bold-open': `bold-close`,
  'italic-open': `italic-close`,
  'bold-italic-open': `bold-italic-close`,
  'strikethrough-open': `strikethrough-close`,
  'link-open': `link-close`,
};

/**
 * Map from open token type to segment type.
 * @type {Record<string, string>}
 */
const SEGMENT_TYPE_FOR = {
  'bold-open': `bold`,
  'italic-open': `italic`,
  'bold-italic-open': `bold-italic`,
  'strikethrough-open': `strikethrough`,
  'link-open': `link`,
};

/**
 * Builds a tree of inline segments from a flat token list.
 *
 * Uses a stack: when an open token is encountered, a new container is
 * pushed.  When the matching close is found, the container is popped
 * and appended to its parent.  Unmatched open/close tokens are emitted
 * as plain text.
 *
 * @param {InlineToken[]} tokens
 * @returns {InlineSegment[]}
 */
export function buildInlineTree(tokens) {
  /** @type {InlineSegment[][]} */
  const stack = [[]]; // stack[0] is the root children list

  /**
   * Metadata for each open container on the stack.
   * @type {Array<{type: string, closeType: string, raw: string, href?: string, tag?: string, attrs?: Record<string, string>}>}
   */
  const openStack = [];

  for (const token of tokens) {
    const current = stack[stack.length - 1];

    if (token.type === `text`) {
      current.push({ type: `text`, text: token.raw });
      continue;
    }

    if (token.type === `code`) {
      current.push({ type: `code`, content: token.content });
      continue;
    }

    if (token.type === `image`) {
      current.push({ type: `image`, alt: token.alt, src: token.src });
      continue;
    }

    if (token.type === `html-void`) {
      const tag = /** @type {string} */ (token.tag);
      current.push({ type: tag, tag, attrs: token.attrs });
      continue;
    }

    if (token.type === `html-entity`) {
      current.push({ type: `text`, text: decodeHTMLEntity(token.raw) });
      continue;
    }

    //  Markdown open tokens
    if (CLOSE_TYPE_FOR[token.type]) {
      const closeType = CLOSE_TYPE_FOR[token.type];
      const segType = SEGMENT_TYPE_FOR[token.type];
      openStack.push({
        type: segType,
        closeType,
        raw: token.raw,
        href: token.href,
      });
      stack.push([]);
      continue;
    }

    //  Markdown close tokens
    if (
      token.type === `bold-close` ||
      token.type === `italic-close` ||
      token.type === `bold-italic-close` ||
      token.type === `strikethrough-close`
    ) {
      // Find the matching open on the stack
      const idx = findMatchingOpen(openStack, token.type);
      if (idx !== -1) {
        // Pop everything from idx to top, collapsing unmatched opens
        collapseStack(stack, openStack, idx);
        const meta = /** @type {{type: string}} */ (openStack.pop());
        const children = /** @type {InlineSegment[]} */ (stack.pop());
        const parent = stack[stack.length - 1];
        parent.push({ type: meta.type, children });
      } else {
        // Unmatched close — emit as text
        current.push({ type: `text`, text: token.raw });
      }
      continue;
    }

    if (token.type === `link-close`) {
      const idx = findMatchingOpen(openStack, `link-close`);
      if (idx !== -1) {
        collapseStack(stack, openStack, idx);
        openStack.pop();
        const children = /** @type {InlineSegment[]} */ (stack.pop());
        const parent = stack[stack.length - 1];
        parent.push({ type: `link`, href: token.href, children });
      } else {
        current.push({ type: `text`, text: token.raw });
      }
      continue;
    }

    //  HTML open tags
    if (token.type === `html-open`) {
      const tag = /** @type {string} */ (token.tag);
      openStack.push({
        type: tag,
        closeType: `html-close:${tag}`,
        raw: token.raw,
        tag,
        attrs: token.attrs,
      });
      stack.push([]);
      continue;
    }

    //  HTML close tags
    if (token.type === `html-close`) {
      const tag = /** @type {string} */ (token.tag);
      const closeKey = `html-close:${tag}`;
      const idx = findMatchingOpen(openStack, closeKey);
      if (idx !== -1) {
        collapseStack(stack, openStack, idx);
        const meta = /** @type {{tag: string, attrs?: Record<string, string>}} */ (openStack.pop());
        const children = /** @type {InlineSegment[]} */ (stack.pop());
        const parent = stack[stack.length - 1];
        parent.push({ type: meta.tag, tag: meta.tag, attrs: meta.attrs, children });
      } else {
        // Unmatched close tag — emit as text
        current.push({ type: `text`, text: token.raw });
      }
    }
  }

  // Collapse any remaining unclosed opens as text
  while (openStack.length > 0) {
    const meta = /** @type {{raw: string}} */ (openStack.pop());
    const children = /** @type {InlineSegment[]} */ (stack.pop());
    const parent = stack[stack.length - 1];
    // Emit the open delimiter as text, then append children
    parent.push({ type: `text`, text: meta.raw });
    for (const child of children) {
      parent.push(child);
    }
  }

  return stack[0];
}

/**
 * Finds the index of the most recent matching open entry on the stack.
 *
 * @param {Array<{closeType: string}>} openStack
 * @param {string} closeType
 * @returns {number} Index into openStack, or -1
 */
function findMatchingOpen(openStack, closeType) {
  for (let i = openStack.length - 1; i >= 0; i--) {
    if (openStack[i].closeType === closeType) {
      return i;
    }
  }
  return -1;
}

/**
 * Collapses unmatched opens between `targetIdx + 1` and the top of the
 * stack, converting them back to plain text so they don't produce
 * phantom containers.
 *
 * @param {InlineSegment[][]} stack
 * @param {Array<{type: string, closeType: string, raw: string}>} openStack
 * @param {number} targetIdx
 */
function collapseStack(stack, openStack, targetIdx) {
  while (openStack.length - 1 > targetIdx) {
    const meta = /** @type {{raw: string}} */ (openStack.pop());
    const children = /** @type {InlineSegment[]} */ (stack.pop());
    const parent = stack[stack.length - 1];
    parent.push({ type: `text`, text: meta.raw });
    for (const child of children) {
      parent.push(child);
    }
  }
}
