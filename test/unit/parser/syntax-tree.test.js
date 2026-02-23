/**
 * @fileoverview Unit tests for the SyntaxTree class.
 */

import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { SyntaxNode, SyntaxTree } from '../../../src/renderer/scripts/parser/syntax-tree.js';

describe('SyntaxNode', () => {
    describe('constructor', () => {
        it('should create a node with type and content', () => {
            const node = new SyntaxNode('paragraph', 'Hello');
            assert.strictEqual(node.type, 'paragraph');
            assert.strictEqual(node.content, 'Hello');
        });

        it('should generate a unique id', () => {
            const node1 = new SyntaxNode('paragraph', 'First');
            const node2 = new SyntaxNode('paragraph', 'Second');
            assert.notStrictEqual(node1.id, node2.id);
        });

        it('should build inline children for inline-containing types', () => {
            const node = new SyntaxNode('paragraph', 'Hello');
            assert.strictEqual(node.children.length, 1);
            assert.strictEqual(node.children[0].type, 'text');
            assert.strictEqual(node.children[0].content, 'Hello');
        });

        it('should initialize with empty children for non-inline types', () => {
            const node = new SyntaxNode('code-block', 'console.log()');
            assert.deepStrictEqual(node.children, []);
        });
    });

    describe('appendChild', () => {
        it('should add a child node', () => {
            const parent = new SyntaxNode('list', '');
            const child = new SyntaxNode('list-item', 'Item 1');
            parent.appendChild(child);
            assert.strictEqual(parent.children.length, 1);
            assert.strictEqual(parent.children[0], child);
        });

        it('should set the parent reference', () => {
            const parent = new SyntaxNode('list', '');
            const child = new SyntaxNode('list-item', 'Item 1');
            parent.appendChild(child);
            assert.strictEqual(child.parent, parent);
        });
    });

    describe('removeChild', () => {
        it('should remove a child node', () => {
            const parent = new SyntaxNode('list', '');
            const child = new SyntaxNode('list-item', 'Item 1');
            parent.appendChild(child);
            const result = parent.removeChild(child);
            assert.strictEqual(result, true);
            assert.strictEqual(parent.children.length, 0);
        });

        it('should return false if child not found', () => {
            const parent = new SyntaxNode('list', '');
            const notChild = new SyntaxNode('list-item', 'Item 1');
            const result = parent.removeChild(notChild);
            assert.strictEqual(result, false);
        });

        it('should clear the parent reference', () => {
            const parent = new SyntaxNode('list', '');
            const child = new SyntaxNode('list-item', 'Item 1');
            parent.appendChild(child);
            parent.removeChild(child);
            assert.strictEqual(child.parent, null);
        });
    });

    describe('toMarkdown', () => {
        it('should convert heading1 to markdown', () => {
            const node = new SyntaxNode('heading1', 'Title');
            assert.strictEqual(node.toMarkdown(), '# Title');
        });

        it('should convert heading2 to markdown', () => {
            const node = new SyntaxNode('heading2', 'Subtitle');
            assert.strictEqual(node.toMarkdown(), '## Subtitle');
        });

        it('should convert paragraph to markdown', () => {
            const node = new SyntaxNode('paragraph', 'Some text');
            assert.strictEqual(node.toMarkdown(), 'Some text');
        });

        it('should convert blockquote to markdown', () => {
            const node = new SyntaxNode('blockquote', 'Quote text');
            assert.strictEqual(node.toMarkdown(), '> Quote text');
        });

        it('should convert code-block to markdown', () => {
            const node = new SyntaxNode('code-block', 'const x = 1;');
            node.attributes = { language: 'javascript' };
            const expected = '```javascript\nconst x = 1;\n```';
            assert.strictEqual(node.toMarkdown(), expected);
        });

        it('should convert unordered list-item to markdown', () => {
            const node = new SyntaxNode('list-item', 'Item');
            node.attributes = { ordered: false, indent: 0 };
            assert.strictEqual(node.toMarkdown(), '- Item');
        });

        it('should convert ordered list-item to markdown', () => {
            const node = new SyntaxNode('list-item', 'Item');
            node.attributes = { ordered: true, number: 1, indent: 0 };
            assert.strictEqual(node.toMarkdown(), '1. Item');
        });

        it('should convert horizontal-rule to markdown', () => {
            const node = new SyntaxNode('horizontal-rule', '');
            assert.strictEqual(node.toMarkdown(), '---');
        });

        it('should convert bare image to markdown', () => {
            const node = new SyntaxNode('image', 'alt text');
            node.attributes = { alt: 'alt text', url: 'image.png' };
            assert.strictEqual(node.toMarkdown(), '![alt text](image.png)');
        });

        it('should convert linked image to markdown', () => {
            const node = new SyntaxNode('image', 'logo');
            node.attributes = { alt: 'logo', url: 'logo.png', href: 'https://example.com' };
            assert.strictEqual(node.toMarkdown(), '[![logo](logo.png)](https://example.com)');
        });
    });

    describe('clone', () => {
        it('should create a deep copy', () => {
            const node = new SyntaxNode('paragraph', 'Original');
            node.attributes = { language: 'javascript' };
            const cloned = node.clone();

            assert.notStrictEqual(cloned, node);
            assert.strictEqual(cloned.type, node.type);
            assert.strictEqual(cloned.content, node.content);
            assert.deepStrictEqual(cloned.attributes, node.attributes);
        });

        it('should clone children', () => {
            const parent = new SyntaxNode('list', '');
            const child = new SyntaxNode('list-item', 'Item');
            parent.appendChild(child);

            const cloned = parent.clone();
            assert.strictEqual(cloned.children.length, 1);
            assert.notStrictEqual(cloned.children[0], child);
        });
    });
});

