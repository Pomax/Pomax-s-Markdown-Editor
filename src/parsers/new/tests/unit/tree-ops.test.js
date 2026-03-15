import assert from "node:assert";
import { describe, it, beforeEach } from "node:test";
import { SyntaxNode, SyntaxTree } from "../index.js";

// ── SyntaxNode.insertChild ──────────────────────────────────────────

describe("SyntaxNode.insertChild", () => {
  let parent, a, b, c;

  beforeEach(() => {
    parent = new SyntaxNode("paragraph", "");
    a = new SyntaxNode("text", "A");
    b = new SyntaxNode("text", "B");
    c = new SyntaxNode("text", "C");
    parent.appendChild(a);
    parent.appendChild(b);
    parent.appendChild(c);
  });

  it("inserts at index 0 (prepend)", () => {
    const n = new SyntaxNode("italic", "N");
    parent.insertChild(n, 0);
    assert.deepStrictEqual(parent.children, [n, a, b, c]);
    assert.strictEqual(n.parent, parent);
  });

  it("inserts at a middle index", () => {
    const n = new SyntaxNode("italic", "N");
    parent.insertChild(n, 1);
    assert.deepStrictEqual(parent.children, [a, n, b, c]);
    assert.strictEqual(n.parent, parent);
  });

  it("inserts at children.length (append)", () => {
    const n = new SyntaxNode("italic", "N");
    parent.insertChild(n, 3);
    assert.deepStrictEqual(parent.children, [a, b, c, n]);
    assert.strictEqual(n.parent, parent);
  });

  it("inserts into an empty children array", () => {
    const empty = new SyntaxNode("paragraph", "");
    const n = new SyntaxNode("text", "X");
    empty.insertChild(n, 0);
    assert.deepStrictEqual(empty.children, [n]);
    assert.strictEqual(n.parent, empty);
  });

  it("sets the parent to this node", () => {
    const n = new SyntaxNode("bold", "N");
    parent.insertChild(n, 2);
    assert.strictEqual(n.parent, parent);
  });
});

// ── SyntaxNode.appendChild ──────────────────────────────────────────

describe("SyntaxNode.appendChild", () => {
  it("appends to end of children", () => {
    const parent = new SyntaxNode("paragraph", "");
    const a = new SyntaxNode("text", "A");
    const b = new SyntaxNode("text", "B");
    parent.appendChild(a);
    parent.appendChild(b);
    assert.deepStrictEqual(parent.children, [a, b]);
    assert.strictEqual(a.parent, parent);
    assert.strictEqual(b.parent, parent);
  });

  it("appends to empty children", () => {
    const parent = new SyntaxNode("paragraph", "");
    const n = new SyntaxNode("text", "X");
    parent.appendChild(n);
    assert.deepStrictEqual(parent.children, [n]);
    assert.strictEqual(n.parent, parent);
  });
});

// ── SyntaxNode.removeChild ──────────────────────────────────────────

describe("SyntaxNode.removeChild", () => {
  let parent, a, b, c;

  beforeEach(() => {
    parent = new SyntaxNode("paragraph", "");
    a = new SyntaxNode("text", "A");
    b = new SyntaxNode("text", "B");
    c = new SyntaxNode("text", "C");
    parent.appendChild(a);
    parent.appendChild(b);
    parent.appendChild(c);
  });

  it("removes a middle child", () => {
    parent.removeChild(b);
    assert.deepStrictEqual(parent.children, [a, c]);
    assert.strictEqual(b.parent, null);
  });

  it("removes the first child", () => {
    parent.removeChild(a);
    assert.deepStrictEqual(parent.children, [b, c]);
    assert.strictEqual(a.parent, null);
  });

  it("removes the last child", () => {
    parent.removeChild(c);
    assert.deepStrictEqual(parent.children, [a, b]);
    assert.strictEqual(c.parent, null);
  });

  it("throws if the child is not found", () => {
    const stranger = new SyntaxNode("text", "X");
    assert.throws(() => parent.removeChild(stranger));
  });
});

