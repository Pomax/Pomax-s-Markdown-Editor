# Step 21: Full Parser Swap — Investigation & Plan

## Overview

This document is the result of a comprehensive reading of every source file, test file, and documentation file in the project. It covers what needs to change, what will break, and how to do the swap safely in testable increments.

The goal: replace all imports from `src/renderer/scripts/parser/` with imports from `@tooling/parser` and `@tooling/syntax-tree`, then delete the old parser directory entirely.

---

## Current State of the Codebase

### What Steps 1–20 built in `@tooling`

The `@tooling` library now contains:

**Parser** (`@tooling/parser/`):
- `DFAParser` — async full-document parser
- `parseLine(text)` — synchronous single-line parser (for keystroke-time type detection)
- `tokenizeInline(input)` — inline tokenizer producing flat token list
- `findMatchedTokenIndices(tokens)` — identifies real delimiter pairs (for offset mapping)
- `parseInlineContent(content)` — produces inline child SyntaxNode trees

**Syntax Tree** (`@tooling/syntax-tree/`):
- `SyntaxNode` / `SyntaxTree` — classes with `appendChild`, `removeChild`, `insertChild(child, index)`, `toMarkdown()`, `toDOM()`
- `tree-utils.js` — `findNodeById`, `findNodeAtPosition`, `getBlockParent`, `isInlineNode`, `toBareText`, `getPathToNode`, `getNodeAtPath`
- `tree-mutations.js` — `rebuildInlineChildren`, `splitNode`, `insertNodesAfter`, `changeNodeType`, `toggleListType`, `renumberOrderedList`, `getTableCell`, `setTableCellText`, `addTableRow`, `addTableColumn`, `removeTableRow`, `removeTableColumn`, `applyFormat`, `reparseLine`, `mergeHints`
- `tree-selection.js` — `createPosition`, `createCollapsed`, `createSelection`, `isCollapsed`, `selectionSpans`, `containsPosition`, `getPathToCursor`, `setCursorFromPath`
- Re-exports: `parseInlineContent`, `tokenizeInline`, `findMatchedTokenIndices` from the parser

**Renderers** (`@tooling/renderers/`):
- `renderTreeToDOM(doc, tree)` — DOM renderer
- `renderTreeToMarkdown(treeOrNode)` — markdown serializer
- `renderTreeToText(tree)` — debug text output

### What Steps 13–20 already resolved on the editor side

| Step | What it did |
|------|-------------|
| 13 | Renamed `linked-image` → `image` with `href` attribute everywhere |
| 14 | Renamed `html-block` → `html-element` everywhere |
| 15 | Promoted `attributes.tagName` → `node.tagName` everywhere |
| 16 | Moved `attributes.openingTag`/`closingTag` → `node.runtime.openingTag`/`closingTag` everywhere |
| 17 | Moved `attributes.rawContent` → `node.runtime.rawContent` everywhere |
| 18 | Moved `attributes._detailsOpen` → `node.runtime.detailsOpen`, `attributes.bareText` → `node.runtime.bareText` everywhere |
| 19 | Consolidated remaining attribute usage |
| 20 | Created `source-edit-map.js` (external map), removed `_sourceEditText` from SyntaxNode, threaded `sourceEditMap` through `toMarkdown()` |

These steps eliminated almost all property-shape mismatches between the old and new tree. The remaining differences are API-shape differences (methods vs standalone functions) and structural differences (lists, tables, code-blocks).

---

## Files That Import From the Old Parser

### ES import statements (8 files)

| File | Import | What it imports |
|------|--------|-----------------|
| `editor.js` | `../parser/dfa-parser.js` | `DFAParser` |
| `editor.js` | `../parser/syntax-tree.js` | `SyntaxNode`, `SyntaxTree` |
| `edit-operations.js` | `../parser/syntax-tree.js` | `SyntaxNode` |
| `event-handler.js` | `../parser/syntax-tree.js` | `SyntaxNode` |
| `range-operations.js` | `../parser/syntax-tree.js` | `SyntaxNode` |
| `image-helper.js` | `../parser/syntax-tree.js` | `SyntaxNode` |
| `offset-mapping.js` | `../parser/inline-tokenizer.js` | `findMatchedTokenIndices`, `tokenizeInline` |
| `writing-renderer.js` | `../../parser/inline-tokenizer.js` | `buildInlineTree`, `tokenizeInline` |

### JSDoc type-only imports (20+ references across 10 files)

