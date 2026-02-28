/**
 * @fileoverview Unit tests for ClipboardHandler static helpers.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ClipboardHandler } from '../../../src/renderer/scripts/editor/clipboard-handler.js';
import { SyntaxNode } from '../../../src/renderer/scripts/parser/syntax-tree.js';

// ── _fixHtmlTags ───────────────────────────────────────────────────

describe('ClipboardHandler._fixHtmlTags', () => {
    it('returns the slice unchanged when there are no HTML tags', () => {
        assert.equal(ClipboardHandler._fixHtmlTags('hello world'), 'hello world');
    });

    it('returns the slice unchanged when all tags are balanced', () => {
        assert.equal(
            ClipboardHandler._fixHtmlTags('<strong>bold</strong>'),
            '<strong>bold</strong>',
        );
    });

    it('appends a missing closing tag', () => {
        assert.equal(ClipboardHandler._fixHtmlTags('<strong>in'), '<strong>in</strong>');
    });

    it('prepends a missing opening tag', () => {
        assert.equal(ClipboardHandler._fixHtmlTags('nd</strong>'), '<strong>nd</strong>');
    });

    it('handles both missing opener and closer', () => {
        // Slice from the middle of <em>…</em> text <strong>…</strong>
        assert.equal(
            ClipboardHandler._fixHtmlTags('xt</em> and <strong>in'),
            '<em>xt</em> and <strong>in</strong>',
        );
    });

    it('handles nested tags', () => {
        assert.equal(
            ClipboardHandler._fixHtmlTags('<strong><em>text'),
            '<strong><em>text</em></strong>',
        );
    });

    it('handles empty string', () => {
        assert.equal(ClipboardHandler._fixHtmlTags(''), '');
    });

    it('preserves self-contained tags amid unmatched ones', () => {
        assert.equal(
            ClipboardHandler._fixHtmlTags('text</sub> and <sup>more'),
            '<sub>text</sub> and <sup>more</sup>',
        );
    });
});

// ── _nodeToPartialMarkdown ─────────────────────────────────────────

describe('ClipboardHandler._nodeToPartialMarkdown', () => {
    it('wraps heading1 content with # prefix', () => {
        const node = new SyntaxNode('heading1', 'full heading');
        assert.equal(ClipboardHandler._nodeToPartialMarkdown(node, 'ading'), '# ading');
    });

    it('wraps heading2 content with ## prefix', () => {
        const node = new SyntaxNode('heading2', 'full heading');
        assert.equal(ClipboardHandler._nodeToPartialMarkdown(node, 'partial'), '## partial');
    });

    it('returns paragraph content as-is', () => {
        const node = new SyntaxNode('paragraph', 'some text');
        assert.equal(ClipboardHandler._nodeToPartialMarkdown(node, 'me tex'), 'me tex');
    });

    it('wraps blockquote content with > prefix', () => {
        const node = new SyntaxNode('blockquote', 'quoted text');
        assert.equal(ClipboardHandler._nodeToPartialMarkdown(node, 'oted'), '> oted');
    });

    it('wraps unordered list-item with marker', () => {
        const node = new SyntaxNode('list-item', 'item text');
        node.attributes = { ordered: false, indent: 0 };
        assert.equal(ClipboardHandler._nodeToPartialMarkdown(node, 'item'), '- item');
    });

    it('wraps ordered list-item with number marker', () => {
        const node = new SyntaxNode('list-item', 'item text');
        node.attributes = { ordered: true, indent: 0, number: 3 };
        assert.equal(ClipboardHandler._nodeToPartialMarkdown(node, 'text'), '3. text');
    });

    it('wraps checklist item with checkbox prefix', () => {
        const node = new SyntaxNode('list-item', 'todo item');
        node.attributes = { ordered: false, indent: 0, checked: false };
        assert.equal(ClipboardHandler._nodeToPartialMarkdown(node, 'todo'), '- [ ] todo');
    });

    it('wraps indented list-item with indent spaces', () => {
        const node = new SyntaxNode('list-item', 'nested');
        node.attributes = { ordered: false, indent: 2 };
        assert.equal(ClipboardHandler._nodeToPartialMarkdown(node, 'nested'), '    - nested');
    });
});
