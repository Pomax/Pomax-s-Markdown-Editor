# Migration Plan: Editor → `@tooling` Parser & Syntax Tree

## Initial prompt

"If we wanted to swap the editor over from its parser and syntax tree to the new parser and syntax tree in @tooling, what's missing to make that work? Only perform an audit and analysis with a proposal for how to tackle it. What's missing? What won't work? Where are the problems? How would you solve those without polluting files up the wazoo?"

## Current State

The `@tooling` packages provide a **parse-and-render** toolkit. They turn markdown into a syntax tree, and turn a tree into DOM or markdown. The data structures are deliberately minimal:

- **`SyntaxNode`**: `appendChild`, `toMarkdown`, `toDOM`
- **`SyntaxTree`**: `appendChild`, `toMarkdown`, `toDOM`, `toHTML`

The editor expects far more from its parser and syntax tree — in-place mutations, tree queries, cursor management, format toggling, and offset mapping.

---

## What's Missing

The gaps fall into five categories.

### 1. Tree Mutation

The editor never re-parses the whole document on each keystroke. It mutates the tree directly.

| Missing method | Used by | Purpose |
|---|---|---|
| `SyntaxNode.removeChild()` | edit-operations, range-operations, editor.js | Delete a child from the tree |
| `SyntaxNode.insertBefore()` | edit-operations, clipboard-handler | Insert a node before another |
| `SyntaxTree.removeChild()` | edit-operations, range-operations | Remove top-level nodes |
| `SyntaxTree.changeNodeType()` | edit-operations | e.g. paragraph → heading, heading → paragraph |
| `SyntaxTree.applyFormat()` | toolbar, editor.js | Toggle bold/italic/code/strikethrough/link on a selection range |

### 2. Tree Queries

| Missing method | Used by | Purpose |
|---|---|---|
| `SyntaxTree.findNodeById(id)` | cursor-manager, editor.js, event-handler, search-bar | Map `data-node-id` back to a node |
| `SyntaxTree.findNodeAtPosition(line, col)` | cursor-persistence | Find which node owns a source position |
| `SyntaxNode.getBlockParent()` | cursor-manager, edit-operations | Walk up to the nearest block-level ancestor |
| `SyntaxNode.isInlineNode()` | cursor-manager, toolbar | Test whether a node is inline |
| `SyntaxTree.getNodeCount()` | word-count | Count all nodes |
| `SyntaxNode.toBareText()` / `SyntaxTree.toBareText()` | search-bar, word-count | Strip formatting to get visible text |

### 3. Cursor / Selection / Path Management

The cursor and selection are **tree state**, not UI state. When a user clicks on text, they place a cursor in the tree. When they shift-click or drag, they define a selection range in the tree. The DOM caret and highlight are merely visualizations of those tree positions.

| Missing | Used by |
|---|---|
| `SyntaxTree.cursor` property | editor.js — the current editing position in the tree |
| `SyntaxTree.selection` property | editor.js — the current selected range in the tree (anchor + focus) |
| `SyntaxTree.getPathToCursor()` | cursor-persistence — serializes cursor for undo/redo |
| `SyntaxTree.setCursorPath(path)` | cursor-persistence — restores cursor |
| `SyntaxTree.getPathToNode(id)` | cursor-persistence |
| `SyntaxTree.getNodeAtPath(path)` | cursor-persistence |

### 4. Reactive Content & Cloning

| Missing | Used by | Purpose |
|---|---|---|
| `content` getter/setter that auto-rebuilds inline children | edit-operations (every keystroke mutates `node.content`) | When text is typed into a paragraph, inline children must rebuild |
| `SyntaxNode.clone()` / `SyntaxTree.clone()` | undo-manager, clipboard-handler | Deep-clone for snapshots |
| `enterSourceEditMode()` / `exitSourceEditMode()` / `sourceEditLength` | source-renderer, editor.js | Code-block editing treats the entire fenced block as editable text |

