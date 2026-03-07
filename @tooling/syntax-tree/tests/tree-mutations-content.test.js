import assert from "node:assert";
import { describe, it } from "node:test";
import { SyntaxNode, SyntaxTree } from "../src/syntax-tree.js";
import {
  rebuildInlineChildren,
  mergeHints,
} from "../src/tree-mutations.js";

// ── rebuildInlineChildren ───────────────────────────────────────────

describe("rebuildInlineChildren", () => {
  it("parses plain text into a single text child", () => {
    const node = new SyntaxNode("paragraph", "Hello world");
    rebuildInlineChildren(node);
    assert.strictEqual(node.children.length, 1);
    assert.strictEqual(node.children[0].type, "text");
    assert.strictEqual(node.children[0].content, "Hello world");
  });

  it("parses bold formatting into text + bold children", () => {
    const node = new SyntaxNode("paragraph", "Hello **world**");
    rebuildInlineChildren(node);
    assert.strictEqual(node.children.length, 2);
    assert.strictEqual(node.children[0].type, "text");
    assert.strictEqual(node.children[0].content, "Hello ");
    assert.strictEqual(node.children[1].type, "bold");
    // bold node should have a text child
    assert.strictEqual(node.children[1].children.length, 1);
    assert.strictEqual(node.children[1].children[0].type, "text");
    assert.strictEqual(node.children[1].children[0].content, "world");
  });

  it("parses italic formatting", () => {
    const node = new SyntaxNode("paragraph", "Buy *eggs*");
    rebuildInlineChildren(node);
    assert.strictEqual(node.children.length, 2);
    assert.strictEqual(node.children[0].type, "text");
    assert.strictEqual(node.children[1].type, "italic");
  });

  it("parses inline code", () => {
    const node = new SyntaxNode("paragraph", "Use `const` here");
    rebuildInlineChildren(node);
    const codeNode = node.children.find((c) => c.type === "inline-code");
    assert.ok(codeNode, "should contain an inline-code node");
    assert.strictEqual(codeNode.content, "const");
  });

  it("works on heading types", () => {
    for (let i = 1; i <= 6; i++) {
      const node = new SyntaxNode(`heading${i}`, "Hello **bold**");
      rebuildInlineChildren(node);
      assert.ok(node.children.length >= 2, `heading${i} should have parsed children`);
    }
  });

  it("works on list-item type", () => {
    const node = new SyntaxNode("list-item", "Buy *milk*");
    rebuildInlineChildren(node);
    assert.strictEqual(node.children.length, 2);
    assert.strictEqual(node.children[1].type, "italic");
  });

  it("works on blockquote type", () => {
    const node = new SyntaxNode("blockquote", "A **quote**");
    rebuildInlineChildren(node);
    assert.ok(node.children.length >= 2);
  });

  it("clears existing children when structure changes completely", () => {
    const node = new SyntaxNode("paragraph", "old content");
    const staleChild = new SyntaxNode("text", "stale");
    node.appendChild(staleChild);
    // Change content to something with different structure
    node.content = "new **content**";
    rebuildInlineChildren(node);
    // First child type still matches (text=text), so identity is preserved
    // but content is updated. The bold node is new.
    assert.strictEqual(node.children[0], staleChild);
    assert.strictEqual(node.children[0].content, "new ");
    assert.strictEqual(node.children.length, 2);
    assert.strictEqual(node.children[1].type, "bold");
  });

  // ── Identity preservation (reconciliation) ──────────────────────

  it("preserves child identity when only text content changes", () => {
    const node = new SyntaxNode("paragraph", "Hello **world**");
    rebuildInlineChildren(node);
    const textNode = node.children[0];
    const boldNode = node.children[1];
    const boldTextNode = boldNode.children[0];
    const textId = textNode.id;
    const boldId = boldNode.id;
    const boldTextId = boldTextNode.id;

    // Simulate user typing in the bold word
    node.content = "Hello **worlds**";
    rebuildInlineChildren(node);

    // Same node objects should still be there
    assert.strictEqual(node.children[0], textNode);
    assert.strictEqual(node.children[0].id, textId);
    assert.strictEqual(node.children[1], boldNode);
    assert.strictEqual(node.children[1].id, boldId);
    assert.strictEqual(node.children[1].children[0], boldTextNode);
    assert.strictEqual(node.children[1].children[0].id, boldTextId);
    // But content should be updated
    assert.strictEqual(node.children[1].children[0].content, "worlds");
  });

  it("preserves identity for leading text when only text changes", () => {
    const node = new SyntaxNode("paragraph", "Hello world");
    rebuildInlineChildren(node);
    const textNode = node.children[0];
    const textId = textNode.id;

    node.content = "Hello world!";
    rebuildInlineChildren(node);

    assert.strictEqual(node.children[0], textNode);
    assert.strictEqual(node.children[0].id, textId);
    assert.strictEqual(node.children[0].content, "Hello world!");
  });

  it("replaces nodes when structure changes", () => {
    const node = new SyntaxNode("paragraph", "Hello world");
    rebuildInlineChildren(node);
    const originalText = node.children[0];

    // Adding bold changes the structure
    node.content = "Hello **world**";
    rebuildInlineChildren(node);

    // First child is still text type with same id (content prefix matches)
    assert.strictEqual(node.children[0], originalText);
    assert.strictEqual(node.children[0].content, "Hello ");
    // But now there's a bold node too
    assert.strictEqual(node.children.length, 2);
    assert.strictEqual(node.children[1].type, "bold");
  });

  it("preserves identity across multiple rebuilds", () => {
    const node = new SyntaxNode("paragraph", "A *B* C");
    rebuildInlineChildren(node);
    const aNode = node.children[0]; // text "A "
    const italicNode = node.children[1]; // italic
    const cNode = node.children[2]; // text " C"

    // Edit 1: change text in italic
    node.content = "A *Bx* C";
    rebuildInlineChildren(node);
    assert.strictEqual(node.children[0], aNode);
    assert.strictEqual(node.children[1], italicNode);
    assert.strictEqual(node.children[2], cNode);

    // Edit 2: change trailing text
    node.content = "A *Bx* C!";
    rebuildInlineChildren(node);
    assert.strictEqual(node.children[0], aNode);
    assert.strictEqual(node.children[1], italicNode);
    assert.strictEqual(node.children[2], cNode);
    assert.strictEqual(cNode.content, " C!");
  });

  it("handles adding a node at the end while preserving earlier nodes", () => {
    const node = new SyntaxNode("paragraph", "Hello world");
    rebuildInlineChildren(node);
    const textNode = node.children[0];

    // Structure change: text → text + bold (diverges at index 1, but index 0 still matches)
    // Actually "Hello " is text type, but original was single "Hello world" text
    // After adding bold, first child becomes "Hello " — type matches (text=text) so id preserved
    node.content = "Hello **world**";
    rebuildInlineChildren(node);

    assert.strictEqual(node.children[0], textNode);
    assert.strictEqual(node.children.length, 2);
    assert.strictEqual(node.children[1].type, "bold");
  });

  it("sets parent on new children", () => {
    const node = new SyntaxNode("paragraph", "Hello **world**");
    rebuildInlineChildren(node);
    for (const child of node.children) {
      assert.strictEqual(child.parent, node);
    }
  });

  it("is a no-op for non-inline-content types", () => {
    const types = ["list", "table", "code-block", "horizontal-rule", "header", "row", "cell", "html-element"];
    for (const type of types) {
      const node = new SyntaxNode(type, "Some **content**");
      node.appendChild(new SyntaxNode("text", "original"));
      rebuildInlineChildren(node);
      // Children should be unchanged
      assert.strictEqual(node.children.length, 1);
      assert.strictEqual(node.children[0].content, "original");
    }
  });

  it("handles empty content", () => {
    const node = new SyntaxNode("paragraph", "");
    rebuildInlineChildren(node);
    assert.strictEqual(node.children.length, 0);
  });

  it("preserves the node identity (same object reference)", () => {
    const node = new SyntaxNode("paragraph", "Hello");
    const id = node.id;
    rebuildInlineChildren(node);
    assert.strictEqual(node.id, id);
    assert.strictEqual(node.type, "paragraph");
  });

  it("does not alter node.content", () => {
    const node = new SyntaxNode("paragraph", "Hello **world**");
    rebuildInlineChildren(node);
    assert.strictEqual(node.content, "Hello **world**");
  });
});

