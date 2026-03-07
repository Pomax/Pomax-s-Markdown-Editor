import assert from "node:assert";
import { describe, it } from "node:test";
import { SyntaxNode, SyntaxTree } from "../src/syntax-tree.js";
import {
  toggleListType,
  renumberOrderedList,
} from "../src/tree-mutations.js";

// ── Helper: build list nodes ────────────────────────────────────────

function buildUnorderedList() {
  const list = new SyntaxNode("list", "");
  list.attributes = { ordered: false, indent: 0 };
  list.runtime.marker = "-";

  const li1 = new SyntaxNode("list-item", "Buy milk");
  li1.attributes = {};
  list.appendChild(li1);

  const li2 = new SyntaxNode("list-item", "Buy eggs");
  li2.attributes = {};
  list.appendChild(li2);

  return { list, li1, li2 };
}

function buildOrderedList() {
  const list = new SyntaxNode("list", "");
  list.attributes = { ordered: true, indent: 0, number: 1 };

  const li1 = new SyntaxNode("list-item", "First");
  li1.attributes = {};
  list.appendChild(li1);

  const li2 = new SyntaxNode("list-item", "Second");
  li2.attributes = {};
  list.appendChild(li2);

  return { list, li1, li2 };
}

function buildChecklist() {
  const list = new SyntaxNode("list", "");
  list.attributes = { ordered: false, indent: 0, checked: true };
  list.runtime.marker = "-";

  const li1 = new SyntaxNode("list-item", "Buy milk");
  li1.attributes = { checked: true };
  list.appendChild(li1);

  const li2 = new SyntaxNode("list-item", "Buy eggs");
  li2.attributes = { checked: false };
  list.appendChild(li2);

  return { list, li1, li2 };
}

// ── toggleListType ──────────────────────────────────────────────────

describe("toggleListType", () => {

  // ── To unordered ───────────────────────────────────────────────

  it("ordered → unordered: sets ordered false, removes number", () => {
    const { list } = buildOrderedList();
    toggleListType(list, "unordered");
    assert.strictEqual(list.attributes.ordered, false);
    assert.strictEqual(list.attributes.number, undefined);
  });

  it("checklist → unordered: removes checked from list and items", () => {
    const { list, li1, li2 } = buildChecklist();
    toggleListType(list, "unordered");
    assert.strictEqual(list.attributes.ordered, false);
    assert.strictEqual(list.attributes.checked, undefined);
    assert.strictEqual(li1.attributes.checked, undefined);
    assert.strictEqual(li2.attributes.checked, undefined);
  });

  it("unordered → unordered: is a no-op", () => {
    const { list, li1 } = buildUnorderedList();
    toggleListType(list, "unordered");
    assert.strictEqual(list.attributes.ordered, false);
    assert.strictEqual(list.attributes.checked, undefined);
    assert.strictEqual(li1.attributes.checked, undefined);
  });

  // ── To ordered ────────────────────────────────────────────────

  it("unordered → ordered: sets ordered true, adds number", () => {
    const { list } = buildUnorderedList();
    toggleListType(list, "ordered");
    assert.strictEqual(list.attributes.ordered, true);
    assert.strictEqual(list.attributes.number, 1);
  });

  it("checklist → ordered: removes checked, sets ordered + number", () => {
    const { list, li1, li2 } = buildChecklist();
    toggleListType(list, "ordered");
    assert.strictEqual(list.attributes.ordered, true);
    assert.strictEqual(list.attributes.number, 1);
    assert.strictEqual(list.attributes.checked, undefined);
    assert.strictEqual(li1.attributes.checked, undefined);
    assert.strictEqual(li2.attributes.checked, undefined);
  });

  it("ordered → ordered: is a no-op", () => {
    const { list } = buildOrderedList();
    toggleListType(list, "ordered");
    assert.strictEqual(list.attributes.ordered, true);
    assert.strictEqual(list.attributes.number, 1);
  });

  // ── To checklist ──────────────────────────────────────────────

  it("unordered → checklist: sets checked on list and items", () => {
    const { list, li1, li2 } = buildUnorderedList();
    toggleListType(list, "checklist");
    assert.strictEqual(list.attributes.ordered, false);
    assert.strictEqual(list.attributes.checked, true);
    assert.strictEqual(li1.attributes.checked, false);
    assert.strictEqual(li2.attributes.checked, false);
  });

  it("ordered → checklist: sets unordered, removes number, adds checked", () => {
    const { list, li1, li2 } = buildOrderedList();
    toggleListType(list, "checklist");
    assert.strictEqual(list.attributes.ordered, false);
    assert.strictEqual(list.attributes.number, undefined);
    assert.strictEqual(list.attributes.checked, true);
    assert.strictEqual(li1.attributes.checked, false);
    assert.strictEqual(li2.attributes.checked, false);
  });

  it("checklist → checklist: preserves existing item checked states", () => {
    const { list, li1, li2 } = buildChecklist();
    toggleListType(list, "checklist");
    assert.strictEqual(list.attributes.checked, true);
    // Should NOT reset items that already have checked booleans
    assert.strictEqual(li1.attributes.checked, true);
    assert.strictEqual(li2.attributes.checked, false);
  });

  // ── Preservation ──────────────────────────────────────────────

  it("preserves indent across toggles", () => {
    const { list } = buildUnorderedList();
    list.attributes.indent = 2;
    toggleListType(list, "ordered");
    assert.strictEqual(list.attributes.indent, 2);
    toggleListType(list, "checklist");
    assert.strictEqual(list.attributes.indent, 2);
  });

  it("preserves list node identity", () => {
    const { list } = buildUnorderedList();
    const id = list.id;
    toggleListType(list, "ordered");
    assert.strictEqual(list.id, id);
  });

  it("preserves list-item content", () => {
    const { list, li1, li2 } = buildUnorderedList();
    toggleListType(list, "checklist");
    assert.strictEqual(li1.content, "Buy milk");
    assert.strictEqual(li2.content, "Buy eggs");
  });
});

// ── renumberOrderedList ─────────────────────────────────────────────

describe("renumberOrderedList", () => {
  it("resets number to 1", () => {
    const { list } = buildOrderedList();
    list.attributes.number = 5;
    renumberOrderedList(list);
    assert.strictEqual(list.attributes.number, 1);
  });

  it("is a no-op for unordered lists", () => {
    const { list } = buildUnorderedList();
    renumberOrderedList(list);
    assert.strictEqual(list.attributes.number, undefined);
  });

  it("is a no-op for checklists", () => {
    const { list } = buildChecklist();
    renumberOrderedList(list);
    assert.strictEqual(list.attributes.number, undefined);
  });
});
