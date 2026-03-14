/**
 * @fileoverview Inline tokenizer for markdown and HTML inline markup.
 *
 * Produces a flat list of tokens from a string containing mixed markdown
 * inline syntax (`**`, `*`, `_`, `__`, `~~`, `` ` ``, `[]()`) and HTML
 * inline tags (`<strong>`, `<em>`, `<sub>`, `<sup>`, etc.).
 *
 * The token list is consumed by {@link parseInlineContent} in
 * syntax-tree.js, which assembles it into SyntaxNode children.
 */

// ── Void HTML elements ──────────────────────────────────────────────

/** @type {Set<string>} */
const VOID_HTML_ELEMENTS = new Set([
    `area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`,
    `link`, `meta`, `param`, `source`, `track`, `wbr`,
]);

// ── HTML helpers ────────────────────────────────────────────────────

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
    const attrs = {};
    const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
    let m;
    while ((m = re.exec(str)) !== null) {
        attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? ``;
    }
    return attrs;
}

// ── Token types ─────────────────────────────────────────────────────

/**
 * @typedef {'text'|'bold-open'|'bold-close'|'italic-open'|'italic-close'
 *   |'bold-italic-open'|'bold-italic-close'
 *   |'strikethrough-open'|'strikethrough-close'|'code'
 *   |'link-open'|'link-close'|'link-href'
 *   |'image'
 *   |'html-open'|'html-close'|'html-void'} TokenType
 */

/**
 * @typedef {object} InlineToken
 * @property {TokenType} type
 * @property {string} raw      - The original source text of the token.
 * @property {string} [content] - Inner content (for code spans / text).
 * @property {string} [tag]     - HTML tag name (for html-open / html-close / html-void).
 * @property {Record<string, string>} [attrs] - HTML attributes (for html-open / html-void).
 * @property {string} [href]    - Link URL (for link-href).
 * @property {string} [alt]     - Alt text (for image tokens).
 * @property {string} [src]     - Image URL (for image tokens).
 */

// ── Tokenizer ───────────────────────────────────────────────────────

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

        // ── Backtick: inline code (no nesting) ──────────────────
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

        // ── **** or more: nonsense, treat as plain text ──────
        if (ch === `*` && input[i + 1] === `*` && input[i + 2] === `*` && input[i + 3] === `*`) {
            // Count the full run of asterisks and leave them as text
            let end = i + 4;
            while (end < input.length && input[end] === `*`) end++;
            // Don't flush — let the asterisks accumulate in the text span
            i = end;
            continue;
        }

        // ── *** bold+italic (single delimiter) ─────────────────
        if (ch === `*` && input[i + 1] === `*` && input[i + 2] === `*`) {
            flushText(i);
            const isClose = tokens.some(
                (t) =>
                    t.type === `bold-italic-open` &&
                    !tokens.some(
                        (u) =>
                            u.type === `bold-italic-close` && tokens.indexOf(u) > tokens.indexOf(t),
                    ),
            );
            tokens.push({ type: isClose ? `bold-italic-close` : `bold-italic-open`, raw: `***` });
            i += 3;
            textStart = i;
            continue;
        }

        // ── ** bold ─────────────────────────────────────────────
        if (ch === `*` && input[i + 1] === `*`) {
            // If *** is open, * and ** are just text — only *** can close it.
            const hasBoldItalicOpen = tokens.some(
                (t) =>
                    t.type === `bold-italic-open` &&
                    !tokens.some(
                        (u) =>
                            u.type === `bold-italic-close` && tokens.indexOf(u) > tokens.indexOf(t),
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
                    !tokens.some(
                        (u) => u.type === `bold-close` && tokens.indexOf(u) > tokens.indexOf(t),
                    ),
            );
            tokens.push({ type: isClose ? `bold-close` : `bold-open`, raw: `**` });
            i += 2;
            textStart = i;
            continue;
        }

        // ── __ double-underscore emphasis ────────────────────────
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

        // ── ~~ strikethrough ────────────────────────────────────
        if (ch === `~` && input[i + 1] === `~`) {
            flushText(i);
            const isClose = tokens.some(
                (t) =>
                    t.type === `strikethrough-open` &&
                    !tokens.some(
                        (u) =>
                            u.type === `strikethrough-close` &&
                            tokens.indexOf(u) > tokens.indexOf(t),
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

        // ── * single-star italic ────────────────────────────────
        if (ch === `*` && input[i + 1] !== `*`) {
            // If *** is open, * and ** are just text — only *** can close it.
            const hasBoldItalicOpen = tokens.some(
                (t) =>
                    t.type === `bold-italic-open` &&
                    !tokens.some(
                        (u) =>
                            u.type === `bold-italic-close` && tokens.indexOf(u) > tokens.indexOf(t),
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
                            u.type === `italic-close` &&
                            u.raw === `*` &&
                            tokens.indexOf(u) > tokens.indexOf(t),
                    ),
            );
            tokens.push({ type: isClose ? `italic-close` : `italic-open`, raw: `*` });
            i += 1;
            textStart = i;
            continue;
        }

        // ── _ single-underscore italic (word-boundary only) ─────
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
                                u.type === `italic-close` &&
                                u.raw === `_` &&
                                tokens.indexOf(u) > tokens.indexOf(t),
                        ),
                );
                tokens.push({ type: isClose ? `italic-close` : `italic-open`, raw: `_` });
                i += 1;
                textStart = i;
                continue;
            }
        }

        // ── ![alt](src) image or [text](href) link ─────────────
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

        // ── <tag> / </tag> / <tag /> HTML tags ──────────────────
        if (ch === `<`) {
            const closeAngle = findClosingAngle(input, i + 1);
            if (closeAngle !== -1) {
                const tagContent = input.slice(i + 1, closeAngle);
                // Closing tag: </tagname>
                const closeMatch = tagContent.match(/^\/([a-zA-Z][a-zA-Z0-9]*)$/);
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
                const openMatch = tagContent.match(/^([a-zA-Z][a-zA-Z0-9]*)([\s/].*)?$/);
                if (openMatch) {
                    const tagName = openMatch[1].toLowerCase();
                    const rest = (openMatch[2] || ``).trim();
                    const selfClosing = rest.endsWith(`/`);
                    const attrString = selfClosing ? rest.slice(0, -1).trim() : rest;
                    const attrs = attrString ? parseHTMLAttributes(attrString) : {};
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

        i++;
    }

    // Flush any remaining text.
    flushText(input.length);

    return tokens;
}