| File | JSDoc type import path |
|------|----------------------|
| `clipboard-handler.js` | `../parser/syntax-tree.js` (SyntaxTree, SyntaxNode) |
| `cursor-persistence.js` | `../parser/syntax-tree.js` (SyntaxTree, SyntaxNode, NodeAttributes) |
| `selection-manager.js` | `../parser/syntax-tree.js` (SyntaxNode) |
| `source-renderer.js` | `../../parser/syntax-tree.js` (SyntaxTree, SyntaxNode, NodeAttributes) |
| `writing-renderer.js` | `../../parser/syntax-tree.js` (SyntaxTree, SyntaxNode, NodeAttributes) |
| `table-manager.js` | `../parser/syntax-tree.js` (SyntaxNode) |
| `toolbar.js` | `../parser/syntax-tree.js` (SyntaxNode) |
| `toc.js` | `../parser/syntax-tree.js` (SyntaxNode) |
| `search-bar.js` | `../../scripts/parser/syntax-tree.js` (SyntaxNode) |
| `word-count-modal.js` | `../parser/syntax-tree.js` (SyntaxTree) |
| `app.js` | `./parser/syntax-tree.js` (SyntaxTree, TreeRange) |

---

## API Surface Differences

### Methods on old classes vs standalone functions in `@tooling`

| Old API (method on class) | New API in `@tooling` | Signature change |
|---------------------------|----------------------|------------------|
| `tree.findNodeById(id)` | `findNodeById(tree, id)` | Add `tree` as first arg |
| `tree.findNodeAtPosition(line, col)` | `findNodeAtPosition(tree, line, col)` | Add `tree` as first arg |
| `tree.changeNodeType(node, type)` | `changeNodeType(node, type)` | Drop `tree` arg |
| `tree.applyFormat(node, start, end, fmt)` | `applyFormat(node, start, end, fmt)` | Drop `tree` arg |
| `tree.getPathToCursor()` | `getPathToCursor(tree, cursor)` | Takes tree + cursor explicitly |
| `tree.setCursorPath(path)` | `setCursorFromPath(tree, path)` | Takes tree, returns TreePosition (doesn't set property) |
| `tree.getPathToNode(id)` | `getPathToNode(tree, id)` | Add `tree` as first arg |
| `tree.getNodeAtPath(path)` | `getNodeAtPath(tree, path)` | Add `tree` as first arg |
| `tree.getNodeCount()` | *(removed — unused)* | N/A |
| `tree.toBareText()` | `toBareText(tree)` | Standalone function |
| `node.toBareText()` | `toBareText(node)` | Standalone function |
| `node.isInlineNode()` | `isInlineNode(node)` | Standalone function |
| `node.getBlockParent()` | `getBlockParent(node)` | Standalone function |
| `node.insertBefore(new, ref)` | `node.insertChild(child, index)` | Different signature — find index manually |
| `node.toMarkdown(sourceEditMap)` | `node.toMarkdown()` (no sourceEditMap param) | **sourceEditMap no longer threaded** |
| `tree.toMarkdown(sourceEditMap)` | `tree.toMarkdown()` (async, no sourceEditMap) | **async + no sourceEditMap** |
| `parser.parse(text)` (sync) | `parseLine(text)` (sync, single-line) | For multi-line: `parse(text)` is async |
| `tree.clone()` | *(does not exist)* | Deferred — snapshot undo uses toMarkdown |
| `node.clone()` | *(does not exist)* | Deferred — snapshot undo uses toMarkdown |

### The `content` setter difference

**Old**: `node.content` is a getter/setter. Setting it triggers `buildInlineChildren()` automatically. 30+ call sites set `node.content = newValue`.

**New (`@tooling`)**: `node.content` is a plain field. Setting it does NOT auto-rebuild inline children. The caller must explicitly call `rebuildInlineChildren(node)` after changing content.

This is the single most pervasive API difference. Every place the editor writes `node.content = ...` needs to be followed by `rebuildInlineChildren(node)` for inline-containing types (paragraph, heading1–6, blockquote, list-item).

### The `treeCursor` / `treeRange` difference

**Old**: `syntaxTree.treeCursor` is a mutable property on SyntaxTree containing `{ nodeId, offset, blockNodeId?, tagPart?, cellRow?, cellCol? }`. Read in ~40 places, written in ~15 places. `editor.treeRange` is `{ startNodeId, startOffset, endNodeId, endOffset } | null`.

**New (`@tooling`)**: The SyntaxTree has no `treeCursor` or `treeRange`. Instead, `tree-selection.js` provides standalone functions that operate on plain `TreePosition` / `TreeSelection` objects.

The editor must store cursor/selection state itself — either on the `Editor` instance or on some wrapper. Since `app.js` saves/restores `state.syntaxTree.treeCursor` by copying it from/to document state, the cursor must travel with the tree somehow.

### The `toMarkdown(sourceEditMap)` difference

The old `toMarkdown()` accepts an optional `sourceEditMap` parameter to look up code-block source edit text. The `@tooling` `renderTreeToMarkdown()` has no such parameter.

This was introduced in Step 20. The editor threads `this.sourceEditMap` through ~20 call sites. To work with `@tooling`, either:
1. The source-edit-map module patches node content *before* calling `toMarkdown()` and restores it after, or
2. `renderTreeToMarkdown` is extended to accept a sourceEditMap (this keeps the pattern from Step 20), or
3. Source-edit text is written into `node.content` directly during source-edit mode, and restored on exit (simplest but requires care).

### The `SyntaxTree.toMarkdown()` is async

The `@tooling` `SyntaxTree.toMarkdown()` is declared `async` even though `renderTreeToMarkdown` is synchronous. The editor calls `this.syntaxTree.toMarkdown(...)` synchronously in ~10 places (recording undo snapshots, building clipboard content, etc.). Options:
1. Make `SyntaxTree.toMarkdown()` synchronous (it delegates to `renderTreeToMarkdown` which is already sync).
2. Or call `renderTreeToMarkdown(this.syntaxTree)` directly instead of `this.syntaxTree.toMarkdown()`.

### The `buildInlineTree` import in writing-renderer.js

The writing renderer imports `buildInlineTree` and `tokenizeInline` from the old inline-tokenizer for its `appendSegments` fallback path. The `@tooling` parser exports `tokenizeInline` and `parseInlineContent` but does NOT export `buildInlineTree`. The writing renderer uses `buildInlineTree(tokenizeInline(content))` to get a segment tree for rendering inline content. Since `@tooling`'s `parseInlineContent` produces SyntaxNode children instead of segments, the renderer should use those children directly (they're already on the node) rather than re-tokenizing.

