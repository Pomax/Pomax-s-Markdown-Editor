/**
 * @fileoverview Unit tests for cursor-persistence helpers.
 *
 * Verifies that cursorToAbsoluteOffset and absoluteOffsetToCursor form
 * a correct round-trip for various document structures.
 */

// @ts-nocheck — test assertions access optional properties without guards

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    absoluteOffsetToCursor,
    cursorToAbsoluteOffset,
} from '../../../src/renderer/scripts/editor/cursor-persistence.js';
import { SyntaxNode, SyntaxTree } from '../../../src/renderer/scripts/parser/syntax-tree.js';

/**
 * Mirrors Editor.getPrefixLength for use in tests.
 */
function getPrefixLength(type, attributes) {
    switch (type) {
        case 'heading1':
            return 2;
        case 'heading2':
            return 3;
        case 'heading3':
            return 4;
        case 'heading4':
            return 5;
        case 'heading5':
            return 6;
        case 'heading6':
            return 7;
        case 'blockquote':
            return 2;
        case 'list-item': {
            const indent = '  '.repeat(attributes?.indent || 0);
            const marker = attributes?.ordered ? `${attributes?.number || 1}. ` : '- ';
            return indent.length + marker.length;
        }
        default:
            return 0;
    }
}

/**
 * Mirrors Editor.buildMarkdownLine (only used by cursorToAbsoluteOffset
 * so we include a minimal stub).
 */
function buildMarkdownLine(type, content, attrs) {
    const node = new SyntaxNode(type, content);
    Object.assign(node.attributes, attrs);
    return node.toMarkdown();
}

// ── Helper to build a simple tree ───────────────────────────────────

function makeTree(...nodes) {
    const tree = new SyntaxTree();
    for (const node of nodes) {
        tree.appendChild(node);
    }
    return tree;
}

// ── cursorToAbsoluteOffset ──────────────────────────────────────────

describe('cursorToAbsoluteOffset', () => {
    it('computes offset for a single paragraph at position 0', () => {
        const p = new SyntaxNode('paragraph', 'Hello');
        const tree = makeTree(p);
        const cursor = { nodeId: p.id, offset: 0 };
        assert.equal(cursorToAbsoluteOffset(tree, cursor, buildMarkdownLine, getPrefixLength), 0);
    });

    it('computes offset within a single paragraph', () => {
        const p = new SyntaxNode('paragraph', 'Hello world');
        const tree = makeTree(p);
        const cursor = { nodeId: p.id, offset: 5 };
        // paragraph has prefix 0, so absolute offset = 0 + 0 + 5 = 5
        assert.equal(cursorToAbsoluteOffset(tree, cursor, buildMarkdownLine, getPrefixLength), 5);
    });

    it('computes offset for second paragraph (after \\n\\n separator)', () => {
        const p1 = new SyntaxNode('paragraph', 'Hello');
        const p2 = new SyntaxNode('paragraph', 'World');
        const tree = makeTree(p1, p2);
        const cursor = { nodeId: p2.id, offset: 0 };
        // "Hello" (5) + "\n\n" (2) = 7
        assert.equal(cursorToAbsoluteOffset(tree, cursor, buildMarkdownLine, getPrefixLength), 7);
    });

    it('computes offset for a heading (prefix accounts for # + space)', () => {
        const h = new SyntaxNode('heading2', 'Title');
        const tree = makeTree(h);
        const cursor = { nodeId: h.id, offset: 3 };
        // "## " prefix = 3, so absolute = 0 + 3 + 3 = 6
        assert.equal(cursorToAbsoluteOffset(tree, cursor, buildMarkdownLine, getPrefixLength), 6);
    });

    it('computes offset for a heading after a paragraph', () => {
        const p = new SyntaxNode('paragraph', 'Intro');
        const h = new SyntaxNode('heading1', 'Title');
        const tree = makeTree(p, h);
        const cursor = { nodeId: h.id, offset: 0 };
        // "Intro" (5) + "\n\n" (2) + "# " prefix (2) = 9
        // But prefix is added inside the function: pos=7, prefix=2, offset=0 → 9
        assert.equal(cursorToAbsoluteOffset(tree, cursor, buildMarkdownLine, getPrefixLength), 9);
    });

    it('returns -1 when node ID is not found', () => {
        const p = new SyntaxNode('paragraph', 'Hello');
        const tree = makeTree(p);
        const cursor = { nodeId: 'nonexistent', offset: 0 };
        assert.equal(cursorToAbsoluteOffset(tree, cursor, buildMarkdownLine, getPrefixLength), -1);
    });

    it('computes offset for a list item', () => {
        const li = new SyntaxNode('list-item', 'Item text');
        li.attributes = { ordered: false };
        const tree = makeTree(li);
        const cursor = { nodeId: li.id, offset: 4 };
        // "- " prefix = 2, so absolute = 0 + 2 + 4 = 6
        assert.equal(cursorToAbsoluteOffset(tree, cursor, buildMarkdownLine, getPrefixLength), 6);
    });
});

// ── absoluteOffsetToCursor ──────────────────────────────────────────

