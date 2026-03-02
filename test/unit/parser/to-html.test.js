/**
 * @fileoverview Unit tests for SyntaxNode.toHTML() and SyntaxTree.toHTML().
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SyntaxNode, SyntaxTree } from '../../../src/renderer/scripts/parser/syntax-tree.js';

// ── Helpers ─────────────────────────────────────────────

/**
 * Creates a list-item node with the given attributes.
 * @param {string} content
 * @param {object} attrs
 * @returns {SyntaxNode}
 */
function listItem(content, attrs = {}) {
    const node = new SyntaxNode('list-item', content);
    Object.assign(node.attributes, attrs);
    return node;
}

// ── SyntaxNode.toHTML() ─────────────────────────────────

describe('SyntaxNode.toHTML()', () => {
    describe('headings', () => {
        it('should render heading1 through heading6', () => {
            for (let i = 1; i <= 6; i++) {
                const node = new SyntaxNode(`heading${i}`, 'Title');
                assert.strictEqual(node.toHTML(), `<h${i}>Title</h${i}>`);
            }
        });

        it('should render inline formatting inside headings', () => {
            const node = new SyntaxNode('heading2', 'Hello **world**');
            assert.strictEqual(node.toHTML(), '<h2>Hello <strong>world</strong></h2>');
        });
    });

    describe('paragraph', () => {
        it('should render a simple paragraph', () => {
            const node = new SyntaxNode('paragraph', 'Hello world');
            assert.strictEqual(node.toHTML(), '<p>Hello world</p>');
        });

        it('should escape HTML in paragraph text', () => {
            const node = new SyntaxNode('paragraph', 'a < b & c > d');
            assert.strictEqual(node.toHTML(), '<p>a &lt; b &amp; c &gt; d</p>');
        });

        it('should render bold and italic', () => {
            const node = new SyntaxNode('paragraph', '**bold** and *italic*');
            assert.strictEqual(node.toHTML(), '<p><strong>bold</strong> and <em>italic</em></p>');
        });

        it('should render bold-italic', () => {
            const node = new SyntaxNode('paragraph', '***both***');
            assert.strictEqual(node.toHTML(), '<p><strong><em>both</em></strong></p>');
        });

        it('should render strikethrough', () => {
            const node = new SyntaxNode('paragraph', '~~deleted~~');
            assert.strictEqual(node.toHTML(), '<p><del>deleted</del></p>');
        });

        it('should render inline code', () => {
            const node = new SyntaxNode('paragraph', 'use `console.log()`');
            assert.strictEqual(node.toHTML(), '<p>use <code>console.log()</code></p>');
        });

        it('should render links', () => {
            const node = new SyntaxNode('paragraph', 'click [here](https://example.com)');
            assert.strictEqual(
                node.toHTML(),
                '<p>click <a href="https://example.com">here</a></p>',
            );
        });

        it('should render inline images', () => {
            const node = new SyntaxNode('paragraph', 'an ![alt text](img.png) image');
            assert.strictEqual(node.toHTML(), '<p>an <img src="img.png" alt="alt text"> image</p>');
        });

        it('should render inline HTML tags like sub and sup', () => {
            const node = new SyntaxNode('paragraph', 'H<sub>2</sub>O');
            assert.strictEqual(node.toHTML(), '<p>H<sub>2</sub>O</p>');
        });
    });

    describe('blockquote', () => {
        it('should render a blockquote', () => {
            const node = new SyntaxNode('blockquote', 'Quote text');
            assert.strictEqual(node.toHTML(), '<blockquote><p>Quote text</p></blockquote>');
        });
    });

    describe('code-block', () => {
        it('should render a code block without language', () => {
            const node = new SyntaxNode('code-block', 'const x = 1;');
            assert.strictEqual(node.toHTML(), '<pre><code>const x = 1;</code></pre>');
        });

        it('should render a code block with language', () => {
            const node = new SyntaxNode('code-block', 'const x = 1;');
            node.attributes.language = 'javascript';
            assert.strictEqual(
                node.toHTML(),
                '<pre><code class="language-javascript">const x = 1;</code></pre>',
            );
        });

        it('should escape HTML in code blocks', () => {
            const node = new SyntaxNode('code-block', '<div class="test">');
            assert.strictEqual(
                node.toHTML(),
                '<pre><code>&lt;div class=&quot;test&quot;&gt;</code></pre>',
            );
        });
    });

    describe('list-item', () => {
        it('should render an unordered list item', () => {
            const node = listItem('Item text');
            assert.strictEqual(node.toHTML(), '<li>Item text</li>');
        });

        it('should render a checklist item unchecked', () => {
            const node = listItem('Task', { checked: false });
            assert.strictEqual(node.toHTML(), '<li><input type="checkbox" disabled> Task</li>');
        });

        it('should render a checklist item checked', () => {
            const node = listItem('Done', { checked: true });
            assert.strictEqual(
                node.toHTML(),
                '<li><input type="checkbox" disabled checked> Done</li>',
            );
        });
    });

    describe('horizontal-rule', () => {
        it('should render an <hr>', () => {
            const node = new SyntaxNode('horizontal-rule', '');
            assert.strictEqual(node.toHTML(), '<hr>');
        });
    });

    describe('image', () => {
        it('should render a simple image', () => {
            const node = new SyntaxNode('image', '');
            node.attributes.url = 'photo.jpg';
            node.attributes.alt = 'A photo';
            assert.strictEqual(node.toHTML(), '<img src="photo.jpg" alt="A photo">');
        });

        it('should render a linked image', () => {
            const node = new SyntaxNode('image', '');
            node.attributes.url = 'photo.jpg';
            node.attributes.alt = 'A photo';
            node.attributes.href = 'https://example.com';
            assert.strictEqual(
                node.toHTML(),
                '<a href="https://example.com"><img src="photo.jpg" alt="A photo"></a>',
            );
        });

        it('should render an image with style', () => {
            const node = new SyntaxNode('image', '');
            node.attributes.url = 'photo.jpg';
            node.attributes.alt = 'A photo';
            node.attributes.style = 'width:100px';
            assert.strictEqual(
                node.toHTML(),
                '<img src="photo.jpg" alt="A photo" style="width:100px">',
            );
        });
    });

    describe('table', () => {
        it('should render a simple table', () => {
            const node = new SyntaxNode('table', '| A | B |\n|---|---|\n| 1 | 2 |');
            const html = node.toHTML();
            assert.ok(html.includes('<table>'));
            assert.ok(html.includes('<th>A</th>'));
            assert.ok(html.includes('<th>B</th>'));
            assert.ok(html.includes('<td>1</td>'));
            assert.ok(html.includes('<td>2</td>'));
            assert.ok(html.includes('</table>'));
        });

        it('should handle column alignment', () => {
            const node = new SyntaxNode('table', '| L | C | R |\n|:---|:---:|---:|\n| a | b | c |');
            const html = node.toHTML();
            assert.ok(html.includes('style="text-align: left"'));
            assert.ok(html.includes('style="text-align: center"'));
            assert.ok(html.includes('style="text-align: right"'));
        });
    });

    describe('html-block', () => {
        it('should render void elements as passthrough', () => {
            const node = new SyntaxNode('html-block', '');
            node.attributes.tagName = 'link';
            node.attributes.openingTag = '<link rel="stylesheet" href="style.css">';
            node.attributes.closingTag = '';
            assert.strictEqual(node.toHTML(), '<link rel="stylesheet" href="style.css">');
        });

        it('should render raw content tags (script) as passthrough', () => {
            const node = new SyntaxNode('html-block', '');
            node.attributes.tagName = 'script';
            node.attributes.openingTag = '<script>';
            node.attributes.closingTag = '</script>';
            node.attributes.rawContent = 'console.log("hi");';
            assert.strictEqual(node.toHTML(), '<script>\nconsole.log("hi");\n</script>');
        });

        it('should render raw content tags (style) as passthrough', () => {
            const node = new SyntaxNode('html-block', '');
            node.attributes.tagName = 'style';
            node.attributes.openingTag = '<style>';
            node.attributes.closingTag = '</style>';
            node.attributes.rawContent = 'body { color: red; }';
            assert.strictEqual(node.toHTML(), '<style>\nbody { color: red; }\n</style>');
        });

        it('should render container html-blocks with children as HTML', () => {
            const node = new SyntaxNode('html-block', '');
            node.attributes.tagName = 'details';
            node.attributes.openingTag = '<details>';
            node.attributes.closingTag = '</details>';
            const child = new SyntaxNode('paragraph', 'Inner text');
            node.appendChild(child);
            const html = node.toHTML();
            assert.ok(html.startsWith('<details>'));
            assert.ok(html.includes('<p>Inner text</p>'));
            assert.ok(html.endsWith('</details>'));
        });

        it('should render bare-text children as inline HTML', () => {
            const node = new SyntaxNode('html-block', '');
            node.attributes.tagName = 'summary';
            node.attributes.openingTag = '<summary>';
            node.attributes.closingTag = '</summary>';
            const child = new SyntaxNode('paragraph', 'Click me');
            child.attributes.bareText = true;
            node.appendChild(child);
            const html = node.toHTML();
            assert.ok(html.includes('<summary>'));
            assert.ok(html.includes('Click me'));
            assert.ok(html.includes('</summary>'));
            // bare-text children should NOT be wrapped in <p>
            assert.ok(!html.includes('<p>'));
        });

        it('should render HTML comments as passthrough', () => {
            const node = new SyntaxNode('html-block', '');
            node.attributes.tagName = '!--';
            node.attributes.openingTag = '<!-- a comment -->';
            node.attributes.closingTag = '';
            assert.strictEqual(node.toHTML(), '<!-- a comment -->');
        });
    });
});

