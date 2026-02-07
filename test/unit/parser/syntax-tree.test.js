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

        it('should initialize with empty children array', () => {
            const node = new SyntaxNode('paragraph', 'Hello');
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
        it('should count all nodes', () => {
            tree.appendChild(new SyntaxNode('heading1', 'Title'));
            tree.appendChild(new SyntaxNode('paragraph', 'Content'));
            tree.appendChild(new SyntaxNode('paragraph', 'More'));

            assert.strictEqual(tree.getNodeCount(), 3);
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