describe('absoluteOffsetToCursor', () => {
    it('resolves offset 0 to first node at offset 0', () => {
        const p = new SyntaxNode('paragraph', 'Hello');
        const tree = makeTree(p);
        const cursor = absoluteOffsetToCursor(tree, 0, getPrefixLength);
        assert.equal(cursor.nodeId, p.id);
        assert.equal(cursor.offset, 0);
    });

    it('resolves offset within a paragraph', () => {
        const p = new SyntaxNode('paragraph', 'Hello world');
        const tree = makeTree(p);
        const cursor = absoluteOffsetToCursor(tree, 5, getPrefixLength);
        assert.equal(cursor.nodeId, p.id);
        assert.equal(cursor.offset, 5);
    });

    it('resolves offset to second paragraph', () => {
        const p1 = new SyntaxNode('paragraph', 'Hello');
        const p2 = new SyntaxNode('paragraph', 'World');
        const tree = makeTree(p1, p2);
        // "Hello\n\nWorld" → offset 7 is start of "World"
        const cursor = absoluteOffsetToCursor(tree, 7, getPrefixLength);
        assert.equal(cursor.nodeId, p2.id);
        assert.equal(cursor.offset, 0);
    });

    it('resolves offset within a heading (skipping prefix)', () => {
        const h = new SyntaxNode('heading2', 'Title');
        const tree = makeTree(h);
        // "## Title" → offset 6 is 'l' in Title (prefix=3, in-content=3)
        const cursor = absoluteOffsetToCursor(tree, 6, getPrefixLength);
        assert.equal(cursor.nodeId, h.id);
        assert.equal(cursor.offset, 3);
    });

    it('clamps to end of content if offset is at node boundary', () => {
        const p = new SyntaxNode('paragraph', 'Hi');
        const tree = makeTree(p);
        // "Hi" length = 2 → offset 2 should be at end
        const cursor = absoluteOffsetToCursor(tree, 2, getPrefixLength);
        assert.equal(cursor.nodeId, p.id);
        assert.equal(cursor.offset, 2);
    });

    it('falls back to end of last node for large offset', () => {
        const p = new SyntaxNode('paragraph', 'Hello');
        const tree = makeTree(p);
        const cursor = absoluteOffsetToCursor(tree, 9999, getPrefixLength);
        assert.equal(cursor.nodeId, p.id);
        assert.equal(cursor.offset, 5);
    });

    it('returns null for empty tree', () => {
        const tree = makeTree();
        const cursor = absoluteOffsetToCursor(tree, 0, getPrefixLength);
        assert.equal(cursor, null);
    });
});

// ── Round-trip ──────────────────────────────────────────────────────

describe('cursor round-trip', () => {
    it('paragraph → offset → cursor preserves position', () => {
        const p1 = new SyntaxNode('paragraph', 'First paragraph');
        const p2 = new SyntaxNode('paragraph', 'Second one');
        const tree = makeTree(p1, p2);

        const originalCursor = { nodeId: p2.id, offset: 7 };
        const absOffset = cursorToAbsoluteOffset(
            tree,
            originalCursor,
            buildMarkdownLine,
            getPrefixLength,
        );

        const restored = absoluteOffsetToCursor(tree, absOffset, getPrefixLength);
        assert.equal(restored.nodeId, p2.id);
        assert.equal(restored.offset, 7);
    });

    it('heading → offset → cursor preserves position', () => {
        const p = new SyntaxNode('paragraph', 'Intro text');
        const h = new SyntaxNode('heading1', 'My Heading');
        const tree = makeTree(p, h);

        const originalCursor = { nodeId: h.id, offset: 3 };
        const absOffset = cursorToAbsoluteOffset(
            tree,
            originalCursor,
            buildMarkdownLine,
            getPrefixLength,
        );

        const restored = absoluteOffsetToCursor(tree, absOffset, getPrefixLength);
        assert.equal(restored.nodeId, h.id);
        assert.equal(restored.offset, 3);
    });

    it('list item → offset → cursor preserves position', () => {
        const li1 = new SyntaxNode('list-item', 'Buy milk');
        li1.attributes = { ordered: false };
        const li2 = new SyntaxNode('list-item', 'Walk dog');
        li2.attributes = { ordered: false };
        const tree = makeTree(li1, li2);

        const originalCursor = { nodeId: li2.id, offset: 4 };
        const absOffset = cursorToAbsoluteOffset(
            tree,
            originalCursor,
            buildMarkdownLine,
            getPrefixLength,
        );

        const restored = absoluteOffsetToCursor(tree, absOffset, getPrefixLength);
        assert.equal(restored.nodeId, li2.id);
        assert.equal(restored.offset, 4);
    });

    it('multi-type document round-trip', () => {
        const h = new SyntaxNode('heading1', 'Title');
        const p = new SyntaxNode('paragraph', 'Some text here');
        const li = new SyntaxNode('list-item', 'Item one');
        li.attributes = { ordered: true, number: 1 };
        const tree = makeTree(h, p, li);

        // Place cursor in list item at offset 5
        const originalCursor = { nodeId: li.id, offset: 5 };
        const absOffset = cursorToAbsoluteOffset(
            tree,
            originalCursor,
            buildMarkdownLine,
            getPrefixLength,
        );

        const restored = absoluteOffsetToCursor(tree, absOffset, getPrefixLength);
        assert.equal(restored.nodeId, li.id);
        assert.equal(restored.offset, 5);
    });
});
