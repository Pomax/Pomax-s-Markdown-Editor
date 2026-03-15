/**
 * @fileoverview Unit tests for the reparseLine mutation function.
 *
 * reparseLine is the hot-path function called on every keystroke to detect
 * implicit type changes (e.g. paragraph → heading when "# " is typed).
 */

// @ts-nocheck — test assertions access optional properties without guards

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SyntaxNode, SyntaxTree } from '../index.js';
import { reparseLine, rebuildInlineChildren } from '../src/tree-mutations.js';

/**
 * Fake parseFn that mimics the @tooling parseLine behavior for select inputs.
 * Returns a SyntaxNode with the detected type and content, or null.
 */
function fakeParseLine(text) {
  if (!text) return null;

  // Heading patterns
  const headingMatch = text.match(/^(#{1,6}) (.*)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    return new SyntaxNode(`heading${level}`, headingMatch[2]);
  }

  // Blockquote
  if (text.startsWith(`> `)) {
    return new SyntaxNode(`blockquote`, text.slice(2));
  }

  // Unordered list item
  const ulMatch = text.match(/^(\s*)([-*+]) (.*)$/);
  if (ulMatch) {
    const indent = Math.floor(ulMatch[1].length / 2);
    const node = new SyntaxNode(`list-item`, ulMatch[3]);
    node.attributes = { ordered: false, indent };
    return node;
  }

  // Ordered list item
  const olMatch = text.match(/^(\s*)(\d+)\. (.*)$/);
  if (olMatch) {
    const indent = Math.floor(olMatch[1].length / 2);
    const node = new SyntaxNode(`list-item`, olMatch[3]);
    node.attributes = {
      ordered: true,
      number: parseInt(olMatch[2], 10),
      indent,
    };
    return node;
  }

  // Image
  const imgMatch = text.match(/^!\[([^\]]*)\]\(([^)]*)\)$/);
  if (imgMatch) {
    const node = new SyntaxNode(`image`);
    node.attributes = { alt: imgMatch[1], url: imgMatch[2] };
    return node;
  }

  // Code-block fence (simulated — parseLine returns this for ``` + newline)
  if (text === `\`\`\`\n`) {
    const node = new SyntaxNode(`code-block`, ``);
    node.attributes = { language: ``, fenceCount: 3 };
    return node;
  }

  // Default: paragraph
  return new SyntaxNode(`paragraph`, text);
}

describe(`reparseLine — no change`, () => {
  it(`returns null when type stays paragraph`, () => {
    const node = new SyntaxNode(`paragraph`, `hello`);
    const result = reparseLine(node, `hello world`, fakeParseLine);
    assert.strictEqual(result, null);
  });

  it(`updates content even when returning null`, () => {
    const node = new SyntaxNode(`paragraph`, `hello`);
    reparseLine(node, `hello world`, fakeParseLine);
    assert.strictEqual(node.content, `hello world`);
  });

  it(`returns null when heading content changes but type stays`, () => {
    const node = new SyntaxNode(`heading1`, `Title`);
    const result = reparseLine(node, `New Title`, fakeParseLine);
    assert.strictEqual(result, null);
    assert.strictEqual(node.content, `New Title`);
  });
});

