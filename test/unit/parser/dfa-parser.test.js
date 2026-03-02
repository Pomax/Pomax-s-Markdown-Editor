/**
 * @fileoverview Unit tests for the DFA-based markdown parser.
 *
 * These tests verify that DFAParser produces the correct SyntaxTree
 * output for all supported markdown constructs.
 */

import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { DFAParser } from '../../../src/renderer/scripts/parser/dfa-parser.js';
import { tokenize } from '../../../src/renderer/scripts/parser/dfa-tokenizer.js';

// ── Tokenizer tests ─────────────────────────────────────────────────

describe('DFA Tokenizer', () => {
    it('should tokenize an empty string to just EOF', () => {
        const tokens = tokenize('');
        assert.strictEqual(tokens.length, 1);
        assert.strictEqual(tokens[0].type, 'EOF');
    });

    it('should tokenize plain text into a single TEXT token', () => {
        const tokens = tokenize('hello');
        assert.strictEqual(tokens.length, 2); // TEXT + EOF
        assert.strictEqual(tokens[0].type, 'TEXT');
        assert.strictEqual(tokens[0].value, 'hello');
    });

    it('should produce individual tokens for special characters', () => {
        const tokens = tokenize('# ');
        assert.strictEqual(tokens[0].type, 'HASH');
        assert.strictEqual(tokens[1].type, 'SPACE');
    });

    it('should tokenize newlines as NEWLINE tokens', () => {
        const tokens = tokenize('a\nb');
        assert.strictEqual(tokens.length, 4); // TEXT NEWLINE TEXT EOF
        assert.strictEqual(tokens[0].type, 'TEXT');
        assert.strictEqual(tokens[0].value, 'a');
        assert.strictEqual(tokens[1].type, 'NEWLINE');
        assert.strictEqual(tokens[2].type, 'TEXT');
        assert.strictEqual(tokens[2].value, 'b');
    });

    it('should tokenize digits as DIGIT tokens', () => {
        const tokens = tokenize('1');
        assert.strictEqual(tokens[0].type, 'DIGIT');
        assert.strictEqual(tokens[0].value, '1');
    });

    it('should tokenize a heading line into its component tokens', () => {
        const tokens = tokenize('## Hello');
        const types = tokens.map((t) => t.type);
        assert.deepStrictEqual(types, ['HASH', 'HASH', 'SPACE', 'TEXT', 'EOF']);
    });

    it('should tokenize backtick fences', () => {
        const tokens = tokenize('```js\ncode\n```');
        assert.strictEqual(tokens[0].type, 'BACKTICK');
        assert.strictEqual(tokens[1].type, 'BACKTICK');
        assert.strictEqual(tokens[2].type, 'BACKTICK');
        assert.strictEqual(tokens[3].type, 'TEXT');
        assert.strictEqual(tokens[3].value, 'js');
    });

    it('should tokenize HTML angle brackets', () => {
        const tokens = tokenize('<div>');
        assert.strictEqual(tokens[0].type, 'LT');
        assert.strictEqual(tokens[1].type, 'TEXT');
        assert.strictEqual(tokens[1].value, 'div');
        assert.strictEqual(tokens[2].type, 'GT');
    });

    it('should tokenize pipes for tables', () => {
        const tokens = tokenize('| a | b |');
        assert.strictEqual(tokens[0].type, 'PIPE');
    });
});

// ── Parser tests ────────────────────────────────────────────────────

