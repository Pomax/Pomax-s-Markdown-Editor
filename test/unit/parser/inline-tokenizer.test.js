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
} from '../../../src/parsers/old/inline-tokenizer.js';

describe(`tokenizeInline`, () => {
  it(`returns plain text for a string with no markup`, () => {
    const tokens = tokenizeInline(`hello world`);
    assert.deepStrictEqual(tokens, [{ type: `text`, raw: `hello world` }]);
  });

  it(`tokenizes **bold** markers`, () => {
    const tokens = tokenizeInline(`a **b** c`);
    assert.equal(tokens.length, 5);
    assert.equal(tokens[0].type, `text`);
    assert.equal(tokens[1].type, `bold-open`);
    assert.equal(tokens[2].type, `text`);
    assert.equal(tokens[3].type, `bold-close`);
    assert.equal(tokens[4].type, `text`);
  });

  it(`tokenizes *italic* markers`, () => {
    const tokens = tokenizeInline(`a *b* c`);
    assert.equal(tokens[1].type, `italic-open`);
    assert.equal(tokens[3].type, `italic-close`);
  });

  it(`tokenizes ***bold+italic*** as a single bold-italic open/close pair`, () => {
    const tokens = tokenizeInline(`a ***b*** c`);
    assert.equal(tokens.length, 5);
    assert.equal(tokens[0].type, `text`);
    assert.equal(tokens[1].type, `bold-italic-open`);
    assert.equal(tokens[1].raw, `***`);
    assert.equal(tokens[2].type, `text`);
    assert.equal(tokens[2].raw, `b`);
    assert.equal(tokens[3].type, `bold-italic-close`);
    assert.equal(tokens[3].raw, `***`);
    assert.equal(tokens[4].type, `text`);
  });

  it(`treats **** (four or more asterisks) as plain text`, () => {
    const tokens = tokenizeInline(`a **** b`);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].type, `text`);
    assert.equal(tokens[0].raw, `a **** b`);
  });

  it(`treats ***** (five asterisks) as plain text`, () => {
    const tokens = tokenizeInline(`hello ***** world`);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].type, `text`);
    assert.equal(tokens[0].raw, `hello ***** world`);
  });

  it(`tokenizes ~~strikethrough~~ markers`, () => {
    const tokens = tokenizeInline(`a ~~b~~ c`);
    assert.equal(tokens[1].type, `strikethrough-open`);
    assert.equal(tokens[3].type, `strikethrough-close`);
  });

  it(`tokenizes \`code\` spans`, () => {
    const tokens = tokenizeInline(`a \`code\` b`);
    assert.equal(tokens.length, 3);
    assert.equal(tokens[1].type, `code`);
    assert.equal(tokens[1].content, `code`);
  });

  it(`tokenizes [link](url) syntax`, () => {
    const tokens = tokenizeInline(`click [here](https://x.com) now`);
    const linkOpen = tokens.find((t) => t.type === `link-open`);
    const linkClose = tokens.find((t) => t.type === `link-close`);
    assert.ok(linkOpen);
    assert.ok(linkClose);
    assert.equal(linkClose.href, `https://x.com`);
  });

  it(`tokenizes ![alt](src) as an image token`, () => {
    const tokens = tokenizeInline(`see ![photo](./img.png) here`);
    assert.equal(tokens.length, 3);
    assert.equal(tokens[0].type, `text`);
    assert.equal(tokens[0].raw, `see `);
    assert.equal(tokens[1].type, `image`);
    assert.equal(tokens[1].raw, `![photo](./img.png)`);
    assert.equal(tokens[1].alt, `photo`);
    assert.equal(tokens[1].src, `./img.png`);
    assert.equal(tokens[2].type, `text`);
    assert.equal(tokens[2].raw, ` here`);
  });

  it(`tokenizes a standalone ![alt](src) image`, () => {
    const tokens = tokenizeInline(`![my image](path/to/img.jpg)`);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].type, `image`);
    assert.equal(tokens[0].alt, `my image`);
    assert.equal(tokens[0].src, `path/to/img.jpg`);
  });

  it(`does not treat [link](url) without ! as an image`, () => {
    const tokens = tokenizeInline(`[click](https://x.com)`);
    assert.equal(
      tokens.find((t) => t.type === `image`),
      undefined,
    );
    assert.ok(tokens.find((t) => t.type === `link-open`));
  });

  it(`handles !! before [alt](src) — first ! is text`, () => {
    const tokens = tokenizeInline(`!![alt](src)`);
    assert.equal(tokens.length, 2);
    assert.equal(tokens[0].type, `text`);
    assert.equal(tokens[0].raw, `!`);
    assert.equal(tokens[1].type, `image`);
    assert.equal(tokens[1].alt, `alt`);
    assert.equal(tokens[1].src, `src`);
  });

  it(`tokenizes <sub> and </sub> HTML tags`, () => {
    const tokens = tokenizeInline(`H<sub>2</sub>O`);
    assert.equal(tokens.length, 5);
    assert.equal(tokens[0].type, `text`);
    assert.equal(tokens[0].raw, `H`);
    assert.equal(tokens[1].type, `html-open`);
    assert.equal(tokens[1].tag, `sub`);
    assert.equal(tokens[2].type, `text`);
    assert.equal(tokens[2].raw, `2`);
    assert.equal(tokens[3].type, `html-close`);
    assert.equal(tokens[3].tag, `sub`);
    assert.equal(tokens[4].type, `text`);
    assert.equal(tokens[4].raw, `O`);
  });

  it(`tokenizes <strong> and <em> HTML tags`, () => {
    const tokens = tokenizeInline(`<strong>bold</strong> and <em>italic</em>`);
    const opens = tokens.filter((t) => t.type === `html-open`);
    const closes = tokens.filter((t) => t.type === `html-close`);
    assert.equal(opens.length, 2);
    assert.equal(closes.length, 2);
    assert.equal(opens[0].tag, `strong`);
    assert.equal(opens[1].tag, `em`);
  });

  it(`tokenizes arbitrary HTML tags without a whitelist`, () => {
    const tokens = tokenizeInline(`a <span>b</span> c`);
    assert.equal(tokens.length, 5);
    assert.equal(tokens[0].type, `text`);
    assert.equal(tokens[0].raw, `a `);
    assert.equal(tokens[1].type, `html-open`);
    assert.equal(tokens[1].tag, `span`);
    assert.equal(tokens[2].type, `text`);
    assert.equal(tokens[2].raw, `b`);
    assert.equal(tokens[3].type, `html-close`);
    assert.equal(tokens[3].tag, `span`);
    assert.equal(tokens[4].type, `text`);
    assert.equal(tokens[4].raw, ` c`);
  });

  it(`tokenizes HTML tags with attributes`, () => {
    const tokens = tokenizeInline(`<span style="color:red">text</span>`);
    assert.equal(tokens[0].type, `html-open`);
    assert.equal(tokens[0].tag, `span`);
    assert.deepStrictEqual(tokens[0].attrs, { style: `color:red` });
    assert.equal(tokens[1].type, `text`);
    assert.equal(tokens[2].type, `html-close`);
    assert.equal(tokens[2].tag, `span`);
  });

  it(`tokenizes void HTML elements as html-void`, () => {
    const tokens = tokenizeInline(`line1<br>line2`);
    assert.equal(tokens.length, 3);
    assert.equal(tokens[0].type, `text`);
    assert.equal(tokens[0].raw, `line1`);
    assert.equal(tokens[1].type, `html-void`);
    assert.equal(tokens[1].tag, `br`);
    assert.equal(tokens[2].type, `text`);
    assert.equal(tokens[2].raw, `line2`);
  });

  it(`tokenizes self-closing HTML elements as html-void`, () => {
    const tokens = tokenizeInline(`text<br/>more`);
    assert.equal(tokens[1].type, `html-void`);
    assert.equal(tokens[1].tag, `br`);
  });

  it(`tokenizes void elements with attributes`, () => {
    const tokens = tokenizeInline(`<img src="x.png" alt="pic">`);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].type, `html-void`);
    assert.equal(tokens[0].tag, `img`);
    assert.deepStrictEqual(tokens[0].attrs, { src: `x.png`, alt: `pic` });
  });

  it(`handles > inside quoted attributes without ending the tag`, () => {
    const tokens = tokenizeInline(`<span title="a > b">text</span>`);
    assert.equal(tokens[0].type, `html-open`);
    assert.equal(tokens[0].tag, `span`);
    assert.deepStrictEqual(tokens[0].attrs, { title: `a > b` });
  });

  it(`tokenizes custom HTML elements`, () => {
    const tokens = tokenizeInline(`<my-widget>content</my-widget>`);
    assert.equal(tokens[0].type, `html-open`);
    assert.equal(tokens[0].tag, `my-widget`);
    assert.equal(tokens[2].type, `html-close`);
    assert.equal(tokens[2].tag, `my-widget`);
  });

  it(`tokenizes named HTML entities`, () => {
    const tokens = tokenizeInline(`a&nbsp;b`);
    assert.equal(tokens.length, 3);
    assert.equal(tokens[0].type, `text`);
    assert.equal(tokens[0].raw, `a`);
    assert.equal(tokens[1].type, `html-entity`);
    assert.equal(tokens[1].raw, `&nbsp;`);
    assert.equal(tokens[2].type, `text`);
    assert.equal(tokens[2].raw, `b`);
  });

  it(`tokenizes decimal numeric HTML entities`, () => {
    const tokens = tokenizeInline(`&#160;`);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].type, `html-entity`);
    assert.equal(tokens[0].raw, `&#160;`);
  });

  it(`tokenizes hexadecimal numeric HTML entities`, () => {
    const tokens = tokenizeInline(`&#x00A0;`);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].type, `html-entity`);
    assert.equal(tokens[0].raw, `&#x00A0;`);
  });

  it(`does not treat bare & as an entity`, () => {
    const tokens = tokenizeInline(`a & b`);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].type, `text`);
    assert.equal(tokens[0].raw, `a & b`);
  });
});

