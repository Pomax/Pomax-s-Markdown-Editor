# Migration Plan: Editor → `@tooling` Parser & Syntax Tree

## The question

"If we wanted to swap the editor over from its parser and syntax tree to the new parser and syntax tree in `@tooling`, what's missing to make that work? Only perform an audit and analysis with a proposal for how to tackle it. What's missing? What won't work? Where are the problems? How would you solve those without polluting files up the wazoo?"

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

## Structural Mismatches

Three data-model differences between the `@tooling` parser and the editor's built-in parser silently break large parts of the editor. These must be resolved **before** any phase work begins.

### List container nodes (critical)

The `@tooling` parser wraps consecutive list items in a `list` container node (`type: 'list'`). The editor's built-in parser produces list items as **flat siblings** in `syntaxTree.children` with no wrapping container.

This affects every list-touching code path:
- `_getContiguousListRun()` walks flat siblings looking for adjacent `list-item` nodes
- `toggleList()` / `splitListAroundItem()` / `renumberAdjacentList()` operate on flat sibling arrays
- `handleEnterKey` / `handleBackspace` for list items splice into the sibling array
- `getSiblings(node)` returns `node.parent.children` — with `@tooling`, list-item siblings are list-container children, not tree-root children
- Both renderers iterate `syntaxTree.children` directly

**Resolution**: The `@tooling` parser already produces list containers, and that structure is correct for rendering (`<ul>`/`<ol>` wrappers). The editor-side list operations (Phase 3) must operate on list containers rather than flat sibling runs. The `_getContiguousListRun` pattern disappears — replaced by navigating the container's `children` array directly. `getSiblings()` already returns `node.parent.children`, so if the parent is a `list` node, list-item siblings are naturally scoped. Phase 3's `toggleList`, `splitListAroundItem`, and `renumberOrderedList` are written against `@tooling`'s container model from the start.

### Table structure (critical)

The `@tooling` parser produces structured tables: `table → header/row → cell[]` with inline children per cell. The editor stores tables as a single `table` node whose `content` is verbatim pipe-delimited markdown.

This affects:
- `table-manager.js` (`getTableCellText()`, `setTableCellText()`, `buildTableMarkdown()`) — all parse/rebuild raw markdown
- `TableModal.parseTableContent()` — splits on pipes to populate the modal
- Cell-level editing in `edit-operations.js` — modifies substrings within `node.content`
- Both renderers' table branches

**Resolution**: Adopt `@tooling`'s structured representation. The structured model is strictly better — cell content is already parsed into inline children, column/row indexing is direct, and the renderer can map `cell` nodes to `<td>`/`<th>` without re-parsing. Rewrite `table-manager.js` to operate on structured children. `getTableCellText(node, row, col)` becomes a child lookup. `setTableCellText` mutates the cell node's content and triggers `rebuildInlineChildren`. `buildTableMarkdown` serializes from the structured tree (or delegate to `node.toMarkdown()`). The `TableModal` populates from cell children instead of splitting on pipes. Cell-level editing addresses cell nodes directly using `cellRow`/`cellCol` from the `TreePosition`.

### Code-block content vs child node (high)

The `@tooling` parser creates `code-block → text(child)` with `node.content = ''`. The editor expects `code-block.content` to contain the code body directly. Source-edit mode, syntax highlighting, `getPrefixLength()`, and `toMarkdown()` all read `node.content`.

**Resolution**: Change `@tooling`'s `parseCodeBlock` to store the code body in `node.content` directly (matching headings, paragraphs, and blockquotes which all use `content`). The `text` child adds no structural value for code blocks — the content is opaque text, not inline-parsed. This is a one-line parser change and aligns the model with the editor's expectations.

---

## Type Mismatches