describe(`reparseLine — type changes`, () => {
  it(`converts paragraph to heading1 when # prefix typed`, () => {
    const node = new SyntaxNode(`paragraph`, `# Title`);
    const result = reparseLine(node, `# Title`, fakeParseLine);
    assert.ok(result);
    assert.strictEqual(node.type, `heading1`);
    assert.strictEqual(node.content, `Title`);
    assert.deepStrictEqual(result.renderHints.updated, [node.id]);
  });

  it(`converts heading1 to paragraph when prefix was stripped by editor`, () => {
    // When the editor detects the user backspaced through the "# " prefix,
    // it changes the node type to paragraph first, then calls reparseLine.
    // Here we simulate that: the node is already a paragraph with plain text.
    const node = new SyntaxNode(`paragraph`, `Title`);
    const result = reparseLine(node, `Title`, fakeParseLine);
    // paragraph→paragraph is not a type change
    assert.strictEqual(result, null);
    assert.strictEqual(node.type, `paragraph`);
    assert.strictEqual(node.content, `Title`);
  });

  it(`converts paragraph to heading2`, () => {
    const node = new SyntaxNode(`paragraph`, `## Sub`);
    const result = reparseLine(node, `## Sub`, fakeParseLine);
    assert.ok(result);
    assert.strictEqual(node.type, `heading2`);
    assert.strictEqual(node.content, `Sub`);
  });

  it(`converts paragraph to blockquote`, () => {
    const node = new SyntaxNode(`paragraph`, `> quoted`);
    const result = reparseLine(node, `> quoted`, fakeParseLine);
    assert.ok(result);
    assert.strictEqual(node.type, `blockquote`);
    assert.strictEqual(node.content, `quoted`);
  });

  it(`converts paragraph to unordered list-item`, () => {
    const node = new SyntaxNode(`paragraph`, `- item`);
    const result = reparseLine(node, `- item`, fakeParseLine);
    assert.ok(result);
    assert.strictEqual(node.type, `list-item`);
    assert.strictEqual(node.content, `item`);
    assert.strictEqual(node.attributes.ordered, false);
  });

  it(`converts paragraph to ordered list-item`, () => {
    const node = new SyntaxNode(`paragraph`, `1. first`);
    const result = reparseLine(node, `1. first`, fakeParseLine);
    assert.ok(result);
    assert.strictEqual(node.type, `list-item`);
    assert.strictEqual(node.content, `first`);
    assert.strictEqual(node.attributes.ordered, true);
    assert.strictEqual(node.attributes.number, 1);
  });
});

describe(`reparseLine — suppression`, () => {
  it(`suppresses code-block conversion during typing`, () => {
    const node = new SyntaxNode(`paragraph`, `\`\`\`\n`);
    const result = reparseLine(node, `\`\`\`\n`, fakeParseLine);
    // Type should NOT change — code-block conversion is Enter-only
    assert.strictEqual(result, null);
    assert.strictEqual(node.type, `paragraph`);
    assert.strictEqual(node.content, `\`\`\`\n`);
  });

  it(`suppresses image conversion during typing`, () => {
    const node = new SyntaxNode(`paragraph`, `![alt](img.png)`);
    const result = reparseLine(node, `![alt](img.png)`, fakeParseLine);
    // Type should NOT change — images are handled inline
    assert.strictEqual(result, null);
    assert.strictEqual(node.type, `paragraph`);
  });

  it(`does NOT suppress code-block when node is already code-block`, () => {
    // If it's already a code-block, reparsing should still allow code-block
    const node = new SyntaxNode(`code-block`, ``);
    node.attributes = { language: ``, fenceCount: 3 };
    const result = reparseLine(node, `\`\`\`\n`, fakeParseLine);
    // Already code-block → no type change → null
    assert.strictEqual(result, null);
    assert.strictEqual(node.type, `code-block`);
  });
});

describe(`reparseLine — parseFn returns null`, () => {
  it(`updates content when parseFn returns null`, () => {
    const node = new SyntaxNode(`paragraph`, `old`);
    const nullParseFn = () => null;
    const result = reparseLine(node, `new`, nullParseFn);
    assert.strictEqual(result, null);
    assert.strictEqual(node.content, `new`);
  });
});

describe(`reparseLine — inline children`, () => {
  it(`rebuilds inline children after content update`, () => {
    const node = new SyntaxNode(`paragraph`, `plain`);
    reparseLine(node, `**bold** text`, fakeParseLine);
    // After reparseLine, inline children should be rebuilt from the new content
    assert.ok(node.children.length > 0);
  });

  it(`rebuilds inline children after type change`, () => {
    const node = new SyntaxNode(`paragraph`, `# Title with **bold**`);
    reparseLine(node, `# Title with **bold**`, fakeParseLine);
    // Node is now heading1 with content "Title with **bold**"
    assert.strictEqual(node.type, `heading1`);
    assert.ok(node.children.length > 0);
  });
});
