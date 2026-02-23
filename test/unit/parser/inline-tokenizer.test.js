/**
 * @fileoverview Unit tests for the inline tokenizer.
 */

// @ts-nocheck — test assertions access optional properties without guards

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    buildInlineTree,
    findMatchedTokenIndices,
    tokenizeInline,
} from '../../../src/renderer/scripts/parser/inline-tokenizer.js';

// ── tokenizeInline ──────────────────────────────────────────────────

describe('tokenizeInline', () => {
    it('returns plain text for a string with no markup', () => {
        const tokens = tokenizeInline('hello world');
        assert.deepStrictEqual(tokens, [{ type: 'text', raw: 'hello world' }]);
    });

    it('tokenizes **bold** markers', () => {
        const tokens = tokenizeInline('a **b** c');
        assert.equal(tokens.length, 5);
        assert.equal(tokens[0].type, 'text');
        assert.equal(tokens[1].type, 'bold-open');
        assert.equal(tokens[2].type, 'text');
        assert.equal(tokens[3].type, 'bold-close');
        assert.equal(tokens[4].type, 'text');
    });

    it('tokenizes *italic* markers', () => {
        const tokens = tokenizeInline('a *b* c');
        assert.equal(tokens[1].type, 'italic-open');
        assert.equal(tokens[3].type, 'italic-close');
    });

    it('tokenizes ***bold+italic*** as a single bold-italic open/close pair', () => {
        const tokens = tokenizeInline('a ***b*** c');
        assert.equal(tokens.length, 5);
        assert.equal(tokens[0].type, 'text');
        assert.equal(tokens[1].type, 'bold-italic-open');
        assert.equal(tokens[1].raw, '***');
        assert.equal(tokens[2].type, 'text');
        assert.equal(tokens[2].raw, 'b');
        assert.equal(tokens[3].type, 'bold-italic-close');
        assert.equal(tokens[3].raw, '***');
        assert.equal(tokens[4].type, 'text');
    });

    it('treats **** (four or more asterisks) as plain text', () => {
        const tokens = tokenizeInline('a **** b');
        assert.equal(tokens.length, 1);
        assert.equal(tokens[0].type, 'text');
        assert.equal(tokens[0].raw, 'a **** b');
    });

    it('treats ***** (five asterisks) as plain text', () => {
        const tokens = tokenizeInline('hello ***** world');
        assert.equal(tokens.length, 1);
        assert.equal(tokens[0].type, 'text');
        assert.equal(tokens[0].raw, 'hello ***** world');
    });

    it('tokenizes ~~strikethrough~~ markers', () => {
        const tokens = tokenizeInline('a ~~b~~ c');
        assert.equal(tokens[1].type, 'strikethrough-open');
        assert.equal(tokens[3].type, 'strikethrough-close');
    });

    it('tokenizes `code` spans', () => {
        const tokens = tokenizeInline('a `code` b');
        assert.equal(tokens.length, 3);
        assert.equal(tokens[1].type, 'code');
        assert.equal(tokens[1].content, 'code');
    });

    it('tokenizes [link](url) syntax', () => {
        const tokens = tokenizeInline('click [here](https://x.com) now');
        const linkOpen = tokens.find((t) => t.type === 'link-open');
        const linkClose = tokens.find((t) => t.type === 'link-close');
        assert.ok(linkOpen);
        assert.ok(linkClose);
        assert.equal(linkClose.href, 'https://x.com');
    });

    it('tokenizes ![alt](src) as an image token', () => {
        const tokens = tokenizeInline('see ![photo](./img.png) here');
        assert.equal(tokens.length, 3);
        assert.equal(tokens[0].type, 'text');
        assert.equal(tokens[0].raw, 'see ');
        assert.equal(tokens[1].type, 'image');
        assert.equal(tokens[1].raw, '![photo](./img.png)');
        assert.equal(tokens[1].alt, 'photo');
        assert.equal(tokens[1].src, './img.png');
        assert.equal(tokens[2].type, 'text');
        assert.equal(tokens[2].raw, ' here');
    });

    it('tokenizes a standalone ![alt](src) image', () => {
        const tokens = tokenizeInline('![my image](path/to/img.jpg)');
        assert.equal(tokens.length, 1);
        assert.equal(tokens[0].type, 'image');
        assert.equal(tokens[0].alt, 'my image');
        assert.equal(tokens[0].src, 'path/to/img.jpg');
    });

    it('does not treat [link](url) without ! as an image', () => {
        const tokens = tokenizeInline('[click](https://x.com)');
        assert.equal(
            tokens.find((t) => t.type === 'image'),
            undefined,
        );
        assert.ok(tokens.find((t) => t.type === 'link-open'));
    });

    it('handles !! before [alt](src) — first ! is text', () => {
        const tokens = tokenizeInline('!![alt](src)');
        assert.equal(tokens.length, 2);
        assert.equal(tokens[0].type, 'text');
        assert.equal(tokens[0].raw, '!');
        assert.equal(tokens[1].type, 'image');
        assert.equal(tokens[1].alt, 'alt');
        assert.equal(tokens[1].src, 'src');
    });

    it('tokenizes <sub> and </sub> HTML tags', () => {
        const tokens = tokenizeInline('H<sub>2</sub>O');
        assert.equal(tokens.length, 5);
        assert.equal(tokens[0].type, 'text');
        assert.equal(tokens[0].raw, 'H');
        assert.equal(tokens[1].type, 'html-open');
        assert.equal(tokens[1].tag, 'sub');
        assert.equal(tokens[2].type, 'text');
        assert.equal(tokens[2].raw, '2');
        assert.equal(tokens[3].type, 'html-close');
        assert.equal(tokens[3].tag, 'sub');
        assert.equal(tokens[4].type, 'text');
        assert.equal(tokens[4].raw, 'O');
    });

    it('tokenizes <strong> and <em> HTML tags', () => {
        const tokens = tokenizeInline('<strong>bold</strong> and <em>italic</em>');
        const opens = tokens.filter((t) => t.type === 'html-open');
        const closes = tokens.filter((t) => t.type === 'html-close');
        assert.equal(opens.length, 2);
        assert.equal(closes.length, 2);
        assert.equal(opens[0].tag, 'strong');
        assert.equal(opens[1].tag, 'em');
    });

    it('ignores unknown HTML tags', () => {
        const tokens = tokenizeInline('a <span>b</span> c');
        // <span> is not in INLINE_HTML_TAGS, so it should be plain text
        assert.equal(tokens.length, 1);
        assert.equal(tokens[0].type, 'text');
    });
});

