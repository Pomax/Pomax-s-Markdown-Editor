import assert from "node:assert";
import { describe, it } from "node:test";
import { SyntaxNode } from "../src/syntax-tree.js";
import {
  getTableCell,
  setTableCellText,
  addTableRow,
  addTableColumn,
  removeTableRow,
  removeTableColumn,
} from "../src/tree-mutations.js";

// ── Helper: build a 2-col, 1-body-row table ────────────────────────
//
//   | A | B |
//   |---|---|
//   | 1 | 2 |

function buildSimpleTable() {
  const table = new SyntaxNode("table", "");

  const header = new SyntaxNode("header", "");
  const hA = new SyntaxNode("cell", "A");
  hA.appendChild(new SyntaxNode("text", "A"));
  const hB = new SyntaxNode("cell", "B");
  hB.appendChild(new SyntaxNode("text", "B"));
  header.appendChild(hA);
  header.appendChild(hB);
  table.appendChild(header);

  const row1 = new SyntaxNode("row", "");
  const c1 = new SyntaxNode("cell", "1");
  c1.appendChild(new SyntaxNode("text", "1"));
  const c2 = new SyntaxNode("cell", "2");
  c2.appendChild(new SyntaxNode("text", "2"));
  row1.appendChild(c1);
  row1.appendChild(c2);
  table.appendChild(row1);

  return { table, header, row1, hA, hB, c1, c2 };
}

// ── Helper: build a 3-col, 2-body-row table ────────────────────────
//
//   | X | Y | Z |
//   |---|---|---|
//   | a | b | c |
//   | d | e | f |

function buildLargerTable() {
  const table = new SyntaxNode("table", "");

  const header = new SyntaxNode("header", "");
  for (const t of ["X", "Y", "Z"]) {
    const cell = new SyntaxNode("cell", t);
    cell.appendChild(new SyntaxNode("text", t));
    header.appendChild(cell);
  }
  table.appendChild(header);

  const row1 = new SyntaxNode("row", "");
  for (const t of ["a", "b", "c"]) {
    const cell = new SyntaxNode("cell", t);
    cell.appendChild(new SyntaxNode("text", t));
    row1.appendChild(cell);
  }
  table.appendChild(row1);

  const row2 = new SyntaxNode("row", "");
  for (const t of ["d", "e", "f"]) {
    const cell = new SyntaxNode("cell", t);
    cell.appendChild(new SyntaxNode("text", t));
    row2.appendChild(cell);
  }
  table.appendChild(row2);

  return { table, header, row1, row2 };
}

// ── getTableCell ────────────────────────────────────────────────────

describe("getTableCell", () => {
  it("returns header cell at (0, 0)", () => {
    const { table, hA } = buildSimpleTable();
    assert.strictEqual(getTableCell(table, 0, 0), hA);
  });

  it("returns header cell at (0, 1)", () => {
    const { table, hB } = buildSimpleTable();
    assert.strictEqual(getTableCell(table, 0, 1), hB);
  });

  it("returns body cell at (1, 0)", () => {
    const { table, c1 } = buildSimpleTable();
    assert.strictEqual(getTableCell(table, 1, 0), c1);
  });

  it("returns body cell at (1, 1)", () => {
    const { table, c2 } = buildSimpleTable();
    assert.strictEqual(getTableCell(table, 1, 1), c2);
  });

  it("returns null for out-of-bounds row", () => {
    const { table } = buildSimpleTable();
    assert.strictEqual(getTableCell(table, 5, 0), null);
  });

  it("returns null for out-of-bounds column", () => {
    const { table } = buildSimpleTable();
    assert.strictEqual(getTableCell(table, 0, 5), null);
  });

  it("returns null for negative indices", () => {
    const { table } = buildSimpleTable();
    assert.strictEqual(getTableCell(table, -1, 0), null);
  });

  it("works with a larger table", () => {
    const { table, row2 } = buildLargerTable();
    const cell = getTableCell(table, 2, 1);
    assert.strictEqual(cell.content, "e");
    assert.strictEqual(cell.parent, row2);
  });
});

// ── setTableCellText ────────────────────────────────────────────────

