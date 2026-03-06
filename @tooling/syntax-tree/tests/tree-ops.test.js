import assert from "node:assert";
import { describe, it, beforeEach } from "node:test";
import { SyntaxNode, SyntaxTree } from "../src/syntax-tree.js";

// ── SyntaxNode child operations ─────────────────────────────────────

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

describe("SyntaxNode.replaceChild", () => {
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

  it("replaces a middle child", () => {
    const replacement = new SyntaxNode("bold", "R");
    parent.replaceChild(b, replacement);
    assert.deepStrictEqual(parent.children, [a, replacement, c]);
    assert.strictEqual(replacement.parent, parent);
    assert.strictEqual(b.parent, null);
  });

  it("replaces the first child", () => {
    const replacement = new SyntaxNode("bold", "R");
    parent.replaceChild(a, replacement);
    assert.deepStrictEqual(parent.children, [replacement, b, c]);
    assert.strictEqual(replacement.parent, parent);
    assert.strictEqual(a.parent, null);
  });

  it("replaces the last child", () => {
    const replacement = new SyntaxNode("bold", "R");
    parent.replaceChild(c, replacement);
    assert.deepStrictEqual(parent.children, [a, b, replacement]);
    assert.strictEqual(replacement.parent, parent);
    assert.strictEqual(c.parent, null);
  });

  it("throws if the old child is not found", () => {
    const stranger = new SyntaxNode("text", "X");
    const replacement = new SyntaxNode("bold", "R");
    assert.throws(() => parent.replaceChild(stranger, replacement));
  });
});

describe("SyntaxNode.insertBefore", () => {
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

  it("inserts before a middle child", () => {
    const n = new SyntaxNode("italic", "N");
    parent.insertBefore(n, b);
    assert.deepStrictEqual(parent.children, [a, n, b, c]);
    assert.strictEqual(n.parent, parent);
  });

  it("inserts before the first child", () => {
    const n = new SyntaxNode("italic", "N");
    parent.insertBefore(n, a);
    assert.deepStrictEqual(parent.children, [n, a, b, c]);
    assert.strictEqual(n.parent, parent);
  });

  it("throws if the reference child is not found", () => {
    const stranger = new SyntaxNode("text", "X");
    const n = new SyntaxNode("italic", "N");
    assert.throws(() => parent.insertBefore(n, stranger));
  });
});

describe("SyntaxNode.insertAfter", () => {
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

  it("inserts after a middle child", () => {
    const n = new SyntaxNode("italic", "N");
    parent.insertAfter(n, b);
    assert.deepStrictEqual(parent.children, [a, b, n, c]);
    assert.strictEqual(n.parent, parent);
  });

  it("inserts after the last child", () => {
    const n = new SyntaxNode("italic", "N");
    parent.insertAfter(n, c);
    assert.deepStrictEqual(parent.children, [a, b, c, n]);
    assert.strictEqual(n.parent, parent);
  });

  it("throws if the reference child is not found", () => {
    const stranger = new SyntaxNode("text", "X");
    const n = new SyntaxNode("italic", "N");
    assert.throws(() => parent.insertAfter(n, stranger));
  });
});

// ── SyntaxTree child operations ─────────────────────────────────────

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

describe("SyntaxTree.replaceChild", () => {
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

  it("replaces a child and sets parent to null", () => {
    const replacement = new SyntaxNode("heading1", "R");
    tree.replaceChild(b, replacement);
    assert.deepStrictEqual(tree.children, [a, replacement, c]);
    assert.strictEqual(replacement.parent, null);
    assert.strictEqual(b.parent, null);
  });

  it("throws if the old child is not found", () => {
    const stranger = new SyntaxNode("paragraph", "X");
    const replacement = new SyntaxNode("heading1", "R");
    assert.throws(() => tree.replaceChild(stranger, replacement));
  });
});

describe("SyntaxTree.insertBefore", () => {
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

  it("inserts before a child and sets parent to null", () => {
    const n = new SyntaxNode("heading1", "N");
    tree.insertBefore(n, b);
    assert.deepStrictEqual(tree.children, [a, n, b, c]);
    assert.strictEqual(n.parent, null);
  });

  it("inserts before the first child", () => {
    const n = new SyntaxNode("heading1", "N");
    tree.insertBefore(n, a);
    assert.deepStrictEqual(tree.children, [n, a, b, c]);
    assert.strictEqual(n.parent, null);
  });

  it("throws if the reference child is not found", () => {
    const stranger = new SyntaxNode("paragraph", "X");
    const n = new SyntaxNode("heading1", "N");
    assert.throws(() => tree.insertBefore(n, stranger));
  });
});

describe("SyntaxTree.insertAfter", () => {
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

  it("inserts after a child and sets parent to null", () => {
    const n = new SyntaxNode("heading1", "N");
    tree.insertAfter(n, b);
    assert.deepStrictEqual(tree.children, [a, b, n, c]);
    assert.strictEqual(n.parent, null);
  });

  it("inserts after the last child", () => {
    const n = new SyntaxNode("heading1", "N");
    tree.insertAfter(n, c);
    assert.deepStrictEqual(tree.children, [a, b, c, n]);
    assert.strictEqual(n.parent, null);
  });

  it("throws if the reference child is not found", () => {
    const stranger = new SyntaxNode("paragraph", "X");
    const n = new SyntaxNode("heading1", "N");
    assert.throws(() => tree.insertAfter(n, stranger));
  });
});