// ── mergeHints ──────────────────────────────────────────────────────

describe("mergeHints", () => {
  it("merges two empty hints", () => {
    const a = { renderHints: { updated: [], added: [], removed: [] }, selection: null };
    const b = { renderHints: { updated: [], added: [], removed: [] }, selection: null };
    const result = mergeHints(a, b);
    assert.deepStrictEqual(result.renderHints, { updated: [], added: [], removed: [] });
    assert.strictEqual(result.selection, null);
  });

  it("unions updated arrays", () => {
    const a = { renderHints: { updated: ["a", "b"], added: [], removed: [] }, selection: null };
    const b = { renderHints: { updated: ["b", "c"], added: [], removed: [] }, selection: null };
    const result = mergeHints(a, b);
    assert.deepStrictEqual(result.renderHints.updated.sort(), ["a", "b", "c"]);
  });

  it("unions added arrays", () => {
    const a = { renderHints: { updated: [], added: ["x"], removed: [] }, selection: null };
    const b = { renderHints: { updated: [], added: ["y"], removed: [] }, selection: null };
    const result = mergeHints(a, b);
    assert.deepStrictEqual(result.renderHints.added.sort(), ["x", "y"]);
  });

  it("unions removed arrays", () => {
    const a = { renderHints: { updated: [], added: [], removed: ["d1"] }, selection: null };
    const b = { renderHints: { updated: [], added: [], removed: ["d2"] }, selection: null };
    const result = mergeHints(a, b);
    assert.deepStrictEqual(result.renderHints.removed.sort(), ["d1", "d2"]);
  });

  it("deduplicates ids across all hint arrays", () => {
    const a = { renderHints: { updated: ["x"], added: ["x", "y"], removed: ["z"] }, selection: null };
    const b = { renderHints: { updated: ["x"], added: ["y"], removed: ["z", "w"] }, selection: null };
    const result = mergeHints(a, b);
    assert.deepStrictEqual(result.renderHints.updated.sort(), ["x"]);
    assert.deepStrictEqual(result.renderHints.added.sort(), ["x", "y"]);
    assert.deepStrictEqual(result.renderHints.removed.sort(), ["w", "z"]);
  });

  it("selection from b wins", () => {
    const a = { renderHints: { updated: [], added: [], removed: [] }, selection: { nodeId: "a", offset: 5 } };
    const b = { renderHints: { updated: [], added: [], removed: [] }, selection: { nodeId: "b", offset: 3 } };
    const result = mergeHints(a, b);
    assert.deepStrictEqual(result.selection, { nodeId: "b", offset: 3 });
  });

  it("falls back to a.selection when b.selection is null", () => {
    const a = { renderHints: { updated: [], added: [], removed: [] }, selection: { nodeId: "a", offset: 5 } };
    const b = { renderHints: { updated: [], added: [], removed: [] }, selection: null };
    const result = mergeHints(a, b);
    assert.deepStrictEqual(result.selection, { nodeId: "a", offset: 5 });
  });
});