// ── SyntaxTree.insertChild ──────────────────────────────────────────

describe("SyntaxTree.insertChild", () => {
  let tree, a, b, c;

  beforeEach(() => {
    tree = new SyntaxTree();
    a = new SyntaxNode("paragraph", "A");
    b = new SyntaxNode("paragraph", "B");
    c = new SyntaxNode("paragraph", "C");
    tree.appendChild(a);
    tree.appendChild(b);
    tree.appendChild(c);
  });

  it("inserts at index 0 (prepend)", () => {
    const n = new SyntaxNode("heading1", "N");
    tree.insertChild(n, 0);
    assert.deepStrictEqual(tree.children, [n, a, b, c]);
    assert.strictEqual(n.parent, null);
  });

  it("inserts at a middle index", () => {
    const n = new SyntaxNode("heading1", "N");
    tree.insertChild(n, 2);
    assert.deepStrictEqual(tree.children, [a, b, n, c]);
    assert.strictEqual(n.parent, null);
  });

  it("inserts at children.length (append)", () => {
    const n = new SyntaxNode("heading1", "N");
    tree.insertChild(n, 3);
    assert.deepStrictEqual(tree.children, [a, b, c, n]);
    assert.strictEqual(n.parent, null);
  });

  it("inserts into an empty tree", () => {
    const empty = new SyntaxTree();
    const n = new SyntaxNode("paragraph", "X");
    empty.insertChild(n, 0);
    assert.deepStrictEqual(empty.children, [n]);
    assert.strictEqual(n.parent, null);
  });

  it("sets parent to null (tree-level children have no parent)", () => {
    const n = new SyntaxNode("paragraph", "N");
    n.parent = new SyntaxNode("paragraph", "fake");
    tree.insertChild(n, 1);
    assert.strictEqual(n.parent, null);
  });
});

// ── SyntaxTree.appendChild ──────────────────────────────────────────

describe("SyntaxTree.appendChild", () => {
  it("appends to end of children", () => {
    const tree = new SyntaxTree();
    const a = new SyntaxNode("paragraph", "A");
    const b = new SyntaxNode("paragraph", "B");
    tree.appendChild(a);
    tree.appendChild(b);
    assert.deepStrictEqual(tree.children, [a, b]);
    assert.strictEqual(a.parent, null);
    assert.strictEqual(b.parent, null);
  });

  it("appends to empty tree", () => {
    const tree = new SyntaxTree();
    const n = new SyntaxNode("paragraph", "X");
    tree.appendChild(n);
    assert.deepStrictEqual(tree.children, [n]);
  });
});

// ── SyntaxTree.removeChild ──────────────────────────────────────────

describe("SyntaxTree.removeChild", () => {
  let tree, a, b, c;

  beforeEach(() => {
    tree = new SyntaxTree();
    a = new SyntaxNode("paragraph", "A");
    b = new SyntaxNode("paragraph", "B");
    c = new SyntaxNode("paragraph", "C");
    tree.appendChild(a);
    tree.appendChild(b);
    tree.appendChild(c);
  });

  it("removes a middle child", () => {
    tree.removeChild(b);
    assert.deepStrictEqual(tree.children, [a, c]);
    assert.strictEqual(b.parent, null);
  });

  it("removes the first child", () => {
    tree.removeChild(a);
    assert.deepStrictEqual(tree.children, [b, c]);
    assert.strictEqual(a.parent, null);
  });

  it("removes the last child", () => {
    tree.removeChild(c);
    assert.deepStrictEqual(tree.children, [a, b]);
    assert.strictEqual(c.parent, null);
  });

  it("throws if the child is not found", () => {
    const stranger = new SyntaxNode("paragraph", "X");
    assert.throws(() => tree.removeChild(stranger));
  });
});
