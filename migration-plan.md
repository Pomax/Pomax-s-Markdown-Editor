# Migration Plan: Editor → `@tooling` Parser & Syntax Tree

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

### 3. Cursor / Path Management

| Missing | Used by |
|---|---|
| `SyntaxTree.treeCursor` property | editor.js — stores the current editing position |
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

1. **Every keystroke** — the editor does `node.content = newText`, which triggers `buildInlineChildren()` via a setter. `@tooling`'s `content` is a plain field; inline children would go stale.
2. **Cursor management** — the editor stores a `TreeCursor` on the tree and uses path-based serialization for undo/redo. None of this infrastructure exists.
3. **Format toggling** — `applyFormat` is the implementation behind every toolbar button. It uses `tokenizeInline` + `findMatchedTokenIndices` to locate existing format spans, then surgically edits the raw content string.
4. **Incremental rendering** — the editor's renderers use `renderNodes(container, { updated, added, removed })` hints. `@tooling`'s renderer does full-tree rendering only.
5. **Offset mapping** — maps between "raw content offset" (with `**` etc.) and "rendered offset" (what the user sees). Depends on `findMatchedTokenIndices` which doesn't exist in `@tooling`.

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
export function changeNodeType(node, newType, reparseFn) { ... }
export function applyFormat(node, start, end, format) { ... }
export function rebuildInlineChildren(node) { ... }
```

`applyFormat` imports `tokenizeInline` internally. `rebuildInlineChildren` calls `parseInlineContent` and replaces the children array — the editor calls this after mutating `node.content` instead of relying on a setter.

### Phase 4 — Cursor/Path Utilities (Editor-Side)

`getPathToCursor`, `setCursorPath`, and the `TreeCursor` type are purely editor concerns (they reference DOM selections). These stay in the editor's codebase, operating on the `@tooling` tree from outside. No `treeCursor` property on `SyntaxTree` — the editor owns that state.

### Phase 5 — Reconcile Type Differences

Update the editor call sites to use `@tooling` types:
- ~7 sites: `node.type === 'linked-image'` → `node.type === 'image' && node.attributes.href`
- ~10 sites: `node.type === 'html-block'` → `node.type === 'html-element'`
- Writing renderer: `child.attributes.tag` → `child.tagName`

A linked image *is* an image. These checks are more correct with the unified types.

### Phase 6 — Offset Mapping and `findMatchedTokenIndices`

Add `findMatchedTokenIndices` to `@tooling/parser/src/inline-tokenizer.js` and export it from the parser package. This is a parser concern — it answers "which delimiter tokens are real matches?" The editor's offset-mapping module imports it.

### Phase 7 — Code-Block Source Editing

`enterSourceEditMode` / `exitSourceEditMode` stores the full fenced markdown temporarily. This becomes an editor-side helper that reads `node.toMarkdown()` into a side map (`Map<string, string>` keyed by node ID) rather than a property on `SyntaxNode`. Keeps the data structure clean.

---

## Summary

| What | Where it goes | Why |
|---|---|---|
| `removeChild`, `insertBefore`, `clone` | `SyntaxNode` / `SyntaxTree` methods | Generic tree ops, universally useful |
| `findNodeById`, `findNodeAtPosition`, `isInlineNode`, `getBlockParent`, `toBareText` | `tree-utils.js` (standalone functions) | Query-only, no mutation, no editor coupling |
| `changeNodeType`, `applyFormat`, `rebuildInlineChildren` | `tree-mutations.js` (standalone functions) | Mutation logic that imports parser internals |
| `TreeCursor`, path serialization, `treeCursor` | Editor-side module | Editor-specific DOM↔tree mapping |
| `findMatchedTokenIndices` | `@tooling/parser/src/inline-tokenizer.js` export | Parser concern, needed by offset-mapping |
| Source-edit mode | Editor-side `Map` | Editor-specific temporary state |
| `linked-image` → `image` + href, `html-block` → `html-element` | Editor call sites (~17 changes) | Type unification |