| Editor type/property | `@tooling` type/property | Issue |
|---|---|---|
| `linked-image` | `image` with `attributes.href` | Editor checks `type === 'linked-image'` in ~7 places (semi-dead code — editor's own parser already produces `image` + `href`) |
| `html-block` | `html-element` | Editor checks `type === 'html-block'` in ~10+ places |
| Inline HTML: `child.attributes.tag` | `child.tagName` (top-level property) | Writing renderer's default case checks `child.attributes.tag` |
| Block HTML: `node.attributes.tagName` | `node.tagName` (top-level property) | Writing renderer (`<details>` detection), cursor-persistence — ~5 sites |
| `node.attributes.openingTag` / `closingTag` | `node.runtime.openingTag` / `closingTag` | Both renderers + edit-operations read from `attributes`; `@tooling` stores in `runtime` — ~15 sites |

---

## What Won't Work As-Is

1. **Every keystroke** — the editor does `node.content = newText`, which triggers `buildInlineChildren()` via a setter. `@tooling`'s `content` is a plain field; inline children would go stale. The editor sets `content` in ~30 call sites, and `cursor-manager` reads `node.children` immediately after every content change (on every `selectionchange` event). A debounced rebuild with flush-before-read is architecturally right, but the flush points are so frequent (every selectionchange during typing) that the debounce is effectively a no-op. **Pragmatic fix**: make `rebuildInlineChildren` synchronous-by-default with an opt-in dirty/flush path for batch operations only.
2. **Cursor management** — the editor stores a `TreeCursor` on the tree and uses path-based serialization for session save/restore (via `app.js`). None of this infrastructure exists.
3. **Format toggling** — `applyFormat` is the implementation behind every toolbar button. It uses `tokenizeInline` + `findMatchedTokenIndices` to locate existing format spans, then surgically edits the raw content string.
4. **Incremental rendering** — the editor's renderers use `renderNodes(container, { updated, added, removed })` hints. `@tooling`'s renderer does full-tree rendering only. The fix: each edit operation already knows which nodes it touched — it produces the render hint directly. No diffing or generation counters needed. Undo/redo produces the same kind of hints, since it replays/reverses specific tree operations.
5. **Undo/redo** — must be operation-based, not snapshot-based. If a single node changed, undo should reverse that single change, not restore an entire tree clone. Operations record what changed (node ID, old value, new value, cursor before/after), and undo/redo replays the inverse. This produces the same `{ updated, added, removed }` render hints as forward edits — no full render needed unless the operation truly affected the entire document.
6. **Offset mapping** — maps between "raw content offset" (with `**` etc.) and "rendered offset" (what the user sees). Depends on `findMatchedTokenIndices` which doesn't exist in `@tooling`.
7. **Synchronous single-line parse** — the editor's `_reparseLine(text)` calls `this.parser.parse(text)` synchronously on every keystroke to detect implicit type changes (paragraph → heading, paragraph → code-block). The `@tooling` parser's `parse()` is `async` (it lazily loads JSDOM in Node.js). A **synchronous single-line parse entry point** is a hard requirement — not a nice-to-have — because making `_reparseLine` async would propagate async through the entire input pipeline (`handleBeforeInput` → `insertTextAtCursor` → `_reparseLine`).
8. **`insertTextAtCursor`** — the single hottest code path (every keystroke). It inserts a character at an offset in `node.content`, calls `_reparseLine` for type detection, handles code-block source-edit mode, table cell editing, and HTML-block tag editing. None of Phase 3's named functions cover this directly — it is an editor-side orchestration function that composes Phase 3 primitives. The plan must acknowledge this as the integration glue.

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
export function getPathToNode(tree, id) { ... }
export function getNodeAtPath(tree, path) { ... }
```

No state, no side effects. The editor imports what it needs.

**`findNodeById` must search recursively** through container children — html-element children, list items inside list containers, table rows/cells. The editor's current `findNodeById` delegates to a recursive helper that walks into html-block children. With `@tooling`'s list containers, the search must also descend into `list` → `list-item` children.

**`getNodeCount` is omitted** — word-count iterates `syntaxTree.children` directly and reads `node.content`. The function is unused.

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
export function insertNodesAfter(tree, refNode, newNodes) { ... }

// List-level (operate on @tooling's list-container model)
export function toggleList(tree, node, kind) { ... }
export function splitListAroundItem(tree, list, item) { ... }
export function renumberOrderedList(list) { ... }

// Table-level (operate on @tooling's structured table model)
export function setTableCellText(tableNode, row, col, text) { ... }
export function addTableRow(tableNode) { ... }

// Single-line re-parse (hot path: runs on every keystroke)
export function reparseLine(node, parserFn) { ... }
```

`applyFormat` imports `tokenizeInline` internally. `rebuildInlineChildren` calls `parseInlineContent` and replaces the children array.

**`rebuildInlineChildren` is synchronous by default.** The editor sets `node.content` in ~30 call sites, and `cursor-manager` reads `node.children` immediately after every content change — on every `selectionchange` event during typing. A debounced model with flush-before-read is architecturally appealing, but the flush points are so frequent that the debounce yields no practical benefit. Make `rebuildInlineChildren` synchronous-by-default. An explicit `INLINE_CONTENT_TYPES` set (`paragraph`, `heading1`–`heading6`, `blockquote`, `list-item`) controls which node types get inline children rebuilt — the function is a no-op for other types.

**`splitNode`** splits a node at a content offset into two adjacent nodes (Enter key). **`mergeWithPrevious`** combines a node's content into the preceding node and removes it (Backspace at position 0). Both must handle boundary cases:
- Enter inside an html-element child stays within the container — the new node is inserted after the current child *inside* the same html-element.
- Backspace at position 0 of an html-element's first child merges content into the previous sibling *outside* the container.
- Code-block fence creation: typing `` ``` `` + Enter is a type change via `reparseLine`, not a `splitNode` — the plan must not conflate them.

**`insertNodesAfter`** inserts an array of new nodes after a reference node. Needed for multi-line paste: the editor splits the current node at the cursor, parses each pasted line through `reparseLine`, and inserts N new nodes. None of the other Phase 3 functions handle multi-node insertion.

**`reparseLine`** re-parses a single node's content through the parser to detect implicit type changes (typing `# ` makes a paragraph become a heading, typing `` ``` `` + Enter creates a code block). The `@tooling` parser must expose a **synchronous** single-line parse entry point for this (see "What Won't Work" §7). `reparseLine` calls `changeNodeType` when the detected type differs from the current type.

**`changeNodeType`** must handle prefix-stripping/adding:
- Heading → paragraph: strips `## ` prefix from content
- Paragraph → heading: prepends `## ` prefix and reparses
- Any → blockquote / blockquote → paragraph: adds/strips `> ` prefix
- Any → code-block: wraps in fence markers
- List conversions go through `toggleList`, not `changeNodeType`

**List operations** operate on `@tooling`'s list-container model, not flat sibling runs. `toggleList` wraps target nodes in a new `list` container (or unwraps an existing one). `splitListAroundItem` splits a `list` container node into up to three parts: a list-before, the extracted item, and a list-after. `renumberOrderedList` walks a `list` container's children and updates `attributes.number` sequentially.

**Table operations**: `setTableCellText` locates the cell node at `(row, col)` within the structured `table → header/row → cell[]` tree, updates its content, and calls `rebuildInlineChildren`. `addTableRow` appends a new `row` node with empty `cell` children. These replace the editor's current `table-manager.js` which parses/rebuilds raw markdown.

**All mutation functions return `{ renderHints, selection }`** so the editor knows what to re-render and where to place the caret. This is a cross-cutting contract, not optional.

**Render-hint composition**: Compound operations (e.g. `handleEnterKey` = split + typeChange + renumber) produce multiple `{ renderHints, selection }` results. A `mergeHints(a, b)` utility combines them — union of `updated`/`added`/`removed` sets, with the last `selection` winning.

**`buildMarkdownLine` / `getPrefixLength`**: Editor-side helpers that reconstruct a single-node markdown line and measure the prefix length (e.g. `## ` = 3 chars). Used for type detection and cursor offset calculation. These duplicate serialization logic and must stay consistent with `@tooling`'s `toMarkdown()`. They remain editor-side but should delegate to `serializeNodeMarkdown` where possible.

### Phase 4 — Cursor and Selection as Tree State

The cursor is a point in the tree. A selection is a range between two points in the tree. Both are tree state, not DOM state.

A **tree position** is `{ nodeId, offset, blockNodeId?, tagPart?, cellRow?, cellCol? }`:
- `nodeId` + `offset` — the node and character offset within that node's content
- `blockNodeId` — the enclosing block-level node ID (precomputed; avoids calling `getBlockParent()` on every cursor access, which happens ~40 times across the codebase)
- `tagPart` — `'opening'` or `'closing'` for html-element container tag lines (the user can edit `<div class="note">` directly in source view)
- `cellRow` + `cellCol` — row/column index for table cell editing

A **tree selection** is `{ anchor, focus }` where both are tree positions. When anchor equals focus, there is no selection (collapsed = caret only). The anchor is where the selection started; the focus is where it currently extends to. This matches the browser's Selection API semantics but lives entirely in the tree.

The editor currently uses two separate constructs: `syntaxTree.treeCursor` (always present, ~40 read sites, ~15 write sites) and `editor.treeRange` (only during active selection, ~10 sites). The migration unifies these into a single `TreeSelection` where collapsed = cursor-only.

Add to `SyntaxTree`:
- `selection` property — a `TreeSelection` (`{ anchor: TreePosition, focus: TreePosition }`)
- `cursor` — convenience getter that returns `selection.focus` (the active end)
- `hasSelection()` — returns `true` if anchor ≠ focus
- `getSelectedRange()` — returns `{ start, end }` in document order (normalizes anchor/focus direction)
- `getPathToCursor()` / `setCursorPath(path)` — serialize/restore for **session save/restore** (`app.js` calls `getPathToCursor()` on session flush and `setCursorPath()` on file reopen; tested by session-save.spec.js)
- `getPathToNode(id)` / `getNodeAtPath(path)` — index-path navigation

Add to `@tooling/syntax-tree/src/tree-selection.js`:
- `TreePosition` type — `{ nodeId, offset, blockNodeId?, tagPart?, cellRow?, cellCol? }`
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

**Compound operations** (e.g. handleEnterKey = split + type-change + renumber) must be grouped into a single undo transaction. Undoing the group reverses all sub-operations atomically.

**Deferral note**: This phase is a complete redesign of the current undo system (which stores `{ before: markdownString, after: markdownString }` and reparses on undo). The snapshot approach continues to work with `@tooling`'s tree — just call `toMarkdown()` before/after — so Phase 5 does not block the initial migration. The current snapshot approach can be used as-is during early phases, and operation-based undo can be layered in later. `clone()` on SyntaxNode/SyntaxTree (Phase 1) is only needed if operation-based undo is implemented; it can be deferred alongside this phase.

### Phase 6 — Reconcile Type and Property Differences

Update the editor call sites to use `@tooling` types and property shapes:

**Type renames** (~17 sites):
- ~7 sites: `node.type === 'linked-image'` → `node.type === 'image' && node.attributes.href` (semi-dead code — editor's own parser already produces `image` + `href`)
- ~10 sites: `node.type === 'html-block'` → `node.type === 'html-element'`

**Inline HTML tag name** (~3 sites):
- Writing renderer default case: `child.attributes.tag` → `child.tagName`

**Block-level tag name** (~5 sites):
- Writing renderer (`<details>` detection), cursor-persistence: `node.attributes.tagName` → `node.tagName` (top-level property on `@tooling`'s `SyntaxNode`)

**`openingTag` / `closingTag` storage** (~15 sites):
- The editor reads `node.attributes.openingTag` / `node.attributes.closingTag` in both renderers and edit-operations. `@tooling` stores these in `node.runtime.openingTag` / `node.runtime.closingTag`. All sites must be updated to use `node.runtime`.

**Runtime-only state**: `@tooling`'s `SyntaxNode` already has a `runtime` object for non-serialized data — this is the correct home for `_detailsOpen` (currently in `attributes._detailsOpen`). Similarly, `bareText` is a runtime flag that marks nodes whose content sits inside an HTML container — `reparseLine` must preserve it since the re-parse doesn't know about the HTML-block context. Both move to `node.runtime`.

### Phase 7 — Offset Mapping and `findMatchedTokenIndices`

Add `findMatchedTokenIndices` to `@tooling/parser/src/inline-tokenizer.js` and export it from the parser package. This is a parser concern — it answers "which delimiter tokens are real matches?" The editor's offset-mapping module imports it.

### Phase 8 — Code-Block Source Editing

`enterSourceEditMode` / `exitSourceEditMode` stores the full fenced markdown temporarily. This becomes an editor-side helper that reads `node.toMarkdown()` into a side map (`Map<string, string>` keyed by node ID) rather than a property on `SyntaxNode`. Keeps the data structure clean.

---

## Gaps Revealed by Integration Tests

The integration test suite (53 spec files) was audited against the phases above. The following capabilities are exercised by tests but were missing or under-specified.

### Addressed above (folded into phases)

| Gap | Resolution |
|---|---|
| `splitNode` / `mergeWithPrevious` (Enter/Backspace) | Added to Phase 3; ~20+ tests depend on these |
| Contiguous-run list operations + list splitting | Phase 3 (`toggleList`, `splitListAroundItem`, `renumberOrderedList`), now written against `@tooling`'s list-container model |
| `_reparseLine` (implicit type change on every keystroke) | Phase 3 (`reparseLine`); `@tooling` parser needs synchronous single-line parse |
| Render hints as cross-cutting return value | Phase 3 contract: all mutation functions return `{ renderHints, selection }`; `mergeHints` for compound ops |
| Table cursor (`cellRow`/`cellCol`) | Phase 4 `TreePosition` |
| `syncCursorFromDOM` (DOM→tree) | Phase 4 as integration point |
| Runtime-only attributes (`_detailsOpen`, `bareText`) | Phase 6 — moved to `node.runtime` |
| Table structure (raw content → structured nodes) | Structural Mismatches §2; Phase 3 adds `setTableCellText`, `addTableRow` |
| Code-block content vs child node | Structural Mismatches §3; resolved by parser change |
| `openingTag`/`closingTag` in `attributes` vs `runtime` | Phase 6 (~15 sites) |
| Block-level `attributes.tagName` → `node.tagName` | Phase 6 (~5 sites) |
| Synchronous single-line parse requirement | What Won't Work §7 |
| `insertTextAtCursor` as orchestration glue | What Won't Work §8 |
| Multi-node insertion (paste) | Phase 3 `insertNodesAfter` |

### Editor-side concerns (not in `@tooling`, depend on phases)

| Concern | Depends on | Integration tests |
|---|---|---|
| **Writing-view copy**: adds block prefixes (`> `, `# `, `- `) and repairs sliced HTML inline tags for clipboard | Phase 2 (`toBareText`, inline child inspection) | range-handling.spec.js |
| **Phantom paragraphs**: DOM-only placeholder nodes after trailing code blocks / `</details>`, promoted to real nodes on type | Phase 1 (`appendChild`) | code-block-trailing-paragraph.spec.js, details-trailing-paragraph.spec.js |
| **Context-restricted select-all**: Ctrl+A cycles node → run/parent → document | Phase 2 (`getBlockParent`) + list-container navigation | select-all.spec.js |
| **Table editing**: Tab/Shift+Tab cell navigation, Enter moves to next row, Tab on last cell creates row | Phase 3 (`setTableCellText`, `addTableRow`) + Phase 4 (`cellRow`/`cellCol`) | table-cell-edit.spec.js, table.spec.js |
| **`applyFormat` with HTML tags**: `<sub>`, `<sup>` use HTML tags not delimiter pairs — distinct code path from `**`/`*`/`` ` ``/`~~` | Phase 3 (`applyFormat`) | superscript-button.spec.js, subscript-button.spec.js, toolbar-active.spec.js |
| **`insertTextAtCursor`**: per-keystroke orchestration (insert char → `rebuildInlineChildren` → `reparseLine` → type change → render) | Phase 3 primitives composed editor-side | cursor-sync.spec.js, source-view-editing.spec.js, heading-input.spec.js |
| **`buildMarkdownLine` / `getPrefixLength`**: editor-side serialization helpers for prefix measurement | Should delegate to `serializeNodeMarkdown` | cursor-persistence.test.js, clipboard-handler.test.js |
| **CRLF paste normalization**: paste.spec.js explicitly tests `\r\n` line endings | `@tooling` parser must normalize CRLF | paste.spec.js |
| **Inline image in paragraph**: typing `![alt](src)` must stay inline, not promote to block image | `reparseLine` must preserve paragraph type when content contains inline images | inline-image.spec.js |

### Test coverage gaps (not plan gaps)

| Gap | Notes |
|---|---|
| Undo/redo is weakly tested | Only 2 integration tests exercise undo/redo. Phase 5's operation-based model will need dedicated test coverage. |
| No drag-and-drop tests | Editor supports image drop (`event-handler.js`), but no integration test covers it. |
| No list indent/outdent tests | Parser handles indented items, but no integration test for Tab/Shift+Tab indent level changes on list items. |
| Cursor position after partial delimiters | cursor-typing-delimiters.spec.js covers this but edge cases with partially-typed delimiters are fragile — Phase 7 `findMatchedTokenIndices` must match the editor's current behavior precisely. |

---

## Summary

| What | Where it goes | Why |
|---|---|---|
| `removeChild`, `insertBefore`, `clone` (defer with Phase 5) | `SyntaxNode` / `SyntaxTree` methods | Generic tree ops, universally useful |
| `findNodeById` (recursive), `findNodeAtPosition`, `isInlineNode`, `getBlockParent`, `toBareText` | `tree-utils.js` (standalone functions) | Query-only, no mutation, no editor coupling |
| `splitNode`, `mergeWithPrevious`, `changeNodeType`, `reparseLine`, `insertNodesAfter` | `tree-mutations.js` (standalone functions) | Fundamental edit operations (Enter, Backspace, typing, paste) |
| `applyFormat`, `rebuildInlineChildren` (sync, with `INLINE_CONTENT_TYPES`) | `tree-mutations.js` (standalone functions) | Inline formatting and content rebuild |
| `toggleList`, `splitListAroundItem`, `renumberOrderedList` (list-container model) | `tree-mutations.js` (standalone functions) | List-level operations on `@tooling`'s container nodes |
| `setTableCellText`, `addTableRow` (structured table model) | `tree-mutations.js` (standalone functions) | Table-level operations on `@tooling`'s structured nodes |
| `mergeHints(a, b)` | `tree-mutations.js` utility | Compose render hints from compound operations |
| `TreeSelection`, `TreePosition` (with `blockNodeId`, `tagPart`, `cellRow`/`cellCol`), `selection` | `tree-selection.js` + `SyntaxTree` properties | Cursor and selection are tree state; DOM highlight/caret is just visualization |
| `getPathToCursor` / `setCursorPath` | `SyntaxTree` methods | Session save/restore (app.js), tested by session-save.spec.js |
| Undo/redo (deferrable) | `undo-stack.js` (operation-based) | Records tree ops, not snapshots; snapshot approach works as interim |
| All mutations return `{ renderHints, selection }` | Cross-cutting contract on Phase 3 | Every operation tells the renderer exactly what changed |
| `findMatchedTokenIndices` | `@tooling/parser/src/inline-tokenizer.js` export | Parser concern, needed by offset-mapping |
| Synchronous single-line parse entry point | `@tooling/parser` export | Hard requirement for `reparseLine`; async propagation is unacceptable |
| `tokenizeInline` exported from `@tooling/parser` (not just syntax-tree) | `@tooling/parser/index.js` | Currently only re-exported from syntax-tree package |
| Source-edit mode | Editor-side `Map` | Editor-specific temporary state |
| `_detailsOpen`, `bareText` → `node.runtime` | Phase 6 | Must survive serialization round-trips; `runtime` is the correct home |
| `openingTag`/`closingTag` → `node.runtime` | Phase 6 (~15 sites) | Editor reads from `attributes`; `@tooling` stores in `runtime` |
| `attributes.tagName` → `node.tagName` (block + inline) | Phase 6 (~8 sites combined) | Top-level property on `@tooling`'s `SyntaxNode` |
| `linked-image` → `image` + href, `html-block` → `html-element` | Editor call sites (~17 type-name changes) | Type unification |
| Code-block content: store in `node.content` directly | `@tooling/parser` one-line change | Removes unnecessary `text` child; aligns with editor expectations |
| List items: `@tooling` uses container nodes | Editor list ops rewritten for container model | Structural mismatch — biggest migration risk now addressed in Phase 3 |
| Table structure: `@tooling` uses structured nodes | Table ops rewritten for structured model | Replaces raw-markdown table handling with node-based cell access |
