/**
 * @fileoverview Unit tests for tree-diffing functions:
 * matchChildren, updateMatchedNode.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SyntaxNode, matchChildren, updateMatchedNode } from '../../index.js';

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

  it(`prefers html-element with same tagName as tiebreaker`, () => {
    const oldDetails = new SyntaxNode(`html-element`, ``);
    oldDetails.tagName = `details`;
    oldDetails.runtime = { openingTag: `<details>`, closingTag: `</details>` };
    const oldDiv = new SyntaxNode(`html-element`, ``);
    oldDiv.tagName = `div`;
    oldDiv.runtime = { openingTag: `<div>`, closingTag: `</div>` };
    const newDetails = new SyntaxNode(`html-element`, ``);
    newDetails.tagName = `details`;
    newDetails.runtime = { openingTag: `<details>`, closingTag: `</details>` };
    const result = matchChildren([oldDiv, oldDetails], [newDetails]);
    assert.strictEqual(result.get(newDetails), oldDetails);
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
      openingTag: `<details>`,
      closingTag: `</details>`,
      detailsOpen: true,
    };
    const newAttrs = { openingTag: `<details open>`, closingTag: `</details>` };
    const oldNode = new SyntaxNode(`html-element`, ``);
    oldNode.tagName = `details`;
    oldNode.attributes = oldAttrs;
    const newNode = new SyntaxNode(`html-element`, ``);
    newNode.tagName = `details`;
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

  it(`recursively matches and updates html-element children`, () => {
    const oldChildContent = `This is a paragraph`;
    const newChildContent = `This is a paragraph updated`;

    const oldChild = new SyntaxNode(`paragraph`, oldChildContent);
    const oldContainer = new SyntaxNode(`html-element`, ``);
    oldContainer.tagName = `details`;
    oldContainer.runtime = { openingTag: `<details>`, closingTag: `</details>` };
    oldContainer.children = [oldChild];
    oldChild.parent = oldContainer;
    const oldChildId = oldChild.id;

    const newChild = new SyntaxNode(`paragraph`, newChildContent);
    const newContainer = new SyntaxNode(`html-element`, ``);
    newContainer.tagName = `details`;
    newContainer.runtime = { openingTag: `<details>`, closingTag: `</details>` };
    newContainer.children = [newChild];
    newChild.parent = newContainer;

    updateMatchedNode(oldContainer, newContainer);
    assert.strictEqual(oldContainer.children.length, 1);
    assert.strictEqual(oldContainer.children[0].id, oldChildId);
    assert.strictEqual(oldContainer.children[0].content, newChildContent);
    assert.strictEqual(oldContainer.children[0].parent, oldContainer);
  });

  it(`clears children for html-element void elements`, () => {
    const oldChild = new SyntaxNode(`paragraph`, `leftover child`);
    const oldNode = new SyntaxNode(`html-element`, ``);
    oldNode.tagName = `hr`;
    oldNode.runtime = { openingTag: `<hr />`, closingTag: `` };
    oldNode.children = [oldChild];
    const newNode = new SyntaxNode(`html-element`, ``);
    newNode.tagName = `hr`;
    newNode.runtime = { openingTag: `<hr />`, closingTag: `` };
    newNode.children = [];
    updateMatchedNode(oldNode, newNode);
    assert.strictEqual(oldNode.children.length, 0);
  });
});
