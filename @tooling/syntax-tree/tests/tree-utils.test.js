import assert from "node:assert";
import { describe, it, beforeEach } from "node:test";
import { SyntaxNode, SyntaxTree } from "../src/syntax-tree.js";
import {
  findNodeById,
  findNodeAtPosition,
  getBlockParent,
  isInlineNode,
  toBareText,
  getPathToNode,
  getNodeAtPath,
} from "../src/tree-utils.js";

// ── Helper: build a small but realistic tree ────────────────────────
//
//  tree
//   ├── heading1  "Introduction"          (lines 0–0)
//   │    └── text "Introduction"
//   ├── paragraph "Hello **world**"       (lines 2–2)
//   │    ├── text "Hello "
//   │    └── bold ""
//   │         └── text "world"
//   ├── list ""                           (lines 4–6)
//   │    ├── list-item "Buy milk"         (lines 4–4)
//   │    │    └── text "Buy milk"
//   │    ├── list-item "Buy *eggs*"       (lines 5–5)
//   │    │    ├── text "Buy "
//   │    │    └── italic ""
//   │    │         └── text "eggs"
//   │    └── list-item "Buy bread"        (lines 6–6)
//   │         └── text "Buy bread"
//   └── table ""                          (lines 8–10)
//        ├── header ""
//        │    ├── cell "Name"
//        │    └── cell "Age"
//        └── row ""
//             ├── cell "Alice"
//             └── cell "30"

function buildTree() {
  const tree = new SyntaxTree();

  // heading
  const h1 = new SyntaxNode("heading1", "Introduction");
  h1.startLine = 0;
  h1.endLine = 0;
  const h1Text = new SyntaxNode("text", "Introduction");
  h1.appendChild(h1Text);
  tree.appendChild(h1);

  // paragraph
  const p = new SyntaxNode("paragraph", "Hello **world**");
  p.startLine = 2;
  p.endLine = 2;
  const pText = new SyntaxNode("text", "Hello ");
  const pBold = new SyntaxNode("bold", "");
  const pBoldText = new SyntaxNode("text", "world");
  pBold.appendChild(pBoldText);
  p.appendChild(pText);
  p.appendChild(pBold);
  tree.appendChild(p);

  // list
  const list = new SyntaxNode("list", "");
  list.attributes = { ordered: false };
  list.startLine = 4;
  list.endLine = 6;

  const li1 = new SyntaxNode("list-item", "Buy milk");
  li1.startLine = 4;
  li1.endLine = 4;
  const li1Text = new SyntaxNode("text", "Buy milk");
  li1.appendChild(li1Text);
  list.appendChild(li1);

  const li2 = new SyntaxNode("list-item", "Buy *eggs*");
  li2.startLine = 5;
  li2.endLine = 5;
  const li2Text = new SyntaxNode("text", "Buy ");
  const li2Italic = new SyntaxNode("italic", "");
  const li2ItalicText = new SyntaxNode("text", "eggs");
  li2Italic.appendChild(li2ItalicText);
  li2.appendChild(li2Text);
  li2.appendChild(li2Italic);
  list.appendChild(li2);

  const li3 = new SyntaxNode("list-item", "Buy bread");
  li3.startLine = 6;
  li3.endLine = 6;
  const li3Text = new SyntaxNode("text", "Buy bread");
  li3.appendChild(li3Text);
  list.appendChild(li3);

  tree.appendChild(list);

  // table
  const table = new SyntaxNode("table", "");
  table.startLine = 8;
  table.endLine = 10;

  const header = new SyntaxNode("header", "");
  header.startLine = 8;
  header.endLine = 8;
  const hCell1 = new SyntaxNode("cell", "Name");
  const hCell2 = new SyntaxNode("cell", "Age");
  header.appendChild(hCell1);
  header.appendChild(hCell2);
  table.appendChild(header);

  const row = new SyntaxNode("row", "");
  row.startLine = 10;
  row.endLine = 10;
  const rCell1 = new SyntaxNode("cell", "Alice");
  const rCell2 = new SyntaxNode("cell", "30");
  row.appendChild(rCell1);
  row.appendChild(rCell2);
  table.appendChild(row);

  tree.appendChild(table);

  return {
    tree,
    h1, h1Text,
    p, pText, pBold, pBoldText,
    list, li1, li1Text, li2, li2Text, li2Italic, li2ItalicText, li3, li3Text,
    table, header, hCell1, hCell2, row, rCell1, rCell2,
  };
}

// ── findNodeById ────────────────────────────────────────────────────

