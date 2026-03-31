/**
 * @fileoverview Unit tests for tree-diffing functions: contentSimilarity,
 * matchChildren, updateMatchedNode, and SyntaxTree.updateUsing.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SyntaxNode } from '../../../src/parsers/old/syntax-node.js';
import { contentSimilarity, matchChildren } from '../../../src/parsers/old/syntax-tree.js';

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
    const line = `This is a ~~long~~ repeated line with [links](https://example.com) and **bold** formatting that pads the string`.repeat(2);
    const a = Array.from({ length: 60 }, () => line).join(`\n`);
    const b = Array.from({ length: 60 }, (_, i) => (i < 55 ? line : `A completely different line with \`code\` and *emphasis* that replaces the original`.repeat(2))).join(`\n`);
    const result = contentSimilarity(a, b);
    assert.ok(result > 0 && result < 1, `expected between 0 and 1, got ${result}`);
  });
});

describe(`matchChildren`, () => {
  it(`matches every child when lists are identical`, () => {
    const old1 = new SyntaxNode(`paragraph`, `The **quick** brown fox jumps over the *lazy* dog`);
    const old2 = new SyntaxNode(`paragraph`, `Use \`npm install\` to get started with the **new** parser`);
    const new1 = new SyntaxNode(`paragraph`, `The **quick** brown fox jumps over the *lazy* dog`);
    const new2 = new SyntaxNode(`paragraph`, `Use \`npm install\` to get started with the **new** parser`);
    const result = matchChildren([old1, old2], [new1, new2]);
    assert.strictEqual(result.size, 2);
    assert.strictEqual(result.get(new1), old1);
    assert.strictEqual(result.get(new2), old2);
  });

  it(`fuzzy-matches an edited node while exact-matching unedited ones`, () => {
    const old1 = new SyntaxNode(`paragraph`, `The **quick** brown fox jumps over the *lazy* dog`);
    const old2 = new SyntaxNode(`paragraph`, `Use \`npm install\` to get started with the **new** parser`);
    const new1 = new SyntaxNode(`paragraph`, `The **quick** brown fox jumps over the *lazy* dog`);
    const new2 = new SyntaxNode(`paragraph`, `Use \`npm install\` to get started with the **updated** parser`);
    const result = matchChildren([old1, old2], [new1, new2]);
    assert.strictEqual(result.size, 2);
    assert.strictEqual(result.get(new1), old1);
    assert.strictEqual(result.get(new2), old2);
  });

  it(`matches existing nodes when a new node is inserted at start`, () => {
    const old1 = new SyntaxNode(`paragraph`, `The **quick** brown fox jumps over the *lazy* dog`);
    const old2 = new SyntaxNode(`paragraph`, `See the [installation guide](https://example.com) for ~~manual~~ **automated** setup`);
    const newInserted = new SyntaxNode(`heading1`, `Introduction`);
    const new1 = new SyntaxNode(`paragraph`, `The **quick** brown fox jumps over the *lazy* dog`);
    const new2 = new SyntaxNode(`paragraph`, `See the [installation guide](https://example.com) for ~~manual~~ **automated** setup`);
    const result = matchChildren([old1, old2], [newInserted, new1, new2]);
    assert.strictEqual(result.size, 2);
    assert.strictEqual(result.has(newInserted), false);
    assert.strictEqual(result.get(new1), old1);
    assert.strictEqual(result.get(new2), old2);
  });

  it(`matches surviving nodes when a node is deleted`, () => {
    const old1 = new SyntaxNode(`paragraph`, `The **quick** brown fox jumps over the *lazy* dog`);
    const old2 = new SyntaxNode(`paragraph`, `Use \`npm install\` to get started with the **new** parser`);
    const old3 = new SyntaxNode(`paragraph`, `See the [installation guide](https://example.com) for ~~manual~~ **automated** setup`);
    const new1 = new SyntaxNode(`paragraph`, `The **quick** brown fox jumps over the *lazy* dog`);
    const new3 = new SyntaxNode(`paragraph`, `See the [installation guide](https://example.com) for ~~manual~~ **automated** setup`);
    const result = matchChildren([old1, old2, old3], [new1, new3]);
    assert.strictEqual(result.size, 2);
    assert.strictEqual(result.get(new1), old1);
    assert.strictEqual(result.get(new3), old3);
    const matchedOlds = new Set(result.values());
    assert.strictEqual(matchedOlds.has(old2), false);
  });

  it(`matches all nodes despite reordering`, () => {
    const old1 = new SyntaxNode(`paragraph`, `The **quick** brown fox jumps over the *lazy* dog`);
    const old2 = new SyntaxNode(`paragraph`, `Use \`npm install\` to get started with the **new** parser`);
    const old3 = new SyntaxNode(`paragraph`, `See the [installation guide](https://example.com) for ~~manual~~ **automated** setup`);
    const new1 = new SyntaxNode(`paragraph`, `See the [installation guide](https://example.com) for ~~manual~~ **automated** setup`);
    const new2 = new SyntaxNode(`paragraph`, `The **quick** brown fox jumps over the *lazy* dog`);
    const new3 = new SyntaxNode(`paragraph`, `Use \`npm install\` to get started with the **new** parser`);
    const result = matchChildren([old1, old2, old3], [new1, new2, new3]);
    assert.strictEqual(result.size, 3);
    assert.strictEqual(result.get(new1), old3);
    assert.strictEqual(result.get(new2), old1);
    assert.strictEqual(result.get(new3), old2);
  });

  it(`does not match nodes with different types`, () => {
    const old1 = new SyntaxNode(`paragraph`, `The **quick** brown fox jumps over the *lazy* dog`);
    const new1 = new SyntaxNode(`heading1`, `The **quick** brown fox jumps over the *lazy* dog`);
    const result = matchChildren([old1], [new1]);
    assert.strictEqual(result.size, 0);
  });

  it(`matches duplicate identical nodes to distinct originals`, () => {
    const content = `The **quick** brown fox jumps over the *lazy* dog`;
    const old1 = new SyntaxNode(`paragraph`, content);
    const old2 = new SyntaxNode(`paragraph`, content);
    const new1 = new SyntaxNode(`paragraph`, content);
    const new2 = new SyntaxNode(`paragraph`, content);
    const result = matchChildren([old1, old2], [new1, new2]);
    assert.strictEqual(result.size, 2);
    assert.notStrictEqual(result.get(new1), result.get(new2));
  });

  it(`prefers html-block with same tagName as tiebreaker`, () => {
    const oldDetails = new SyntaxNode(`html-block`, ``);
    oldDetails.attributes = { tagName: `details`, openingTag: `<details>`, closingTag: `</details>` };
    const oldDiv = new SyntaxNode(`html-block`, ``);
    oldDiv.attributes = { tagName: `div`, openingTag: `<div>`, closingTag: `</div>` };
    const newDetails = new SyntaxNode(`html-block`, ``);
    newDetails.attributes = { tagName: `details`, openingTag: `<details>`, closingTag: `</details>` };
    const result = matchChildren([oldDiv, oldDetails], [newDetails]);
    assert.strictEqual(result.get(newDetails), oldDetails);
  });

  it(`prefers list-item with same indent as tiebreaker`, () => {
    const oldIndent0 = new SyntaxNode(`list-item`, `Navigate to the **project** directory and run \`npm test\``);
    oldIndent0.attributes = { indent: 0 };
    const oldIndent1 = new SyntaxNode(`list-item`, `Navigate to the **project** directory and run \`npm test\``);
    oldIndent1.attributes = { indent: 1 };
    const newIndent0 = new SyntaxNode(`list-item`, `Navigate to the **project** directory and run \`npm test\``);
    newIndent0.attributes = { indent: 0 };
    const result = matchChildren([oldIndent1, oldIndent0], [newIndent0]);
    assert.strictEqual(result.get(newIndent0), oldIndent0);
  });
});