### 5. Inline Tokenizer API for Offset Mapping & Format Detection

| Missing | Used by | Purpose |
|---|---|---|
| `findMatchedTokenIndices()` | offset-mapping.js | Identifies which `**`, `*`, etc. are actual delimiters vs literal text so the cursor can skip invisible syntax |
| `buildInlineTree()` (segment-based) | writing-renderer `appendSegments` fallback | Not needed if all inline content is pre-parsed into `SyntaxNode` children |
| `tokenizeInline()` exposed from parser package | offset-mapping, applyFormat | Already exists in `@tooling` but only re-exported from the syntax-tree package, not the parser |

---

## Type Mismatches

| Editor type | `@tooling` type | Issue |
|---|---|---|
| `linked-image` | `image` with `attributes.href` | Editor checks `type === 'linked-image'` in ~7 places |
| `html-block` | `html-element` | Editor checks `type === 'html-block'` in ~10 places |
| Inline HTML uses `child.attributes.tag` as the element name | `html-element` with `child.tagName` | Writing renderer's default case checks `child.attributes.tag` |

---

## What Won't Work As-Is

1. **Every keystroke** — the editor does `node.content = newText`, which triggers `buildInlineChildren()` via a setter. `@tooling`'s `content` is a plain field; inline children would go stale. The fix is debounced `rebuildInlineChildren` (0–100ms) with a dirty flag and flush-before-read guarantee.
2. **Cursor management** — the editor stores a `TreeCursor` on the tree and uses path-based serialization for undo/redo. None of this infrastructure exists.
3. **Format toggling** — `applyFormat` is the implementation behind every toolbar button. It uses `tokenizeInline` + `findMatchedTokenIndices` to locate existing format spans, then surgically edits the raw content string.
4. **Incremental rendering** — the editor's renderers use `renderNodes(container, { updated, added, removed })` hints. `@tooling`'s renderer does full-tree rendering only. The fix: each edit operation already knows which nodes it touched — it produces the render hint directly. No diffing or generation counters needed. Undo/redo produces the same kind of hints, since it replays/reverses specific tree operations.
5. **Undo/redo** — must be operation-based, not snapshot-based. If a single node changed, undo should reverse that single change, not restore an entire tree clone. Operations record what changed (node ID, old value, new value, cursor before/after), and undo/redo replays the inverse. This produces the same `{ updated, added, removed }` render hints as forward edits — no full render needed unless the operation truly affected the entire document.
6. **Offset mapping** — maps between "raw content offset" (with `**` etc.) and "rendered offset" (what the user sees). Depends on `findMatchedTokenIndices` which doesn't exist in `@tooling`.

---

## Approach

**Principle**: `SyntaxNode` and `SyntaxTree` stay as pure data. Everything the editor needs is provided through standalone utility functions that operate on those data structures from the outside.

### Phase 1 — Primitive Gaps on the Data Structures

Add to `SyntaxNode` (small, non-editor-specific, universally useful):
- `removeChild(child)`
- `insertBefore(newNode, refNode)`
- `clone()` (deep copy)

Add to `SyntaxTree`:
- `removeChild(node)`
- `clone()`

These are generic tree operations, not editor logic. They belong on the classes.

### Phase 2 — `@tooling/syntax-tree/src/tree-utils.js`

A single module of pure functions that query/walk the tree:

```js
export function findNodeById(tree, id) { ... }
export function findNodeAtPosition(tree, line, col) { ... }
export function getBlockParent(node) { ... }
export function isInlineNode(node) { ... }
export function toBareText(node) { ... }
export function getNodeCount(tree) { ... }
export function getPathToNode(tree, id) { ... }
export function getNodeAtPath(tree, path) { ... }
```

No state, no side effects. The editor imports what it needs.

### Phase 3 — `@tooling/syntax-tree/src/tree-mutations.js`

