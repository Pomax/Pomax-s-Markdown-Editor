/**
 * @fileoverview Parses raw inline markdown into SyntaxNode children.
 *
 * Tokenizes the input via the inline tokenizer, then uses a stack to
 * pair open/close tokens into nested container nodes.  Unmatched
 * delimiters are emitted as plain text nodes.
 */

import { tokenizeInline } from './inline-tokenizer.js';
import { SyntaxNode } from '../syntax-tree/index.js';

// ── Token-type maps ─────────────────────────────────────────────────

/**
 * Map from open token type to the corresponding close token type.
 * @type {Record<string, string>}
 */
const CLOSE_TYPE_FOR = {
    'bold-open': 'bold-close',
    'italic-open': 'italic-close',
    'bold-italic-open': 'bold-italic-close',
    'strikethrough-open': 'strikethrough-close',
    'link-open': 'link-close',
};

/**
 * Map from open token type to SyntaxNode type.
 * @type {Record<string, string>}
 */
const NODE_TYPE_FOR = {
    'bold-open': 'bold',
    'italic-open': 'italic',
    'bold-italic-open': 'bold-italic',
    'strikethrough-open': 'strikethrough',
    'link-open': 'link',
};

// ── Parser ──────────────────────────────────────────────────────────

/**
 * Parses inline markdown content into an array of SyntaxNodes.
 *
 * Tokenizes the input, then uses a stack to pair open/close tokens
 * into nested container nodes. Unmatched delimiters are emitted as
 * plain text.
 *
 * @param {string} content - Raw inline markdown text.
 * @returns {SyntaxNode[]}
 */
export function parseInlineContent(content) {
    if (!content) return [];
    const tokens = tokenizeInline(content);

    /** @type {SyntaxNode[][]} */
    const stack = [[]]; // stack[0] is the root children list

    /**
     * Metadata for each open container on the stack.
     * @type {Array<{type: string, closeType: string, raw: string, href?: string, tag?: string}>}
     */
    const openStack = [];

    for (const token of tokens) {
        const current = stack[stack.length - 1];

        if (token.type === 'text') {
            current.push(new SyntaxNode('text', token.raw));
            continue;
        }

        if (token.type === 'code') {
            current.push(new SyntaxNode('inline-code', token.content));
            continue;
        }

        if (token.type === 'image') {
            const img = new SyntaxNode('inline-image', '');
            img.attributes.alt = token.alt ?? '';
            img.attributes.src = token.src ?? '';
            current.push(img);
            continue;
        }

        // ── Markdown open tokens ────────────────────────────────
        if (CLOSE_TYPE_FOR[token.type]) {
            openStack.push({
                type: NODE_TYPE_FOR[token.type],
                closeType: CLOSE_TYPE_FOR[token.type],
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
            token.type === 'bold-italic-close' ||
            token.type === 'strikethrough-close'
        ) {
            const idx = findMatchingOpen(openStack, token.type);
            if (idx !== -1) {
                collapseStack(stack, openStack, idx);
                const meta = openStack.pop();
                const children = stack.pop();
                const node = new SyntaxNode(meta.type, '');
                for (const child of children) node.appendChild(child);
                stack[stack.length - 1].push(node);
            } else {
                current.push(new SyntaxNode('text', token.raw));
            }
            continue;
        }

        if (token.type === 'link-close') {
            const idx = findMatchingOpen(openStack, 'link-close');
            if (idx !== -1) {
                collapseStack(stack, openStack, idx);
                openStack.pop();
                const children = stack.pop();
                const node = new SyntaxNode('link', '');
                node.attributes.href = token.href ?? '';
                for (const child of children) node.appendChild(child);
                stack[stack.length - 1].push(node);
            } else {
                current.push(new SyntaxNode('text', token.raw));
            }
            continue;
        }

        // ── HTML void/self-closing tags ─────────────────────────
        if (token.type === 'html-void') {
            const node = new SyntaxNode('html-element', '');
            node.tagName = /** @type {string} */ (token.tag);
            Object.assign(node.attributes, token.attrs || {});
            current.push(node);
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
                attrs: token.attrs || {},
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
                const meta = openStack.pop();
                const children = stack.pop();
                const node = new SyntaxNode('html-element', '');
                node.tagName = meta.tag;
                Object.assign(node.attributes, meta.attrs || {});
                for (const child of children) node.appendChild(child);
                stack[stack.length - 1].push(node);
            } else {
                current.push(new SyntaxNode('text', token.raw));
            }
        }
    }

    // Collapse any remaining unclosed opens as text
    while (openStack.length > 0) {
        const meta = openStack.pop();
        const children = stack.pop();
        const parent = stack[stack.length - 1];
        parent.push(new SyntaxNode('text', meta.raw));
        for (const child of children) {
            parent.push(child);
        }
    }

    return stack[0];
}

/**
 * Finds the index of the most recent matching open entry on the stack.
 * @param {Array<{closeType: string}>} openStack
 * @param {string} closeType
 * @returns {number}
 */
function findMatchingOpen(openStack, closeType) {
    for (let i = openStack.length - 1; i >= 0; i--) {
        if (openStack[i].closeType === closeType) return i;
    }
    return -1;
}

/**
 * Collapses unmatched opens between `targetIdx + 1` and the top of
 * the stack, converting them back to plain text nodes.
 * @param {SyntaxNode[][]} stack
 * @param {Array<{raw: string}>} openStack
 * @param {number} targetIdx
 */
function collapseStack(stack, openStack, targetIdx) {
    while (openStack.length - 1 > targetIdx) {
        const meta = openStack.pop();
        const children = stack.pop();
        const parent = stack[stack.length - 1];
        parent.push(new SyntaxNode('text', meta.raw));
        for (const child of children) {
            parent.push(child);
        }
    }
}