describe('SyntaxTree', () => {
    /** @type {SyntaxTree} */
    let tree;

    beforeEach(() => {
        tree = new SyntaxTree();
    });

    describe('appendChild', () => {
        it('should add nodes to the tree', () => {
            const node = new SyntaxNode('paragraph', 'Hello');
            tree.appendChild(node);
            assert.strictEqual(tree.children.length, 1);
        });
    });

    describe('removeChild', () => {
        it('should remove nodes from the tree', () => {
            const node = new SyntaxNode('paragraph', 'Hello');
            tree.appendChild(node);
            const result = tree.removeChild(node);
            assert.strictEqual(result, true);
            assert.strictEqual(tree.children.length, 0);
        });
    });

    describe('findNodeById', () => {
        it('should find a node by id', () => {
            const node = new SyntaxNode('paragraph', 'Hello');
            tree.appendChild(node);
            const found = tree.findNodeById(node.id);
            assert.strictEqual(found, node);
        });

        it('should return null for unknown id', () => {
            const found = tree.findNodeById('unknown');
            assert.strictEqual(found, null);
        });
    });

    describe('findNodeAtPosition', () => {
        it('should find a node at a line position', () => {
            const node = new SyntaxNode('paragraph', 'Hello');
            node.startLine = 0;
            node.endLine = 0;
            tree.appendChild(node);

            const found = tree.findNodeAtPosition(0, 0);
            assert.strictEqual(found, node);
        });

        it('should return null for out-of-range position', () => {
            const node = new SyntaxNode('paragraph', 'Hello');
            node.startLine = 0;
            node.endLine = 0;
            tree.appendChild(node);

            const found = tree.findNodeAtPosition(5, 0);
            assert.strictEqual(found, null);
        });
    });

    describe('changeNodeType', () => {
        it('should change the type of a node', () => {
            const node = new SyntaxNode('paragraph', 'Hello');
            tree.appendChild(node);
            tree.changeNodeType(node, 'heading1');
            assert.strictEqual(node.type, 'heading1');
        });
    });

    describe('toMarkdown', () => {
        it('should convert tree to markdown', () => {
            tree.appendChild(new SyntaxNode('heading1', 'Title'));
            tree.appendChild(new SyntaxNode('paragraph', 'Content'));

            const markdown = tree.toMarkdown();
            assert.ok(markdown.includes('# Title'));
            assert.ok(markdown.includes('Content'));
        });
    });

    describe('getNodeCount', () => {
        it('should count all nodes including inline children', () => {
            tree.appendChild(new SyntaxNode('heading1', 'Title'));
            tree.appendChild(new SyntaxNode('paragraph', 'Content'));
            tree.appendChild(new SyntaxNode('paragraph', 'More'));

            // 3 block nodes + 3 inline text children = 6
            assert.strictEqual(tree.getNodeCount(), 6);
        });
    });

    describe('clone', () => {
        it('should create a deep copy of the tree', () => {
            tree.appendChild(new SyntaxNode('heading1', 'Title'));
            tree.appendChild(new SyntaxNode('paragraph', 'Content'));

            const cloned = tree.clone();
            assert.notStrictEqual(cloned, tree);
            assert.strictEqual(cloned.children.length, tree.children.length);
        });
    });
});

// ── toBareText ──────────────────────────────────────────────────────