describe("findNodeById", () => {
  it("finds a top-level node", () => {
    const { tree, h1 } = buildTree();
    assert.strictEqual(findNodeById(tree, h1.id), h1);
  });

  it("finds a deeply nested inline node", () => {
    const { tree, pBoldText } = buildTree();
    assert.strictEqual(findNodeById(tree, pBoldText.id), pBoldText);
  });

  it("finds a node inside a list-item", () => {
    const { tree, li2Italic } = buildTree();
    assert.strictEqual(findNodeById(tree, li2Italic.id), li2Italic);
  });

  it("finds a table cell", () => {
    const { tree, rCell2 } = buildTree();
    assert.strictEqual(findNodeById(tree, rCell2.id), rCell2);
  });

  it("returns null for a non-existent id", () => {
    const { tree } = buildTree();
    assert.strictEqual(findNodeById(tree, "no-such-id"), null);
  });

  it("works on a SyntaxNode subtree", () => {
    const { list, li2ItalicText } = buildTree();
    assert.strictEqual(findNodeById(list, li2ItalicText.id), li2ItalicText);
  });
});

// ── findNodeAtPosition ──────────────────────────────────────────────

describe("findNodeAtPosition", () => {
  it("finds the heading at line 0", () => {
    const { tree, h1 } = buildTree();
    assert.strictEqual(findNodeAtPosition(tree, 0, 0), h1);
  });

  it("finds the paragraph at line 2", () => {
    const { tree, p } = buildTree();
    assert.strictEqual(findNodeAtPosition(tree, 2, 0), p);
  });

  it("finds a list-item at line 5", () => {
    const { tree, li2 } = buildTree();
    assert.strictEqual(findNodeAtPosition(tree, 5, 0), li2);
  });

  it("finds the list container at line 4", () => {
    const { tree, li1 } = buildTree();
    // line 4 is within the list (lines 4-6) and specifically the first list-item
    const result = findNodeAtPosition(tree, 4, 0);
    assert.strictEqual(result, li1);
  });

  it("finds a table row at line 10", () => {
    const { tree, row } = buildTree();
    assert.strictEqual(findNodeAtPosition(tree, 10, 0), row);
  });

  it("returns null for a line with no content", () => {
    const { tree } = buildTree();
    // line 1 is between heading and paragraph (blank line)
    assert.strictEqual(findNodeAtPosition(tree, 1, 0), null);
  });

  it("returns null for a line past the end", () => {
    const { tree } = buildTree();
    assert.strictEqual(findNodeAtPosition(tree, 99, 0), null);
  });
});

// ── getBlockParent ──────────────────────────────────────────────────

describe("getBlockParent", () => {
  it("returns the paragraph for an inline text node", () => {
    const { p, pText } = buildTree();
    assert.strictEqual(getBlockParent(pText), p);
  });

  it("returns the paragraph for a nested bold>text", () => {
    const { p, pBoldText } = buildTree();
    assert.strictEqual(getBlockParent(pBoldText), p);
  });

  it("returns the list-item for inline nodes inside it", () => {
    const { li2, li2ItalicText } = buildTree();
    assert.strictEqual(getBlockParent(li2ItalicText), li2);
  });

  it("returns null for a top-level block node (parent is tree/null)", () => {
    const { h1 } = buildTree();
    assert.strictEqual(getBlockParent(h1), null);
  });

  it("returns the list for a list-item", () => {
    const { list, li1 } = buildTree();
    assert.strictEqual(getBlockParent(li1), list);
  });
});

// ── isInlineNode ────────────────────────────────────────────────────

describe("isInlineNode", () => {
  it("returns true for text", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("text", "")), true);
  });

  it("returns true for bold", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("bold", "")), true);
  });

  it("returns true for italic", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("italic", "")), true);
  });

  it("returns true for bold-italic", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("bold-italic", "")), true);
  });

  it("returns true for strikethrough", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("strikethrough", "")), true);
  });

  it("returns true for inline-code", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("inline-code", "")), true);
  });

  it("returns true for link", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("link", "")), true);
  });

  it("returns true for image", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("image", "")), true);
  });

  it("returns true for inline-image", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("inline-image", "")), true);
  });

  it("returns true for html-inline", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("html-inline", "")), true);
  });

  it("returns false for paragraph", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("paragraph", "")), false);
  });

  it("returns false for heading1", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("heading1", "")), false);
  });

  it("returns false for list", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("list", "")), false);
  });

  it("returns false for list-item", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("list-item", "")), false);
  });

  it("returns false for table", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("table", "")), false);
  });

  it("returns false for code-block", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("code-block", "")), false);
  });

  it("returns false for blockquote", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("blockquote", "")), false);
  });

  it("returns false for horizontal-rule", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("horizontal-rule", "")), false);
  });

  it("returns false for html-element", () => {
    assert.strictEqual(isInlineNode(new SyntaxNode("html-element", "")), false);
  });
});

// ── toBareText ──────────────────────────────────────────────────────

