/**
 * @fileoverview Offset mapping between raw markdown and rendered (visible) text.
 *
 * Uses the same tokenizer as FocusedRenderer.renderInlineParts() so
 * that offset mapping is always in sync with the rendered DOM.
 */

import { tokenizeInline } from '../parser/inline-tokenizer.js';

/**
 * Given a raw markdown string and an offset into that raw string,
 * returns the corresponding offset in the rendered (visible) text —
 * i.e. the text the user sees after inline formatting markers have been
 * hidden by renderInlineParts.
 *
 * Walks the flat token list produced by `tokenizeInline`.  Delimiter
 * tokens (bold-open, html-close, etc.) are invisible in the rendered
 * output, so they advance the raw position only.  Text tokens advance
 * both positions equally.  Code tokens skip the backtick delimiters.
 *
 * @param {string} content     - Raw markdown content of the node
 * @param {number} rawOffset   - Offset in the raw content
 * @returns {number}
 */
export function rawOffsetToRenderedOffset(content, rawOffset) {
    if (!content || rawOffset <= 0) return 0;

    const tokens = tokenizeInline(content);
    let rawPos = 0;
    let renderedPos = 0;

    for (const token of tokens) {
        const rawLen = token.raw.length;

        if (token.type === 'text') {
            // Visible text: raw length == rendered length.
            if (rawOffset <= rawPos + rawLen) {
                return renderedPos + (rawOffset - rawPos);
            }
            rawPos += rawLen;
            renderedPos += rawLen;
        } else if (token.type === 'code') {
            // Code span: `content` — backticks are invisible.
            const contentLen = token.content?.length ?? 0;
            const openDelim = 1;
            if (rawOffset <= rawPos + openDelim) {
                return renderedPos;
            }
            if (rawOffset <= rawPos + openDelim + contentLen) {
                return renderedPos + (rawOffset - rawPos - openDelim);
            }
            if (rawOffset < rawPos + rawLen) {
                return renderedPos + contentLen;
            }
            rawPos += rawLen;
            renderedPos += contentLen;
        } else {
            // Invisible delimiter (bold-open, html-close, link-open, etc.).
            if (rawOffset < rawPos + rawLen) {
                return renderedPos;
            }
            rawPos += rawLen;
        }
    }

    return renderedPos;
}

/**
 * Given a raw markdown string and an offset in the rendered (visible)
 * text, returns the corresponding offset in the raw string.
 *
 * Inverse of {@link rawOffsetToRenderedOffset}.
 *
 * @param {string} content          - Raw markdown content of the node
 * @param {number} renderedOffset   - Offset in the rendered text
 * @returns {number}
 */
export function renderedOffsetToRawOffset(content, renderedOffset) {
    if (!content || renderedOffset <= 0) return 0;

    const tokens = tokenizeInline(content);
    let rawPos = 0;
    let renderedPos = 0;

    for (const token of tokens) {
        const rawLen = token.raw.length;

        if (token.type === 'text') {
            if (renderedOffset <= renderedPos + rawLen) {
                return rawPos + (renderedOffset - renderedPos);
            }
            rawPos += rawLen;
            renderedPos += rawLen;
        } else if (token.type === 'code') {
            const contentLen = token.content?.length ?? 0;
            const openDelim = 1;
            if (renderedOffset < renderedPos + contentLen) {
                return rawPos + openDelim + (renderedOffset - renderedPos);
            }
            rawPos += rawLen;
            renderedPos += contentLen;
        } else {
            // Invisible delimiter — advance raw position only.
            rawPos += rawLen;
        }
    }

    return rawPos;
}