describe('SyntaxNode.toBareText', () => {
    it('strips heading prefix', () => {
        const node = new SyntaxNode('heading2', 'Hello World');
        assert.strictEqual(node.toBareText(), 'Hello World');
    });

    it('strips inline bold/italic delimiters', () => {
        const node = new SyntaxNode('paragraph', 'some **bold** and *italic*');
        assert.strictEqual(node.toBareText(), 'some bold and italic');
    });

    it('strips inline code backticks but keeps content', () => {
        const node = new SyntaxNode('paragraph', 'use `const x = 1`');
        assert.strictEqual(node.toBareText(), 'use const x = 1');
    });

    it('strips strikethrough delimiters', () => {
        const node = new SyntaxNode('paragraph', 'some ~~deleted~~ text');
        assert.strictEqual(node.toBareText(), 'some deleted text');
    });

    it('strips HTML inline tags', () => {
        const node = new SyntaxNode('paragraph', 'x<sub>2</sub> + y<sup>3</sup>');
        assert.strictEqual(node.toBareText(), 'x2 + y3');
    });

    it('removes images entirely', () => {
        const node = new SyntaxNode('paragraph', 'before ![alt](img.png) after');
        assert.strictEqual(node.toBareText(), 'before  after');
    });

    it('keeps link text but drops URL', () => {
        const node = new SyntaxNode('paragraph', 'click [here](http://example.com) now');
        assert.strictEqual(node.toBareText(), 'click here now');
    });

    it('returns code-block content as-is', () => {
        const node = new SyntaxNode('code-block', 'const x = 1;\nconsole.log(x);');
        node.attributes.language = 'js';
        assert.strictEqual(node.toBareText(), 'const x = 1;\nconsole.log(x);');
    });

    it('returns empty string for image nodes', () => {
        const node = new SyntaxNode('image', '');
        node.attributes = { alt: 'photo', url: 'pic.png' };
        assert.strictEqual(node.toBareText(), '');
    });

    it('returns empty string for horizontal-rule', () => {
        const node = new SyntaxNode('horizontal-rule', '---');
        assert.strictEqual(node.toBareText(), '');
    });

    it('strips blockquote prefix', () => {
        const node = new SyntaxNode('blockquote', 'quoted text');
        assert.strictEqual(node.toBareText(), 'quoted text');
    });

    it('strips list-item marker', () => {
        const node = new SyntaxNode('list-item', 'item text');
        node.attributes = { indent: 0, ordered: false };
        assert.strictEqual(node.toBareText(), 'item text');
    });

    it('extracts table cell text and skips separator', () => {
        const node = new SyntaxNode('table', '| A | B |\n| --- | --- |\n| 1 | 2 |');
        const result = node.toBareText();
        assert.ok(result.includes('A'));
        assert.ok(result.includes('B'));
        assert.ok(result.includes('1'));
        assert.ok(result.includes('2'));
        assert.ok(!result.includes('---'));
    });

    it('handles html-block with children', () => {
        const container = new SyntaxNode('html-block', '');
        container.attributes = {
            tagName: 'details',
            openingTag: '<details>',
            closingTag: '</details>',
        };
        const child = new SyntaxNode('paragraph', 'inner **text**');
        container.appendChild(child);
        assert.strictEqual(container.toBareText(), 'inner text');
    });
});

describe('SyntaxTree.toBareText', () => {
    it('joins bare text of children with double newlines', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('heading1', 'Title'));
        tree.appendChild(new SyntaxNode('paragraph', 'Body'));
        assert.strictEqual(tree.toBareText(), 'Title\n\nBody');
    });

    it('skips nodes with empty bare text', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('heading1', 'Title'));
        const img = new SyntaxNode('image', '');
        img.attributes = { alt: 'x', url: 'y' };
        tree.appendChild(img);
        tree.appendChild(new SyntaxNode('paragraph', 'End'));
        assert.strictEqual(tree.toBareText(), 'Title\n\nEnd');
    });
});

