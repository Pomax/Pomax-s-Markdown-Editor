/**
 * @fileoverview Unit tests for the word count logic.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SyntaxNode, SyntaxTree } from '../../../src/renderer/scripts/parser/syntax-tree.js';
import { getWordCounts } from '../../../src/renderer/scripts/word-count/word-count-modal.js';

describe('getWordCounts', () => {
    it('should return zeros for a null syntax tree', () => {
        const result = getWordCounts(null);
        assert.strictEqual(result.total, 0);
        assert.strictEqual(result.excludingCode, 0);
    });

    it('should return zeros for an empty tree', () => {
        const tree = new SyntaxTree();
        const result = getWordCounts(tree);
        assert.strictEqual(result.total, 0);
        assert.strictEqual(result.excludingCode, 0);
    });

    it('should count words in a simple paragraph', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('paragraph', 'hello world'));
        const result = getWordCounts(tree);
        assert.strictEqual(result.total, 2);
        assert.strictEqual(result.excludingCode, 2);
    });

    it('should count words across multiple nodes', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('heading1', 'Title'));
        tree.appendChild(new SyntaxNode('paragraph', 'one two three'));
        const result = getWordCounts(tree);
        assert.strictEqual(result.total, 4);
        assert.strictEqual(result.excludingCode, 4);
    });

    it('should count code-block words in total but not in excludingCode', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('paragraph', 'hello world'));
        const codeBlock = new SyntaxNode('code-block', 'const x = 1;');
        codeBlock.attributes = { language: 'js' };
        tree.appendChild(codeBlock);
        const result = getWordCounts(tree);
        assert.strictEqual(result.total, 6); // hello world const x = 1;
        assert.strictEqual(result.excludingCode, 2); // hello world
    });

    it('should strip inline code from excludingCode but keep it in total', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('paragraph', 'use `npm install` to install'));
        const result = getWordCounts(tree);
        assert.strictEqual(result.total, 5); // use npm install to install
        assert.strictEqual(result.excludingCode, 3); // use to install
    });

    it('should strip bold and italic markers', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('paragraph', '**bold** and *italic* text'));
        const result = getWordCounts(tree);
        assert.strictEqual(result.total, 4);
        assert.strictEqual(result.excludingCode, 4);
    });

    it('should count link text but not URL', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('paragraph', 'click [this link](https://example.com) now'));
        const result = getWordCounts(tree);
        assert.strictEqual(result.total, 4); // click this link now
        assert.strictEqual(result.excludingCode, 4);
    });

    it('should count image alt text but not URL', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('paragraph', 'see ![my photo](image.png) here'));
        const result = getWordCounts(tree);
        assert.strictEqual(result.total, 4); // see my photo here
        assert.strictEqual(result.excludingCode, 4);
    });

    it('should handle empty content nodes', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('paragraph', ''));
        tree.appendChild(new SyntaxNode('paragraph', '   '));
        const result = getWordCounts(tree);
        assert.strictEqual(result.total, 0);
        assert.strictEqual(result.excludingCode, 0);
    });

    it('should strip strikethrough markers', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('paragraph', '~~deleted~~ word'));
        const result = getWordCounts(tree);
        assert.strictEqual(result.total, 2);
        assert.strictEqual(result.excludingCode, 2);
    });
});
