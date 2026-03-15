import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SyntaxNode, SyntaxTree } from '../../index.js';
import { applyFormat } from '../../src/syntax-tree/tree-mutations.js';

/** @param {string} content */
function makeParagraph(content) {
  const tree = new SyntaxTree();
  const node = new SyntaxNode(`paragraph`, content);
  tree.appendChild(node);
  return { tree, node };
}

describe(`applyFormat — bold`, () => {
  it(`wraps selected text with **`, () => {
    const { node } = makeParagraph(`text1 text1 text1`);
    applyFormat(node, 6, 11, `bold`);
    assert.strictEqual(node.content, `text1 **text1** text1`);
  });

  it(`unwraps when already bold`, () => {
    const { node } = makeParagraph(`text1 **text1** text1`);
    applyFormat(node, 8, 13, `bold`);
    assert.strictEqual(node.content, `text1 text1 text1`);
  });

  it(`collapsed cursor inside bold toggles off`, () => {
    const { node } = makeParagraph(`text1 **text1** text1`);
    applyFormat(node, 10, 10, `bold`);
    assert.strictEqual(node.content, `text1 text1 text1`);
  });

  it(`collapsed cursor on plain word toggles on`, () => {
    const { node } = makeParagraph(`text1 text1 text1`);
    applyFormat(node, 8, 8, `bold`);
    assert.strictEqual(node.content, `text1 **text1** text1`);
  });

  it(`strips <strong> tag via collapsed cursor`, () => {
    const { node } = makeParagraph(
      `It also tests <strong>strong</strong> and <em>emphasis</em> text.`,
    );
    applyFormat(node, 25, 25, `bold`);
    assert.strictEqual(node.content, `It also tests strong and <em>emphasis</em> text.`);
  });

  it(`strips <b> tag via collapsed cursor`, () => {
    const { node } = makeParagraph(`This is <b>bold tag</b> here.`);
    applyFormat(node, 12, 12, `bold`);
    assert.strictEqual(node.content, `This is bold tag here.`);
  });

  it(`returns selection at end of formatted text`, () => {
    const { node } = makeParagraph(`text1 text1 text1`);
    const result = applyFormat(node, 6, 11, `bold`);
    // "text1 **text1**" = offset 15
    assert.strictEqual(result.selection.offset, 15);
  });

  it(`rebuilds inline children after formatting`, () => {
    const { node } = makeParagraph(`text1 text1 text1`);
    applyFormat(node, 6, 11, `bold`);
    // Should have children reflecting the bold formatting
    assert.ok(node.children.length > 0);
    const types = node.children.map((c) => c.type);
    assert.ok(types.includes(`bold`), `expected bold in [${types}]`);
  });
});

describe(`applyFormat — italic`, () => {
  it(`wraps selected text with *`, () => {
    const { node } = makeParagraph(`text1 text1 text1`);
    applyFormat(node, 0, 5, `italic`);
    assert.strictEqual(node.content, `*text1* text1 text1`);
  });

  it(`unwraps when already italic`, () => {
    const { node } = makeParagraph(`text1 *text1* text1`);
    applyFormat(node, 7, 12, `italic`);
    assert.strictEqual(node.content, `text1 text1 text1`);
  });

  it(`strips <em> tag via collapsed cursor`, () => {
    const { node } = makeParagraph(`This is <em>emphasis text</em> here.`);
    applyFormat(node, 15, 15, `italic`);
    assert.strictEqual(node.content, `This is emphasis text here.`);
  });

  it(`strips <i> tag via collapsed cursor`, () => {
    const { node } = makeParagraph(`This is <i>italic tag</i> here.`);
    applyFormat(node, 13, 13, `italic`);
    assert.strictEqual(node.content, `This is italic tag here.`);
  });
});

describe(`applyFormat — strikethrough`, () => {
  it(`wraps selected text with ~~`, () => {
    const { node } = makeParagraph(`text1 text1 text1`);
    applyFormat(node, 6, 11, `strikethrough`);
    assert.strictEqual(node.content, `text1 ~~text1~~ text1`);
  });

  it(`unwraps when already struck`, () => {
    const { node } = makeParagraph(`text1 ~~text1~~ text1`);
    applyFormat(node, 8, 13, `strikethrough`);
    assert.strictEqual(node.content, `text1 text1 text1`);
  });

  it(`strips <del> tag via collapsed cursor`, () => {
    const { node } = makeParagraph(`This is <del>deleted text</del> here.`);
    applyFormat(node, 16, 16, `strikethrough`);
    assert.strictEqual(node.content, `This is deleted text here.`);
  });

  it(`strips <s> tag via collapsed cursor`, () => {
    const { node } = makeParagraph(`This is <s>struck tag</s> here.`);
    applyFormat(node, 13, 13, `strikethrough`);
    assert.strictEqual(node.content, `This is struck tag here.`);
  });
});

