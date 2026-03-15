import assert from "node:assert";
import { describe, it } from "node:test";
import { SyntaxNode, SyntaxTree } from "../index.js";
import {
  createPosition,
  createCollapsed,
  createSelection,
  isCollapsed,
  selectionSpans,
  containsPosition,
  getPathToCursor,
  setCursorFromPath,
} from "../src/tree-selection.js";

// ── Helper ──────────────────────────────────────────────────────────

function buildTree() {
  const tree = new SyntaxTree();

  const p1 = new SyntaxNode("paragraph", "Hello world");
  const bold = new SyntaxNode("bold", "world");
  const boldText = new SyntaxNode("text", "world");
  bold.appendChild(boldText);
  p1.appendChild(new SyntaxNode("text", "Hello "));
  p1.appendChild(bold);
  tree.appendChild(p1);

  const p2 = new SyntaxNode("paragraph", "Second paragraph");
  p2.appendChild(new SyntaxNode("text", "Second paragraph"));
  tree.appendChild(p2);

  const list = new SyntaxNode("list", "");
  list.attributes = { ordered: false };
  const li1 = new SyntaxNode("list-item", "Item one");
  li1.appendChild(new SyntaxNode("text", "Item one"));
  const li2 = new SyntaxNode("list-item", "Item two");
  li2.appendChild(new SyntaxNode("text", "Item two"));
  list.appendChild(li1);
  list.appendChild(li2);
  tree.appendChild(list);

  return { tree, p1, bold, boldText, p2, list, li1, li2 };
}

// ── createPosition ──────────────────────────────────────────────────

describe("createPosition", () => {
  it("creates a position with nodeId and offset", () => {
    const pos = createPosition("abc", 5);
    assert.strictEqual(pos.nodeId, "abc");
    assert.strictEqual(pos.offset, 5);
  });

  it("includes optional extras", () => {
    const pos = createPosition("abc", 5, {
      blockNodeId: "block1",
      tagPart: "opening",
      cellRow: 0,
      cellCol: 1,
    });
    assert.strictEqual(pos.blockNodeId, "block1");
    assert.strictEqual(pos.tagPart, "opening");
    assert.strictEqual(pos.cellRow, 0);
    assert.strictEqual(pos.cellCol, 1);
  });

  it("omits undefined extras", () => {
    const pos = createPosition("abc", 5);
    assert.strictEqual(pos.blockNodeId, undefined);
    assert.strictEqual(pos.tagPart, undefined);
    assert.strictEqual(pos.cellRow, undefined);
    assert.strictEqual(pos.cellCol, undefined);
  });
});

// ── createCollapsed ─────────────────────────────────────────────────

describe("createCollapsed", () => {
  it("creates a selection where anchor === focus", () => {
    const sel = createCollapsed("abc", 5);
    assert.deepStrictEqual(sel.anchor, sel.focus);
  });

  it("passes extras to both anchor and focus", () => {
    const sel = createCollapsed("abc", 5, { blockNodeId: "block1" });
    assert.strictEqual(sel.anchor.blockNodeId, "block1");
    assert.strictEqual(sel.focus.blockNodeId, "block1");
  });
});

// ── createSelection ─────────────────────────────────────────────────

describe("createSelection", () => {
  it("creates a selection with distinct anchor and focus", () => {
    const anchor = createPosition("a", 0);
    const focus = createPosition("b", 5);
    const sel = createSelection(anchor, focus);
    assert.strictEqual(sel.anchor, anchor);
    assert.strictEqual(sel.focus, focus);
  });
});

// ── isCollapsed ─────────────────────────────────────────────────────

describe("isCollapsed", () => {
  it("returns true when anchor and focus have same nodeId and offset", () => {
    const sel = createCollapsed("abc", 5);
    assert.strictEqual(isCollapsed(sel), true);
  });

  it("returns false when nodeId differs", () => {
    const sel = createSelection(
      createPosition("a", 5),
      createPosition("b", 5),
    );
    assert.strictEqual(isCollapsed(sel), false);
  });

  it("returns false when offset differs", () => {
    const sel = createSelection(
      createPosition("a", 0),
      createPosition("a", 5),
    );
    assert.strictEqual(isCollapsed(sel), false);
  });
});

// ── containsPosition ────────────────────────────────────────────────