describe("setTableCellText", () => {
  it("updates the cell content", () => {
    const { table } = buildSimpleTable();
    setTableCellText(table, 0, 0, "Header");
    const cell = getTableCell(table, 0, 0);
    assert.strictEqual(cell.content, "Header");
  });

  it("rebuilds inline children after update", () => {
    const { table } = buildSimpleTable();
    setTableCellText(table, 1, 0, "**bold**");
    const cell = getTableCell(table, 1, 0);
    assert.strictEqual(cell.children.length, 1);
    assert.strictEqual(cell.children[0].type, "bold");
  });

  it("returns renderHints with updated cell id", () => {
    const { table } = buildSimpleTable();
    const cell = getTableCell(table, 0, 1);
    const result = setTableCellText(table, 0, 1, "New");
    assert.ok(result.renderHints.updated.includes(cell.id));
  });

  it("returns selection at end of new text", () => {
    const { table } = buildSimpleTable();
    const cell = getTableCell(table, 0, 0);
    const result = setTableCellText(table, 0, 0, "Hello");
    assert.deepStrictEqual(result.selection, {
      nodeId: cell.id,
      offset: 5,
    });
  });

  it("preserves cell node identity", () => {
    const { table, hA } = buildSimpleTable();
    setTableCellText(table, 0, 0, "Changed");
    assert.strictEqual(getTableCell(table, 0, 0), hA);
  });
});

// ── addTableRow ─────────────────────────────────────────────────────

describe("addTableRow", () => {
  it("appends a new row to the table", () => {
    const { table } = buildSimpleTable();
    assert.strictEqual(table.children.length, 2); // header + 1 row
    addTableRow(table);
    assert.strictEqual(table.children.length, 3);
  });

  it("new row has correct number of cells", () => {
    const { table } = buildSimpleTable();
    addTableRow(table);
    const newRow = table.children[table.children.length - 1];
    assert.strictEqual(newRow.children.length, 2);
  });

  it("new row has type 'row'", () => {
    const { table } = buildSimpleTable();
    addTableRow(table);
    const newRow = table.children[table.children.length - 1];
    assert.strictEqual(newRow.type, "row");
  });

  it("new cells have empty content", () => {
    const { table } = buildSimpleTable();
    addTableRow(table);
    const newRow = table.children[table.children.length - 1];
    for (const cell of newRow.children) {
      assert.strictEqual(cell.type, "cell");
      assert.strictEqual(cell.content, "");
    }
  });

  it("returns renderHints with added row and cell ids", () => {
    const { table } = buildSimpleTable();
    const result = addTableRow(table);
    const newRow = table.children[table.children.length - 1];
    assert.ok(result.renderHints.added.includes(newRow.id));
    for (const cell of newRow.children) {
      assert.ok(result.renderHints.added.includes(cell.id));
    }
  });

  it("returns selection pointing to first cell of new row", () => {
    const { table } = buildSimpleTable();
    const result = addTableRow(table);
    const newRow = table.children[table.children.length - 1];
    assert.deepStrictEqual(result.selection, {
      nodeId: newRow.children[0].id,
      offset: 0,
    });
  });

  it("works with a 3-column table", () => {
    const { table } = buildLargerTable();
    addTableRow(table);
    const newRow = table.children[table.children.length - 1];
    assert.strictEqual(newRow.children.length, 3);
  });
});

// ── addTableColumn ──────────────────────────────────────────────────

describe("addTableColumn", () => {
  it("adds a cell to the header", () => {
    const { table, header } = buildSimpleTable();
    addTableColumn(table);
    assert.strictEqual(header.children.length, 3);
  });

  it("adds a cell to each body row", () => {
    const { table, row1 } = buildSimpleTable();
    addTableColumn(table);
    assert.strictEqual(row1.children.length, 3);
  });

  it("new cells have empty content", () => {
    const { table } = buildSimpleTable();
    addTableColumn(table);
    for (const child of table.children) {
      const lastCell = child.children[child.children.length - 1];
      assert.strictEqual(lastCell.content, "");
    }
  });

  it("new cells have type 'cell'", () => {
    const { table } = buildSimpleTable();
    addTableColumn(table);
    for (const child of table.children) {
      const lastCell = child.children[child.children.length - 1];
      assert.strictEqual(lastCell.type, "cell");
    }
  });

  it("returns renderHints with added cell ids", () => {
    const { table } = buildSimpleTable();
    const result = addTableColumn(table);
    // header + 1 row = 2 new cells
    assert.strictEqual(result.renderHints.added.length, 2);
  });

  it("returns selection pointing to header's new cell", () => {
    const { table, header } = buildSimpleTable();
    const result = addTableColumn(table);
    const newHeaderCell = header.children[header.children.length - 1];
    assert.deepStrictEqual(result.selection, {
      nodeId: newHeaderCell.id,
      offset: 0,
    });
  });

  it("works with a larger table (adds to all rows)", () => {
    const { table } = buildLargerTable();
    addTableColumn(table);
    // header + 2 rows = all should have 4 cells
    for (const child of table.children) {
      assert.strictEqual(child.children.length, 4);
    }
  });
});