describe("toBareText", () => {
  it("returns content for a leaf text node", () => {
    const node = new SyntaxNode("text", "Hello");
    assert.strictEqual(toBareText(node), "Hello");
  });

  it("returns content for a node with no children", () => {
    const node = new SyntaxNode("paragraph", "Simple text");
    assert.strictEqual(toBareText(node), "Simple text");
  });

  it("concatenates children text for a paragraph with inline nodes", () => {
    const { p } = buildTree();
    // p has children: text "Hello " + bold > text "world"
    assert.strictEqual(toBareText(p), "Hello world");
  });

  it("handles nested inline formatting", () => {
    const { li2 } = buildTree();
    // li2 has children: text "Buy " + italic > text "eggs"
    assert.strictEqual(toBareText(li2), "Buy eggs");
  });

  it("concatenates all text from a full tree", () => {
    const { tree } = buildTree();
    const result = toBareText(tree);
    assert.ok(result.includes("Introduction"));
    assert.ok(result.includes("Hello "));
    assert.ok(result.includes("world"));
    assert.ok(result.includes("Buy milk"));
    assert.ok(result.includes("eggs"));
    assert.ok(result.includes("Alice"));
  });

  it("returns empty string for an empty tree", () => {
    const tree = new SyntaxTree();
    assert.strictEqual(toBareText(tree), "");
  });

  it("uses content when node has no children", () => {
    const node = new SyntaxNode("inline-code", "let x = 1");
    assert.strictEqual(toBareText(node), "let x = 1");
  });
});

// ── getPathToNode ───────────────────────────────────────────────────

describe("getPathToNode", () => {
  it("returns [0] for the first top-level child", () => {
    const { tree, h1 } = buildTree();
    assert.deepStrictEqual(getPathToNode(tree, h1.id), [0]);
  });

  it("returns [1] for the second top-level child", () => {
    const { tree, p } = buildTree();
    assert.deepStrictEqual(getPathToNode(tree, p.id), [1]);
  });

  it("returns path for a nested inline node", () => {
    const { tree, pBoldText } = buildTree();
    // tree.children[1] = paragraph, .children[1] = bold, .children[0] = text
    assert.deepStrictEqual(getPathToNode(tree, pBoldText.id), [1, 1, 0]);
  });

  it("returns path for a list-item", () => {
    const { tree, li2 } = buildTree();
    // tree.children[2] = list, .children[1] = li2
    assert.deepStrictEqual(getPathToNode(tree, li2.id), [2, 1]);
  });

  it("returns path for a deeply nested node inside a list", () => {
    const { tree, li2ItalicText } = buildTree();
    // tree.children[2] = list, .children[1] = li2, .children[1] = italic, .children[0] = text
    assert.deepStrictEqual(getPathToNode(tree, li2ItalicText.id), [2, 1, 1, 0]);
  });

  it("returns path for a table cell", () => {
    const { tree, rCell2 } = buildTree();
    // tree.children[3] = table, .children[1] = row, .children[1] = cell
    assert.deepStrictEqual(getPathToNode(tree, rCell2.id), [3, 1, 1]);
  });

  it("returns null for a non-existent id", () => {
    const { tree } = buildTree();
    assert.strictEqual(getPathToNode(tree, "no-such-id"), null);
  });
});

// ── getNodeAtPath ───────────────────────────────────────────────────

describe("getNodeAtPath", () => {
  it("follows [0] to the first child", () => {
    const { tree, h1 } = buildTree();
    assert.strictEqual(getNodeAtPath(tree, [0]), h1);
  });

  it("follows [1, 1, 0] to bold > text", () => {
    const { tree, pBoldText } = buildTree();
    assert.strictEqual(getNodeAtPath(tree, [1, 1, 0]), pBoldText);
  });

  it("follows [2, 1, 1, 0] to list > li2 > italic > text", () => {
    const { tree, li2ItalicText } = buildTree();
    assert.strictEqual(getNodeAtPath(tree, [2, 1, 1, 0]), li2ItalicText);
  });

  it("follows [3, 1, 1] to table > row > cell", () => {
    const { tree, rCell2 } = buildTree();
    assert.strictEqual(getNodeAtPath(tree, [3, 1, 1]), rCell2);
  });

  it("returns null for an out-of-bounds index", () => {
    const { tree } = buildTree();
    assert.strictEqual(getNodeAtPath(tree, [99]), null);
  });

  it("returns null for a path that goes too deep", () => {
    const { tree } = buildTree();
    assert.strictEqual(getNodeAtPath(tree, [0, 0, 0, 0, 0]), null);
  });

  it("returns null for an empty path", () => {
    const { tree } = buildTree();
    assert.strictEqual(getNodeAtPath(tree, []), null);
  });

  it("roundtrips with getPathToNode", () => {
    const { tree, li2Italic } = buildTree();
    const path = getPathToNode(tree, li2Italic.id);
    assert.strictEqual(getNodeAtPath(tree, path), li2Italic);
  });
});
