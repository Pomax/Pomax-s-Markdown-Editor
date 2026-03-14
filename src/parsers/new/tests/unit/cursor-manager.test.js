/**
 * @fileoverview Unit tests for CursorManager and offset resolution.
 *
 * Parses known markdown strings via the Parser, then verifies that
 * setCursor path+offset navigation resolves to the correct inline
 * child node.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Parser } from '../../index.js';

describe(`CursorManager`, () => {
  describe(`setCursor path navigation`, () => {
    it(`resolves offset in a plain paragraph to the text node`, async () => {
      const tree = await Parser.parse(`Hello world`);
      // paragraph → text "Hello world"
      tree.cursor.setCursor(0, 3);
      const c = tree.cursor.cursors[0];
      assert.equal(c.nodeId, tree.children[0].children[0].id);
      assert.equal(c.offset, 3);
    });

    it(`resolves offset at start of paragraph to first text child`, async () => {
      const tree = await Parser.parse(`Hello world`);
      tree.cursor.setCursor(0, 0);
      const c = tree.cursor.cursors[0];
      assert.equal(c.nodeId, tree.children[0].children[0].id);
      assert.equal(c.offset, 0);
    });
  });

  describe(`bold offset resolution`, () => {
    it(`offset in text before bold resolves to that text node`, async () => {
      // "This is **bold text** here."
      //  01234567
      const tree = await Parser.parse(`This is **bold text** here.`);
      tree.cursor.setCursor(0, 3);
      const c = tree.cursor.cursors[0];
      assert.equal(c.nodeId, tree.children[0].children[0].id, `should be first text node`);
      assert.equal(c.offset, 3);
    });

    it(`offset on bold opening delimiter stays on the bold node`, async () => {
      const tree = await Parser.parse(`This is **bold text** here.`);
      // offset 8 = first *, offset 9 = second *
      tree.cursor.setCursor(0, 8);
      const c = tree.cursor.cursors[0];
      const boldNode = tree.children[0].children[1];
      assert.equal(boldNode.type, `bold`);
      assert.equal(c.nodeId, boldNode.id);
      assert.equal(c.offset, 0);
    });

    it(`offset inside bold content resolves to the text inside bold`, async () => {
      const tree = await Parser.parse(`This is **bold text** here.`);
      // offset 10 = first char of "bold text" inside **
      // "This is " = 8 chars, "**" = 2 chars → content starts at 10
      tree.cursor.setCursor(0, 10);
      const c = tree.cursor.cursors[0];
      const boldTextNode = tree.children[0].children[1].children[0];
      assert.equal(boldTextNode.type, `text`);
      assert.equal(boldTextNode.content, `bold text`);
      assert.equal(c.nodeId, boldTextNode.id);
      assert.equal(c.offset, 0);
    });

    it(`offset on bold closing delimiter stays on the bold node`, async () => {
      const tree = await Parser.parse(`This is **bold text** here.`);
      // bold markdown: "**bold text**" (13 chars)
      // closing ** at positions 11,12 within bold
      // In paragraph: "This is " (8) + bold starts at 8
      // offset 19 = 8 + 11 = first closing *
      tree.cursor.setCursor(0, 19);
      const c = tree.cursor.cursors[0];
      const boldNode = tree.children[0].children[1];
      assert.equal(c.nodeId, boldNode.id);
      assert.equal(c.offset, 11);
    });

    it(`offset after bold resolves to trailing text node`, async () => {
      const tree = await Parser.parse(`This is **bold text** here.`);
      // "This is " (8) + "**bold text**" (13) = 21 → " here." starts at 21
      tree.cursor.setCursor(0, 21);
      const c = tree.cursor.cursors[0];
      const trailingText = tree.children[0].children[2];
      assert.equal(trailingText.type, `text`);
      assert.equal(trailingText.content, ` here.`);
      assert.equal(c.nodeId, trailingText.id);
      assert.equal(c.offset, 0);
    });
  });

  describe(`heading prefix handling`, () => {
    it(`offset in heading prefix stays on the heading node`, async () => {
      const tree = await Parser.parse(`## Hello`);
      // "## " is 3-char prefix, offset 1 is in the prefix
      tree.cursor.setCursor(0, 1);
      const c = tree.cursor.cursors[0];
      assert.equal(c.nodeId, tree.children[0].id);
      assert.equal(c.offset, 1);
    });

    it(`offset past heading prefix resolves into inline children`, async () => {
      const tree = await Parser.parse(`## Hello`);
      // "## Hello" → prefix "## " (3 chars), content "Hello"
      // offset 3 = first char of content → text child
      tree.cursor.setCursor(0, 3);
      const c = tree.cursor.cursors[0];
      const textNode = tree.children[0].children[0];
      assert.equal(textNode.type, `text`);
      assert.equal(c.nodeId, textNode.id);
      assert.equal(c.offset, 0);
    });

    it(`offset in heading with bold resolves through to bold text`, async () => {
      const tree = await Parser.parse(`## Hello **world**`);
      // "## " (3) + "Hello " (6) + "**world**" (9)
      // offset 3+6+2 = 11 → first char inside bold content
      tree.cursor.setCursor(0, 11);
      const c = tree.cursor.cursors[0];
      const boldNode = tree.children[0].children[1];
      assert.equal(boldNode.type, `bold`);
      const boldText = boldNode.children[0];
      assert.equal(boldText.content, `world`);
      assert.equal(c.nodeId, boldText.id);
      assert.equal(c.offset, 0);
    });
  });

  describe(`italic offset resolution`, () => {
    it(`offset inside italic content resolves to text inside italic`, async () => {
      const tree = await Parser.parse(`This is *italic text* here.`);
      // "This is " (8) + "*" (1) → content starts at 9
      tree.cursor.setCursor(0, 9);
      const c = tree.cursor.cursors[0];
      const italicText = tree.children[0].children[1].children[0];
      assert.equal(italicText.type, `text`);
      assert.equal(italicText.content, `italic text`);
      assert.equal(c.nodeId, italicText.id);
      assert.equal(c.offset, 0);
    });
  });

  describe(`strikethrough offset resolution`, () => {
    it(`offset inside strikethrough resolves to inner text`, async () => {
      const tree = await Parser.parse(`This is ~~struck~~ here.`);
      // "This is " (8) + "~~" (2) → content starts at 10
      tree.cursor.setCursor(0, 10);
      const c = tree.cursor.cursors[0];
      const innerText = tree.children[0].children[1].children[0];
      assert.equal(innerText.content, `struck`);
      assert.equal(c.nodeId, innerText.id);
      assert.equal(c.offset, 0);
    });
  });

  describe(`link offset resolution`, () => {
    it(`offset inside link text resolves to text inside link`, async () => {
      const tree = await Parser.parse(`click [here](https://x.com) now`);
      // "click " (6) + "[" (1) → link text starts at 7
      tree.cursor.setCursor(0, 7);
      const c = tree.cursor.cursors[0];
      const linkText = tree.children[0].children[1].children[0];
      assert.equal(linkText.content, `here`);
      assert.equal(c.nodeId, linkText.id);
      assert.equal(c.offset, 0);
    });

    it(`offset on link opening bracket stays on link node`, async () => {
      const tree = await Parser.parse(`click [here](https://x.com) now`);
      // "click " (6) → "[" is at offset 6
      tree.cursor.setCursor(0, 6);
      const c = tree.cursor.cursors[0];
      const linkNode = tree.children[0].children[1];
      assert.equal(linkNode.type, `link`);
      assert.equal(c.nodeId, linkNode.id);
      assert.equal(c.offset, 0);
    });

    it(`offset in link suffix stays on link node`, async () => {
      const tree = await Parser.parse(`click [here](https://x.com) now`);
      // link markdown: "[here](https://x.com)" = 1 + 4 + 2 + 13 + 1 = 21
      // suffix starts at position 5 (after "[here")
      // "click " (6) + link suffix region → offset 6 + 5 = 11
      tree.cursor.setCursor(0, 11);
      const c = tree.cursor.cursors[0];
      const linkNode = tree.children[0].children[1];
      assert.equal(c.nodeId, linkNode.id);
      assert.equal(c.offset, 5);
    });
  });

  describe(`nested inline formatting`, () => {
    it(`resolves through link into nested bold text`, async () => {
      const tree = await Parser.parse(`[click **here**](https://x.com)`);
      // link "[click **here**](https://x.com)"
      // offset 0 = "[" → link node
      // offset 1 = "c" → into link children
      // link children: text "click " (6), bold "**here**" (8)
      // offset 1+6 = 7 → past text child, into bold
      // offset 7: "click " consumed (6), "**" prefix of bold (2)
      // 7 - 6 = 1 into bold → offset 1 < prefix 2 → stays on bold
      tree.cursor.setCursor(0, 8);
      // offset 8 in paragraph → offset 8 in link (paragraph prefix=0, link starts at 0)
      // Wait, link is the first child, offset 0 in paragraph = "[" of link.
      // offset 8: link prefix 1 → contentOffset = 7
      // text "click " length 6: 7 >= 6, contentOffset = 1
      // bold "**here**" length 8: 1 < 8, recurse into bold at offset 1
      // bold prefix 2: offset 1 < 2 → stays on bold
      const c = tree.cursor.cursors[0];
      const linkNode = tree.children[0].children[0];
      assert.equal(linkNode.type, `link`);
      const boldNode = linkNode.children[1];
      assert.equal(boldNode.type, `bold`);
      assert.equal(c.nodeId, boldNode.id);
      assert.equal(c.offset, 1);
    });

    it(`resolves deep into bold text within a link`, async () => {
      const tree = await Parser.parse(`[click **here**](https://x.com)`);
      // offset 9: link prefix 1 → contentOffset = 8
      // text "click " (6): 8 >= 6, contentOffset = 2
      // bold "**here**" (8): 2 < 8, recurse at offset 2
      // bold prefix 2: offset 2 >= 2 → in content
      // contentOffset = 2 - 2 = 0
      // text "here" (4): 0 < 4 → recurse at offset 0
      // text has no children → OffsetPoint(text.id, 0)
      tree.cursor.setCursor(0, 9);
      const c = tree.cursor.cursors[0];
      const boldText = tree.children[0].children[0].children[1].children[0];
      assert.equal(boldText.type, `text`);
      assert.equal(boldText.content, `here`);
      assert.equal(c.nodeId, boldText.id);
      assert.equal(c.offset, 0);
    });
  });

  describe(`inline code (leaf node)`, () => {
    it(`offset landing on inline-code stays on the inline-code node`, async () => {
      const tree = await Parser.parse(`This is \`code\` here.`);
      // "This is " (8) → "`code`" starts at 8
      // inline-code markdown is "`code`" (6 chars)
      // offset 8 = first backtick → inline-code node (leaf, no children)
      tree.cursor.setCursor(0, 8);
      const c = tree.cursor.cursors[0];
      const codeNode = tree.children[0].children[1];
      assert.equal(codeNode.type, `inline-code`);
      assert.equal(c.nodeId, codeNode.id);
      assert.equal(c.offset, 0);
    });
  });

  describe(`multi-cursor`, () => {
    it(`addCursor accumulates multiple cursors`, async () => {
      const tree = await Parser.parse(`Hello world`);
      tree.cursor.setCursor(0, 0);
      tree.cursor.addCursor(0, 5);
      assert.equal(tree.cursor.cursors.length, 2);
      assert.equal(tree.cursor.cursors[0].offset, 0);
      assert.equal(tree.cursor.cursors[1].offset, 5);
    });

    it(`setCursor replaces all existing cursors`, async () => {
      const tree = await Parser.parse(`Hello world`);
      tree.cursor.addCursor(0, 0);
      tree.cursor.addCursor(0, 5);
      tree.cursor.addCursor(0, 8);
      assert.equal(tree.cursor.cursors.length, 3);
      tree.cursor.setCursor(0, 2);
      assert.equal(tree.cursor.cursors.length, 1);
    });
  });

  describe(`error handling`, () => {
    it(`throws on invalid child index`, async () => {
      const tree = await Parser.parse(`Hello`);
      assert.throws(() => tree.cursor.setCursor(5, 0), RangeError);
    });

    it(`throws on too few arguments`, async () => {
      const tree = await Parser.parse(`Hello`);
      assert.throws(() => tree.cursor.setCursor(0), Error);
    });
  });
});