Pure functions for structural edits:

```js
// Content-level
export function rebuildInlineChildren(node) { ... }
export function applyFormat(node, start, end, format) { ... }

// Block-level
export function changeNodeType(node, newType, reparseFn) { ... }
export function splitNode(tree, node, offset) { ... }
export function mergeWithPrevious(tree, node) { ... }

// List-level
export function toggleList(tree, node, kind) { ... }
export function splitListAroundItem(tree, list, item) { ... }
export function renumberOrderedList(list) { ... }

// Single-line re-parse (hot path: runs on every keystroke)
export function reparseLine(node, parserFn) { ... }
```

`applyFormat` imports `tokenizeInline` internally. `rebuildInlineChildren` calls `parseInlineContent` and replaces the children array.

**`rebuildInlineChildren` is debounced, not synchronous.** The user never sees the syntax tree — they see the DOM. What matters is **eventual consistency**: the tree must be consistent by the time an operation that depends on it runs (render, undo snapshot, format toggle, etc.). The debounce window is 0–100ms. If it settles faster, great. The editor's edit pipeline marks the node as dirty on content change, and flushes pending rebuilds before any dependent operation.

**`splitNode`** splits a node at a content offset into two adjacent nodes (Enter key). **`mergeWithPrevious`** combines a node's content into the preceding node and removes it (Backspace at position 0). Both must handle boundary cases: merging into an html-element's last child, Enter inside an html-element child staying within the container.

**`reparseLine`** re-parses a single node's content through the parser to detect implicit type changes (typing `# ` makes a paragraph become a heading, typing `` ``` `` + Enter creates a code block). The `@tooling` parser must expose a single-line parse entry point for this. `reparseLine` calls `changeNodeType` when the detected type differs from the current type.

**List operations**: `toggleList` finds the contiguous run of list items and converts all of them (not just the current node). `splitListAroundItem` handles the case where a heading button is pressed on a list item — it splits the list into before/item/after. `renumberOrderedList` updates `attributes.number` after any insertion, deletion, or reordering.

**All mutation functions return `{ renderHints, selection }`** so the editor knows what to re-render and where to place the caret. This is a cross-cutting contract, not optional.

### Phase 4 — Cursor and Selection as Tree State

The cursor is a point in the tree. A selection is a range between two points in the tree. Both are tree state, not DOM state.

A **tree position** is `{ nodeId, offset }` — a node and a character offset within that node's content. For table cells, it also includes `cellRow` and `cellCol` to identify the cell within the table.

A **tree selection** is `{ anchor, focus }` where both are tree positions. When anchor equals focus, there is no selection (collapsed = caret only). The anchor is where the selection started; the focus is where it currently extends to. This matches the browser's Selection API semantics but lives entirely in the tree.

Add to `SyntaxTree`:
- `selection` property — a `TreeSelection` (`{ anchor: TreePosition, focus: TreePosition }`)
- `cursor` — convenience getter that returns `selection.focus` (the active end)
- `hasSelection()` — returns `true` if anchor ≠ focus
- `getSelectedRange()` — returns `{ start, end }` in document order (normalizes anchor/focus direction)
- `getPathToCursor()` / `setCursorPath(path)` — serialize/restore for undo/redo
- `getPathToNode(id)` / `getNodeAtPath(path)` — index-path navigation

Add to `@tooling/syntax-tree/src/tree-selection.js`:
- `TreePosition` type — `{ nodeId, offset }`
- `TreeSelection` class or type — `{ anchor: TreePosition, focus: TreePosition }`
- Selection validation (do the referenced nodes still exist? are offsets within bounds?)
- Selection utilities: `isCollapsed()`, `spans(nodeId)` (does the selection include a given node?), `containsPosition(pos)`

The editor's job is to **translate** DOM selection events into tree selection updates, and to **visualize** the tree selection as a DOM highlight + caret. If the DOM and tree disagree, the tree wins.