describe(`buildInlineTree`, () => {
  it(`builds a tree from bold tokens`, () => {
    const tokens = tokenizeInline(`a **b** c`);
    const tree = buildInlineTree(tokens);
    assert.equal(tree.length, 3);
    assert.equal(tree[0].type, `text`);
    assert.equal(tree[1].type, `bold`);
    assert.equal(tree[1].children.length, 1);
    assert.equal(tree[1].children[0].text, `b`);
    assert.equal(tree[2].type, `text`);
  });

  it(`builds a tree from HTML inline tags`, () => {
    const tokens = tokenizeInline(`H<sub>2</sub>O`);
    const tree = buildInlineTree(tokens);
    assert.equal(tree.length, 3);
    assert.equal(tree[0].type, `text`);
    assert.equal(tree[0].text, `H`);
    assert.equal(tree[1].type, `sub`);
    assert.equal(tree[1].tag, `sub`);
    assert.equal(tree[1].children.length, 1);
    assert.equal(tree[1].children[0].text, `2`);
    assert.equal(tree[2].type, `text`);
    assert.equal(tree[2].text, `O`);
  });

  it(`handles nested markdown inside HTML tags`, () => {
    const tokens = tokenizeInline(`<strong>**nested** text</strong>`);
    const tree = buildInlineTree(tokens);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].type, `strong`);
    assert.equal(tree[0].children.length, 2);
    assert.equal(tree[0].children[0].type, `bold`);
    assert.equal(tree[0].children[1].type, `text`);
  });

  it(`handles mixed markdown and HTML`, () => {
    const tokens = tokenizeInline(`**bold** and <sub>subscript</sub>`);
    const tree = buildInlineTree(tokens);
    assert.equal(tree.length, 3);
    assert.equal(tree[0].type, `bold`);
    assert.equal(tree[1].type, `text`);
    assert.equal(tree[2].type, `sub`);
  });

  it(`treats unmatched open as plain text`, () => {
    const tokens = tokenizeInline(`a **b c`);
    const tree = buildInlineTree(tokens);
    // ** is unmatched, so it becomes text
    assert.ok(tree.every((s) => s.type === `text`));
  });

  it(`treats unmatched close tag as plain text`, () => {
    const tokens = tokenizeInline(`text</sub>more`);
    const tree = buildInlineTree(tokens);
    assert.ok(tree.every((s) => s.type === `text`));
  });

  it(`builds a link with children`, () => {
    const tokens = tokenizeInline(`[click **here**](https://x.com)`);
    const tree = buildInlineTree(tokens);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].type, `link`);
    assert.equal(tree[0].href, `https://x.com`);
    assert.equal(tree[0].children.length, 2);
    assert.equal(tree[0].children[0].type, `text`);
    assert.equal(tree[0].children[1].type, `bold`);
  });

  it(`builds bold-italic segment from ***word***`, () => {
    const tokens = tokenizeInline(`test ***word*** end`);
    const tree = buildInlineTree(tokens);
    assert.equal(tree.length, 3);
    assert.equal(tree[0].type, `text`);
    assert.equal(tree[0].text, `test `);
    assert.equal(tree[1].type, `bold-italic`);
    assert.equal(tree[1].children.length, 1);
    assert.equal(tree[1].children[0].text, `word`);
    assert.equal(tree[2].type, `text`);
  });

  it(`treats **** as plain text in tree`, () => {
    const tokens = tokenizeInline(`test **** end`);
    const tree = buildInlineTree(tokens);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].type, `text`);
    assert.equal(tree[0].text, `test **** end`);
  });

  it(`builds an image segment from an image token`, () => {
    const tokens = tokenizeInline(`see ![photo](./img.png) here`);
    const tree = buildInlineTree(tokens);
    assert.equal(tree.length, 3);
    assert.equal(tree[0].type, `text`);
    assert.equal(tree[1].type, `image`);
    assert.equal(tree[1].alt, `photo`);
    assert.equal(tree[1].src, `./img.png`);
    assert.equal(tree[2].type, `text`);
  });

  it(`handles code spans (no nesting)`, () => {
    const tokens = tokenizeInline(`use \`<sub>\` for subscript`);
    const tree = buildInlineTree(tokens);
    const codeNode = tree.find((s) => s.type === `code`);
    assert.ok(codeNode);
    assert.equal(codeNode.content, `<sub>`);
  });

  it(`builds a tree with arbitrary HTML tags and attributes`, () => {
    const tokens = tokenizeInline(`<span style="color:red">colored</span>`);
    const tree = buildInlineTree(tokens);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].type, `span`);
    assert.equal(tree[0].tag, `span`);
    assert.deepStrictEqual(tree[0].attrs, { style: `color:red` });
    assert.equal(tree[0].children.length, 1);
    assert.equal(tree[0].children[0].text, `colored`);
  });

  it(`builds a void element segment with no children`, () => {
    const tokens = tokenizeInline(`line1<br>line2`);
    const tree = buildInlineTree(tokens);
    assert.equal(tree.length, 3);
    assert.equal(tree[0].type, `text`);
    assert.equal(tree[0].text, `line1`);
    assert.equal(tree[1].type, `br`);
    assert.equal(tree[1].tag, `br`);
    assert.equal(tree[1].children, undefined);
    assert.equal(tree[2].type, `text`);
    assert.equal(tree[2].text, `line2`);
  });

  it(`builds a void element with attributes`, () => {
    const tokens = tokenizeInline(`<img src="x.png" alt="pic">`);
    const tree = buildInlineTree(tokens);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].type, `img`);
    assert.equal(tree[0].tag, `img`);
    assert.deepStrictEqual(tree[0].attrs, { src: `x.png`, alt: `pic` });
  });

  it(`decodes HTML entities into text segments`, () => {
    const tokens = tokenizeInline(`a&nbsp;b`);
    const tree = buildInlineTree(tokens);
    assert.equal(tree.length, 3);
    assert.equal(tree[0].type, `text`);
    assert.equal(tree[0].text, `a`);
    assert.equal(tree[1].type, `text`);
    assert.equal(tree[1].text, `\u00A0`);
    assert.equal(tree[2].type, `text`);
    assert.equal(tree[2].text, `b`);
  });

  it(`decodes &#160; numeric entity into text`, () => {
    const tokens = tokenizeInline(`&#160;`);
    const tree = buildInlineTree(tokens);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].type, `text`);
    assert.equal(tree[0].text, `\u00A0`);
  });

  it(`handles the issue example: &nbsp; and <br> and <span> in table cell content`, () => {
    const input = `&nbsp;&nbsp;weight<br><span style="border-top:1px solid black;">wing area</span>`;
    const tree = buildInlineTree(tokenizeInline(input));
    // Should produce: text(\u00A0), text(\u00A0), text(weight), br void, span with children
    const types = tree.map((s) => s.type);
    assert.ok(types.includes(`text`));
    assert.ok(types.includes(`br`));
    assert.ok(types.includes(`span`));
    const span = tree.find((s) => s.tag === `span`);
    assert.ok(span);
    assert.deepStrictEqual(span.attrs, { style: `border-top:1px solid black;` });
    assert.equal(span.children[0].text, `wing area`);
  });
});

