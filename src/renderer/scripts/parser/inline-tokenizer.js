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

// ── Known inline HTML tags ──────────────────────────────────────────
//
// Adding support for a new inline HTML tag is a one-line change: just
// add the tag name to this set.

/** @type {Set<string>} */
const INLINE_HTML_TAGS = new Set(['strong', 'em', 'del', 's', 'sub', 'sup', 'mark', 'u', 'b', 'i']);

// ── Token types ─────────────────────────────────────────────────────

/**
 * @typedef {'text'|'bold-open'|'bold-close'|'italic-open'|'italic-close'
 *   |'strikethrough-open'|'strikethrough-close'|'code'
 *   |'link-open'|'link-close'|'link-href'
 *   |'image'
 *   |'html-open'|'html-close'} TokenType
 */

/**
 * @typedef {object} InlineToken
 * @property {TokenType} type
 * @property {string} raw      - The original source text of the token.
 * @property {string} [content] - Inner content (for code spans / text).
 * @property {string} [tag]     - HTML tag name (for html-open / html-close).
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
            tokens.push({ type: 'text', raw: input.slice(textStart, end) });
        }
    }

    while (i < input.length) {
        const ch = input[i];

        // ── Backtick: inline code (no nesting) ──────────────────
        if (ch === '`') {
            const close = input.indexOf('`', i + 1);
            if (close > i + 1) {
                flushText(i);
                const raw = input.slice(i, close + 1);
                tokens.push({ type: 'code', raw, content: input.slice(i + 1, close) });
                i = close + 1;
                textStart = i;
                continue;
            }
        }

        // ── ** bold ─────────────────────────────────────────────
        if (ch === '*' && input[i + 1] === '*') {
            flushText(i);
            // Determine open vs close: if we have an unclosed bold-open
            // on the stack, this is a close; otherwise it's an open.
            const isClose = tokens.some(
                (t) =>
                    t.type === 'bold-open' &&
                    !tokens.some(
                        (u) => u.type === 'bold-close' && tokens.indexOf(u) > tokens.indexOf(t),
                    ),
            );
            tokens.push({ type: isClose ? 'bold-close' : 'bold-open', raw: '**' });
            i += 2;
            textStart = i;
            continue;
        }

        // ── __ double-underscore emphasis ────────────────────────
        if (ch === '_' && input[i + 1] === '_') {
            // Only at word boundary
            const before = i > 0 ? input[i - 1] : ' ';
            const after = i + 2 < input.length ? input[i + 2] : ' ';
            if (/\W/.test(before) || /\W/.test(after)) {
                flushText(i);
                const isClose = tokens.some(
                    (t) =>
                        t.type === 'italic-open' &&
                        t.raw === '__' &&
                        !tokens.some(
                            (u) =>
                                u.type === 'italic-close' &&
                                u.raw === '__' &&
                                tokens.indexOf(u) > tokens.indexOf(t),
                        ),
                );
                tokens.push({ type: isClose ? 'italic-close' : 'italic-open', raw: '__' });
                i += 2;
                textStart = i;
                continue;
            }
        }

        // ── ~~ strikethrough ────────────────────────────────────
        if (ch === '~' && input[i + 1] === '~') {
            flushText(i);
            const isClose = tokens.some(
                (t) =>
                    t.type === 'strikethrough-open' &&
                    !tokens.some(
                        (u) =>
                            u.type === 'strikethrough-close' &&
                            tokens.indexOf(u) > tokens.indexOf(t),
                    ),
            );
            tokens.push({
                type: isClose ? 'strikethrough-close' : 'strikethrough-open',
                raw: '~~',
            });
            i += 2;
            textStart = i;
            continue;
        }

        // ── * single-star italic ────────────────────────────────
        if (ch === '*' && input[i + 1] !== '*') {
            flushText(i);
            const isClose = tokens.some(
                (t) =>
                    t.type === 'italic-open' &&
                    t.raw === '*' &&
                    !tokens.some(
                        (u) =>
                            u.type === 'italic-close' &&
                            u.raw === '*' &&
                            tokens.indexOf(u) > tokens.indexOf(t),
                    ),
            );
            tokens.push({ type: isClose ? 'italic-close' : 'italic-open', raw: '*' });
            i += 1;
            textStart = i;
            continue;
        }

        // ── _ single-underscore italic (word-boundary only) ─────
        if (ch === '_' && input[i + 1] !== '_') {
            const before = i > 0 ? input[i - 1] : ' ';
            const after = i + 1 < input.length ? input[i + 1] : ' ';
            if (/\W/.test(before) || /\W/.test(after)) {
                flushText(i);
                const isClose = tokens.some(
                    (t) =>
                        t.type === 'italic-open' &&
                        t.raw === '_' &&
                        !tokens.some(
                            (u) =>
                                u.type === 'italic-close' &&
                                u.raw === '_' &&
                                tokens.indexOf(u) > tokens.indexOf(t),
                        ),
                );
                tokens.push({ type: isClose ? 'italic-close' : 'italic-open', raw: '_' });
                i += 1;
                textStart = i;
                continue;
            }
        }

        // ── ![alt](src) image or [text](href) link ─────────────
        if (ch === '[') {
            // Check for image syntax: preceding '!' means this is ![alt](src)
            const isImage = i > 0 && input[i - 1] === '!';

            // Look ahead for ](href)
            const closeBracket = input.indexOf(']', i + 1);
            if (closeBracket !== -1 && input[closeBracket + 1] === '(') {
                const closeParen = input.indexOf(')', closeBracket + 2);
                if (closeParen !== -1) {
                    if (isImage) {
                        // Flush text up to (but not including) the '!'
                        flushText(i - 1);
                        const alt = input.slice(i + 1, closeBracket);
                        const src = input.slice(closeBracket + 2, closeParen);
                        tokens.push({
                            type: 'image',
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
                    tokens.push({ type: 'link-open', raw: '[' });
                    // Tokenize the link text recursively for nested formatting
                    const innerTokens = tokenizeInline(linkText);
                    for (const t of innerTokens) {
                        tokens.push(t);
                    }
                    tokens.push({ type: 'link-close', raw: `](${href})`, href });
                    i = closeParen + 1;
                    textStart = i;
                    continue;
                }
            }
        }

        // ── <tag> / </tag> HTML inline tags ──────────────────────
        if (ch === '<') {
            const closeAngle = input.indexOf('>', i + 1);
            if (closeAngle !== -1) {
                const tagContent = input.slice(i + 1, closeAngle);
                // Closing tag: </tagname>
                const closeMatch = tagContent.match(/^\/([a-zA-Z][a-zA-Z0-9]*)$/);
                if (closeMatch) {
                    const tagName = closeMatch[1].toLowerCase();
                    if (INLINE_HTML_TAGS.has(tagName)) {
                        flushText(i);
                        tokens.push({
                            type: 'html-close',
                            raw: input.slice(i, closeAngle + 1),
                            tag: tagName,
                        });
                        i = closeAngle + 1;
                        textStart = i;
                        continue;
                    }
                }
                // Opening tag: <tagname> (no attributes for inline tags)
                const openMatch = tagContent.match(/^([a-zA-Z][a-zA-Z0-9]*)$/);
                if (openMatch) {
                    const tagName = openMatch[1].toLowerCase();
                    if (INLINE_HTML_TAGS.has(tagName)) {
                        flushText(i);
                        tokens.push({
                            type: 'html-open',
                            raw: input.slice(i, closeAngle + 1),
                            tag: tagName,
                        });
                        i = closeAngle + 1;
                        textStart = i;
                        continue;
                    }
                }
            }
        }

        i++;
    }

    // Flush any remaining text.
    flushText(input.length);

    return tokens;
}

// ── Matched-delimiter analysis ───────────────────────────────────────

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

        if (token.type === 'text' || token.type === 'code') continue;

        // Image tokens are self-contained — always matched.
        if (token.type === 'image') {
            matched.add(i);
            continue;
        }

        // ── Markdown open tokens ────────────────────────────────
        if (CLOSE_TYPE_FOR[token.type]) {
            openStack.push({ closeType: CLOSE_TYPE_FOR[token.type], tokenIndex: i });
            continue;
        }

        // ── HTML open tags ──────────────────────────────────────
        if (token.type === 'html-open') {
            const tag = /** @type {string} */ (token.tag);
            openStack.push({ closeType: `html-close:${tag}`, tokenIndex: i });
            continue;
        }

        // ── Markdown close tokens ───────────────────────────────
        if (
            token.type === 'bold-close' ||
            token.type === 'italic-close' ||
            token.type === 'strikethrough-close'
        ) {
            const idx = _findOpenIdx(openStack, token.type);
            if (idx !== -1) {
                matched.add(openStack[idx].tokenIndex);
                matched.add(i);
                openStack.splice(idx);
            }
            continue;
        }

        // ── Link close ──────────────────────────────────────────
        if (token.type === 'link-close') {
            const idx = _findOpenIdx(openStack, 'link-close');
            if (idx !== -1) {
                matched.add(openStack[idx].tokenIndex);
                matched.add(i);
                openStack.splice(idx);
            }
            continue;
        }

        // ── HTML close tags ─────────────────────────────────────
        if (token.type === 'html-close') {
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

// ── Tree builder ────────────────────────────────────────────────────

/**
 * An inline segment: either plain text, a code span, or a formatted
 * container with children.
 *
 * @typedef {object} InlineSegment
 * @property {'text'|'code'|'image'|'bold'|'italic'|'strikethrough'|'link'|string} type
 * @property {string} [text]     - Plain text content (type === 'text').
 * @property {string} [content]  - Code content (type === 'code').
 * @property {string} [href]     - Link URL (type === 'link'). * @property {string} [alt]     - Alt text (type === 'image').
 * @property {string} [src]     - Image URL (type === 'image'). * @property {string} [tag]      - HTML tag name (for html inline elements).
 * @property {InlineSegment[]} [children] - Child segments for containers.
 */

/**
 * Map from open token type to the corresponding close token type.
 * @type {Record<string, string>}
 */
const CLOSE_TYPE_FOR = {
    'bold-open': 'bold-close',
    'italic-open': 'italic-close',
    'strikethrough-open': 'strikethrough-close',
    'link-open': 'link-close',
};

/**
 * Map from open token type to segment type.
 * @type {Record<string, string>}
 */
const SEGMENT_TYPE_FOR = {
    'bold-open': 'bold',
    'italic-open': 'italic',
    'strikethrough-open': 'strikethrough',
    'link-open': 'link',
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
     * @type {Array<{type: string, closeType: string, raw: string, href?: string, tag?: string}>}
     */
    const openStack = [];

    for (const token of tokens) {
        const current = stack[stack.length - 1];

        if (token.type === 'text') {
            current.push({ type: 'text', text: token.raw });
            continue;
        }

        if (token.type === 'code') {
            current.push({ type: 'code', content: token.content });
            continue;
        }

        if (token.type === 'image') {
            current.push({ type: 'image', alt: token.alt, src: token.src });
            continue;
        }

        // ── Markdown open tokens ────────────────────────────────
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

        // ── Markdown close tokens ───────────────────────────────
        if (
            token.type === 'bold-close' ||
            token.type === 'italic-close' ||
            token.type === 'strikethrough-close'
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
                current.push({ type: 'text', text: token.raw });
            }
            continue;
        }

        if (token.type === 'link-close') {
            const idx = findMatchingOpen(openStack, 'link-close');
            if (idx !== -1) {
                collapseStack(stack, openStack, idx);
                openStack.pop();
                const children = /** @type {InlineSegment[]} */ (stack.pop());
                const parent = stack[stack.length - 1];
                parent.push({ type: 'link', href: token.href, children });
            } else {
                current.push({ type: 'text', text: token.raw });
            }
            continue;
        }

        // ── HTML open tags ──────────────────────────────────────
        if (token.type === 'html-open') {
            const tag = /** @type {string} */ (token.tag);
            openStack.push({
                type: tag,
                closeType: `html-close:${tag}`,
                raw: token.raw,
                tag,
            });
            stack.push([]);
            continue;
        }

        // ── HTML close tags ─────────────────────────────────────
        if (token.type === 'html-close') {
            const tag = /** @type {string} */ (token.tag);
            const closeKey = `html-close:${tag}`;
            const idx = findMatchingOpen(openStack, closeKey);
            if (idx !== -1) {
                collapseStack(stack, openStack, idx);
                const meta = /** @type {{tag: string}} */ (openStack.pop());
                const children = /** @type {InlineSegment[]} */ (stack.pop());
                const parent = stack[stack.length - 1];
                parent.push({ type: meta.tag, tag: meta.tag, children });
            } else {
                // Unmatched close tag — emit as text
                current.push({ type: 'text', text: token.raw });
            }
        }
    }

    // Collapse any remaining unclosed opens as text
    while (openStack.length > 0) {
        const meta = /** @type {{raw: string}} */ (openStack.pop());
        const children = /** @type {InlineSegment[]} */ (stack.pop());
        const parent = stack[stack.length - 1];
        // Emit the open delimiter as text, then append children
        parent.push({ type: 'text', text: meta.raw });
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
        parent.push({ type: 'text', text: meta.raw });
        for (const child of children) {
            parent.push(child);
        }
    }
}