describe("containsPosition", () => {
  it("returns true for position matching anchor", () => {
    const sel = createSelection(
      createPosition("a", 0),
      createPosition("a", 10),
    );
    const pos = createPosition("a", 0);
    assert.strictEqual(containsPosition(sel, pos), true);
  });

  it("returns true for position within range (same node)", () => {
    const sel = createSelection(
      createPosition("a", 2),
      createPosition("a", 8),
    );
    const pos = createPosition("a", 5);
    assert.strictEqual(containsPosition(sel, pos), true);
  });

  it("returns false for position outside range (same node)", () => {
    const sel = createSelection(
      createPosition("a", 2),
      createPosition("a", 8),
    );
    const pos = createPosition("a", 9);
    assert.strictEqual(containsPosition(sel, pos), false);
  });

  it("returns false for position in a different node", () => {
    const sel = createSelection(
      createPosition("a", 0),
      createPosition("a", 10),
    );
    const pos = createPosition("b", 5);
    assert.strictEqual(containsPosition(sel, pos), false);
  });

  it("returns true for collapsed selection at exact position", () => {
    const sel = createCollapsed("a", 5);
    const pos = createPosition("a", 5);
    assert.strictEqual(containsPosition(sel, pos), true);
  });
});

// ── selectionSpans ──────────────────────────────────────────────────

describe("selectionSpans", () => {
  it("returns true when selection is within the node", () => {
    const { tree, p1 } = buildTree();
    const sel = createSelection(
      createPosition(p1.id, 0),
      createPosition(p1.id, 5),
    );
    assert.strictEqual(selectionSpans(sel, p1.id, tree), true);
  });

  it("returns false when selection is in a different node", () => {
    const { tree, p1, p2 } = buildTree();
    const sel = createCollapsed(p1.id, 3);
    assert.strictEqual(selectionSpans(sel, p2.id, tree), false);
  });

  it("returns true when selection anchor is in the node", () => {
    const { tree, p1, p2 } = buildTree();
    const sel = createSelection(
      createPosition(p1.id, 0),
      createPosition(p2.id, 5),
    );
    assert.strictEqual(selectionSpans(sel, p1.id, tree), true);
  });

  it("returns true when selection focus is in the node", () => {
    const { tree, p1, p2 } = buildTree();
    const sel = createSelection(
      createPosition(p1.id, 0),
      createPosition(p2.id, 5),
    );
    assert.strictEqual(selectionSpans(sel, p2.id, tree), true);
  });
});

// ── getPathToCursor ─────────────────────────────────────────────────

describe("getPathToCursor", () => {
  it("returns path for top-level node", () => {
    const { tree, p1 } = buildTree();
    const cursor = createPosition(p1.id, 3);
    const path = getPathToCursor(tree, cursor);
    assert.deepStrictEqual(path, [0, 3]);
  });

  it("returns path for nested inline node", () => {
    const { tree, boldText } = buildTree();
    const cursor = createPosition(boldText.id, 2);
    const path = getPathToCursor(tree, cursor);
    // tree child 0 (p1) → child 1 (bold) → child 0 (boldText) → offset 2
    assert.deepStrictEqual(path, [0, 1, 0, 2]);
  });

  it("returns path for list item", () => {
    const { tree, li2 } = buildTree();
    const cursor = createPosition(li2.id, 4);
    const path = getPathToCursor(tree, cursor);
    // tree child 2 (list) → child 1 (li2) → offset 4
    assert.deepStrictEqual(path, [2, 1, 4]);
  });

  it("returns null for non-existent node", () => {
    const { tree } = buildTree();
    const cursor = createPosition("nonexistent", 0);
    const path = getPathToCursor(tree, cursor);
    assert.strictEqual(path, null);
  });
});

// ── setCursorFromPath ───────────────────────────────────────────────

describe("setCursorFromPath", () => {
  it("restores cursor for top-level node", () => {
    const { tree, p1 } = buildTree();
    const cursor = setCursorFromPath(tree, [0, 3]);
    assert.strictEqual(cursor.nodeId, p1.id);
    assert.strictEqual(cursor.offset, 3);
  });

  it("restores cursor for nested node", () => {
    const { tree, boldText } = buildTree();
    const cursor = setCursorFromPath(tree, [0, 1, 0, 2]);
    assert.strictEqual(cursor.nodeId, boldText.id);
    assert.strictEqual(cursor.offset, 2);
  });

  it("restores cursor for list item", () => {
    const { tree, li2 } = buildTree();
    const cursor = setCursorFromPath(tree, [2, 1, 4]);
    assert.strictEqual(cursor.nodeId, li2.id);
    assert.strictEqual(cursor.offset, 4);
  });

  it("returns null for null path", () => {
    const { tree } = buildTree();
    assert.strictEqual(setCursorFromPath(tree, null), null);
  });

  it("returns null for path too short", () => {
    const { tree } = buildTree();
    assert.strictEqual(setCursorFromPath(tree, [0]), null);
  });

  it("returns null for out-of-bounds index", () => {
    const { tree } = buildTree();
    assert.strictEqual(setCursorFromPath(tree, [99, 0]), null);
  });

  it("roundtrips with getPathToCursor", () => {
    const { tree, boldText } = buildTree();
    const original = createPosition(boldText.id, 2);
    const path = getPathToCursor(tree, original);
    const restored = setCursorFromPath(tree, path);
    assert.strictEqual(restored.nodeId, original.nodeId);
    assert.strictEqual(restored.offset, original.offset);
  });
});