describe(`applyFormat — code`, () => {
  it(`wraps selected text with backtick`, () => {
    const { node } = makeParagraph(`text1 text1 text1`);
    applyFormat(node, 6, 11, `code`);
    assert.strictEqual(node.content, `text1 \`text1\` text1`);
  });

  it(`unwraps when already code`, () => {
    const { node } = makeParagraph(`text1 \`text1\` text1`);
    applyFormat(node, 7, 12, `code`);
    assert.strictEqual(node.content, `text1 text1 text1`);
  });

  it(`collapsed cursor inside code toggles off`, () => {
    const { node } = makeParagraph(`This is \`code\` here.`);
    applyFormat(node, 10, 10, `code`);
    assert.strictEqual(node.content, `This is code here.`);
  });
});

describe(`applyFormat — subscript`, () => {
  it(`wraps selected text with <sub> tags`, () => {
    const { node } = makeParagraph(`text1 text1 text1`);
    applyFormat(node, 6, 11, `subscript`);
    assert.strictEqual(node.content, `text1 <sub>text1</sub> text1`);
  });

  it(`unwraps when already subscript`, () => {
    const { node } = makeParagraph(`text1 <sub>text1</sub> text1`);
    applyFormat(node, 14, 14, `subscript`);
    assert.strictEqual(node.content, `text1 text1 text1`);
  });

  it(`collapsed cursor on plain word wraps with <sub>`, () => {
    const { node } = makeParagraph(`text1 text1 text1`);
    applyFormat(node, 8, 8, `subscript`);
    assert.strictEqual(node.content, `text1 <sub>text1</sub> text1`);
  });
});

describe(`applyFormat — superscript`, () => {
  it(`wraps selected text with <sup> tags`, () => {
    const { node } = makeParagraph(`text1 text1 text1`);
    applyFormat(node, 6, 11, `superscript`);
    assert.strictEqual(node.content, `text1 <sup>text1</sup> text1`);
  });

  it(`unwraps when already superscript`, () => {
    const { node } = makeParagraph(`text1 <sup>text1</sup> text1`);
    applyFormat(node, 14, 14, `superscript`);
    assert.strictEqual(node.content, `text1 text1 text1`);
  });
});

describe(`applyFormat — sub/sup mutual exclusion`, () => {
  it(`applying subscript strips existing superscript`, () => {
    const { node } = makeParagraph(`text1 <sup>text1</sup> text1`);
    applyFormat(node, 11, 16, `subscript`);
    assert.strictEqual(node.content, `text1 <sub>text1</sub> text1`);
  });

  it(`applying superscript strips existing subscript`, () => {
    const { node } = makeParagraph(`text1 <sub>text1</sub> text1`);
    applyFormat(node, 11, 16, `superscript`);
    assert.strictEqual(node.content, `text1 <sup>text1</sup> text1`);
  });
});

describe(`applyFormat — link`, () => {
  it(`wraps selected text as [text](url)`, () => {
    const { node } = makeParagraph(`click here please`);
    applyFormat(node, 6, 10, `link`);
    assert.strictEqual(node.content, `click [here](url) please`);
  });

  it(`link is always additive (never toggles off)`, () => {
    const { node } = makeParagraph(`click [here](url) please`);
    // Even with cursor inside, link should wrap again (not toggle off)
    applyFormat(node, 7, 11, `link`);
    // The exact behavior may nest, but should not strip the link
    assert.ok(node.content.includes(`[`));
  });
});

describe(`applyFormat — trailing whitespace`, () => {
  it(`moves trailing whitespace outside delimiters`, () => {
    const { node } = makeParagraph(`hello world `);
    // Select "world " (with trailing space)
    applyFormat(node, 6, 12, `bold`);
    assert.strictEqual(node.content, `hello **world** `);
  });
});

describe(`applyFormat — collapsed cursor edge cases`, () => {
  it(`is a no-op when cursor is between spaces`, () => {
    const { node } = makeParagraph(`hello  world`);
    // Offset 6 is the second space in the double-space gap
    const result = applyFormat(node, 6, 6, `bold`);
    assert.strictEqual(node.content, `hello  world`);
    assert.strictEqual(result.selection.offset, 6);
  });

  it(`preserves node identity`, () => {
    const { node } = makeParagraph(`text1 text1 text1`);
    const id = node.id;
    applyFormat(node, 6, 11, `bold`);
    assert.strictEqual(node.id, id);
  });
});

describe(`applyFormat — return value`, () => {
  it(`returns renderHints with updated node id`, () => {
    const { node } = makeParagraph(`text1 text1 text1`);
    const result = applyFormat(node, 6, 11, `bold`);
    assert.ok(result.renderHints.updated.includes(node.id));
  });

  it(`returns selection with nodeId`, () => {
    const { node } = makeParagraph(`text1 text1 text1`);
    const result = applyFormat(node, 6, 11, `bold`);
    assert.strictEqual(result.selection.nodeId, node.id);
  });
});