Operations that consume selections:
- `applyFormat` — toggles formatting on the selected range
- Copy/cut — serializes the selected range to markdown/plain text
- Range deletion — removes content within the selected range
- Typing with a selection — replaces the selected range with the typed character

**DOM→tree mapping (`syncCursorFromDOM`)**: The reverse direction — translating a browser `Selection` into a `TreePosition` — is an editor-side function, but it depends heavily on Phase 2 (`findNodeById`, `isInlineNode`, `getBlockParent`) and Phase 7 (offset mapping to convert rendered offsets back to raw content offsets). This is a critical integration point.

### Phase 5 — Undo/Redo

Undo/redo is **operation-based**, not snapshot-based. Each undoable action records a reversible operation describing what changed in the tree — not a clone of the entire tree.

An operation record contains:
- Which nodes were affected (by ID)
- What changed (old content/type/attributes → new content/type/attributes, or node added/removed with its position in the tree)
- Selection state before and after (full `TreeSelection`, not just cursor)

On undo: apply the inverse of the operation (restore old content, re-insert removed nodes, remove added nodes, restore selection to "before"). On redo: re-apply the forward operation, restore selection to "after".

This produces the same `{ updated, added, removed }` render hints as forward edits — the renderer does not need to know whether a change came from typing or from undo. A full render is only needed if the operation genuinely affected every node (e.g. a global find-and-replace).

Flush any pending `rebuildInlineChildren` before recording an operation (the tree must be consistent so the operation captures the real before-state).

Implement as `@tooling/syntax-tree/src/undo-stack.js`:
- `UndoStack` class with `push(operation)`, `undo()`, `redo()`, `canUndo`, `canRedo`
- Each method returns `{ renderHints, selection }` so the editor knows what to re-render and where to place the caret/selection

### Phase 6 — Reconcile Type Differences

Update the editor call sites to use `@tooling` types:
- ~7 sites: `node.type === 'linked-image'` → `node.type === 'image' && node.attributes.href`
- ~10 sites: `node.type === 'html-block'` → `node.type === 'html-element'`
- Writing renderer: `child.attributes.tag` → `child.tagName`

A linked image *is* an image. These checks are more correct with the unified types.

**Runtime-only attributes**: `SyntaxNode.attributes` must support properties like `_detailsOpen` that are runtime-only and excluded from `toMarkdown()` serialization. Similarly, `bareText` is a runtime flag that marks nodes whose content sits inside an HTML container — `reparseLine` must preserve it since the re-parse doesn't know about the HTML-block context.

### Phase 7 — Offset Mapping and `findMatchedTokenIndices`

Add `findMatchedTokenIndices` to `@tooling/parser/src/inline-tokenizer.js` and export it from the parser package. This is a parser concern — it answers "which delimiter tokens are real matches?" The editor's offset-mapping module imports it.

### Phase 8 — Code-Block Source Editing

`enterSourceEditMode` / `exitSourceEditMode` stores the full fenced markdown temporarily. This becomes an editor-side helper that reads `node.toMarkdown()` into a side map (`Map<string, string>` keyed by node ID) rather than a property on `SyntaxNode`. Keeps the data structure clean.

---

## Gaps Revealed by Integration Tests

The integration test suite (54 spec files) was audited against the phases above. The following capabilities are exercised by tests but were missing or under-specified.

### Addressed above (folded into phases)

| Gap | Resolution |
|---|---|
| `splitNode` / `mergeWithPrevious` (Enter/Backspace) | Added to Phase 3; ~20+ tests depend on these |
| Contiguous-run list operations + list splitting | Added to Phase 3 (`toggleList`, `splitListAroundItem`, `renumberOrderedList`) |
| `_reparseLine` (implicit type change on every keystroke) | Added to Phase 3 (`reparseLine`); `@tooling` parser needs single-line parse |
| Render hints as cross-cutting return value | Phase 3 contract: all mutation functions return `{ renderHints, selection }` |
| Table cursor (`cellRow`/`cellCol`) | Added to Phase 4 `TreePosition` |
| `syncCursorFromDOM` (DOM→tree) | Noted in Phase 4 as integration point |
| Runtime-only attributes (`_detailsOpen`, `bareText`) | Added to Phase 6 |

