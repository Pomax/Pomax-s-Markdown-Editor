# Migration Approach: Editor → `@tooling` Parser & Syntax Tree

## Agent Instructions

This document defines the migration from the editor's built-in parser to the `@tooling` parser and syntax tree. Work through the steps **in order**. Each step is designed to be independently completable and verifiable.

### Rules

1. **Never delete files.** Only create new files or modify existing ones.
2. **Do not modify `@tooling` code without explicit approval.** Every step that touches files under `@tooling/` is flagged. Present the proposed changes and wait for sign-off before writing code.
3. **Write tests first (TDD).** For every step that adds new functions, write the test file first — before implementing the code. The tests define the expected behavior. Run them to confirm they fail (the code doesn't exist yet). Then implement the code. Then run the tests again — they should now pass. This is the red-green cycle: red (failing tests) → implement → green (passing tests).
4. **Verify before proceeding.** After completing a step, run the verification commands listed. All tests must pass before moving to the next step. If a test fails, fix it before continuing.
5. **Commit after each step.** Every completed, verified step gets its own commit. This ensures no work is lost and provides rollback points.
6. **Use the existing terminal.** Do not open PowerShell; use `cmd` for all terminal work.

### Verification Commands

| Scope | Command |
|-------|---------|
| Parser spec tests | `cd @tooling/parser && npm run test:spec` |
| Editor unit tests | `npm run test:unit` |
| Editor integration tests | `npm run test:integration` |
| All tests | `npm test` |
| Lint only | `npm run lint` |

For steps that only add new code under `@tooling/`, it is sufficient to verify that (a) the new tests pass and (b) the existing parser spec tests still pass. For steps that modify editor code, the full test suite must pass.

---

## Step 1: Add Child-Manipulation Operations

**Goal:** Add `insertChild(node, index)` and `removeChild(child)` to both `SyntaxNode` and `SyntaxTree`. The existing `appendChild` becomes a thin wrapper around `insertChild`. These are generic tree operations needed by nearly every later step.

**Files to modify:**
- `@tooling/syntax-tree/src/syntax-tree.js` — add methods to both classes, refactor `appendChild` to delegate
- `@tooling/syntax-tree/package.json` — add a `"test"` script: `node --test "tests/**/*.test.js"` (runs all tests in the tests directory, matching the top-level repo's pattern)

**Files to create:**
- `@tooling/syntax-tree/tests/tree-ops.test.js` — unit tests for the new methods

**Implementation details (on both `SyntaxNode` and `SyntaxTree`):**
- `insertChild(child, index)`: Splice `child` into `this.children` at `index`, set `child.parent = this` (or `null` for `SyntaxTree`). Index 0 prepends, index `children.length` appends.
- `appendChild(child)`: Delegates to `insertChild(child, this.children.length)`.
- `removeChild(child)`: Find `child` in `this.children` by identity (`===`), splice it out, set `child.parent = null`. Throw if `child` is not found.

**Verification:**
```
cd @tooling/syntax-tree && npm test
cd @tooling/parser && npm run test:spec
```

**Depends on:** Nothing.

---

## Step 2: Create Tree Query Utilities (`tree-utils.js`)

**Goal:** Create a module of pure functions that query/walk the syntax tree. No mutations, no side effects.

**Files to create:**
- `@tooling/syntax-tree/src/tree-utils.js`
- `@tooling/syntax-tree/tests/tree-utils.test.js`

**Files to modify:**
- `@tooling/syntax-tree/index.js` — export the new functions

**Functions to implement:**

| Function | Signature | Purpose |
|----------|-----------|---------|
| `findNodeById` | `(tree, id) → SyntaxNode\|null` | Recursive search through all children (including list containers, html-element children, table rows/cells) |
| `findNodeAtPosition` | `(tree, line, col) → SyntaxNode\|null` | Find node whose `startLine`/`endLine` range contains the position |
| `getBlockParent` | `(node) → SyntaxNode\|null` | Walk up `node.parent` chain to the nearest block-level ancestor |
| `isInlineNode` | `(node) → boolean` | Returns true for inline types: text, bold, italic, bold-italic, strikethrough, code, link, image, inline-image, html-inline, etc. |
| `toBareText` | `(nodeOrTree) → string` | Strip all formatting to get visible text only. Recurse through children for container nodes. |
| `getPathToNode` | `(tree, id) → number[]\|null` | Return the index path from root to the node (e.g. `[2, 0, 1]` = tree.children[2].children[0].children[1]) |
| `getNodeAtPath` | `(tree, path) → SyntaxNode\|null` | Follow an index path to retrieve a node |

**Verification:**
```
cd @tooling/syntax-tree && npm test
cd @tooling/parser && npm run test:spec
```

**Depends on:** Nothing (reads tree structure only).

---

## Step 3: Content-Level Mutations — `rebuildInlineChildren` and `mergeHints`

**Goal:** Create the `tree-mutations.js` module with the two foundational content-level functions. `rebuildInlineChildren` is the most critical function in the migration — it keeps inline children in sync when `node.content` changes.

**Files to create:**
- `@tooling/syntax-tree/src/tree-mutations.js`
- `@tooling/syntax-tree/tests/tree-mutations-content.test.js`

**Files to modify:**
- `@tooling/syntax-tree/index.js` — export the new functions

**Functions to implement:**

### `rebuildInlineChildren(node) → void`
- Re-parse `node.content` via `parseInlineContent`, then **reconcile** old children against new ones.
- Where old and new children structurally match (same type at the same position), the existing node is kept and its content/attributes are updated **in place** — preserving node identity (IDs, DOM node references, cursor position).
- Where structure diverges (type mismatch or length change), old nodes are removed and new nodes are appended from that point on.
- **Synchronous.** The editor calls this on every keystroke and reads `node.children` immediately after.
- No-op if `node.type` is not in `INLINE_CONTENT_TYPES` (`paragraph`, `heading1`–`heading6`, `blockquote`, `list-item`).
- **Design note:** Full reparse is always performed (inline formatting is context-sensitive — a single `*` can restructure the whole inline tree). The reconciliation pass is what makes it efficient: editing a bolded word updates the text node in place without touching sibling nodes or regenerating IDs.

### `mergeHints(a, b) → { renderHints, selection }`
- Combine two `{ renderHints: { updated, added, removed }, selection }` objects.
- Union the `updated`/`added`/`removed` sets (arrays of node IDs).
- The `selection` from `b` wins (last operation determines cursor placement).

**Verification:**
```
cd @tooling/syntax-tree && npm test
cd @tooling/parser && npm run test:spec
```

**Depends on:** Step 1 (uses `appendChild` and `removeChild`).

---

## Step 4: Block-Level Mutations

**Goal:** Add structural editing operations to `tree-mutations.js`. These implement Enter, paste, and type-change behavior. All operations follow markdown-first: edit the markdown content, reparse, update the tree.

**Files to modify:**
- `@tooling/syntax-tree/src/tree-mutations.js` — add functions

**Files to create:**
- `@tooling/syntax-tree/tests/tree-mutations-block.test.js`

**Functions to implement:**

### `splitNode(tree, node, offset, parseFn) → { renderHints, selection }`
- Split the markdown: take `node.content`, split at `offset` into two strings.
- Reparse each half using `parseFn` to determine the correct types. (E.g. `## Hello world` split at offset 5 → `## Hello` parses as heading2 + `world` parses as paragraph.)
- Replace the original node with the parse results in the tree.
- Call `rebuildInlineChildren` on each resulting node.

### `insertNodesAfter(tree, refNode, newNodes) → { renderHints, selection }`
- Insert an array of new nodes after `refNode` in its parent's children.
- Needed for multi-line paste.

### `changeNodeType(node, newType) → void`
- Change `node.type` to `newType`. That's it — no content manipulation.
- The caller is responsible for editing markdown content (adding/removing prefixes) and reparsing. This is just the primitive that mutates the type field.

**Verification:**
```
cd @tooling/syntax-tree && npm test
cd @tooling/parser && npm run test:spec
```

**Depends on:** Steps 1, 3.

---

## Step 5: List Operations

**Goal:** Add list-level helpers to `tree-mutations.js`. Lists in `@tooling` use a container model (`list` node wraps `list-item` children). The operations here are minimal — most behavior follows from markdown-first editing + reparsing.

**Files to modify:**
- `@tooling/syntax-tree/src/tree-mutations.js` — add functions

**Files to create:**
- `@tooling/syntax-tree/tests/tree-mutations-list.test.js`

**Functions to implement:**

### `toggleListType(list, kind) → void`
- Switch a list between three kinds: `"unordered"`, `"ordered"`, `"checklist"`.
- **→ unordered**: set `ordered: false`, delete `checked` from list and all items, delete `number` from list.
- **→ ordered**: set `ordered: true`, set `number: 1`, delete `checked` from list and all items.
- **→ checklist**: set `ordered: false`, set `checked: true` on list, set `checked: false` on every item that doesn't already have a boolean `checked`. Delete `number` from list.
- Checklists are always unordered (the parser only detects `[ ]`/`[x]` inside `parseUnorderedListItem`).
- The `list.attributes.checked` flag means "this list contains checklist items" — it is always `true` when present. Each `list-item.attributes.checked` is the per-item checked state (`true`/`false`).

### `renumberOrderedList(list) → void`
- Set `list.attributes.number` to `1` (reset the start number). Individual list-item numbers are not stored — the parser strips them via `stripListAttrsFromItem`. The markdown renderer derives item numbers from the list-level `number` attribute.
- No-op if `list.attributes.ordered` is not `true`.

**Verification:**
```
cd @tooling/syntax-tree && npm test
cd @tooling/parser && npm run test:spec
```

**Depends on:** Steps 1, 3, 4.

---

## Step 6: Table Operations

**Goal:** Add table-level helpers to `tree-mutations.js`. Tables use `@tooling`'s structured model (`table → header/row → cell[]`). Most table edits are structural (adding/removing rows or columns), not markdown-text edits, so direct tree manipulation is appropriate here.

**Files to modify:**
- `@tooling/syntax-tree/src/tree-mutations.js` — add functions

**Files to create:**
- `@tooling/syntax-tree/tests/tree-mutations-table.test.js`

**Functions to implement:**

### `getTableCell(tableNode, row, col) → SyntaxNode|null`
- Navigate the structured table tree to find the cell at `(row, col)`.
- Row 0 = header row, row 1+ = body rows.

### `setTableCellText(tableNode, row, col, text) → { renderHints, selection }`
- Locate the cell via `getTableCell`, update its content, call `rebuildInlineChildren`.

### `addTableRow(tableNode) → { renderHints, selection }`
- Append a new `row` node with empty `cell` children matching the column count.
- This is what happens on Shift-Enter from the last cell: a new fully qualified row is created and the cursor moves to its first cell.

### `addTableColumn(tableNode) → { renderHints, selection }`
- Append a new `cell` to every row (including header).

### `removeTableRow(tableNode, rowIndex) → { renderHints, selection }`
- Remove the row at the given index. Cannot remove the header row (row 0).

### `removeTableColumn(tableNode, colIndex) → { renderHints, selection }`
- Remove the cell at `colIndex` from every row. Cannot remove the last column.

**Verification:**
```
cd @tooling/syntax-tree && npm test
cd @tooling/parser && npm run test:spec
```

**Depends on:** Steps 1, 3.

---

## Step 7: Format Operations — `applyFormat`

**Goal:** Add the `applyFormat` function to `tree-mutations.js`. This is the implementation behind every toolbar button (bold, italic, code, strikethrough, link, sub, sup).

**Files to modify:**
- `@tooling/syntax-tree/src/tree-mutations.js` — add function

**Files to create:**
- `@tooling/syntax-tree/tests/tree-mutations-format.test.js`

**Function to implement:**

### `applyFormat(node, start, end, format) → { renderHints, selection }`
- `format` is one of: `bold`, `italic`, `code`, `strikethrough`, `link`, `sub`, `sup`
- Operates on `node.content` between offsets `start` and `end`.
- For delimiter-based formats (`bold`, `italic`, `code`, `strikethrough`): toggle the delimiter pair around the selected range. If the range is already wrapped, remove the delimiters. If not, add them.
- For HTML-tag-based formats (`sub`, `sup`): toggle `<sub>`/`<sup>` tags around the selected range.
- For `link`: wrap in `[text](url)` or unwrap if already a link.
- After modifying content, call `rebuildInlineChildren`.
- Return updated selection offsets (adjusted for inserted/removed delimiters).

**Verification:**
```
cd @tooling/syntax-tree && npm test
cd @tooling/parser && npm run test:spec
```

**Depends on:** Steps 1, 3.

---

## Step 8: Cursor and Selection as Tree State

**Goal:** Create `TreePosition` and `TreeSelection` types and add selection state to `SyntaxTree`.

**Files to create:**
- `@tooling/syntax-tree/src/tree-selection.js`
- `@tooling/syntax-tree/tests/tree-selection.test.js`

**Files to modify:**
- `@tooling/syntax-tree/src/syntax-tree.js` — add `selection` property, `cursor` getter, `hasSelection()`, `getSelectedRange()`, path serialization methods
- `@tooling/syntax-tree/index.js` — export TreePosition, TreeSelection

**Types/classes to implement:**

### `TreePosition`
```
{ nodeId, offset, blockNodeId?, tagPart?, cellRow?, cellCol? }
```
- `nodeId` + `offset`: the node and character offset within content
- `blockNodeId`: precomputed enclosing block-level node ID
- `tagPart`: `'opening'` or `'closing'` for html-element tag editing
- `cellRow` + `cellCol`: row/column for table cell editing

### `TreeSelection`
```
{ anchor: TreePosition, focus: TreePosition }
```
- When `anchor` equals `focus`, the selection is collapsed (cursor only).

### SyntaxTree additions:
- `selection` property — a `TreeSelection`
- `cursor` — getter returning `this.selection.focus`
- `hasSelection()` — returns `true` when anchor ≠ focus
- `getSelectedRange()` — returns `{ start, end }` in document order
- `getPathToCursor()` — serialize cursor as index path (for session save/restore)
- `setCursorPath(path)` — restore cursor from path

### Selection utilities (in `tree-selection.js`):
- `isCollapsed(selection)` — anchor equals focus
- `spans(selection, nodeId)` — does the selection include the given node?
- `containsPosition(selection, position)` — is a position within the selection?
- `createCollapsedSelection(nodeId, offset, blockNodeId?)` — convenience factory

**Verification:**
```
cd @tooling/syntax-tree && npm test
cd @tooling/parser && npm run test:spec
```

**Depends on:** Step 2 (uses `getBlockParent`, `getPathToNode`, `getNodeAtPath`).

---

## Step 9: `findMatchedTokenIndices` — Offset Mapping Support

**Goal:** Add `findMatchedTokenIndices` to the inline tokenizer and export it from the parser package. This function identifies which delimiter tokens (e.g. `**`, `*`) are actual matched pairs vs literal text, which is essential for cursor offset mapping.

**Files to modify:**
- `@tooling/parser/src/inline-tokenizer.js` — add function
- `@tooling/parser/index.js` — export the function
- `@tooling/syntax-tree/index.js` — re-export the function

**Files to create:**
- `@tooling/parser/tests/unit/find-matched-token-indices.test.js`

**Function to implement:**

### `findMatchedTokenIndices(content) → { index, length, type }[]`
- Tokenize the content using `tokenizeInline`.
- Return the matched delimiter pairs with their string indices and lengths.
- Must handle: `**bold**`, `*italic*`, `` `code` ``, `~~strikethrough~~`, `[link](url)`, `![image](url)`, HTML inline tags.
- Unmatched delimiters are NOT included in the result.

**Verification:**
```
cd @tooling/parser && npm test
cd @tooling/parser && npm run test:spec
```

**Depends on:** Nothing (uses existing tokenizer).

---

## Step 10: Synchronous Single-Line Parse Entry Point

**Goal:** Add a synchronous single-line parse function to the parser. The editor calls `_reparseLine(text)` on every keystroke to detect implicit type changes (paragraph → heading when `# ` is typed). The existing `Parser.parse()` is async; making `_reparseLine` async would propagate async through the entire input pipeline, which is unacceptable.

**Files to modify:**
- `@tooling/parser/src/dfa-parser.js` — add synchronous `parseLine(text)` method
- `@tooling/parser/index.js` — export `parseLine`

**Files to create:**
- `@tooling/parser/tests/unit/parse-line.test.js`

**Function to implement:**

### `parseLine(text) → SyntaxNode`
- Parse a single line of markdown synchronously.
- Returns a single `SyntaxNode` with the detected type and content.
- Does NOT use JSDOM or any async dependencies — this is a pure block-type detection + content extraction function.
- Must detect: headings (`# `–`###### `), code fence openers (`` ``` ``), blockquotes (`> `), horizontal rules (`---`, `***`, `___`), list items (`- `, `* `, `1. `), and default to paragraph.

**Verification:**
```
cd @tooling/parser && npm test
cd @tooling/parser && npm run test:spec
```

**Depends on:** Nothing.

---

## Step 11: `reparseLine` Mutation Function

**Goal:** Add `reparseLine` to `tree-mutations.js`. This is the hot-path function that re-parses a single node's content through the parser on every keystroke to detect implicit type changes.

**Files to modify:**
- `@tooling/syntax-tree/src/tree-mutations.js` — add function

**Files to create:**
- `@tooling/syntax-tree/tests/tree-mutations-reparse.test.js`

**Function to implement:**

### `reparseLine(node, parseFn) → { renderHints, selection } | null`
- Call `parseFn(node.content)` to detect the type of the current content.
- If the detected type matches `node.type`, return `null` (no change).
- If the type differs: update `node.type` via `changeNodeType`, strip/normalize the content as needed (e.g. `parseFn` returns both the type and the cleaned content), call `rebuildInlineChildren`.
- `parseFn` is the synchronous `parseLine` from Step 10, injected as a parameter to avoid coupling the syntax-tree package to the parser.

**Verification:**
```
cd @tooling/syntax-tree && npm test
cd @tooling/parser && npm run test:spec
```

**Depends on:** Steps 4, 10.

---

## Step 12: Export Consolidation and Package Wiring

**Goal:** Ensure all new modules are properly exported from both `@tooling/syntax-tree` and `@tooling/parser` packages, and that cross-package imports work correctly.

**Files to modify:**
- `@tooling/syntax-tree/index.js` — verify all exports from tree-utils.js, tree-mutations.js, tree-selection.js
- `@tooling/parser/index.js` — verify exports of `parseLine`, `findMatchedTokenIndices`, `tokenizeInline`

**Files to create:**
- `@tooling/syntax-tree/tests/exports.test.js` — verify that all expected symbols are importable

**Verification:**
```
cd @tooling/syntax-tree && npm test
cd @tooling/parser && npm run test:spec
```

**Depends on:** Steps 1–11.

---

## Step 13: Editor-Side Type and Property Reconciliation

**Goal:** Update all editor call sites to use `@tooling` types and property shapes. This step does NOT switch the parser — it only aligns the editor's property access patterns with `@tooling`'s data model so that the eventual parser swap is seamless.

**This is the first step that modifies editor source code (`src/`).** Run the full test suite.

**Changes by category:**

### 13a: Type name updates (~17 sites)
- `node.type === 'linked-image'` → `node.type === 'image' && node.attributes.href` (~7 sites)
- `node.type === 'html-block'` → `node.type === 'html-element'` (~10 sites)

### 13b: Inline HTML tag name (~3 sites)
- `child.attributes.tag` → `child.tagName`

### 13c: Block-level tag name (~5 sites)
- `node.attributes.tagName` → `node.tagName`

### 13d: openingTag/closingTag storage (~15 sites)
- `node.attributes.openingTag` → `node.runtime.openingTag`
- `node.attributes.closingTag` → `node.runtime.closingTag`

### 13e: Runtime-only state
- `node.attributes._detailsOpen` → `node.runtime._detailsOpen`
- `node.attributes.bareText` → `node.runtime.bareText`

**Verification:**
```
npm run test:unit
npm run test:integration
```

**Depends on:** Nothing from Steps 1–12 (this is editor-side only). However, it logically prepares for the parser swap.

---

## Step 14: Code-Block Source Editing Helper

**Goal:** Create an editor-side helper that implements source-edit mode for code blocks using a `Map<string, string>` keyed by node ID, rather than a property on `SyntaxNode`.

**Files to create:**
- `src/renderer/scripts/editor/source-edit-map.js`

**Files to modify:**
- Editor files that currently use `node.sourceEditContent` or similar (audit needed)

**Implementation:**
- `enterSourceEditMode(map, node)` — stores `node.toMarkdown()` in the map under `node.id`
- `exitSourceEditMode(map, node)` — removes the entry, returns the stored markdown
- `getSourceEditContent(map, nodeId)` — retrieves the stored content
- `isInSourceEditMode(map, nodeId)` — checks if the node is being source-edited

**Verification:**
```
npm run test:unit
npm run test:integration
```

**Depends on:** Nothing from Steps 1–12.

---

## Step Dependency Graph

```
Step 1  (child ops)         ─────────────────────────────┐
Step 2  (tree utils)        ─────────────────────────────┼──> Step 8  (cursor/selection)
Step 9  (findMatchedTokens)                              │
Step 10 (sync parseLine)    ─────────────────────────────┼──> Step 11 (reparseLine)
                                                         │
Step 3  (rebuildInline)     ──> Step 4  (block muts) ────┼──> Step 5  (list ops)
                                                         │    Step 6  (table ops)
                                                         │    Step 7  (format ops)
                                                         │
Step 12 (export wiring)     ─────────────────────────────┘    (depends on all above)
Step 13 (type reconciliation)      (independent — editor-side)
Step 14 (source-edit helper)       (independent — editor-side)
```

Steps 1, 2, 9, 10, 13, and 14 have no dependencies and could theoretically be done in parallel. However, for clear progress tracking, work through them sequentially as numbered.

---

## Out of Scope (Deferred)

The following are explicitly deferred per the migration plan:

1. **Operation-based undo/redo (Phase 5):** The current snapshot-based undo system works with `@tooling`'s tree (call `toMarkdown()` before/after). Operation-based undo is a future optimization.
2. **`SyntaxNode.clone()` / `SyntaxTree.clone()`:** Only needed for operation-based undo. Deferred alongside Phase 5.
3. **Full parser swap in the editor:** The steps above build all the infrastructure. The actual swap of the editor's parser to use `@tooling`'s parser is a subsequent project that composes these building blocks.
4. **`insertTextAtCursor` orchestration:** This is the editor-side function that composes Phase 3 primitives on every keystroke. It is editor integration work, not `@tooling` library work.
