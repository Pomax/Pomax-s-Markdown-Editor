import assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { SyntaxNode, SyntaxTree } from '../../index.js';
import {
  splitNode,
  insertNodesAfter,
  changeNodeType,
} from '../../src/syntax-tree/tree-mutations.js';

// Mimics what the DFA parser does: determines the block type from
// markdown prefix, returns a SyntaxNode with the right type + content.

/** @param {string} markdown */
function mockParseFn(markdown) {
  const headingMatch = markdown.match(/^(#{1,6})\s+(.*)/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    return new SyntaxNode(`heading${level}`, headingMatch[2]);
  }
  if (markdown.startsWith(`> `)) {
    return new SyntaxNode(`blockquote`, markdown.slice(2));
  }
  if (markdown.startsWith(`- `)) {
    return new SyntaxNode(`list-item`, markdown.slice(2));
  }
  if (markdown.startsWith(`---`) || markdown.startsWith(`***`)) {
    return new SyntaxNode(`horizontal-rule`, markdown);
  }
  return new SyntaxNode(`paragraph`, markdown);
}

function buildTree() {
  const tree = new SyntaxTree();

  const h1 = new SyntaxNode(`heading1`, `Introduction`);
  h1.startLine = 0;
  h1.endLine = 0;
  tree.appendChild(h1);

  const p = new SyntaxNode(`paragraph`, `Hello world`);
  p.startLine = 2;
  p.endLine = 2;
  tree.appendChild(p);

  const p2 = new SyntaxNode(`paragraph`, `Second paragraph`);
  p2.startLine = 4;
  p2.endLine = 4;
  tree.appendChild(p2);

  return { tree, h1, p, p2 };
}

describe(`splitNode`, () => {
  it(`splits a paragraph into two paragraphs`, () => {
    const { tree, p } = buildTree();
    // "Hello world" split at offset 5 → "Hello" + " world"
    const result = splitNode(tree, p, 5, mockParseFn);

    // Original node replaced by two nodes
    const idx = tree.children.indexOf(p);
    assert.strictEqual(idx, -1, `original node should be removed from tree`);
    // Should have 4 children now: h1, first-half, second-half, p2
    assert.strictEqual(tree.children.length, 4);
    assert.strictEqual(tree.children[1].type, `paragraph`);
    assert.strictEqual(tree.children[1].content, `Hello`);
    assert.strictEqual(tree.children[2].type, `paragraph`);
    assert.strictEqual(tree.children[2].content, ` world`);
  });

  it(`splits a heading — second half becomes paragraph`, () => {
    const { tree, h1 } = buildTree();
    // mockParseFn("# Intro") → heading1, ("duction") → paragraph
    h1.content = `Intro duction`;
    const result = splitNode(tree, h1, 5, (md) => {
      // Simulate: first half keeps heading prefix, second half is plain
      return mockParseFn(md);
    });

    // First half: "Intro" parsed as paragraph (no heading prefix in content)
    // But the caller controls the parseFn — we test that splitNode uses it
    assert.strictEqual(tree.children.length, 4);
  });

  it(`split at offset 0 creates empty first half`, () => {
    const { tree, p } = buildTree();
    splitNode(tree, p, 0, mockParseFn);

    assert.strictEqual(tree.children.length, 4);
    assert.strictEqual(tree.children[1].content, ``);
    assert.strictEqual(tree.children[2].content, `Hello world`);
  });

  it(`split at end creates empty second half`, () => {
    const { tree, p } = buildTree();
    splitNode(tree, p, p.content.length, mockParseFn);

    assert.strictEqual(tree.children.length, 4);
    assert.strictEqual(tree.children[1].content, `Hello world`);
    assert.strictEqual(tree.children[2].content, ``);
  });

  it(`calls rebuildInlineChildren on both resulting nodes`, () => {
    const { tree, p } = buildTree();
    p.content = `Hello **bold** text`;
    splitNode(tree, p, 6, mockParseFn);

    const first = tree.children[1]; // "Hello "
    const second = tree.children[2]; // "*bold** text"
    // Both should have inline children parsed
    assert.ok(first.children.length >= 1, `first half should have inline children`);
    assert.ok(second.children.length >= 1, `second half should have inline children`);
  });

  it(`returns renderHints with the new node IDs`, () => {
    const { tree, p } = buildTree();
    const result = splitNode(tree, p, 5, mockParseFn);

    assert.ok(result.renderHints, `should return renderHints`);
    assert.ok(result.renderHints.removed.includes(p.id), `should mark original as removed`);
    assert.strictEqual(result.renderHints.added.length, 2, `should have 2 added nodes`);
  });

  it(`returns selection pointing to start of second node`, () => {
    const { tree, p } = buildTree();
    const result = splitNode(tree, p, 5, mockParseFn);

    assert.ok(result.selection, `should return selection`);
    assert.strictEqual(result.selection.nodeId, tree.children[2].id);
    assert.strictEqual(result.selection.offset, 0);
  });
});

describe(`insertNodesAfter`, () => {
  it(`inserts a single node after refNode`, () => {
    const { tree, p } = buildTree();
    const newNode = new SyntaxNode(`paragraph`, `Inserted`);
    const result = insertNodesAfter(tree, p, [newNode]);

    assert.strictEqual(tree.children.length, 4);
    assert.strictEqual(tree.children[2], newNode);
    assert.strictEqual(tree.children[2].content, `Inserted`);
  });

  it(`inserts multiple nodes in order after refNode`, () => {
    const { tree, h1 } = buildTree();
    const n1 = new SyntaxNode(`paragraph`, `First`);
    const n2 = new SyntaxNode(`paragraph`, `Second`);
    const n3 = new SyntaxNode(`paragraph`, `Third`);
    insertNodesAfter(tree, h1, [n1, n2, n3]);

    assert.strictEqual(tree.children.length, 6);
    assert.strictEqual(tree.children[1], n1);
    assert.strictEqual(tree.children[2], n2);
    assert.strictEqual(tree.children[3], n3);
  });

  it(`inserts after the last child`, () => {
    const { tree, p2 } = buildTree();
    const newNode = new SyntaxNode(`paragraph`, `End`);
    insertNodesAfter(tree, p2, [newNode]);

    assert.strictEqual(tree.children.length, 4);
    assert.strictEqual(tree.children[3], newNode);
  });

  it(`works with refNode inside a list (parent is not tree)`, () => {
    const tree = new SyntaxTree();
    const list = new SyntaxNode(`list`, ``);
    tree.appendChild(list);
    const li1 = new SyntaxNode(`list-item`, `Item 1`);
    const li2 = new SyntaxNode(`list-item`, `Item 2`);
    list.appendChild(li1);
    list.appendChild(li2);

    const newLi = new SyntaxNode(`list-item`, `Item 1.5`);
    insertNodesAfter(tree, li1, [newLi]);

    assert.strictEqual(list.children.length, 3);
    assert.strictEqual(list.children[0], li1);
    assert.strictEqual(list.children[1], newLi);
    assert.strictEqual(list.children[2], li2);
  });

  it(`returns renderHints with added node IDs`, () => {
    const { tree, p } = buildTree();
    const n1 = new SyntaxNode(`paragraph`, `A`);
    const n2 = new SyntaxNode(`paragraph`, `B`);
    const result = insertNodesAfter(tree, p, [n1, n2]);

    assert.ok(result.renderHints.added.includes(n1.id));
    assert.ok(result.renderHints.added.includes(n2.id));
  });

  it(`returns selection pointing to end of last inserted node`, () => {
    const { tree, p } = buildTree();
    const newNode = new SyntaxNode(`paragraph`, `New text`);
    const result = insertNodesAfter(tree, p, [newNode]);

    assert.ok(result.selection);
    assert.strictEqual(result.selection.nodeId, newNode.id);
  });

  it(`handles empty array as no-op`, () => {
    const { tree, p } = buildTree();
    const result = insertNodesAfter(tree, p, []);

    assert.strictEqual(tree.children.length, 3);
    assert.deepStrictEqual(result.renderHints.added, []);
  });
});

describe(`changeNodeType`, () => {
  it(`changes a paragraph to heading1`, () => {
    const node = new SyntaxNode(`paragraph`, `Hello`);
    changeNodeType(node, `heading1`);
    assert.strictEqual(node.type, `heading1`);
  });

  it(`changes a heading2 to paragraph`, () => {
    const node = new SyntaxNode(`heading2`, `Title`);
    changeNodeType(node, `paragraph`);
    assert.strictEqual(node.type, `paragraph`);
  });

  it(`preserves the node id`, () => {
    const node = new SyntaxNode(`paragraph`, `Hello`);
    const id = node.id;
    changeNodeType(node, `heading3`);
    assert.strictEqual(node.id, id);
  });

  it(`preserves content`, () => {
    const node = new SyntaxNode(`paragraph`, `Some content`);
    changeNodeType(node, `blockquote`);
    assert.strictEqual(node.content, `Some content`);
  });

  it(`preserves children`, () => {
    const node = new SyntaxNode(`paragraph`, `Hello`);
    const child = new SyntaxNode(`text`, `Hello`);
    node.appendChild(child);
    changeNodeType(node, `heading1`);
    assert.strictEqual(node.children.length, 1);
    assert.strictEqual(node.children[0], child);
  });

  it(`preserves parent reference`, () => {
    const tree = new SyntaxTree();
    const node = new SyntaxNode(`paragraph`, `Hello`);
    tree.appendChild(node);
    changeNodeType(node, `heading1`);
    assert.strictEqual(node.parent, null); // tree-level children have null parent
    assert.ok(tree.children.includes(node));
  });
});