describe('DFAParser', () => {
    /** @type {DFAParser} */
    let parser;

    beforeEach(() => {
        parser = new DFAParser();
    });

    // ── Basic parsing ───────────────────────────────────────────

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
            assert.strictEqual(tree.children[0].content, 'First paragraph');
            assert.strictEqual(tree.children[1].type, 'paragraph');
            assert.strictEqual(tree.children[1].content, 'Second paragraph');
        });
    });

    // ── Headings ────────────────────────────────────────────────

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
            assert.strictEqual(tree.children[0].type, 'heading1');
            assert.strictEqual(tree.children[1].type, 'heading2');
            assert.strictEqual(tree.children[2].type, 'heading3');
        });

        it('should preserve heading content with inline formatting', () => {
            const tree = parser.parse('## Hello **world**');
            assert.strictEqual(tree.children[0].content, 'Hello **world**');
        });
    });

    // ── Blockquotes ─────────────────────────────────────────────

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

    // ── Code blocks ─────────────────────────────────────────────

    describe('code blocks', () => {
        it('should parse a code block', () => {
            const tree = parser.parse('```\ncode here\n```');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'code-block');
            assert.strictEqual(tree.children[0].content, 'code here');
            assert.strictEqual(tree.children[0].attributes.fenceCount, 3);
        });

        it('should parse a code block with language', () => {
            const tree = parser.parse('```javascript\nconst x = 1;\n```');
            assert.strictEqual(tree.children[0].type, 'code-block');
            assert.strictEqual(tree.children[0].attributes.language, 'javascript');
            assert.strictEqual(tree.children[0].content, 'const x = 1;');
        });

        it('should parse a multi-line code block', () => {
            const tree = parser.parse('```\nline 1\nline 2\nline 3\n```');
            assert.strictEqual(tree.children[0].type, 'code-block');
            assert.strictEqual(tree.children[0].content, 'line 1\nline 2\nline 3');
        });

        it('should parse a code block with empty language', () => {
            const tree = parser.parse('```\nfoo\n```');
            assert.strictEqual(tree.children[0].attributes.language, '');
        });

        it('should preserve special characters inside code blocks', () => {
            const tree = parser.parse('```\n# not a heading\n> not a quote\n```');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'code-block');
            assert.ok(tree.children[0].content.includes('# not a heading'));
            assert.ok(tree.children[0].content.includes('> not a quote'));
        });

        it('should parse a four-backtick code fence', () => {
            const tree = parser.parse('````\ncode\n````');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'code-block');
            assert.strictEqual(tree.children[0].content, 'code');
            assert.strictEqual(tree.children[0].attributes.fenceCount, 4);
        });

        it('should parse a four-backtick fence with language', () => {
            const tree = parser.parse('````js\ncode\n````');
            assert.strictEqual(tree.children[0].type, 'code-block');
            assert.strictEqual(tree.children[0].attributes.language, 'js');
            assert.strictEqual(tree.children[0].attributes.fenceCount, 4);
        });

        it('should treat three backticks inside a four-backtick fence as literal text', () => {
            const tree = parser.parse('````\n```\nstill code\n```\n````');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'code-block');
            assert.strictEqual(tree.children[0].content, '```\nstill code\n```');
        });

        it('should require exact backtick count to close', () => {
            const tree = parser.parse('`````\n```\n````\nstill code\n`````');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'code-block');
            assert.strictEqual(tree.children[0].content, '```\n````\nstill code');
            assert.strictEqual(tree.children[0].attributes.fenceCount, 5);
        });

        it('should not treat backticks at EOF as a code fence', () => {
            const tree = parser.parse('```');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'paragraph');
        });

        it('should not treat backticks with language at EOF as a code fence', () => {
            const tree = parser.parse('```js');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'paragraph');
        });

        it('should round-trip a four-backtick code block', () => {
            const md = '````\ncode with ``` inside\n````';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('should round-trip a six-backtick code block', () => {
            const md = '``````\n````` inside\n``````';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('should parse text after a closed four-backtick fence', () => {
            const tree = parser.parse('````\ncode\n````\n\ntext after');
            assert.strictEqual(tree.children.length, 2);
            assert.strictEqual(tree.children[0].type, 'code-block');
            assert.strictEqual(tree.children[1].type, 'paragraph');
            assert.strictEqual(tree.children[1].content, 'text after');
        });

        // ── Issue #82 examples ──────────────────────────────────

        it('issue #82 example 1: four-backtick fence with nested three-backtick literal text', () => {
            const md =
                'This is a paragraph of text.\n\n````\ncode with ``` in it\nand more ``` here\n````\n\nAnd this is regular text again.';
            const tree = parser.parse(md);
            assert.strictEqual(tree.children.length, 3);
            assert.strictEqual(tree.children[0].type, 'paragraph');
            assert.strictEqual(tree.children[1].type, 'code-block');
            assert.strictEqual(tree.children[1].attributes.fenceCount, 4);
            assert.strictEqual(tree.children[1].content, 'code with ``` in it\nand more ``` here');
            assert.strictEqual(tree.children[2].type, 'paragraph');
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('issue #82 example 2: ten-backtick fence with nine-backtick literal text', () => {
            const md =
                'This is text\n\n``````````\nThis is code, with ````````` in it\n``````````\n\nBut this is text again.';
            const tree = parser.parse(md);
            assert.strictEqual(tree.children.length, 3);
            assert.strictEqual(tree.children[0].type, 'paragraph');
            assert.strictEqual(tree.children[1].type, 'code-block');
            assert.strictEqual(tree.children[1].attributes.fenceCount, 10);
            assert.strictEqual(tree.children[1].content, 'This is code, with ````````` in it');
            assert.strictEqual(tree.children[2].type, 'paragraph');
            assert.strictEqual(tree.toMarkdown(), md);
        });
    });

    // ── Lists ───────────────────────────────────────────────────

    describe('lists', () => {
        it('should parse an unordered list item with dash', () => {
            const tree = parser.parse('- Item 1');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'list-item');
            assert.strictEqual(tree.children[0].content, 'Item 1');
            assert.strictEqual(tree.children[0].attributes.ordered, false);
        });

        it('should parse an unordered list item with star', () => {
            const tree = parser.parse('* Item 1');
            assert.strictEqual(tree.children[0].type, 'list-item');
            assert.strictEqual(tree.children[0].attributes.ordered, false);
        });

        it('should parse an unordered list item with plus', () => {
            const tree = parser.parse('+ Item 1');
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

        it('should parse ordered list items with different numbers', () => {
            const tree = parser.parse('3. Third item');
            assert.strictEqual(tree.children[0].attributes.number, 3);
        });

        it('should parse indented list items', () => {
            const tree = parser.parse('- Item 1\n  - Nested item');
            assert.strictEqual(tree.children.length, 2);
            assert.strictEqual(tree.children[0].attributes.indent, 0);
            assert.strictEqual(tree.children[1].attributes.indent, 1);
        });

        it('should parse multiple list items', () => {
            const tree = parser.parse('- One\n- Two\n- Three');
            assert.strictEqual(tree.children.length, 3);
            for (const child of tree.children) {
                assert.strictEqual(child.type, 'list-item');
            }
        });

        it('should parse an unchecked checklist item', () => {
            const tree = parser.parse('- [ ] Task');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'list-item');
            assert.strictEqual(tree.children[0].content, 'Task');
            assert.strictEqual(tree.children[0].attributes.ordered, false);
            assert.strictEqual(tree.children[0].attributes.checked, false);
        });

        it('should parse a checked checklist item with lowercase x', () => {
            const tree = parser.parse('- [x] Done');
            assert.strictEqual(tree.children[0].content, 'Done');
            assert.strictEqual(tree.children[0].attributes.checked, true);
        });

        it('should parse a checked checklist item with uppercase X', () => {
            const tree = parser.parse('- [X] Done');
            assert.strictEqual(tree.children[0].content, 'Done');
            assert.strictEqual(tree.children[0].attributes.checked, true);
        });

        it('should parse checklist items with star marker', () => {
            const tree = parser.parse('* [ ] Star task');
            assert.strictEqual(tree.children[0].type, 'list-item');
            assert.strictEqual(tree.children[0].content, 'Star task');
            assert.strictEqual(tree.children[0].attributes.checked, false);
        });

        it('should parse indented checklist items', () => {
            const tree = parser.parse('- [ ] Top\n  - [x] Nested');
            assert.strictEqual(tree.children.length, 2);
            assert.strictEqual(tree.children[0].attributes.indent, 0);
            assert.strictEqual(tree.children[0].attributes.checked, false);
            assert.strictEqual(tree.children[1].attributes.indent, 1);
            assert.strictEqual(tree.children[1].attributes.checked, true);
        });

        it('should roundtrip checklist items through toMarkdown', () => {
            const tree = parser.parse('- [ ] Unchecked\n- [x] Checked');
            assert.strictEqual(tree.children[0].toMarkdown(), '- [ ] Unchecked');
            assert.strictEqual(tree.children[1].toMarkdown(), '- [x] Checked');
        });

        it('should not treat regular list items as checklists', () => {
            const tree = parser.parse('- Regular item');
            assert.strictEqual(tree.children[0].attributes.checked, undefined);
        });
    });

    // ── Horizontal rules ────────────────────────────────────────

    describe('horizontal rules', () => {
        it('should parse horizontal rule with dashes', () => {
            const tree = parser.parse('---\n');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'horizontal-rule');
        });

        it('should parse horizontal rule with asterisks', () => {
            const tree = parser.parse('***\n');
            assert.strictEqual(tree.children[0].type, 'horizontal-rule');
        });

        it('should parse horizontal rule with underscores', () => {
            const tree = parser.parse('___\n');
            assert.strictEqual(tree.children[0].type, 'horizontal-rule');
        });

        it('should parse horizontal rule with more than three chars', () => {
            const tree = parser.parse('-----\n');
            assert.strictEqual(tree.children[0].type, 'horizontal-rule');
        });
    });

    // ── Tables ──────────────────────────────────────────────────

    describe('tables', () => {
        it('should parse a simple table', () => {
            const markdown = '| A | B |\n|---|---|\n| 1 | 2 |';
            const tree = parser.parse(markdown);
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'table');
        });

        it('should preserve table content exactly', () => {
            const markdown = '| A | B |\n|---|---|\n| 1 | 2 |';
            const tree = parser.parse(markdown);
            assert.strictEqual(tree.children[0].content, markdown);
        });

        it('should parse a table with multiple rows', () => {
            const markdown = '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |';
            const tree = parser.parse(markdown);
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'table');
            assert.strictEqual(tree.children[0].content, markdown);
        });

        it('should round-trip a table through toMarkdown', () => {
            const markdown = '| A | B |\n|---|---|\n| 1 | 2 |';
            const tree = parser.parse(markdown);
            assert.strictEqual(tree.children[0].toMarkdown(), markdown);
        });

        it('should parse a table among other elements', () => {
            const markdown = '# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nSome text';
            const tree = parser.parse(markdown);
            assert.strictEqual(tree.children.length, 3);
            assert.strictEqual(tree.children[0].type, 'heading1');
            assert.strictEqual(tree.children[1].type, 'table');
            assert.strictEqual(tree.children[2].type, 'paragraph');
        });
    });

    // ── Images ──────────────────────────────────────────────────

    describe('images', () => {
        it('should parse a bare image', () => {
            const tree = parser.parse('![alt text](image.png)');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'image');
            assert.strictEqual(tree.children[0].content, 'alt text');
            assert.strictEqual(tree.children[0].attributes.alt, 'alt text');
            assert.strictEqual(tree.children[0].attributes.url, 'image.png');
            assert.strictEqual(tree.children[0].attributes.href, undefined);
        });

        it('should parse an image with empty alt text', () => {
            const tree = parser.parse('![](photo.jpg)');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'image');
            assert.strictEqual(tree.children[0].content, '');
            assert.strictEqual(tree.children[0].attributes.alt, '');
            assert.strictEqual(tree.children[0].attributes.url, 'photo.jpg');
        });

        it('should parse a linked image', () => {
            const tree = parser.parse('[![logo](logo.png)](https://example.com)');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'image');
            assert.strictEqual(tree.children[0].content, 'logo');
            assert.strictEqual(tree.children[0].attributes.alt, 'logo');
            assert.strictEqual(tree.children[0].attributes.url, 'logo.png');
            assert.strictEqual(tree.children[0].attributes.href, 'https://example.com');
        });

        it('should round-trip a bare image through toMarkdown', () => {
            const markdown = '![alt text](image.png)';
            const tree = parser.parse(markdown);
            assert.strictEqual(tree.children[0].toMarkdown(), markdown);
        });

        it('should round-trip a linked image through toMarkdown', () => {
            const markdown = '[![logo](logo.png)](https://example.com)';
            const tree = parser.parse(markdown);
            assert.strictEqual(tree.children[0].toMarkdown(), markdown);
        });

        it('should parse an image with a full URL', () => {
            const tree = parser.parse('![photo](https://example.com/img.jpg)');
            assert.strictEqual(tree.children[0].type, 'image');
            assert.strictEqual(tree.children[0].attributes.url, 'https://example.com/img.jpg');
        });

        it('should parse an image among other elements', () => {
            const markdown = '# Title\n\n![photo](img.png)\n\nSome text';
            const tree = parser.parse(markdown);
            assert.strictEqual(tree.children.length, 3);
            assert.strictEqual(tree.children[0].type, 'heading1');
            assert.strictEqual(tree.children[1].type, 'image');
            assert.strictEqual(tree.children[2].type, 'paragraph');
        });

        it('should parse an HTML img tag with src, alt and style', () => {
            const tree = parser.parse('<img src="photo.png" alt="A photo" style="zoom: 80%;" />');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'image');
            assert.strictEqual(tree.children[0].attributes.url, 'photo.png');
            assert.strictEqual(tree.children[0].attributes.alt, 'A photo');
            assert.strictEqual(tree.children[0].attributes.style, 'zoom: 80%;');
        });

        it('should parse an HTML img tag without style', () => {
            const tree = parser.parse('<img src="pic.jpg" alt="test" />');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'image');
            assert.strictEqual(tree.children[0].attributes.url, 'pic.jpg');
            assert.strictEqual(tree.children[0].attributes.alt, 'test');
            assert.strictEqual(tree.children[0].attributes.style, undefined);
        });

        it('should parse an HTML img tag without alt', () => {
            const tree = parser.parse('<img src="pic.jpg" style="display: block;" />');
            assert.strictEqual(tree.children[0].type, 'image');
            assert.strictEqual(tree.children[0].attributes.url, 'pic.jpg');
            assert.strictEqual(tree.children[0].attributes.alt, '');
            assert.strictEqual(tree.children[0].attributes.style, 'display: block;');
        });

        it('should parse a non-self-closing HTML img tag', () => {
            const tree = parser.parse('<img src="pic.jpg" alt="test">');
            assert.strictEqual(tree.children[0].type, 'image');
            assert.strictEqual(tree.children[0].attributes.url, 'pic.jpg');
            assert.strictEqual(tree.children[0].attributes.alt, 'test');
        });

        it('should serialize an image without style as markdown syntax', () => {
            const tree = parser.parse('<img src="pic.jpg" alt="test" />');
            assert.strictEqual(tree.children[0].toMarkdown(), '![test](pic.jpg)');
        });
    });

    // ── HTML blocks ─────────────────────────────────────────────

    describe('html blocks', () => {
        it('should parse a self-closed HTML block', () => {
            const tree = parser.parse('<summary>Some text</summary>');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(tree.children[0].attributes.tagName, 'summary');
            assert.strictEqual(tree.children[0].children.length, 1);
            assert.strictEqual(tree.children[0].children[0].type, 'paragraph');
            assert.strictEqual(tree.children[0].children[0].content, 'Some text');
            assert.strictEqual(tree.children[0].children[0].attributes.bareText, true);
        });

        it('should parse a multi-line HTML block', () => {
            const tree = parser.parse('<details>\n\n## Heading\n\nSome text\n\n</details>');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(tree.children[0].attributes.tagName, 'details');
            assert.strictEqual(tree.children[0].attributes.openingTag, '<details>');
            assert.strictEqual(tree.children[0].attributes.closingTag, '</details>');
            assert.ok(tree.children[0].children.length >= 2);
        });

        it('should parse nested HTML blocks (details with summary)', () => {
            const markdown =
                '<details>\n\n<summary>Title</summary>\n\n## Heading\n\nText\n\n</details>';
            const tree = parser.parse(markdown);
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(tree.children[0].attributes.tagName, 'details');
        });

        it('should recursively parse markdown inside HTML blocks', () => {
            const tree = parser.parse('<div>\n\n# Title\n\nParagraph\n\n</div>');
            assert.strictEqual(tree.children[0].type, 'html-block');
            const children = tree.children[0].children;
            assert.strictEqual(children[0].type, 'heading1');
            assert.strictEqual(children[0].content, 'Title');
            assert.strictEqual(children[1].type, 'paragraph');
            assert.strictEqual(children[1].content, 'Paragraph');
        });

        it('should parse a custom element with a hyphenated tag name', () => {
            const tree = parser.parse('<my-component>\n\nHello\n\n</my-component>');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(tree.children[0].attributes.tagName, 'my-component');
            assert.strictEqual(tree.children[0].attributes.openingTag, '<my-component>');
            assert.strictEqual(tree.children[0].attributes.closingTag, '</my-component>');
            assert.strictEqual(tree.children[0].children.length, 1);
            assert.strictEqual(tree.children[0].children[0].type, 'paragraph');
            assert.strictEqual(tree.children[0].children[0].content, 'Hello');
        });

        it('should parse a custom element with multiple hyphens', () => {
            const tree = parser.parse('<my-cool-widget>\n\nContent\n\n</my-cool-widget>');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(tree.children[0].attributes.tagName, 'my-cool-widget');
        });

        it('should parse a self-closed custom element', () => {
            const tree = parser.parse('<app-header>Title text</app-header>');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(tree.children[0].attributes.tagName, 'app-header');
            assert.strictEqual(tree.children[0].children[0].content, 'Title text');
            assert.strictEqual(tree.children[0].children[0].attributes.bareText, true);
        });

        it('should parse custom elements with attributes', () => {
            const tree = parser.parse('<my-element class="test">\n\nBody\n\n</my-element>');
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(tree.children[0].attributes.tagName, 'my-element');
            assert.strictEqual(tree.children[0].attributes.openingTag, '<my-element class="test">');
        });

        it('should treat an unknown tag as an HTML block when it has proper tag syntax', () => {
            const tree = parser.parse('<notarealtag>\n\nText\n\n</notarealtag>');
            // "notarealtag" is not in HTML_BLOCK_TAGS and has no hyphen, but
            // the token stream forms a proper LT TEXT GT pattern so it is
            // promoted to an html-block.
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(tree.children[0].attributes.tagName, 'notarealtag');
        });

        it('should round-trip a custom element block', () => {
            const md = '<my-component>\n\nSome content\n\n</my-component>';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });
    });

    // ── Void HTML elements ──────────────────────────────────────

    describe('void HTML elements', () => {
        it('should parse a <link> tag without consuming following content', () => {
            const md = '<link rel="stylesheet" href="style.css">\n\n# Heading';
            const tree = parser.parse(md);
            assert.strictEqual(tree.children.length, 2);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(tree.children[0].attributes.tagName, 'link');
            assert.strictEqual(
                tree.children[0].attributes.openingTag,
                '<link rel="stylesheet" href="style.css">',
            );
            assert.strictEqual(tree.children[0].attributes.closingTag, '');
            assert.strictEqual(tree.children[0].children.length, 0);
            assert.strictEqual(tree.children[1].type, 'heading1');
        });

        it('should round-trip a void element', () => {
            const md = '<link rel="stylesheet" href="style.css">';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('should parse consecutive void elements without merging', () => {
            const md = '<link rel="stylesheet" href="a.css">\n<link rel="stylesheet" href="b.css">';
            const tree = parser.parse(md);
            assert.strictEqual(tree.children.length, 2);
            assert.strictEqual(
                tree.children[0].attributes.openingTag,
                '<link rel="stylesheet" href="a.css">',
            );
            assert.strictEqual(
                tree.children[1].attributes.openingTag,
                '<link rel="stylesheet" href="b.css">',
            );
        });
    });

    // ── Raw content HTML tags ───────────────────────────────────

    describe('raw content HTML tags', () => {
        it('should parse a <script> tag with src attribute and preserve it', () => {
            const md = '<script type="module" src="./app.js" async></script>';
            const tree = parser.parse(md);
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(tree.children[0].attributes.tagName, 'script');
            assert.strictEqual(
                tree.children[0].attributes.openingTag,
                '<script type="module" src="./app.js" async>',
            );
            assert.strictEqual(tree.children[0].attributes.closingTag, '</script>');
            assert.strictEqual(tree.children[0].attributes.rawContent, '');
            assert.strictEqual(tree.children[0].children.length, 0);
        });

        it('should round-trip a <script> tag with attributes', () => {
            const md = '<script type="module" src="./app.js" async></script>';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('should parse a multi-line <script> with body content', () => {
            const md = '<script>\n  const x = 1;\n  console.log(x);\n</script>';
            const tree = parser.parse(md);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(
                tree.children[0].attributes.rawContent,
                '  const x = 1;\n  console.log(x);',
            );
            assert.strictEqual(tree.children[0].children.length, 0);
        });

        it('should round-trip a multi-line <script>', () => {
            const md = '<script>\n  const x = 1;\n  console.log(x);\n</script>';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('should parse a <style> block and preserve CSS verbatim', () => {
            const md = '<style>\n  body { color: red; }\n  h1 > span { font-size: 2em; }\n</style>';
            const tree = parser.parse(md);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(tree.children[0].attributes.tagName, 'style');
            assert.strictEqual(
                tree.children[0].attributes.rawContent,
                '  body { color: red; }\n  h1 > span { font-size: 2em; }',
            );
        });

        it('should not re-parse CSS selectors as markdown headings', () => {
            const md = '<style>\n  #heading { color: red; }\n  > .child { margin: 0; }\n</style>';
            const tree = parser.parse(md);
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(
                tree.children[0].attributes.rawContent,
                '  #heading { color: red; }\n  > .child { margin: 0; }',
            );
        });

        it('should parse a <script> followed by other content', () => {
            const md = '<script src="app.js"></script>\n\n# Heading\n\nParagraph';
            const tree = parser.parse(md);
            assert.strictEqual(tree.children.length, 3);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(tree.children[1].type, 'heading1');
            assert.strictEqual(tree.children[2].type, 'paragraph');
        });
    });

    // ── Bare-text attribute preservation ────────────────────────

    describe('bare-text attribute preservation', () => {
        it('should round-trip a <summary> with attributes', () => {
            const md = '<summary class="title">Some text</summary>';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });
    });

    // ── Inline-only tags are not block-level ────────────────────

    describe('inline-only HTML tags', () => {
        for (const tag of ['strong', 'em', 'del', 's', 'sub', 'sup', 'b', 'i']) {
            it(`should not treat <${tag}> as a block-level HTML element`, () => {
                const md = `<${tag}>text</${tag}>`;
                const tree = parser.parse(md);
                assert.strictEqual(tree.children[0].type, 'paragraph');
            });
        }
    });

    // ── Unknown tag fallback ────────────────────────────────────

    describe('unknown HTML tag fallback', () => {
        it('should parse an unknown tag with attributes as html-block', () => {
            const md = '<noscript class="no-js">\n\nFallback\n\n</noscript>';
            const tree = parser.parse(md);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(tree.children[0].attributes.tagName, 'noscript');
            assert.strictEqual(tree.children[0].attributes.openingTag, '<noscript class="no-js">');
        });

        it('should round-trip an unknown tag block', () => {
            const md = '<noscript>\n\nContent here\n\n</noscript>';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });
    });

    // ── HTML comments ───────────────────────────────────────────

    describe('HTML comments', () => {
        it('should parse a single-line HTML comment as html-block', () => {
            const md = '<!-- a comment -->';
            const tree = parser.parse(md);
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(tree.children[0].attributes.tagName, '!--');
            assert.strictEqual(tree.children[0].attributes.openingTag, '<!-- a comment -->');
            assert.strictEqual(tree.children[0].attributes.closingTag, '');
        });

        it('should round-trip a single-line HTML comment', () => {
            const md = '<!-- a comment -->';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('should parse a multi-line HTML comment', () => {
            const md = '<!--\nline one\nline two\n-->';
            const tree = parser.parse(md);
            assert.strictEqual(tree.children.length, 1);
            assert.strictEqual(tree.children[0].type, 'html-block');
            assert.strictEqual(tree.children[0].attributes.tagName, '!--');
            assert.strictEqual(
                tree.children[0].attributes.openingTag,
                '<!--\nline one\nline two\n-->',
            );
        });

        it('should round-trip a multi-line HTML comment', () => {
            const md = '<!--\nline one\nline two\n-->';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('should parse a comment between paragraphs', () => {
            const md = 'Before\n\n<!-- comment -->\n\nAfter';
            const tree = parser.parse(md);
            assert.strictEqual(tree.children.length, 3);
            assert.strictEqual(tree.children[0].type, 'paragraph');
            assert.strictEqual(tree.children[1].type, 'html-block');
            assert.strictEqual(tree.children[1].attributes.tagName, '!--');
            assert.strictEqual(tree.children[2].type, 'paragraph');
        });

        it('should parse adjacent comments as separate blocks', () => {
            const md = '<!-- first -->\n<!-- second -->';
            const tree = parser.parse(md);
            assert.strictEqual(tree.children.length, 2);
            assert.strictEqual(tree.children[0].attributes.openingTag, '<!-- first -->');
            assert.strictEqual(tree.children[1].attributes.openingTag, '<!-- second -->');
        });
    });

    // ── Complex documents ───────────────────────────────────────

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

        it('should handle consecutive headings without blanks', () => {
            const tree = parser.parse('# One\n## Two\n### Three');
            assert.strictEqual(tree.children.length, 3);
            assert.strictEqual(tree.children[0].type, 'heading1');
            assert.strictEqual(tree.children[1].type, 'heading2');
            assert.strictEqual(tree.children[2].type, 'heading3');
        });

        it('should handle heading then paragraph', () => {
            const tree = parser.parse('# Title\n\nSome body text here.');
            assert.strictEqual(tree.children.length, 2);
            assert.strictEqual(tree.children[0].type, 'heading1');
            assert.strictEqual(tree.children[1].type, 'paragraph');
        });

        it('should handle code block then paragraph', () => {
            const tree = parser.parse('```\ncode\n```\n\ntext after');
            assert.strictEqual(tree.children.length, 2);
            assert.strictEqual(tree.children[0].type, 'code-block');
            assert.strictEqual(tree.children[1].type, 'paragraph');
        });

        it('should handle list items then paragraph', () => {
            const tree = parser.parse('- a\n- b\n\nA paragraph');
            assert.strictEqual(tree.children.length, 3);
            assert.strictEqual(tree.children[0].type, 'list-item');
            assert.strictEqual(tree.children[1].type, 'list-item');
            assert.strictEqual(tree.children[2].type, 'paragraph');
        });

        it('should preserve inline markdown in paragraph content', () => {
            const tree = parser.parse('This has **bold** and *italic* text');
            assert.strictEqual(tree.children[0].content, 'This has **bold** and *italic* text');
        });

        it('should handle the details fixture document', () => {
            const markdown = [
                '# This is a title',
                '',
                'with some text and then a div. Content in the div should be parsed as  "this is just more markdown":',
                '',
                '<details>',
                '',
                '<summary>This is a paragraph</summary>',
                '',
                '## and this an h2',
                '',
                'better',
                '',
                '</details>',
                '',
                'And then this is the main doc again.',
                '',
                '## with another heading',
                '',
                'wow',
            ].join('\n');

            const tree = parser.parse(markdown);
            // Should have: heading, paragraph, details block, paragraph, heading, paragraph
            assert.ok(tree.children.length >= 5);
            assert.strictEqual(tree.children[0].type, 'heading1');
            assert.strictEqual(tree.children[0].content, 'This is a title');
        });
    });

    // ── Round-trip tests ────────────────────────────────────────

    describe('round-trip (toMarkdown)', () => {
        it('should round-trip a heading', () => {
            const md = '## Hello World';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('should round-trip a paragraph', () => {
            const md = 'Just some text';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('should round-trip a blockquote', () => {
            const md = '> Quoted text';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('should round-trip a code block', () => {
            const md = '```js\nconst x = 1;\n```';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('should round-trip a four-backtick code block with nested three-backtick fence', () => {
            const md = '````\n```\nnested\n```\n````';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('should round-trip an unordered list item', () => {
            const md = '- Item one';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('should round-trip an ordered list item', () => {
            const md = '1. First item';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('should round-trip a horizontal rule', () => {
            const md = '---';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });

        it('should round-trip a self-closed HTML block', () => {
            const md = '<summary>Some text</summary>';
            const tree = parser.parse(md);
            assert.strictEqual(tree.toMarkdown(), md);
        });
    });
});