---

## Structural Mismatches

### 1. List container nodes (CRITICAL)

**Old parser**: List items are flat siblings of `syntaxTree.children`. No wrapping container.
**@tooling parser**: List items are wrapped in a `list` container node (`type: 'list'`).

Impact on editor:
- `_getContiguousListRun()` in `editor.js` walks flat siblings looking for adjacent list-items — breaks because list items are now children of a `list` node, not siblings of other tree-level nodes
- `toggleList()` in `editor.js` operates on flat sibling arrays — needs rewrite
- `_getNodesInRange()` must descend into list containers
- Both renderers iterate `syntaxTree.children` — they will encounter `list` nodes and need a render path for them
- `renumberAdjacentList()` walks siblings — replaced by `renumberOrderedList(listNode)` from `@tooling`
- `getSiblings(node)` returns `node.parent.children` — if parent is a list, siblings are scoped correctly, but code that assumes siblings are tree-level breaks

This is the biggest structural change. The editor has extensive list logic (~200 lines in `editor.js` alone) that assumes flat siblings.

### 2. Table structure (CRITICAL)

**Old parser**: A single `table` node with raw markdown in `content`. Table-manager parses pipe-delimited text.
**@tooling parser**: Structured `table → header/row → cell[]` with inline children per cell.

Impact on editor:
- `table-manager.js`: `getTableCellText()`, `setTableCellText()`, `getTableDimensions()`, `buildTableMarkdown()`, `tableAddRow()` all parse/rebuild raw markdown — must be rewritten to navigate structured children
- `TableModal.parseTableContent()` splits on pipes — must read from structured children
- Cell editing in `edit-operations.js` modifies substrings of `node.content` — must address cell nodes directly
- The search-bar won't find text inside table cells if it only checks `node.content` (which is now empty)
- Both renderers' table branches must render structured children instead of parsing pipe text
- `clipboard-handler.js` serializes `node.toMarkdown()` for table nodes — this still works since `renderNodeToMarkdown` handles structured tables

### 3. Code-block content vs child node

**Old parser**: `code-block.content` contains the code body directly.
**@tooling parser**: `code-block.content = ''`, code body is in `node.children[0].content` (a `text` child).

Impact:
- Source edit mode reads `node.content` for code-blocks
- `edit-operations.js` modifies `node.content` for code-block character insertion
- `getPrefixLength` reads `node.content`
- Syntax highlighter reads `node.content`
- Word-count reads `node.content`
- The `renderNodeToMarkdown` code-block case already handles both: `node.children.length > 0 ? node.children[0].content : node.content`

**Resolution**: Change `@tooling`'s parser to store code body in `node.content` directly instead of creating a text child. This is a one-line parser change and aligns with the editor's expectations. Alternatively, the editor could be changed to read `node.children[0]?.content || node.content`, but that's more invasive.

---

## Step-by-Step Plan

The swap must be done incrementally. Each step must leave the test suite passing. The steps are ordered to minimize simultaneous breakage.

### Step 21A: Fix @tooling code-block content model

**What**: Change `@tooling/parser/src/dfa-parser.js` `parseCodeBlock()` to store the code body in `node.content` directly instead of creating a `text` child node. Update `renderNodeToMarkdown` code-block case to always use `node.content`.

**Tests first**: Update `@tooling/parser` tests that check code-block structure to expect `node.content` instead of `node.children[0].content`. Run `@tooling` tests.

**Why first**: This eliminates the code-block structural mismatch before any import rewiring happens. Every editor code path that reads `node.content` on code-blocks will Just Work.

**What breaks**: Nothing in the editor (old parser still in use). Only `@tooling` tests change.

**Verification**: `npm run test:unit` (includes @tooling tests)

### Step 21B: Make SyntaxTree.toMarkdown() synchronous

**What**: Change `SyntaxTree.toMarkdown()` from `async` to sync. It already delegates to `renderTreeToMarkdown()` which is synchronous. Also make `SyntaxTree.toDOM()` and `SyntaxTree.toHTML()` sync if they don't need to be async.

