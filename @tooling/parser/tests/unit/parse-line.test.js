/**
 * @fileoverview Unit tests for parseLine — the synchronous single-line
 * parse entry point that the editor uses on every keystroke to detect
 * implicit type changes.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { parseLine } from '../../src/parse-line.js';

// ── Empty input ─────────────────────────────────────────────────────

describe('parseLine — empty input', () => {
  it('returns null for an empty string', () => {
    assert.strictEqual(parseLine(''), null);
  });
});

// ── Headings ────────────────────────────────────────────────────────

describe('parseLine — headings', () => {
  it('parses heading1', () => {
    const node = parseLine('# Title');
    assert.strictEqual(node.type, 'heading1');
    assert.strictEqual(node.content, 'Title');
  });

  it('parses heading2', () => {
    const node = parseLine('## Subtitle');
    assert.strictEqual(node.type, 'heading2');
    assert.strictEqual(node.content, 'Subtitle');
  });

  it('parses heading3', () => {
    const node = parseLine('### Level 3');
    assert.strictEqual(node.type, 'heading3');
    assert.strictEqual(node.content, 'Level 3');
  });

  it('parses heading4', () => {
    const node = parseLine('#### Level 4');
    assert.strictEqual(node.type, 'heading4');
    assert.strictEqual(node.content, 'Level 4');
  });

  it('parses heading5', () => {
    const node = parseLine('##### Level 5');
    assert.strictEqual(node.type, 'heading5');
    assert.strictEqual(node.content, 'Level 5');
  });

  it('parses heading6', () => {
    const node = parseLine('###### Level 6');
    assert.strictEqual(node.type, 'heading6');
    assert.strictEqual(node.content, 'Level 6');
  });

  it('caps level at 6 for seven hashes', () => {
    const node = parseLine('####### Too many');
    assert.strictEqual(node.type, 'heading6');
    assert.strictEqual(node.content, 'Too many');
  });

  it('falls through to paragraph when no space follows hashes', () => {
    const node = parseLine('#NoSpace');
    assert.strictEqual(node.type, 'paragraph');
    assert.strictEqual(node.content, '#NoSpace');
  });
});

// ── Blockquotes ─────────────────────────────────────────────────────

describe('parseLine — blockquotes', () => {
  it('parses a blockquote', () => {
    const node = parseLine('> quoted text');
    assert.strictEqual(node.type, 'blockquote');
    assert.strictEqual(node.content, 'quoted text');
  });

  it('parses a blockquote with no space after GT', () => {
    const node = parseLine('>no space');
    assert.strictEqual(node.type, 'blockquote');
    assert.strictEqual(node.content, 'no space');
  });
});

// ── Unordered list items ────────────────────────────────────────────

describe('parseLine — unordered list items', () => {
  it('parses a dash list item', () => {
    const node = parseLine('- item');
    assert.strictEqual(node.type, 'list-item');
    assert.strictEqual(node.content, 'item');
    assert.strictEqual(node.attributes.ordered, false);
    assert.strictEqual(node.attributes.indent, 0);
  });

  it('parses an indented list item', () => {
    const node = parseLine('  - nested');
    assert.strictEqual(node.type, 'list-item');
    assert.strictEqual(node.content, 'nested');
    assert.strictEqual(node.attributes.indent, 1);
  });

  it('parses a star list item', () => {
    const node = parseLine('* star item');
    assert.strictEqual(node.type, 'list-item');
    assert.strictEqual(node.content, 'star item');
  });

  it('parses a plus list item', () => {
    const node = parseLine('+ plus item');
    assert.strictEqual(node.type, 'list-item');
    assert.strictEqual(node.content, 'plus item');
  });

  it('parses an unchecked checkbox', () => {
    const node = parseLine('- [ ] todo');
    assert.strictEqual(node.type, 'list-item');
    assert.strictEqual(node.content, 'todo');
    assert.strictEqual(node.attributes.checked, false);
  });

  it('parses a checked checkbox', () => {
    const node = parseLine('- [x] done');
    assert.strictEqual(node.type, 'list-item');
    assert.strictEqual(node.content, 'done');
    assert.strictEqual(node.attributes.checked, true);
  });
});

// ── Ordered list items ──────────────────────────────────────────────

describe('parseLine — ordered list items', () => {
  it('parses an ordered list item', () => {
    const node = parseLine('1. first');
    assert.strictEqual(node.type, 'list-item');
    assert.strictEqual(node.content, 'first');
    assert.strictEqual(node.attributes.ordered, true);
    assert.strictEqual(node.attributes.number, 1);
  });

  it('parses a higher-numbered item', () => {
    const node = parseLine('42. answer');
    assert.strictEqual(node.type, 'list-item');
    assert.strictEqual(node.content, 'answer');
    assert.strictEqual(node.attributes.number, 42);
  });

  it('parses an indented ordered list item', () => {
    const node = parseLine('  1. nested');
    assert.strictEqual(node.type, 'list-item');
    assert.strictEqual(node.content, 'nested');
    assert.strictEqual(node.attributes.ordered, true);
    assert.strictEqual(node.attributes.indent, 1);
  });
});

// ── Horizontal rules ────────────────────────────────────────────────

describe('parseLine — horizontal rules', () => {
  it('parses --- with trailing newline as horizontal-rule', () => {
    const node = parseLine('---\n');
    assert.strictEqual(node.type, 'horizontal-rule');
  });

  it('parses *** with trailing newline as horizontal-rule', () => {
    const node = parseLine('***\n');
    assert.strictEqual(node.type, 'horizontal-rule');
  });

  it('parses ___ with trailing newline as horizontal-rule', () => {
    const node = parseLine('___\n');
    assert.strictEqual(node.type, 'horizontal-rule');
  });

  it('falls through to paragraph for --- without newline', () => {
    const node = parseLine('---');
    assert.strictEqual(node.type, 'paragraph');
    assert.strictEqual(node.content, '---');
  });

  it('preserves marker and count attributes', () => {
    const node = parseLine('-----\n');
    assert.strictEqual(node.type, 'horizontal-rule');
    assert.strictEqual(node.attributes.marker, '-');
    assert.strictEqual(node.attributes.count, 5);
  });
});

// ── Tables ──────────────────────────────────────────────────────────

describe('parseLine — tables', () => {
  it('parses a single pipe-delimited line as a table', () => {
    const node = parseLine('| A | B |');
    assert.strictEqual(node.type, 'table');
  });
});

// ── Images ──────────────────────────────────────────────────────────

describe('parseLine — images', () => {
  it('parses an image', () => {
    const node = parseLine('![alt text](photo.jpg)');
    assert.strictEqual(node.type, 'image');
    assert.strictEqual(node.attributes.alt, 'alt text');
    assert.strictEqual(node.attributes.url, 'photo.jpg');
  });

  it('parses a linked image', () => {
    const node = parseLine('[![alt](img.png)](https://example.com)');
    assert.strictEqual(node.type, 'image');
    assert.strictEqual(node.attributes.alt, 'alt');
    assert.strictEqual(node.attributes.url, 'img.png');
    assert.strictEqual(node.attributes.href, 'https://example.com');
  });
});

// ── Code fences (fall through to paragraph) ─────────────────────────

describe('parseLine — code fences', () => {
  it('parses bare backticks as paragraph', () => {
    const node = parseLine('```');
    assert.strictEqual(node.type, 'paragraph');
    assert.strictEqual(node.content, '```');
  });

  it('parses backticks with language as paragraph', () => {
    const node = parseLine('```js');
    assert.strictEqual(node.type, 'paragraph');
    assert.strictEqual(node.content, '```js');
  });
});

// ── HTML block tags (fall through to paragraph) ─────────────────────

describe('parseLine — HTML blocks', () => {
  it('parses an HTML opening tag as paragraph', () => {
    const node = parseLine('<details>');
    assert.strictEqual(node.type, 'paragraph');
  });
});

// ── Paragraphs ──────────────────────────────────────────────────────

describe('parseLine — paragraphs', () => {
  it('parses plain text as paragraph', () => {
    const node = parseLine('Hello world');
    assert.strictEqual(node.type, 'paragraph');
    assert.strictEqual(node.content, 'Hello world');
  });

  it('parses text starting with special chars as paragraph', () => {
    const node = parseLine('100% done');
    assert.strictEqual(node.type, 'paragraph');
    assert.strictEqual(node.content, '100% done');
  });
});
