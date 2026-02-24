/**
 * @fileoverview Unit tests for applyFormat with HTML inline tags.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SyntaxNode, SyntaxTree } from '../../../src/renderer/scripts/parser/syntax-tree.js';

describe('applyFormat with HTML tags', () => {
    /**
     * Helper: create a tree with a single paragraph node.
     * @param {string} content
     * @returns {{ tree: SyntaxTree, node: SyntaxNode }}
     */
    function setup(content) {
        const tree = new SyntaxTree();
        const node = new SyntaxNode('paragraph', content);
        tree.appendChild(node);
        return { tree, node };
    }

    it('should strip <strong> when bold format is toggled off with collapsed cursor', () => {
        const { tree, node } = setup(
            'It also tests <strong>strong</strong> and <em>emphasis</em> text.',
        );
        // Cursor inside "strong" text — raw offset 25 is inside the word "strong" after <strong>
        const newOffset = tree.applyFormat(node, 25, 25, 'bold');
        assert.strictEqual(node.content, 'It also tests strong and <em>emphasis</em> text.');
        console.log(
            'stripped <strong> result:',
            JSON.stringify(node.content),
            'newOffset:',
            newOffset,
        );
    });

    it('should strip <b> when bold format is toggled off with collapsed cursor', () => {
        const { tree, node } = setup('This is <b>bold tag</b> here.');
        const newOffset = tree.applyFormat(node, 12, 12, 'bold');
        assert.strictEqual(node.content, 'This is bold tag here.');
        console.log('stripped <b> result:', JSON.stringify(node.content), 'newOffset:', newOffset);
    });

    it('should strip <em> when italic format is toggled off with collapsed cursor', () => {
        const { tree, node } = setup('This is <em>emphasis text</em> here.');
        const newOffset = tree.applyFormat(node, 15, 15, 'italic');
        assert.strictEqual(node.content, 'This is emphasis text here.');
        console.log('stripped <em> result:', JSON.stringify(node.content), 'newOffset:', newOffset);
    });

    it('should strip <i> when italic format is toggled off with collapsed cursor', () => {
        const { tree, node } = setup('This is <i>italic tag</i> here.');
        const newOffset = tree.applyFormat(node, 13, 13, 'italic');
        assert.strictEqual(node.content, 'This is italic tag here.');
        console.log('stripped <i> result:', JSON.stringify(node.content), 'newOffset:', newOffset);
    });

    it('should strip <del> when strikethrough format is toggled off with collapsed cursor', () => {
        const { tree, node } = setup('This is <del>deleted text</del> here.');
        const newOffset = tree.applyFormat(node, 16, 16, 'strikethrough');
        assert.strictEqual(node.content, 'This is deleted text here.');
        console.log(
            'stripped <del> result:',
            JSON.stringify(node.content),
            'newOffset:',
            newOffset,
        );
    });

    it('should strip <s> when strikethrough format is toggled off with collapsed cursor', () => {
        const { tree, node } = setup('This is <s>struck tag</s> here.');
        const newOffset = tree.applyFormat(node, 13, 13, 'strikethrough');
        assert.strictEqual(node.content, 'This is struck tag here.');
        console.log('stripped <s> result:', JSON.stringify(node.content), 'newOffset:', newOffset);
    });
});
