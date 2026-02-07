/**
 * @fileoverview Unit tests for the MarkdownParser class.
 */

import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { MarkdownParser } from '../../../src/renderer/scripts/parser/markdown-parser.js';

describe('MarkdownParser', () => {
    /** @type {MarkdownParser} */
    let parser;

    beforeEach(() => {
        parser = new MarkdownParser();
    });

    describe('parse', () => {
        it('should return an empty tree for empty input', () => {
            const tree = parser.parse('');
            assert.strictEqual(tree.children.length, 0);
        });

        it('should parse a simple paragraph', () => {
            const tree = parser.parse('Hello, world!');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'paragraph');
            assert.strictEqual(tree.children[0].content, 'Hello, world!');
        });

        it('should parse multiple paragraphs', () => {
            const tree = parser.parse('First paragraph\n\nSecond paragraph');
            assert.strictEqual(tree.children.length, 2);
            assert.strictEqual(tree.children[0].type, 'paragraph');
            assert.strictEqual(tree.children[1].type, 'paragraph');
        });
    });

    describe('headings', () => {
        it('should parse heading level 1', () => {
            const tree = parser.parse('# Heading 1');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'heading1');
            assert.strictEqual(tree.children[0].content, 'Heading 1');
        });

        it('should parse heading level 2', () => {
            const tree = parser.parse('## Heading 2');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'heading2');
            assert.strictEqual(tree.children[0].content, 'Heading 2');
        });

        it('should parse heading level 3', () => {
            const tree = parser.parse('### Heading 3');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'heading3');
        });

        it('should parse heading level 4', () => {
            const tree = parser.parse('#### Heading 4');
            assert.strictEqual(tree.children[0].type, 'heading4');
        });

        it('should parse heading level 5', () => {
            const tree = parser.parse('##### Heading 5');
            assert.strictEqual(tree.children[0].type, 'heading5');
        });

        it('should parse heading level 6', () => {
            const tree = parser.parse('###### Heading 6');
            assert.strictEqual(tree.children[0].type, 'heading6');
        });

        it('should parse multiple headings', () => {
            const tree = parser.parse('# First\n## Second\n### Third');
            assert.strictEqual(tree.children.length, 3);
        });
    });

    describe('blockquotes', () => {
        it('should parse a blockquote', () => {
            const tree = parser.parse('> This is a quote');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'blockquote');
            assert.strictEqual(tree.children[0].content, 'This is a quote');
        });

        it('should parse multi-line blockquotes', () => {
            const tree = parser.parse('> Line 1\n> Line 2');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'blockquote');
            assert.ok(tree.children[0].content.includes('Line 1'));
            assert.ok(tree.children[0].content.includes('Line 2'));
        });
    });

    describe('code blocks', () => {
        it('should parse a code block', () => {
            const tree = parser.parse('```\ncode here\n```');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'code-block');
            assert.strictEqual(tree.children[0].content, 'code here');
        });

        it('should parse a code block with language', () => {
            const tree = parser.parse('```javascript\nconst x = 1;\n```');
            assert.strictEqual(tree.children[0].type, 'code-block');
            assert.strictEqual(tree.children[0].attributes.language, 'javascript');
        });
    });

    describe('lists', () => {
        it('should parse an unordered list item', () => {
            const tree = parser.parse('- Item 1');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'list-item');
            assert.strictEqual(tree.children[0].attributes.ordered, false);
        });

        it('should parse an ordered list item', () => {
            const tree = parser.parse('1. Item 1');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'list-item');
            assert.strictEqual(tree.children[0].attributes.ordered, true);
            assert.strictEqual(tree.children[0].attributes.number, 1);
        });

        it('should parse indented list items', () => {
            const tree = parser.parse('- Item 1\n  - Nested item');
            assert.strictEqual(tree.children.length, 2);
            assert.strictEqual(tree.children[1].attributes.indent, 1);
        });
    });

    describe('horizontal rules', () => {
        it('should parse horizontal rule with dashes', () => {
            const tree = parser.parse('---');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'horizontal-rule');
        });

        it('should parse horizontal rule with asterisks', () => {
            const tree = parser.parse('***');
            assert.strictEqual(tree.children[0].type, 'horizontal-rule');
        });

        it('should parse horizontal rule with underscores', () => {
            const tree = parser.parse('___');
            assert.strictEqual(tree.children[0].type, 'horizontal-rule');
        });
    });

    describe('tables', () => {
        it('should parse a simple table', () => {
            const markdown = '| A | B |\n|---|---|\n| 1 | 2 |';
            const tree = parser.parse(markdown);
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'table');
        });
    });

    describe('complex documents', () => {
        it('should parse a document with mixed elements', () => {
            const markdown = `# Title

This is a paragraph.

## Subtitle

> A quote

- List item 1
- List item 2

\`\`\`js
code
\`\`\``;
            const tree = parser.parse(markdown);
            assert.ok(tree.children.length >= 6);
        });
    });
});