### Editor-side concerns (not in `@tooling`, depend on phases)

| Concern | Depends on | Integration tests |
|---|---|---|
| **Writing-view copy**: adds block prefixes (`> `, `# `, `- `) and repairs sliced HTML inline tags for clipboard | Phase 2 (`toBareText`, inline child inspection) | range-handling.spec.js |
| **Phantom paragraphs**: DOM-only placeholder nodes after trailing code blocks / `</details>`, promoted to real nodes on type | Phase 1 (`appendChild`) | code-block-trailing-paragraph.spec.js, details-trailing-paragraph.spec.js |
| **Context-restricted select-all**: Ctrl+A cycles node → run/parent → document | Phase 2 (`getBlockParent`) + list-run detection | select-all.spec.js |
| **Table editing**: Tab/Shift+Tab cell navigation, Enter moves to next row, Tab on last cell creates row | Phase 3 (table-specific mutation functions) + Phase 4 (`cellRow`/`cellCol`) | table-cell-edit.spec.js, table.spec.js |
| **`applyFormat` with HTML tags**: `<sub>`, `<sup>` use HTML tags not delimiter pairs — distinct code path from `**`/`*`/`` ` ``/`~~` | Phase 3 (`applyFormat`) | superscript-button.spec.js, subscript-button.spec.js, toolbar-active.spec.js |

### Test coverage gap (not a plan gap)

| Gap | Notes |
|---|---|
| Undo/redo is weakly tested | Only 2 integration tests exercise undo/redo. Phase 5's operation-based model is architecturally sound but will need dedicated test coverage. |

| What | Where it goes | Why |
|---|---|---|
| `removeChild`, `insertBefore`, `clone` | `SyntaxNode` / `SyntaxTree` methods | Generic tree ops, universally useful |
| `findNodeById`, `findNodeAtPosition`, `isInlineNode`, `getBlockParent`, `toBareText` | `tree-utils.js` (standalone functions) | Query-only, no mutation, no editor coupling |
| `splitNode`, `mergeWithPrevious`, `changeNodeType`, `reparseLine` | `tree-mutations.js` (standalone functions) | Fundamental edit operations (Enter, Backspace, typing) |
| `applyFormat`, `rebuildInlineChildren` | `tree-mutations.js` (standalone functions) | Inline formatting and content rebuild |
| `toggleList`, `splitListAroundItem`, `renumberOrderedList` | `tree-mutations.js` (standalone functions) | List-level multi-node operations |
| `TreeSelection`, `TreePosition` (with `cellRow`/`cellCol`), `selection` | `tree-selection.js` + `SyntaxTree` properties | Cursor and selection are tree state; DOM highlight/caret is just visualization |
| Undo/redo | `undo-stack.js` (operation-based) | Records tree ops, not snapshots; undo/redo replays inverses with targeted render hints |
| All mutations return `{ renderHints, selection }` | Cross-cutting contract on Phase 3 | Every operation tells the renderer exactly what changed |
| `findMatchedTokenIndices` | `@tooling/parser/src/inline-tokenizer.js` export | Parser concern, needed by offset-mapping |
| Single-line parse entry point | `@tooling/parser` export | Needed by `reparseLine` for keystroke-level type detection |
| Source-edit mode | Editor-side `Map` | Editor-specific temporary state |
| Runtime-only attributes (`_detailsOpen`, `bareText`) | Phase 6 | Must survive serialization round-trips |
| `linked-image` → `image` + href, `html-block` → `html-element` | Editor call sites (~17 changes) | Type unification |