// ── buildInlineTree ─────────────────────────────────────────────────

describe('buildInlineTree', () => {
    it('builds a tree from bold tokens', () => {
        const tokens = tokenizeInline('a **b** c');
        const tree = buildInlineTree(tokens);
        assert.equal(tree.length, 3);
        assert.equal(tree[0].type, 'text');
        assert.equal(tree[1].type, 'bold');
        assert.equal(tree[1].children.length, 1);
        assert.equal(tree[1].children[0].text, 'b');
        assert.equal(tree[2].type, 'text');
    });

    it('builds a tree from HTML inline tags', () => {
        const tokens = tokenizeInline('H<sub>2</sub>O');
        const tree = buildInlineTree(tokens);
        assert.equal(tree.length, 3);
        assert.equal(tree[0].type, 'text');
        assert.equal(tree[0].text, 'H');
        assert.equal(tree[1].type, 'sub');
        assert.equal(tree[1].tag, 'sub');
        assert.equal(tree[1].children.length, 1);
        assert.equal(tree[1].children[0].text, '2');
        assert.equal(tree[2].type, 'text');
        assert.equal(tree[2].text, 'O');
    });

    it('handles nested markdown inside HTML tags', () => {
        const tokens = tokenizeInline('<strong>**nested** text</strong>');
        const tree = buildInlineTree(tokens);
        assert.equal(tree.length, 1);
        assert.equal(tree[0].type, 'strong');
        assert.equal(tree[0].children.length, 2);
        assert.equal(tree[0].children[0].type, 'bold');
        assert.equal(tree[0].children[1].type, 'text');
    });

    it('handles mixed markdown and HTML', () => {
        const tokens = tokenizeInline('**bold** and <sub>subscript</sub>');
        const tree = buildInlineTree(tokens);
        assert.equal(tree.length, 3);
        assert.equal(tree[0].type, 'bold');
        assert.equal(tree[1].type, 'text');
        assert.equal(tree[2].type, 'sub');
    });

    it('treats unmatched open as plain text', () => {
        const tokens = tokenizeInline('a **b c');
        const tree = buildInlineTree(tokens);
        // ** is unmatched, so it becomes text
        assert.ok(tree.every((s) => s.type === 'text'));
    });

    it('treats unmatched close tag as plain text', () => {
        const tokens = tokenizeInline('text</sub>more');
        const tree = buildInlineTree(tokens);
        assert.ok(tree.every((s) => s.type === 'text'));
    });

    it('builds a link with children', () => {
        const tokens = tokenizeInline('[click **here**](https://x.com)');
        const tree = buildInlineTree(tokens);
        assert.equal(tree.length, 1);
        assert.equal(tree[0].type, 'link');
        assert.equal(tree[0].href, 'https://x.com');
        assert.equal(tree[0].children.length, 2);
        assert.equal(tree[0].children[0].type, 'text');
        assert.equal(tree[0].children[1].type, 'bold');
    });

    it('builds bold-italic segment from ***word***', () => {
        const tokens = tokenizeInline('test ***word*** end');
        const tree = buildInlineTree(tokens);
        assert.equal(tree.length, 3);
        assert.equal(tree[0].type, 'text');
        assert.equal(tree[0].text, 'test ');
        assert.equal(tree[1].type, 'bold-italic');
        assert.equal(tree[1].children.length, 1);
        assert.equal(tree[1].children[0].text, 'word');
        assert.equal(tree[2].type, 'text');
    });

    it('treats **** as plain text in tree', () => {
        const tokens = tokenizeInline('test **** end');
        const tree = buildInlineTree(tokens);
        assert.equal(tree.length, 1);
        assert.equal(tree[0].type, 'text');
        assert.equal(tree[0].text, 'test **** end');
    });

    it('builds an image segment from an image token', () => {
        const tokens = tokenizeInline('see ![photo](./img.png) here');
        const tree = buildInlineTree(tokens);
        assert.equal(tree.length, 3);
        assert.equal(tree[0].type, 'text');
        assert.equal(tree[1].type, 'image');
        assert.equal(tree[1].alt, 'photo');
        assert.equal(tree[1].src, './img.png');
        assert.equal(tree[2].type, 'text');
    });

    it('handles code spans (no nesting)', () => {
        const tokens = tokenizeInline('use `<sub>` for subscript');
        const tree = buildInlineTree(tokens);
        const codeNode = tree.find((s) => s.type === 'code');
        assert.ok(codeNode);
        assert.equal(codeNode.content, '<sub>');
    });
});