**Tests first**: Check @tooling tests for any `await tree.toMarkdown()` calls and remove the `await` (the result is the same since the function was never truly async — it just returned a resolved promise).

**Why**: The editor calls `this.syntaxTree.toMarkdown()` synchronously in ~10 places. Making it async would propagate `await` through the entire editing pipeline.

**What breaks**: Nothing — removing `async` is backward-compatible (callers that `await` a non-Promise value get it immediately).

**Verification**: `npm run test:unit`

### Step 21C: Add sourceEditMap support to @tooling toMarkdown

**What**: Extend `renderNodeToMarkdown()` and `renderTreeToMarkdown()` in `@tooling/renderers/src/markdown.js` to accept an optional `sourceEditMap` parameter. For `code-block` nodes, check `sourceEditMap?.has(node.id)` and use the stored text instead of reconstructing from content/attributes.

**Tests first**: Add unit tests in `@tooling` that verify sourceEditMap is consulted for code-blocks.

**Why**: The editor threads `sourceEditMap` through ~20 `toMarkdown()` call sites (Step 20). The @tooling renderer needs to support this parameter so the swap doesn't break code-block source editing.

Also add `sourceEditMap` as an optional parameter to `SyntaxNode.toMarkdown(sourceEditMap)` and `SyntaxTree.toMarkdown(sourceEditMap)` so the class methods forward it.

**What breaks**: Nothing — the new parameter is optional.

**Verification**: `npm run test:unit`

### Step 21D: Add treeCursor and treeRange to @tooling SyntaxTree

**What**: Add `treeCursor` and `treeRange` properties to `@tooling`'s `SyntaxTree` class. Also add the cursor/path convenience methods as delegating wrappers:

```js
// On SyntaxTree:
this.treeCursor = null;  // { nodeId, offset, blockNodeId?, tagPart?, cellRow?, cellCol? }

getPathToCursor() { return getPathToCursor(this, this.treeCursor); }
setCursorPath(path) {
  const pos = setCursorFromPath(this, path);
  if (pos) this.treeCursor = pos;
}
getPathToNode(id) { return getPathToNode(this, id); }
getNodeAtPath(path) { return getNodeAtPath(this, path); }
```

These are thin wrappers that delegate to the standalone functions but preserve API compatibility with the old tree's interface.

**Tests first**: Write tests for the wrapper methods.

**Why**: The editor reads/writes `syntaxTree.treeCursor` in ~55 places and calls `getPathToCursor()`, `setCursorPath()`, `getPathToNode()`, `getNodeAtPath()` in `app.js` and `cursor-persistence.js`. Adding these to the class avoids rewriting all those call sites.

**What breaks**: Nothing — adding properties/methods to the class is additive.

**Verification**: `npm run test:unit`

### Step 21E: Add convenience methods to @tooling SyntaxNode/SyntaxTree

**What**: Add methods to `@tooling`'s classes that match the old API surface, delegating to standalone functions:

```js
// On SyntaxNode:
isInlineNode() { return isInlineNode(this); }
getBlockParent() { return getBlockParent(this); }
toBareText() { return toBareText(this); }
insertBefore(newNode, referenceNode) {
  const idx = this.children.indexOf(referenceNode);
  if (idx === -1) throw new Error('Reference node not found');
  this.insertChild(newNode, idx);
}

// On SyntaxTree:
findNodeById(id) { return findNodeById(this, id); }
findNodeAtPosition(line, col) { return findNodeAtPosition(this, line, col); }
```

**Tests first**: Write tests for each wrapper method.

**Why**: The editor calls `node.isInlineNode()` in 4+ places, `node.getBlockParent()` in 2+ places, `node.toBareText()` in 3+ places, `tree.findNodeById()` in 13+ places, and `tree.findNodeAtPosition()` in 1 place. Adding these wrappers prevents a massive rewrite of editor code.

**What breaks**: Nothing — additive change.

**Verification**: `npm run test:unit`

### Step 21F: Add reactive content setter to @tooling SyntaxNode

**What**: Change `@tooling`'s `SyntaxNode.content` from a plain field to a getter/setter that conditionally calls `rebuildInlineChildren(this)` for inline-containing types (paragraph, heading1–6, blockquote, list-item).

```js
const INLINE_CONTENT_TYPES = new Set([
  'paragraph', 'heading1', 'heading2', 'heading3',
  'heading4', 'heading5', 'heading6', 'blockquote', 'list-item',
]);

get content() { return this._content; }
set content(value) {
  this._content = value;
  if (INLINE_CONTENT_TYPES.has(this.type)) {
    rebuildInlineChildren(this);
  }
}
```

The constructor initializes `this._content = content` directly (bypassing the setter to avoid a rebuild during parsing, when inline children are populated by the parser itself).

**Tests first**: Write tests verifying that setting `node.content` on a paragraph triggers inline child rebuild, and that setting it on a code-block does not.