describe('SyntaxTree.getPathToCursor', () => {
    it('returns null when treeCursor is null', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('paragraph', 'Hello'));
        tree.treeCursor = null;
        assert.strictEqual(tree.getPathToCursor(), null);
    });

    it('returns null when the cursor node is not in the tree', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('paragraph', 'Hello'));
        tree.treeCursor = { nodeId: 'nonexistent', offset: 0 };
        assert.strictEqual(tree.getPathToCursor(), null);
    });

    it('returns [childIndex, offset] for a top-level node', () => {
        const tree = new SyntaxTree();
        const n0 = new SyntaxNode('heading1', 'Title');
        const n1 = new SyntaxNode('paragraph', 'Body text');
        tree.appendChild(n0);
        tree.appendChild(n1);
        tree.treeCursor = { nodeId: n1.id, offset: 4 };
        assert.deepStrictEqual(tree.getPathToCursor(), [1, 4]);
    });

    it('returns [0, offset] for the first top-level node', () => {
        const tree = new SyntaxTree();
        const n0 = new SyntaxNode('heading1', 'Title');
        tree.appendChild(n0);
        tree.treeCursor = { nodeId: n0.id, offset: 0 };
        assert.deepStrictEqual(tree.getPathToCursor(), [0, 0]);
    });

    it('returns path through nested children', () => {
        const tree = new SyntaxTree();
        const container = new SyntaxNode('html-block', '');
        container.attributes = { tagName: 'details' };
        const child0 = new SyntaxNode('paragraph', 'summary');
        const child1 = new SyntaxNode('paragraph', 'detail text');
        container.appendChild(child0);
        container.appendChild(child1);
        tree.appendChild(new SyntaxNode('heading1', 'Title'));
        tree.appendChild(container);
        // cursor is at offset 6 in the 2nd child of the 2nd top-level node
        tree.treeCursor = { nodeId: child1.id, offset: 6 };
        assert.deepStrictEqual(tree.getPathToCursor(), [1, 1, 6]);
    });

    it('returns path for deeply nested node', () => {
        const tree = new SyntaxTree();
        const outer = new SyntaxNode('html-block', '');
        const inner = new SyntaxNode('html-block', '');
        const leaf = new SyntaxNode('paragraph', 'deep content');
        inner.appendChild(leaf);
        outer.appendChild(new SyntaxNode('paragraph', 'filler'));
        outer.appendChild(inner);
        tree.appendChild(outer);
        // path: outer is child 0, inner is child 1 of outer, leaf is child 0 of inner, offset 3
        tree.treeCursor = { nodeId: leaf.id, offset: 3 };
        assert.deepStrictEqual(tree.getPathToCursor(), [0, 1, 0, 3]);
    });

    it('returns offset 0 when cursor is at the start', () => {
        const tree = new SyntaxTree();
        const node = new SyntaxNode('paragraph', 'Hello');
        tree.appendChild(node);
        tree.treeCursor = { nodeId: node.id, offset: 0 };
        assert.deepStrictEqual(tree.getPathToCursor(), [0, 0]);
    });

    it('handles cursor at end of content', () => {
        const tree = new SyntaxTree();
        const node = new SyntaxNode('paragraph', 'Hello');
        tree.appendChild(node);
        tree.treeCursor = { nodeId: node.id, offset: 5 };
        assert.deepStrictEqual(tree.getPathToCursor(), [0, 5]);
    });
});

describe('SyntaxTree.setCursorPath', () => {
    it('sets treeCursor for a top-level node', () => {
        const tree = new SyntaxTree();
        const n0 = new SyntaxNode('heading1', 'Title');
        const n1 = new SyntaxNode('paragraph', 'Body');
        tree.appendChild(n0);
        tree.appendChild(n1);
        tree.setCursorPath([1, 3]);
        assert.ok(tree.treeCursor);
        assert.strictEqual(tree.treeCursor.nodeId, n1.id);
        assert.strictEqual(tree.treeCursor.offset, 3);
    });

    it('sets treeCursor for a nested node', () => {
        const tree = new SyntaxTree();
        const container = new SyntaxNode('html-block', '');
        const child0 = new SyntaxNode('paragraph', 'first');
        const child1 = new SyntaxNode('paragraph', 'second');
        container.appendChild(child0);
        container.appendChild(child1);
        tree.appendChild(container);
        tree.setCursorPath([0, 1, 4]);
        assert.ok(tree.treeCursor);
        assert.strictEqual(tree.treeCursor.nodeId, child1.id);
        assert.strictEqual(tree.treeCursor.offset, 4);
    });

    it('does nothing when path is null', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('paragraph', 'Hello'));
        tree.treeCursor = null;
        tree.setCursorPath(null);
        assert.strictEqual(tree.treeCursor, null);
    });

    it('does nothing when path is too short', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('paragraph', 'Hello'));
        tree.treeCursor = null;
        tree.setCursorPath([5]);
        assert.strictEqual(tree.treeCursor, null);
    });

    it('does nothing when child index is out of bounds', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('paragraph', 'Hello'));
        tree.treeCursor = null;
        tree.setCursorPath([99, 0]);
        assert.strictEqual(tree.treeCursor, null);
    });

    it('roundtrips with getPathToCursor', () => {
        const tree = new SyntaxTree();
        const container = new SyntaxNode('html-block', '');
        const child = new SyntaxNode('paragraph', 'inner text');
        container.appendChild(child);
        tree.appendChild(new SyntaxNode('heading1', 'Title'));
        tree.appendChild(container);

        tree.treeCursor = { nodeId: child.id, offset: 5 };
        const path = tree.getPathToCursor();
        assert.deepStrictEqual(path, [1, 0, 5]);

        // Now reset and restore via setCursorPath
        tree.treeCursor = null;
        tree.setCursorPath(path);
        /** @type {any} */
        const restored = tree.treeCursor;
        assert.ok(restored);
        assert.strictEqual(restored.nodeId, child.id);
        assert.strictEqual(restored.offset, 5);
    });
});
