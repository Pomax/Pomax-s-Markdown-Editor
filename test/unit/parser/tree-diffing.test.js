/**
 * @fileoverview Unit tests for tree-diffing functions: contentSimilarity,
 * matchChildren, updateMatchedNode, and SyntaxTree.updateUsing.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SyntaxNode } from '../../../src/parsers/old/syntax-node.js';
import {
  contentSimilarity,
  matchChildren,
  updateMatchedNode,
} from '../../../src/parsers/old/syntax-tree.js';

describe(`contentSimilarity`, () => {
  it(`returns 1 for two empty strings`, () => {
    assert.strictEqual(contentSimilarity(``, ``), 1);
  });

  it(`returns 1 for identical markdown strings`, () => {
    const md = `The **quick** brown fox jumps over the *lazy* dog`;
    assert.strictEqual(contentSimilarity(md, md), 1);
  });

  it(`returns 0 for completely different strings of equal length`, () => {
    const a = `Use \`npm install\` to set up the **project** locally`;
    const b = `XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`;
    assert.strictEqual(contentSimilarity(a, b), 0);
  });

  it(`returns a high score for a small edit in a markdown paragraph`, () => {
    const a = `See the [installation guide](https://example.com) for **automated** setup`;
    const b = `See the [installation guide](https://example.com) for **manual** setup`;
    const result = contentSimilarity(a, b);
    assert.ok(result > 0.85 && result < 1, `expected high similarity, got ${result}`);
  });

  it(`returns 0 when one string is empty`, () => {
    assert.strictEqual(contentSimilarity(`A paragraph with *italic* and **bold** text`, ``), 0);
  });

  it(`uses line-level fast-path for strings both > 10000 chars`, () => {
    const line =
      `This is a ~~long~~ repeated line with [links](https://example.com) and **bold** formatting that pads the string`.repeat(
        2,
      );
    const a = Array.from({ length: 60 }, () => line).join(`\n`);
    const b = Array.from({ length: 60 }, (_, i) =>
      i < 55
        ? line
        : `A completely different line with \`code\` and *emphasis* that replaces the original`.repeat(
            2,
          ),
    ).join(`\n`);
    const result = contentSimilarity(a, b);
    assert.ok(result > 0 && result < 1, `expected between 0 and 1, got ${result}`);
  });
});

describe(`matchChildren`, () => {
  const contentA = `The **quick** brown fox jumps over the *lazy* dog`;
  const contentB = `Use \`npm install\` to get started with the **new** parser`;
  const contentC = `See the [installation guide](https://example.com) for ~~manual~~ **automated** setup`;

  it(`matches every child when lists are identical`, () => {
    const old1 = new SyntaxNode(`paragraph`, contentA);
    const old2 = new SyntaxNode(`paragraph`, contentB);
    const new1 = new SyntaxNode(`paragraph`, contentA);
    const new2 = new SyntaxNode(`paragraph`, contentB);
    const result = matchChildren([old1, old2], [new1, new2]);
    assert.strictEqual(result.size, 2);
    assert.strictEqual(result.get(new1), old1);
    assert.strictEqual(result.get(new2), old2);
  });

  it(`fuzzy-matches an edited node while exact-matching unedited ones`, () => {
    const editedContent = `Use \`npm install\` to get started with the **updated** parser`;
    const old1 = new SyntaxNode(`paragraph`, contentA);
    const old2 = new SyntaxNode(`paragraph`, contentB);
    const new1 = new SyntaxNode(`paragraph`, contentA);
    const new2 = new SyntaxNode(`paragraph`, editedContent);
    const result = matchChildren([old1, old2], [new1, new2]);
    assert.strictEqual(result.size, 2);
    assert.strictEqual(result.get(new1), old1);
    assert.strictEqual(result.get(new2), old2);
  });

  it(`matches existing nodes when a new node is inserted at start`, () => {
    const insertedContent = `Introduction`;
    const old1 = new SyntaxNode(`paragraph`, contentA);
    const old2 = new SyntaxNode(`paragraph`, contentC);
    const newInserted = new SyntaxNode(`heading1`, insertedContent);
    const new1 = new SyntaxNode(`paragraph`, contentA);
    const new2 = new SyntaxNode(`paragraph`, contentC);
    const result = matchChildren([old1, old2], [newInserted, new1, new2]);
    assert.strictEqual(result.size, 2);
    assert.strictEqual(result.has(newInserted), false);
    assert.strictEqual(result.get(new1), old1);
    assert.strictEqual(result.get(new2), old2);
  });

  it(`matches surviving nodes when a node is deleted`, () => {
    const old1 = new SyntaxNode(`paragraph`, contentA);
    const old2 = new SyntaxNode(`paragraph`, contentB);
    const old3 = new SyntaxNode(`paragraph`, contentC);
    const new1 = new SyntaxNode(`paragraph`, contentA);
    const new3 = new SyntaxNode(`paragraph`, contentC);
    const result = matchChildren([old1, old2, old3], [new1, new3]);
    assert.strictEqual(result.size, 2);
    assert.strictEqual(result.get(new1), old1);
    assert.strictEqual(result.get(new3), old3);
    const matchedOlds = new Set(result.values());
    assert.strictEqual(matchedOlds.has(old2), false);
  });

  it(`matches all nodes despite reordering`, () => {
    const old1 = new SyntaxNode(`paragraph`, contentA);
    const old2 = new SyntaxNode(`paragraph`, contentB);
    const old3 = new SyntaxNode(`paragraph`, contentC);
    const new1 = new SyntaxNode(`paragraph`, contentC);
    const new2 = new SyntaxNode(`paragraph`, contentA);
    const new3 = new SyntaxNode(`paragraph`, contentB);
    const result = matchChildren([old1, old2, old3], [new1, new2, new3]);
    assert.strictEqual(result.size, 3);
    assert.strictEqual(result.get(new1), old3);
    assert.strictEqual(result.get(new2), old1);
    assert.strictEqual(result.get(new3), old2);
  });

  it(`does not match nodes with different types`, () => {
    const old1 = new SyntaxNode(`paragraph`, contentA);
    const new1 = new SyntaxNode(`heading1`, contentA);
    const result = matchChildren([old1], [new1]);
    assert.strictEqual(result.size, 0);
  });

  it(`matches duplicate identical nodes to distinct originals`, () => {
    const old1 = new SyntaxNode(`paragraph`, contentA);
    const old2 = new SyntaxNode(`paragraph`, contentA);
    const new1 = new SyntaxNode(`paragraph`, contentA);
    const new2 = new SyntaxNode(`paragraph`, contentA);
    const result = matchChildren([old1, old2], [new1, new2]);
    assert.strictEqual(result.size, 2);
    assert.notStrictEqual(result.get(new1), result.get(new2));
  });

  it(`prefers html-block with same tagName as tiebreaker`, () => {
    const detailsAttrs = { tagName: `details`, openingTag: `<details>`, closingTag: `</details>` };
    const divAttrs = { tagName: `div`, openingTag: `<div>`, closingTag: `</div>` };
    const oldDetails = new SyntaxNode(`html-block`, ``);
    oldDetails.attributes = { ...detailsAttrs };
    const oldDiv = new SyntaxNode(`html-block`, ``);
    oldDiv.attributes = { ...divAttrs };
    const newDetails = new SyntaxNode(`html-block`, ``);
    newDetails.attributes = { ...detailsAttrs };
    const result = matchChildren([oldDiv, oldDetails], [newDetails]);
    assert.strictEqual(result.get(newDetails), oldDetails);
  });

  it(`prefers list-item with same indent as tiebreaker`, () => {
    const listContent = `Navigate to the **project** directory and run \`npm test\``;
    const oldIndent0 = new SyntaxNode(`list-item`, listContent);
    oldIndent0.attributes = { indent: 0 };
    const oldIndent1 = new SyntaxNode(`list-item`, listContent);
    oldIndent1.attributes = { indent: 1 };
    const newIndent0 = new SyntaxNode(`list-item`, listContent);
    newIndent0.attributes = { indent: 0 };
    const result = matchChildren([oldIndent1, oldIndent0], [newIndent0]);
    assert.strictEqual(result.get(newIndent0), oldIndent0);
  });
});

describe(`updateMatchedNode`, () => {
  it(`updates content and preserves id`, () => {
    const oldContent = `This is **bold text** here.`;
    const newContent = `This is **bold text** updated.`;
    const oldNode = new SyntaxNode(`paragraph`, oldContent);
    const oldId = oldNode.id;
    const newNode = new SyntaxNode(`paragraph`, newContent);
    updateMatchedNode(oldNode, newNode);
    assert.strictEqual(oldNode.id, oldId);
    assert.strictEqual(oldNode.content, newContent);
  });

  it(`copies attributes and preserves detailsOpen when present`, () => {
    const oldAttrs = {
      tagName: `details`,
      openingTag: `<details>`,
      closingTag: `</details>`,
      detailsOpen: true,
    };
    const newAttrs = { tagName: `details`, openingTag: `<details open>`, closingTag: `</details>` };
    const oldNode = new SyntaxNode(`html-block`, ``);
    oldNode.attributes = oldAttrs;
    const newNode = new SyntaxNode(`html-block`, ``);
    newNode.attributes = newAttrs;
    updateMatchedNode(oldNode, newNode);
    assert.strictEqual(oldNode.attributes.openingTag, newAttrs.openingTag);
    assert.strictEqual(oldNode.attributes.detailsOpen, true);
  });

  it(`copies startLine and endLine`, () => {
    const content = `This is *italic text* here.`;
    const oldNode = new SyntaxNode(`paragraph`, content);
    oldNode.startLine = 0;
    oldNode.endLine = 0;
    const newNode = new SyntaxNode(`paragraph`, content);
    newNode.startLine = 5;
    newNode.endLine = 5;
    updateMatchedNode(oldNode, newNode);
    assert.strictEqual(oldNode.startLine, newNode.startLine);
    assert.strictEqual(oldNode.endLine, newNode.endLine);
  });

  it(`rebuilds inline children after content update on a paragraph`, () => {
    const oldContent = `This is ~~struck~~ here.`;
    const newContent = `This is ~~struck~~ and **bold** here.`;
    const oldNode = new SyntaxNode(`paragraph`, oldContent);
    const oldChildCount = oldNode.children.length;
    const newNode = new SyntaxNode(`paragraph`, newContent);
    updateMatchedNode(oldNode, newNode);
    assert.strictEqual(oldNode.content, newContent);
    assert.ok(oldNode.children.length > 0);
    assert.notStrictEqual(oldNode.children.length, oldChildCount);
  });

  it(`recursively matches and updates html-block children`, () => {
    const oldChildContent = `This is a paragraph`;
    const newChildContent = `This is a paragraph updated`;
    const containerAttrs = {
      tagName: `details`,
      openingTag: `<details>`,
      closingTag: `</details>`,
    };

    const oldChild = new SyntaxNode(`paragraph`, oldChildContent);
    const oldContainer = new SyntaxNode(`html-block`, ``);
    oldContainer.attributes = { ...containerAttrs };
    oldContainer.children = [oldChild];
    oldChild.parent = oldContainer;
    const oldChildId = oldChild.id;

    const newChild = new SyntaxNode(`paragraph`, newChildContent);
    const newContainer = new SyntaxNode(`html-block`, ``);
    newContainer.attributes = { ...containerAttrs };
    newContainer.children = [newChild];
    newChild.parent = newContainer;

    updateMatchedNode(oldContainer, newContainer);
    assert.strictEqual(oldContainer.children.length, 1);
    assert.strictEqual(oldContainer.children[0].id, oldChildId);
    assert.strictEqual(oldContainer.children[0].content, newChildContent);
    assert.strictEqual(oldContainer.children[0].parent, oldContainer);
  });

  it(`clears children for html-block void elements`, () => {
    const voidAttrs = { tagName: `hr`, openingTag: `<hr />`, closingTag: `` };
    const oldChild = new SyntaxNode(`paragraph`, `leftover child`);
    const oldNode = new SyntaxNode(`html-block`, ``);
    oldNode.attributes = { ...voidAttrs };
    oldNode.children = [oldChild];
    const newNode = new SyntaxNode(`html-block`, ``);
    newNode.attributes = { ...voidAttrs };
    newNode.children = [];
    updateMatchedNode(oldNode, newNode);
    assert.strictEqual(oldNode.children.length, 0);
  });
});