// ── findMatchedTokenIndices ─────────────────────────────────────────

describe('findMatchedTokenIndices', () => {
    it('returns empty set for plain text', () => {
        const tokens = tokenizeInline('hello world');
        const matched = findMatchedTokenIndices(tokens);
        assert.equal(matched.size, 0);
    });

    it('marks matched ** open/close as matched', () => {
        const tokens = tokenizeInline('a **b** c');
        const matched = findMatchedTokenIndices(tokens);
        // tokens: [text, bold-open, text, bold-close, text]
        assert.ok(matched.has(1)); // bold-open
        assert.ok(matched.has(3)); // bold-close
        assert.equal(matched.size, 2);
    });

    it('marks matched * open/close as matched', () => {
        const tokens = tokenizeInline('a *b* c');
        const matched = findMatchedTokenIndices(tokens);
        assert.ok(matched.has(1)); // italic-open
        assert.ok(matched.has(3)); // italic-close
        assert.equal(matched.size, 2);
    });

    it('marks matched ~~ open/close as matched', () => {
        const tokens = tokenizeInline('a ~~b~~ c');
        const matched = findMatchedTokenIndices(tokens);
        assert.ok(matched.has(1)); // strikethrough-open
        assert.ok(matched.has(3)); // strikethrough-close
        assert.equal(matched.size, 2);
    });

    it('marks matched HTML tags as matched', () => {
        const tokens = tokenizeInline('H<sub>2</sub>O');
        const matched = findMatchedTokenIndices(tokens);
        // tokens: [text, html-open, text, html-close, text]
        assert.ok(matched.has(1)); // html-open
        assert.ok(matched.has(3)); // html-close
        assert.equal(matched.size, 2);
    });

    it('returns empty set for unmatched *', () => {
        const tokens = tokenizeInline('this is a *');
        const matched = findMatchedTokenIndices(tokens);
        assert.equal(matched.size, 0);
    });

    it('returns empty set for unmatched ~~', () => {
        const tokens = tokenizeInline('this is a ~~');
        const matched = findMatchedTokenIndices(tokens);
        assert.equal(matched.size, 0);
    });

    it('returns empty set for unmatched <sub>', () => {
        const tokens = tokenizeInline('text <sub>');
        const matched = findMatchedTokenIndices(tokens);
        assert.equal(matched.size, 0);
    });

    it('handles mix of matched and unmatched', () => {
        // **bold** and * — ** pair is matched, lone * is not
        const tokens = tokenizeInline('**bold** and *');
        const matched = findMatchedTokenIndices(tokens);
        // tokens: [bold-open, text, bold-close, text, italic-open]
        assert.ok(matched.has(0)); // bold-open
        assert.ok(matched.has(2)); // bold-close
        assert.ok(!matched.has(4)); // italic-open (unmatched)
        assert.equal(matched.size, 2);
    });

    it('marks image tokens as matched', () => {
        const tokens = tokenizeInline('see ![photo](./img.png) here');
        const matched = findMatchedTokenIndices(tokens);
        // tokens: [text, image, text]
        assert.ok(matched.has(1)); // image
        assert.equal(matched.size, 1);
    });
});