describe(`findMatchedTokenIndices`, () => {
  it(`returns empty set for plain text`, () => {
    const tokens = tokenizeInline(`hello world`);
    const matched = findMatchedTokenIndices(tokens);
    assert.equal(matched.size, 0);
  });

  it(`marks matched ** open/close as matched`, () => {
    const tokens = tokenizeInline(`a **b** c`);
    const matched = findMatchedTokenIndices(tokens);
    // tokens: [text, bold-open, text, bold-close, text]
    assert.ok(matched.has(1)); // bold-open
    assert.ok(matched.has(3)); // bold-close
    assert.equal(matched.size, 2);
  });

  it(`marks matched * open/close as matched`, () => {
    const tokens = tokenizeInline(`a *b* c`);
    const matched = findMatchedTokenIndices(tokens);
    assert.ok(matched.has(1)); // italic-open
    assert.ok(matched.has(3)); // italic-close
    assert.equal(matched.size, 2);
  });

  it(`marks matched ~~ open/close as matched`, () => {
    const tokens = tokenizeInline(`a ~~b~~ c`);
    const matched = findMatchedTokenIndices(tokens);
    assert.ok(matched.has(1)); // strikethrough-open
    assert.ok(matched.has(3)); // strikethrough-close
    assert.equal(matched.size, 2);
  });

  it(`marks matched HTML tags as matched`, () => {
    const tokens = tokenizeInline(`H<sub>2</sub>O`);
    const matched = findMatchedTokenIndices(tokens);
    // tokens: [text, html-open, text, html-close, text]
    assert.ok(matched.has(1)); // html-open
    assert.ok(matched.has(3)); // html-close
    assert.equal(matched.size, 2);
  });

  it(`returns empty set for unmatched *`, () => {
    const tokens = tokenizeInline(`this is a *`);
    const matched = findMatchedTokenIndices(tokens);
    assert.equal(matched.size, 0);
  });

  it(`returns empty set for unmatched ~~`, () => {
    const tokens = tokenizeInline(`this is a ~~`);
    const matched = findMatchedTokenIndices(tokens);
    assert.equal(matched.size, 0);
  });

  it(`returns empty set for unmatched <sub>`, () => {
    const tokens = tokenizeInline(`text <sub>`);
    const matched = findMatchedTokenIndices(tokens);
    assert.equal(matched.size, 0);
  });

  it(`handles mix of matched and unmatched`, () => {
    // **bold** and * — ** pair is matched, lone * is not
    const tokens = tokenizeInline(`**bold** and *`);
    const matched = findMatchedTokenIndices(tokens);
    // tokens: [bold-open, text, bold-close, text, italic-open]
    assert.ok(matched.has(0)); // bold-open
    assert.ok(matched.has(2)); // bold-close
    assert.ok(!matched.has(4)); // italic-open (unmatched)
    assert.equal(matched.size, 2);
  });

  it(`marks image tokens as matched`, () => {
    const tokens = tokenizeInline(`see ![photo](./img.png) here`);
    const matched = findMatchedTokenIndices(tokens);
    // tokens: [text, image, text]
    assert.ok(matched.has(1)); // image
    assert.equal(matched.size, 1);
  });

  it(`marks void HTML tokens as matched`, () => {
    const tokens = tokenizeInline(`line1<br>line2`);
    const matched = findMatchedTokenIndices(tokens);
    // tokens: [text, html-void, text]
    assert.ok(matched.has(1)); // html-void
    assert.equal(matched.size, 1);
  });

  it(`marks matched arbitrary HTML open/close as matched`, () => {
    const tokens = tokenizeInline(`<span style="x">text</span>`);
    const matched = findMatchedTokenIndices(tokens);
    assert.ok(matched.has(0)); // html-open
    assert.ok(matched.has(2)); // html-close
    assert.equal(matched.size, 2);
  });
});