// ── removeTableRow ──────────────────────────────────────────────────

describe("removeTableRow", () => {
  it("removes a body row by index", () => {
    const { table } = buildLargerTable();
    assert.strictEqual(table.children.length, 3); // header + 2 rows
    removeTableRow(table, 1);
    assert.strictEqual(table.children.length, 2);
  });

  it("removes the correct row", () => {
    const { table, row2 } = buildLargerTable();
    removeTableRow(table, 1); // remove row1
    // row2 should now be at index 1
    assert.strictEqual(table.children[1], row2);
  });

  it("cannot remove the header row (row 0)", () => {
    const { table, header } = buildSimpleTable();
    removeTableRow(table, 0);
    // header should still be there
    assert.strictEqual(table.children[0], header);
    assert.strictEqual(table.children.length, 2); // unchanged
  });

  it("returns renderHints with removed row and cell ids", () => {
    const { table, row1 } = buildLargerTable();
    const cellIds = row1.children.map((c) => c.id);
    const result = removeTableRow(table, 1);
    assert.ok(result.renderHints.removed.includes(row1.id));
    for (const id of cellIds) {
      assert.ok(result.renderHints.removed.includes(id));
    }
  });

  it("returns null selection when removing non-header row", () => {
    const { table } = buildLargerTable();
    const result = removeTableRow(table, 1);
    assert.strictEqual(result.selection, null);
  });

  it("is a no-op for out-of-bounds index", () => {
    const { table } = buildSimpleTable();
    const result = removeTableRow(table, 10);
    assert.strictEqual(table.children.length, 2);
    assert.deepStrictEqual(result.renderHints.removed, []);
  });
});

// ── removeTableColumn ───────────────────────────────────────────────

describe("removeTableColumn", () => {
  it("removes a cell from the header", () => {
    const { table } = buildLargerTable();
    removeTableColumn(table, 1); // remove col Y
    assert.strictEqual(table.children[0].children.length, 2);
  });

  it("removes a cell from every body row", () => {
    const { table } = buildLargerTable();
    removeTableColumn(table, 1);
    for (const child of table.children) {
      assert.strictEqual(child.children.length, 2);
    }
  });

  it("removes the correct column", () => {
    const { table } = buildLargerTable();
    removeTableColumn(table, 1); // remove col Y
    // header should have X, Z
    assert.strictEqual(table.children[0].children[0].content, "X");
    assert.strictEqual(table.children[0].children[1].content, "Z");
  });

  it("cannot remove the last column", () => {
    const { table } = buildSimpleTable();
    removeTableColumn(table, 0); // now 1 col
    removeTableColumn(table, 0); // should be a no-op
    assert.strictEqual(table.children[0].children.length, 1);
  });

  it("returns renderHints with removed cell ids", () => {
    const { table } = buildLargerTable();
    // Collect the col-1 cells before removing
    const removedIds = table.children.map((child) => child.children[1].id);
    const result = removeTableColumn(table, 1);
    for (const id of removedIds) {
      assert.ok(result.renderHints.removed.includes(id));
    }
  });

  it("returns null selection", () => {
    const { table } = buildLargerTable();
    const result = removeTableColumn(table, 0);
    assert.strictEqual(result.selection, null);
  });

  it("is a no-op for out-of-bounds column index", () => {
    const { table } = buildSimpleTable();
    const result = removeTableColumn(table, 10);
    assert.strictEqual(table.children[0].children.length, 2);
    assert.deepStrictEqual(result.renderHints.removed, []);
  });
});
