import assert from "node:assert";
import { describe, it, beforeEach } from "node:test";
import { SyntaxNode, SyntaxTree } from "../src/syntax-tree.js";

// ── SyntaxNode.mergeToPrevious ──────────────────────────────────────

describe("SyntaxNode.mergeToPrevious", () => {
  let parent, a, b, c;

  beforeEach(() => {
    parent = new SyntaxNode("paragraph", "");
    a = new SyntaxNode("text", "Hello");
    b = new SyntaxNode("text", " World");
    c = new SyntaxNode("text", "!");
    parent.appendChild(a);
    parent.appendChild(b);
    parent.appendChild(c);
  });

  it("merges node into its previous sibling", () => {
    parent.mergeToPrevious(b);
    assert.strictEqual(a.content, "Hello World");
    assert.deepStrictEqual(parent.children, [a, c]);
    assert.strictEqual(b.parent, null);
  });

  it("preserves the previous sibling's id and type", () => {
    const originalId = a.id;
    const originalType = a.type;
    parent.mergeToPrevious(b);
    assert.strictEqual(a.id, originalId);
    assert.strictEqual(a.type, originalType);
  });

  it("appends the merged node's children to the survivor", () => {
    const child1 = new SyntaxNode("bold", "bold text");
    const child2 = new SyntaxNode("italic", "italic text");
    b.appendChild(child1);
    b.appendChild(child2);
    const aChildCount = a.children.length;
    parent.mergeToPrevious(b);
    assert.strictEqual(a.children.length, aChildCount + 2);
    assert.strictEqual(a.children[a.children.length - 2], child1);
    assert.strictEqual(a.children[a.children.length - 1], child2);
    assert.strictEqual(child1.parent, a);
    assert.strictEqual(child2.parent, a);
  });

  it("merges the last child into the second-to-last", () => {
    parent.mergeToPrevious(c);
    assert.strictEqual(b.content, " World!");
    assert.deepStrictEqual(parent.children, [a, b]);
  });

  it("throws if the node is the first child", () => {
    assert.throws(() => parent.mergeToPrevious(a));
  });

  it("throws if the node is not a child", () => {
    const stranger = new SyntaxNode("text", "X");
    assert.throws(() => parent.mergeToPrevious(stranger));
  });
});

// ── SyntaxNode.mergeToNext ──────────────────────────────────────────

describe("SyntaxNode.mergeToNext", () => {
  let parent, a, b, c;

  beforeEach(() => {
    parent = new SyntaxNode("paragraph", "");
    a = new SyntaxNode("text", "Hello");
    b = new SyntaxNode("text", " World");
    c = new SyntaxNode("text", "!");
    parent.appendChild(a);
    parent.appendChild(b);
    parent.appendChild(c);
  });

  it("merges the next sibling into node", () => {
    parent.mergeToNext(a);
    assert.strictEqual(a.content, "Hello World");
    assert.deepStrictEqual(parent.children, [a, c]);
    assert.strictEqual(b.parent, null);
  });

  it("preserves node's id and type", () => {
    const originalId = a.id;
    const originalType = a.type;
    parent.mergeToNext(a);
    assert.strictEqual(a.id, originalId);
    assert.strictEqual(a.type, originalType);
  });

  it("appends the next sibling's children to node", () => {
    const child1 = new SyntaxNode("bold", "bold text");
    const child2 = new SyntaxNode("italic", "italic text");
    b.appendChild(child1);
    b.appendChild(child2);
    const aChildCount = a.children.length;
    parent.mergeToNext(a);
    assert.strictEqual(a.children.length, aChildCount + 2);
    assert.strictEqual(a.children[a.children.length - 2], child1);
    assert.strictEqual(a.children[a.children.length - 1], child2);
    assert.strictEqual(child1.parent, a);
    assert.strictEqual(child2.parent, a);
  });

  it("merges from the second-to-last into the last", () => {
    parent.mergeToNext(b);
    assert.strictEqual(b.content, " World!");
    assert.deepStrictEqual(parent.children, [a, b]);
  });

  it("throws if the node is the last child", () => {
    assert.throws(() => parent.mergeToNext(c));
  });

  it("throws if the node is not a child", () => {
    const stranger = new SyntaxNode("text", "X");
    assert.throws(() => parent.mergeToNext(stranger));
  });
});

// ── SyntaxTree.mergeToPrevious ──────────────────────────────────────

describe("SyntaxTree.mergeToPrevious", () => {
  let tree, a, b, c;

  beforeEach(() => {
    tree = new SyntaxTree();
    a = new SyntaxNode("paragraph", "First");
    b = new SyntaxNode("paragraph", " Second");
    c = new SyntaxNode("paragraph", " Third");
    tree.appendChild(a);
    tree.appendChild(b);
    tree.appendChild(c);
  });

  it("merges node into its previous sibling", () => {
    tree.mergeToPrevious(b);
    assert.strictEqual(a.content, "First Second");
    assert.deepStrictEqual(tree.children, [a, c]);
    assert.strictEqual(b.parent, null);
  });

  it("preserves the previous sibling's id and type", () => {
    const originalId = a.id;
    tree.mergeToPrevious(b);
    assert.strictEqual(a.id, originalId);
  });

  it("appends the merged node's children to the survivor", () => {
    const child1 = new SyntaxNode("text", "inline");
    b.appendChild(child1);
    tree.mergeToPrevious(b);
    assert.strictEqual(a.children[a.children.length - 1], child1);
    assert.strictEqual(child1.parent, a);
  });

  it("throws if the node is the first child", () => {
    assert.throws(() => tree.mergeToPrevious(a));
  });

  it("throws if the node is not a child", () => {
    const stranger = new SyntaxNode("paragraph", "X");
    assert.throws(() => tree.mergeToPrevious(stranger));
  });
});

// ── SyntaxTree.mergeToNext ──────────────────────────────────────────

describe("SyntaxTree.mergeToNext", () => {
  let tree, a, b, c;

  beforeEach(() => {
    tree = new SyntaxTree();
    a = new SyntaxNode("paragraph", "First");
    b = new SyntaxNode("paragraph", " Second");
    c = new SyntaxNode("paragraph", " Third");
    tree.appendChild(a);
    tree.appendChild(b);
    tree.appendChild(c);
  });

  it("merges the next sibling into node", () => {
    tree.mergeToNext(a);
    assert.strictEqual(a.content, "First Second");
    assert.deepStrictEqual(tree.children, [a, c]);
    assert.strictEqual(b.parent, null);
  });

  it("preserves node's id and type", () => {
    const originalId = b.id;
    tree.mergeToNext(b);
    assert.strictEqual(b.id, originalId);
  });

  it("appends the next sibling's children to node", () => {
    const child1 = new SyntaxNode("text", "inline");
    b.appendChild(child1);
    tree.mergeToNext(a);
    assert.strictEqual(a.children[a.children.length - 1], child1);
    assert.strictEqual(child1.parent, a);
  });

  it("throws if the node is the last child", () => {
    assert.throws(() => tree.mergeToNext(c));
  });

  it("throws if the node is not a child", () => {
    const stranger = new SyntaxNode("paragraph", "X");
    assert.throws(() => tree.mergeToNext(stranger));
  });
});