**Why**: The editor sets `node.content = ...` in ~30 call sites and expects inline children to be rebuilt automatically. Without this, every inline node would go stale after content mutation. Making this change in `@tooling` rather than adding `rebuildInlineChildren()` calls to 30 editor sites is the correct approach per the migration-plan.md.

**But**: This introduces a dependency from `syntax-tree.js` on `tree-mutations.js` (`rebuildInlineChildren`). Currently `rebuildInlineChildren` imports from `syntax-tree.js`. To break the cycle, the minimal inline parsing logic (`parseInlineContent`) is already an external import — the setter would import `rebuildInlineChildren` from `tree-mutations.js`, which imports `parseInlineContent` from the parser. As long as `syntax-tree.js` does not import `tree-mutations.js` at module level (to avoid circular deps), an inline dynamic import or a setter-injection pattern is needed. Alternatively, the setter stores a dirty flag and the editor calls a flush function before reads — but that adds complexity. The cleanest solution: move `rebuildInlineChildren` into `syntax-tree.js` itself (it's a small function) or use a callback registration pattern.

**What breaks**: Existing @tooling tests that set `node.content` on INLINE_CONTENT_TYPES nodes will now get inline children rebuilt automatically. Some tests may need adjustment if they set content and then manually call `rebuildInlineChildren`.

**Important**: The parser must NOT trigger the setter during parsing. During `populateInlineChildren(node)` in dfa-parser.js, the parser sets `node.content` and then calls `parseInlineContent` to create children. If the setter also triggers `rebuildInlineChildren`, children would be built twice. The constructor bypass (`this._content = content`) handles the initial set. For the parser, we can either: (a) have the parser write to `_content` directly, (b) add a flag `node._parserBuilding = true` that the setter checks, or (c) accept the double-build (wasteful but not incorrect).

**Verification**: `npm run test:unit` (all @tooling tests must pass)

### Step 21G: Add changeNodeType and applyFormat wrappers to SyntaxTree

**What**: Add `changeNodeType(node, type)` and `applyFormat(node, start, end, fmt)` as methods on SyntaxTree that delegate to the standalone functions:

```js
// On SyntaxTree:
changeNodeType(node, type) { return changeNodeType(node, type); }
applyFormat(node, start, end, format) { return applyFormat(node, start, end, format); }
```

**Tests first**: Write minimal wrapper tests.

**Why**: `editor.js` calls `this.syntaxTree.changeNodeType(node, type)` at L1012 and `this.syntaxTree.applyFormat(node, start, end, format)` at L1327. These are the last two SyntaxTree method calls that need wrappers.

**What breaks**: Nothing — additive.

**Verification**: `npm run test:unit`

### Step 21H: Swap the imports — core editor files

**What**: In these 6 files, change the import path from `../parser/syntax-tree.js` and `../parser/dfa-parser.js` to `@tooling/syntax-tree` and `@tooling/parser`:

1. **editor.js**: `DFAParser` → import `parseLine` from `@tooling/parser`. Replace `this.parser = new DFAParser()`. Replace `this.parser.parse(text)` calls:
   - `_reparseLine(text)` → `parseLine(text)` (synchronous single-line)
   - `_parseMultiLine(combined)` → (currently calls `this.parser.parse(combined).children`) — need a sync multi-line parse or inline the parse calls
   - `loadMarkdown(markdown)` → This is the full-document parse on file load. The @tooling `parse()` is async but this is called from `loadMarkdown()` which can be made async. Currently `this.syntaxTree = this.parser.parse(normalised)` — change to `this.syntaxTree = await parse(normalised)` and make `loadMarkdown` async.
   - Undo/redo calls `this.parser.parse(change.before/after)` — these are full re-parses. They can use async parse if undo/redo is made async, or use a synchronous reparsing approach (parse each line with `parseLine` and build tree manually).
2. **edit-operations.js**: `SyntaxNode` import → from `@tooling/syntax-tree`
3. **event-handler.js**: `SyntaxNode` import → from `@tooling/syntax-tree`
4. **range-operations.js**: `SyntaxNode` import → from `@tooling/syntax-tree`
5. **image-helper.js**: `SyntaxNode` import → from `@tooling/syntax-tree`
6. **offset-mapping.js**: `findMatchedTokenIndices, tokenizeInline` → from `@tooling/syntax-tree` (re-exported) or directly from `@tooling/parser`

**Tests first**: Before changing imports, verify the @tooling wrappers from steps 21D–21G pass. Then swap one file at a time, running unit tests after each.

**The critical issue — async parse for undo/redo**: The old undo system stores `before`/`after` markdown strings and calls `this.parser.parse(change.before)` synchronously on undo. The @tooling parser's full `parse()` is async. Options:
1. Build a synchronous full-parse function from `parseLine` (parse each line and assemble a tree) — this misses multi-line constructs (code blocks, tables, HTML blocks).
2. Make undo/redo async — this is architecturally painful but contained (called from keyboard handler).
3. Keep the old `DFAParser` temporarily just for undo/redo re-parsing.
4. **Best option**: Make the old editor's `DFAParser.parse()` available as a synchronous wrapper that calls `parseLine` per line with multi-line handling. Actually, looking more carefully: the `@tooling` `DFAParser.parse()` is async only because `groupListItems` and `_parseHtmlBlock` are async (they call `await this.parseBlock(ctx)`). If those can be made synchronous for the browser context (no JSDOM needed since `document` is available natively), then `parse()` can be made sync.

**What breaks**: This is where things break. All 346 unit tests and 361 integration tests must be re-verified. Expected breakage:
- Any test that exercises list operations (list items are now wrapped in containers)
- Any test that exercises table editing (structured vs raw content)
- Any test that exercises inline child reading after content mutation (if the setter isn't working correctly)

**Verification**: `npm run test:unit`, `npm run test:integration`

### Step 21I: Swap imports — renderer and UI files

**What**: Change JSDoc type imports in all remaining files:

1. **writing-renderer.js**: 
   - Replace `import { buildInlineTree, tokenizeInline } from '../../parser/inline-tokenizer.js'` with appropriate @tooling imports
   - The `buildInlineTree` usage needs investigation: if the renderer's `appendSegments` path is used as a fallback when a node has no inline children, it can be replaced by calling `rebuildInlineChildren(node)` to ensure children exist, then rendering the children directly.
2. **source-renderer.js**: JSDoc type imports only — change paths
3. **clipboard-handler.js**: JSDoc type imports only — change paths
4. **cursor-persistence.js**: JSDoc type imports only — change paths
5. **selection-manager.js**: JSDoc type imports only — change paths
6. **table-manager.js**: JSDoc type imports only — change paths
7. **toolbar.js**: JSDoc type imports only — change paths
8. **toc.js**: JSDoc type imports only — change paths
9. **search-bar.js**: JSDoc type imports only — change paths (note: search-bar has a wrong-looking path `../../scripts/parser/syntax-tree.js` which should be `../parser/syntax-tree.js`)
10. **word-count-modal.js**: JSDoc type imports only — change paths
11. **app.js**: JSDoc type imports only — change paths

**Tests first**: The JSDoc changes are non-functional (they only affect type checking). Run `npm run lint:typing` after each batch.

**What breaks**: Nothing functional. Lint typing may flag issues if @tooling's type exports differ from the old ones.

**Verification**: `npm run lint`, `npm run test:unit`, `npm run test:integration`

### Step 21J: Handle the list container model

**What**: The editor's list operations assume flat siblings. With @tooling's list containers, these need rewriting:

In `editor.js`:
- `_getContiguousListRun()` — with list containers, list items are already grouped. This function becomes a lookup: find the `list` container that owns the current node(s).
- `toggleList()` — rewrite to use `toggleListType()` from @tooling tree-mutations. The @tooling function operates on list container nodes.
- `renumberAdjacentList()` — replace with `renumberOrderedList(listNode)` from @tooling.
- `_getNodesInRange()` — must descend into list containers when collecting nodes in a selection range.

In both renderers:
- They iterate `syntaxTree.children` and render each node. They'll now encounter `list` nodes. Add a render case for `type === 'list'` that iterates the list's children and renders each list-item. The list node itself becomes `<ul>` or `<ol>`.

In `edit-operations.js`:
- Backspace at offset 0 of a list-item: currently splices from flat siblings. With containers, must remove from the list container, and if the list becomes empty, remove it from the tree.
- Enter in a list-item: creates a new list-item as sibling within the same list container, not as a flat tree sibling.
- Empty list-item Enter: converts to paragraph and removes from list container.

In `clipboard-handler.js`:
- `_getSelectedMarkdown()` may need to handle nodes that are children of list containers.

**Tests first**: Write integration tests for list creation, list splitting, list-to-paragraph conversion, cross-list selection, and nested lists.

**What breaks**: Every list-related integration test. Expected ~15-20 test failures.

**Verification**: `npm run test:unit`, `npm run test:integration`

### Step 21K: Handle the structured table model

**What**: The editor's table operations parse raw markdown content. With @tooling's structured tables, rewrite:

In `table-manager.js`:
- `getTableCellText(node, row, col)` → use `getTableCell(tableNode, row, col)` from @tooling, read `cell.content`
- `setTableCellText(node, row, col, text)` → use `setTableCellText(tableNode, row, col, text)` from @tooling
- `getTableDimensions(node)` → count `node.children` for rows, `node.children[0].children.length` for columns
- `buildTableMarkdown(data)` → may keep for modal output, or delegate to `node.toMarkdown()`
- `tableAddRow(node)` → use `addTableRow(tableNode)` from @tooling
- Tab/Shift+Tab navigation — coordinates are already `cellRow`/`cellCol` on treeCursor, navigation logic stays

In `table-modal.js`:
- `parseTableContent(content)` → receives a table node instead of raw content. Read cells from structured children.

In `edit-operations.js`:
- Table cell character insertion: instead of modifying `node.content` substrings, modify the specific cell node's content.
- Table cell backspace/delete: same — operate on cell node.

In both renderers:
- Table rendering branches parse pipe-delimited text. Rewrite to render structured `table → header/row → cell` children.

In `search-bar.js`:
- Must search inside table cells (descend into structured children).

**Tests first**: Write integration tests for table cell editing, table insertion, table Tab navigation.

**What breaks**: Every table-related test. Expected ~5-10 test failures.

**Verification**: `npm run test:unit`, `npm run test:integration`

### Step 21L: Delete old parser directory

**What**: Remove `src/renderer/scripts/parser/` entirely: `dfa-parser.js`, `dfa-tokenizer.js`, `inline-tokenizer.js`, `syntax-tree.js`.

**Tests first**: Run the full suite to verify no remaining references to the old files.

**Why last**: Only delete after all imports have been rewired and all tests pass.

**What breaks**: Nothing if all previous steps succeeded.

**Verification**: `npm run test`, plus manual testing of the editor.

---

## The Async Parse Problem

The @tooling `DFAParser.parse()` is `async` because:
1. `groupListItems()` is async (it calls `await this.parseBlock(ctx)` to peek at the next block)
2. `_parseHtmlBlock()` is async (for JSDOM in Node.js)

In the browser, `document` is available natively, so JSDOM isn't needed. The async on `groupListItems` is because `parseBlock` calls sub-parsers that may be async.

The editor calls `this.parser.parse(text)` synchronously in:
- `loadMarkdown()` — can be made async (called from app.js which already handles async operations)
- `_reparseLine()` → already replaced by synchronous `parseLine()` from @tooling
- `_parseMultiLine()` — called during paste (multi-line), needs sync or async handling
- Undo/redo — `this.parser.parse(change.before/after)` — must be sync or the entire undo pipeline becomes async

**Proposed solution**: Create a synchronous `parseSync(markdown)` entry point in `@tooling/parser` that uses the same DFA but avoids the async paths. Since `groupListItems` only needs to call `parseBlock` synchronously (which it can do in the browser), the async wrapper is unnecessary. This requires making `groupListItems` and its callees sync-capable when running in a browser context.

Alternatively, convert `loadMarkdown` and undo/redo to async. `loadMarkdown` is easy (already an entry point called from app.js). Undo/redo is harder — `handleUndo`/`handleRedo` are called from synchronous keyboard handlers, and making them async would require awaiting the result before the next keystroke can be processed.

**Best approach**: Make the DFAParser's `parse()` synchronous by removing the unnecessary `async`/`await` markers. The only truly async operation is JSDOM loading (for Node.js testing), which doesn't apply in the browser. In the browser:
- Remove `async` from `parse()`, `parseBlock()`, `groupListItems()`, and all sub-parsers
- Guard JSDOM usage behind an `if (typeof document === 'undefined')` check that lazily loads it (only in Node.js test context)
- Export both `parse(markdown)` (sync) and `parseAsync(markdown)` (for Node.js tests that need JSDOM)

---

## Impact Analysis by Integration Test File

### Tests that will break (list/table structural changes)

| Test file | Reason |
|-----------|--------|
| `checklist.spec.js` | Toggles between list kinds — flat sibling assumption |
| `list.spec.js` | List creation and conversion — flat sibling assumption |
| `table.spec.js` | Table insertion via modal — raw content vs structured |
| `table-cell-edit.spec.js` | Cell editing — raw content manipulation |
| `select-all.spec.js` | Context-restricted select-all walks siblings |
| `range-handling.spec.js` | Cross-node selection may intersect list containers |
| `paste.spec.js` | Pasting list items |
| `backspace-heading.spec.js` | Backspace at list item boundary |
| `cursor-sync.spec.js` | Cursor sync after list/table edits |

### Tests that should survive unchanged

| Test file | Reason |
|-----------|--------|
| `bold-button.spec.js` | `applyFormat` wrapper delegates to same implementation |
| `italic-button.spec.js` | Same |
| `strikethrough-button.spec.js` | Same |
| `subscript-button.spec.js` | Same |
| `superscript-button.spec.js` | Same |
| `heading-input.spec.js` | Heading typing — uses `reparseLine` equivalent |
| `code-block-enter.spec.js` | Code block creation — if code-block content model is fixed first |
| `details-collapse-toggle.spec.js` | Details widget — type already renamed |
| `details-trailing-paragraph.spec.js` | Same |
| `html-block.spec.js` | HTML block — type already renamed |
| `inline-html.spec.js` | Inline HTML — type already aligned |
| `view-mode-switch.spec.js` | View mode switching — renderer agnostic |
| `view-mode-dropdown.spec.js` | Same |
| `search.spec.js` | If search descends into new structures correctly |
| `session-save.spec.js` | If cursor path serialization wrappers work |
| `toolbar-active.spec.js` | If `isInlineNode()` wrapper works |
| `toolbar-tooltip.spec.js` | No tree interaction |
| `toc-highlight.spec.js` | Reads heading nodes — unchanged structure |
| `toc-scroll.spec.js` | Same |
| `image.spec.js` | Image insertion — type already aligned |
| `image-click-edit.spec.js` | Same |
| `link-click-edit.spec.js` | No structural change |
| `link-single-click.spec.js` | Same |
| `reload.spec.js` | Full reload — if async parse works |
| `page-height.spec.js` | CSS only |
| `page-resize.spec.js` | CSS only |
| `click-outside-defocus.spec.js` | Event handling only |

### Tests that need investigation

| Test file | Concern |
|-----------|---------|
| `source-view-editing.spec.js` | Source edit mode — depends on sourceEditMap + toMarkdown integration |
| `source-view-summary-edit.spec.js` | HTML-element source editing |
| `cursor-typing-delimiters.spec.js` | Offset mapping with new tokenizer output |
| `inline-image.spec.js` | Inline image in paragraph — `reparseLine` must preserve paragraph type |
| `details-summary-input.spec.js` | Typing in details/summary children |
| `backspace-after-html-block.spec.js` | Backspace at html-element boundary — needs list container awareness if html-block contains lists |
| `underscore-emphasis.spec.js` | Underscore italic handling — tokenizer behavior must match |
| `editor.spec.js` | General editor tests — broad scope |

---

## Summary of Steps and Dependencies

```
21A: Fix code-block content model in @tooling parser
     └─ No dependencies. @tooling-only change.

21B: Make SyntaxTree.toMarkdown() synchronous
     └─ No dependencies. @tooling-only change.

21C: Add sourceEditMap to @tooling toMarkdown
     └─ Depends on 21B (toMarkdown is sync).

21D: Add treeCursor/treeRange + path methods to SyntaxTree
     └─ No dependencies. @tooling-only change.

21E: Add convenience methods to SyntaxNode/SyntaxTree
     └─ No dependencies. @tooling-only change.

21F: Add reactive content setter
     └─ No dependencies. @tooling-only change. Highest risk.

21G: Add changeNodeType/applyFormat wrappers to SyntaxTree
     └─ No dependencies. @tooling-only change.

21H: Swap imports in core editor files
     └─ Depends on 21A–21G. First step that touches editor code.
     └─ BREAKS things related to lists and tables.

21I: Swap imports in renderer and UI files
     └─ Depends on 21H.

21J: Handle list container model
     └─ Depends on 21H. Fixes list breakage from 21H.

21K: Handle structured table model
     └─ Depends on 21H. Fixes table breakage from 21H.

21L: Delete old parser directory
     └─ Depends on 21H, 21I, 21J, 21K. Everything passes.
```

Steps 21A–21G are all @tooling-only changes that can be done in any order (they have no inter-dependencies). They add API surface without removing anything. All existing tests should pass after each one.

Steps 21H–21K are the breaking changes. 21H swaps imports and immediately breaks list and table tests. 21J and 21K fix those breakages. 21I is low-risk (JSDoc-only path changes).

21L is cleanup — delete the old files.

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Reactive content setter circular dependency | Medium | Move `rebuildInlineChildren` into `syntax-tree.js` or use setter injection |
| Async parse blocking undo/redo | High | Make DFAParser.parse() synchronous for browser context |
| List container model rewrite (~200 lines) | High | Write comprehensive list tests first (TDD) |
| Table structural rewrite | Medium | Table ops are contained in `table-manager.js` |
| Double inline child rebuild (parser + setter) | Low | Bypass setter in parser via `_content` |
| sourceEditMap threading | Low | Already mostly handled in Step 20 |
| `buildInlineTree` removal from writing-renderer | Low | Replace with reading `node.children` directly |
| 30+ content setter sites | Low | Handled by reactive setter (Step 21F) |
| 55+ treeCursor read/write sites | Low | Handled by adding property to SyntaxTree (Step 21D) |

---

## Questions to Resolve Before Starting

1. **Sync vs async parse**: Should we make the @tooling parser fully sync for browser context, or accept async parse for `loadMarkdown` and undo/redo? Making it sync is cleaner but requires changing ~10 `async` functions in the parser. Making `loadMarkdown` async is easy; making undo/redo async is painful.

2. **Reactive setter vs explicit rebuild**: The migration-plan.md recommends a reactive setter. This is the right call for keeping the editor diff small, but it introduces a dependency cycle. What's the preferred solution — move `rebuildInlineChildren` into `syntax-tree.js`, use setter injection, or accept the circular import?

3. **List container approach**: The editor has extensive list logic in `editor.js` (~200 lines). Should we rewrite it to use @tooling's `toggleListType`/`renumberOrderedList` from tree-mutations, or keep the editor's list logic and adapt it to navigate container nodes?

4. **Table approach**: Same question — rewrite `table-manager.js` to use @tooling's structured tree, or add a compatibility shim that converts structured tables to/from raw content at the boundary?

5. **Step ordering**: Steps 21A–21G are safe prep work. Can we batch some of them into larger commits, or should each be its own commit for easier bisection if something breaks?