// ── SyntaxTree.toHTML() ─────────────────────────────────

describe('SyntaxTree.toHTML()', () => {
    it('should render a simple document', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('heading1', 'Title'));
        tree.appendChild(new SyntaxNode('paragraph', 'Hello world'));
        const { head, body } = tree.toHTML();
        assert.strictEqual(head, '');
        assert.ok(body.includes('<h1>Title</h1>'));
        assert.ok(body.includes('<p>Hello world</p>'));
    });

    it('should group consecutive unordered list items into <ul>', () => {
        const tree = new SyntaxTree();
        tree.appendChild(listItem('One'));
        tree.appendChild(listItem('Two'));
        tree.appendChild(listItem('Three'));
        const { body } = tree.toHTML();
        assert.ok(body.includes('<ul>'));
        assert.ok(body.includes('<li>One</li>'));
        assert.ok(body.includes('<li>Two</li>'));
        assert.ok(body.includes('<li>Three</li>'));
        assert.ok(body.includes('</ul>'));
    });

    it('should group consecutive ordered list items into <ol>', () => {
        const tree = new SyntaxTree();
        tree.appendChild(listItem('First', { ordered: true, number: 1 }));
        tree.appendChild(listItem('Second', { ordered: true, number: 2 }));
        const { body } = tree.toHTML();
        assert.ok(body.includes('<ol>'));
        assert.ok(body.includes('<li>First</li>'));
        assert.ok(body.includes('<li>Second</li>'));
        assert.ok(body.includes('</ol>'));
    });

    it('should not merge non-adjacent list groups', () => {
        const tree = new SyntaxTree();
        tree.appendChild(listItem('A'));
        tree.appendChild(new SyntaxNode('paragraph', 'break'));
        tree.appendChild(listItem('B'));
        const { body } = tree.toHTML();
        // Should have two separate <ul> tags
        const ulCount = (body.match(/<ul>/g) || []).length;
        assert.strictEqual(ulCount, 2);
    });

    it('should nest indented list items', () => {
        const tree = new SyntaxTree();
        tree.appendChild(listItem('Parent'));
        tree.appendChild(listItem('Child', { indent: 1 }));
        const { body } = tree.toHTML();
        // The child should be inside a nested <ul>
        assert.ok(body.includes('<ul>'));
        assert.ok(body.includes('<li>Parent'));
        assert.ok(body.includes('<li>Child</li>'));
        // There should be a nested <ul> for the child
        const ulCount = (body.match(/<ul>/g) || []).length;
        assert.strictEqual(ulCount, 2);
    });

    it('should render a mixed document correctly', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('heading1', 'Title'));
        tree.appendChild(new SyntaxNode('paragraph', 'Some text'));
        tree.appendChild(listItem('Item 1'));
        tree.appendChild(listItem('Item 2'));
        tree.appendChild(new SyntaxNode('horizontal-rule', ''));
        tree.appendChild(new SyntaxNode('code-block', 'x = 1'));
        const { body } = tree.toHTML();
        assert.ok(body.includes('<h1>Title</h1>'));
        assert.ok(body.includes('<p>Some text</p>'));
        assert.ok(body.includes('<ul>'));
        assert.ok(body.includes('</ul>'));
        assert.ok(body.includes('<hr>'));
        assert.ok(body.includes('<pre><code>x = 1</code></pre>'));
    });

    it('should place style, script, and link tags in head', () => {
        const tree = new SyntaxTree();
        tree.appendChild(new SyntaxNode('heading1', 'Title'));

        const styleNode = new SyntaxNode('html-block', '');
        styleNode.attributes.tagName = 'style';
        styleNode.attributes.openingTag = '<style>';
        styleNode.attributes.closingTag = '</style>';
        styleNode.attributes.rawContent = 'body { color: red; }';
        tree.appendChild(styleNode);

        const linkNode = new SyntaxNode('html-block', '');
        linkNode.attributes.tagName = 'link';
        linkNode.attributes.openingTag = '<link rel="stylesheet" href="style.css">';
        linkNode.attributes.closingTag = '';
        tree.appendChild(linkNode);

        const scriptNode = new SyntaxNode('html-block', '');
        scriptNode.attributes.tagName = 'script';
        scriptNode.attributes.openingTag = '<script>';
        scriptNode.attributes.closingTag = '</script>';
        scriptNode.attributes.rawContent = 'console.log("hi");';
        tree.appendChild(scriptNode);

        tree.appendChild(new SyntaxNode('paragraph', 'Some text'));

        const { head, body } = tree.toHTML();

        // Head should contain style, link, and script
        assert.ok(head.includes('<style>'));
        assert.ok(head.includes('body { color: red; }'));
        assert.ok(head.includes('<link rel="stylesheet" href="style.css">'));
        assert.ok(head.includes('<script>'));
        assert.ok(head.includes('console.log("hi");'));

        // Body should NOT contain style, link, or script
        assert.ok(!body.includes('<style>'));
        assert.ok(!body.includes('<link'));
        assert.ok(!body.includes('<script>'));

        // Body should contain normal content
        assert.ok(body.includes('<h1>Title</h1>'));
        assert.ok(body.includes('<p>Some text</p>'));
    });
});
