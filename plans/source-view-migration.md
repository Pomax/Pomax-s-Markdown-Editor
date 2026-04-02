# Source View 2 Migration Plan

Tracking issue: https://github.com/Pomax/Pomax-s-Markdown-Editor/issues/119

## Rules

Each step must be committed individually upon completion (that includes checking off the task in this document before committing). Do not batch multiple steps into a single commit. When a step requires more work than is in the document, update the document with a new approved plan before doing the work.

## Progress

- [x] Step 1: Create the source view 2 renderer with a `<textarea>`
- [x] Step 2: Register the `source2` view mode in the editor
- [x] Step 3: Add `source2` to the view mode cycle button and wire up all layers
- [x] Step 4: Style the source view 2 textarea
- [x] Step 5: Add toolbar button support using local text examination
- [x] Step 6: Add hotkey support by triggering toolbar buttons
- [x] Step 7: Reparse markdown to a new tree on switch back to writing view
- [x] Step 8: Implement `SyntaxTree.updateUsing(newTree)` for structural tree diffing
- [x] Step 9: Wire up the view-switch to use `updateUsing` and discard the new tree
- [x] Step 10: Write integration tests for source view 2
- [x] Step 11: Improve switch-over performance
- [x] Step 12: Run full test suite, fix any failures
- [x] Step 13: Update docs
- [ ] Step 14: Audit the code for mentions/use of code relating to the old "Source" (not the new "Source2") view
- [ ] Step 15: Remove all mentions/use of code relating to the old  "Source" (not the new "Source2") view
- [ ] Step 16: Fix "search" in source2 mode
- [ ] Step 17: Remove old source view code, test, and docs
- [ ] Step 18: Rename all `source2` related code, docs, and tests so they use `source`

## Step Details

### Step 1: Create the source view 2 renderer

Create `src/web/scripts/editor/renderers/source-renderer-v2.js`.

This renderer takes the syntax tree and calls `syntaxTree.toMarkdown()` to produce a plain markdown string, then places that string into a `<textarea>` element inside the editor container. No per-node DOM elements, no node ID correspondences. The textarea is the entire editing surface.

The renderer needs a `fullRender(syntaxTree, container)` method to match the interface of the existing renderers, and a method to retrieve the current textarea content for reparsing later.

### Step 2: Register the `source2` view mode in the editor

Update `src/types.d.ts` to add `'source2'` to the `ViewMode` union.

Update `src/web/scripts/editor/index.js` to recognize `source2` as a valid view mode alongside `source` and `writing`:

- Import `SourceRendererV2` and instantiate it in the constructor.
- `setViewMode`: accept `source2`. When entering `source2`, convert the tree cursor to an absolute offset in the markdown string using `cursorToAbsoluteOffset`, remove `contenteditable` from the container, render via `sourceRendererV2.fullRender`, then set `textarea.selectionStart`/`selectionEnd` to that absolute offset so the cursor appears in the same position.
- When leaving `source2`, restore `contenteditable` on the container. The actual textarea-content reparse and cursor hand-off to the parser is deferred to steps 7–9.
- `fullRender`: route `source2` to `sourceRendererV2`.
- `renderNodes`: fall through to a full render for `source2` since incremental rendering does not apply.
- Skip the code-block `sourceEditText` finalization logic when the origin or target mode is `source2`.

### Step 3: Add `source2` to the view mode cycle button and wire up all layers

Extend the existing view mode cycle button to rotate through three modes: `writing → source → source2 → writing`. This involves changes across every layer of the app:

- **Toolbar** (`toolbar.js`): Add `source2` to `VIEW_MODE_LABELS` and update the cycle logic in `createViewModeToggle` and `setViewMode`.
- **Electron menu** (`menu-builder.js`): Add a "Source 2" menu item under the View menu.
- **IPC** (`ipc-handler.js`): Handle the `view:source2` channel.
- **Preload** (`preload.cjs`): Expose `view:source2` in the allowed IPC channels.
- **API registry** (`api-registry.js`): Add `source2` to the allowed view mode values.
- **App** (`app.js`): Handle `view:source2` in the `menu:action` listener.
- **Preferences** (`preferences-modal.js`): Add `source2` as an option in the default view dropdown, and handle it in the view mode loader.
- **Safety guards**: Add early returns or correct branching for `source2` in all handlers and managers that check the current view mode — `event-handler.js`, `input-handler.js`, `clipboard-handler.js`, `enter.js`, `insert.js`, `delete.js`, `backspace.js`, `search-bar.js`, `cursor-manager.js`, `range-operations.js`.
- **Integration tests**: Update `test-utils.js` helpers and existing view-mode specs (`view-mode-dropdown.spec.js`, `cursor-scroll.spec.js`), and write new tests for the three-way cycle behaviour.

### Step 4: Style the source view 2 textarea

Add CSS for the textarea inside the source view 2 container. Monospace font, full width/height of the editor area, no border distractions, consistent padding with the rest of the editor. The textarea should feel like a natural part of the editor, not a foreign form element.

### Step 5: Add toolbar button support using local text examination

Introduce a `Formatter` interface and the `getFormatter()` pattern so that button clicks route through the correct view-mode-specific formatter.

1. **Define a `Formatter` interface** in `types.d.ts` with the methods the toolbar needs: `applyFormat(format)`, `changeElementType(type)`, `toggleList(kind)`, `insertOrUpdateImage(alt, src, href, style)`, `insertOrUpdateTable(tableData)`, plus optional `saveCursorPosition()` and `restoreCursorPosition()` for modals that steal focus.

2. **Create `src/web/scripts/editor/formatters/tree-formatter.js`** — thin delegation wrapper that takes the editor as a constructor param and routes each `Formatter` method to the editor's existing tree-based implementation.

3. **Create `src/web/scripts/editor/formatters/source2-formatter.js`** — implements the same `Formatter` interface but operates on the textarea's text and selection directly:
   - All textarea mutations use `document.execCommand('insertText')` so they participate in the browser's undo/redo stack, with a fallback to direct `.value` assignment if `execCommand` returns false (e.g. after modal focus loss).
   - Inline formats (bold, italic, strikethrough, code, subscript, superscript) detect whether the cursor is collapsed or has a selection. Collapsed cursor uses word-boundary detection (`\w`/`\W` scanning) to find and wrap the word under the caret. Selection mode trims leading/trailing whitespace so delimiters wrap only the non-space portion.
   - Link format inserts `[text](url)` syntax.
   - Block formats (heading, blockquote) examine the current line prefix and toggle it.
   - `changeElementType('paragraph')` supports multi-line selections: removes block prefixes from each line, joins former list items with blank lines, and inserts blank line separators adjacent to remaining list items. Cursor position is tracked through prefix removal and blank line insertion.
   - `toggleList` supports multi-line selections: collapses empty lines between paragraphs when converting to list items, and inserts blank lines when removing list prefixes next to adjacent list items.
   - `toggleCodeBlock` wraps/unwraps with triple-backtick fences.
   - `insertOrUpdateImage` inserts `![alt](src)` syntax with cursor placed between `[]` selecting the alt text.
   - `insertOrUpdateTable` inserts a markdown table with empty header cells (not placeholder text), cursor placed in the first header cell.
   - `saveCursorPosition()`/`restoreCursorPosition()` store and restore `selectionStart`/`selectionEnd` across modal dialogs that steal focus from the textarea.

4. **Add `getFormatter()` to the editor** — returns the source2-formatter for `source2` mode, tree-formatter otherwise. The editor's own formatting methods (`applyFormat`, `changeElementType`, etc.) remain unchanged and are used by the tree-formatter; the toolbar routes through the formatter directly.

5. **Update the toolbar** — `handleButtonClick` calls `editor.getFormatter()` first, then calls methods on the returned formatter for all actions. The toolbar still owns modal UI (image/table dialogs) but passes results to the formatter. For image and table modals, the toolbar calls `formatter.saveCursorPosition?.()` before opening the modal and `formatter.restoreCursorPosition?.()` after, so the textarea cursor survives the focus shift.

6. **Toolbar button states in source2** — `updateButtonStates` early-returns when in source2 mode: all buttons are enabled, none are marked active (no syntax-tree node to inspect). The editor dispatches `editor:selectionchange` with `{ node: null }` when switching to source2 so the toolbar updates immediately.

Auto-highlighting of buttons to reflect current formatting state is explicitly **not required** per the issue.

### Step 6: Add hotkey support and tooltip enhancement

1. **Keyboard shortcut handler** (`keyboard-handler.js`): Created a `KeyboardHandler` class that registers a `keydown` listener on the textarea. It defines 21 shortcuts covering inline formatting (Ctrl+B bold, Ctrl+I italic, Ctrl+\` code, Ctrl+Shift+- strikethrough, Ctrl+Shift+↓ subscript, Ctrl+Shift+↑ superscript), headings (Ctrl+Alt+1–6, Ctrl+Alt+0), block types (Ctrl+Shift+Q blockquote, Ctrl+Shift+C code-block), lists (Ctrl+Shift+B unordered, Ctrl+Shift+N ordered, Ctrl+Shift+X checklist), modals (Ctrl+Shift+I image, Ctrl+Shift+T table, Ctrl+K link), and search (Ctrl+F). `executeAction()` finds the matching toolbar button via `document.querySelector` and calls `.click()`, reusing the toolbar's existing `handleButtonClick` → `getFormatter()` code path. The `search:open` action dispatches a custom event since it has no button.

2. **Physical key matching for Shift-modified keys**: Strikethrough is Ctrl+Shift+- but pressing Shift+`-` produces `event.key === '_'` on most layouts. The shortcut config includes an optional `code` property (`'Minus'`) and `matchesShortcut()` checks `event.code` when `code` is specified, falling back to `event.key` otherwise. The `ShortcutConfig` type in `types.d.ts` has an optional `code?: string` field.

3. **Link modal integration**: Ctrl+K triggers the `insert:link` action which routes through the toolbar to `handleLinkAction()`. This opens the `LinkModal` pre-populated with the selected text or word under the cursor (via `formatter.getLinkPrefill()`), and on submit calls `formatter.insertOrUpdateLink(text, url)`. The `source2-formatter` implements both methods: `getLinkPrefill()` returns the selection or word-under-cursor text, and `insertOrUpdateLink()` inserts `[text](url)` replacing the selection or word. The `Formatter` interface in `types.d.ts` declares both as optional so writing mode is unaffected.

4. **Toolbar tooltip enhancement** (`toolbar-button.js`): Buttons now display keyboard shortcuts in their tooltips using `data-tooltip` attributes (e.g. "Bold (Ctrl+B)"). A `formatShortcut()` helper converts shortcut syntax to display form with platform-aware modifier labels (`Ctrl` on Windows/Linux, `⌘` on macOS). CSS in `toolbar.css` renders these as positioned pseudo-element overlays.

5. **Bug fixes discovered during manual testing**:
   - **Sub/sup mutual exclusion**: Applying superscript on subscript text (or vice versa) now strips the opposite format first via `stripInlineFormat()` before applying the new one. The `EXCLUSIVE` map in `applyFormat()` drives this.
   - **Double-wrap prevention**: `toggleInlineCollapsed()` now checks for existing delimiters around the word-under-cursor (not just at the cursor position), and removes them if present — preventing `<sub><sub>word</sub></sub>` on repeated invocation.
   - **Collapsed cursor no-highlight**: After formatting a word under a collapsed cursor, the cursor remains collapsed (no selection) instead of highlighting the word. `applyTextareaEdit` is called with equal start/end positions.

### Step 7: Reparse markdown to a new tree on switch back to writing view

When the user switches from `source2` to `writing` (or `source`), `setViewMode` now reads the full markdown text from the textarea via `sourceRendererV2.getContent()`, normalises excessive blank lines (`\n{3,}` → `\n\n`), captures `textarea.selectionStart`, and parses the result into a brand new syntax tree via `parser.parse()`. The new tree replaces `this.syntaxTree` entirely. The same guards as `loadMarkdown` are applied: if the tree is empty an empty paragraph is appended, and `ensureTrailingParagraph()` guards against trailing container html-blocks. The textarea caret offset is converted back to a `treeCursor` via `absoluteOffsetToCursor` (newly imported from `cursor-persistence.js`), falling back to the start of the first node if the offset is out of range. Finally `contenteditable` is restored on the container.

This is a temporary full-replacement approach — Steps 8–9 will replace it with structural tree diffing via `updateUsing()` so that node identity is preserved across the round-trip.

### Step 8: Implement `SyntaxTree.updateUsing(newTree)`

Added structural tree diffing to `SyntaxTree` in `src/parsers/old/syntax-tree.js`, broken into sub-steps 8a–8e (detailed in `source-view-migration-diff.md`). Installed `fastest-levenshtein` as a production dependency and added four top-level exported functions plus one class method:

1. **`contentSimilarity(a, b)`** — returns a 0–1 similarity score using character-level Levenshtein distance: `1 - (distance(a, b) / Math.max(a.length, b.length))`. Returns 1 for two empty strings, 0 when one is empty. Falls back to a line-level DP comparison when both strings exceed 10,000 characters.

2. **`matchChildren(oldChildren, newChildren)`** — returns a `Map<newChild, oldChild>` via two passes. Pass 1 (exact): matches new children to unclaimed old children with identical `type` and `toMarkdown()` output. Pass 2 (fuzzy): for each still-unmatched new child, finds the best unclaimed same-type old child by `contentSimilarity` score. Tiebreakers prefer matching `html-block` nodes with the same `attributes.tagName` and `list-item` nodes with the same `attributes.indent`. No minimum similarity threshold — the best same-type match always wins.

3. **`updateMatchedNode(oldNode, newNode)`** — copies `content`, `attributes`, `startLine`, `endLine` from `newNode` to `oldNode`, preserving `oldNode.id`. The content setter triggers `buildInlineChildren()` for inline-containing types. Preserves `detailsOpen` if it existed on the old node. Clears `sourceEditText` to null. For `html-block` nodes with block-level children, recursively calls `matchChildren` and `updateMatchedNode` on the children. For void `html-block` nodes, clears children to an empty array.

4. **`SyntaxTree.updateUsing(newTree)`** — orchestrates the above. Calls `matchChildren(this.children, newTree.children)`, then iterates `newTree.children` in order: matched nodes get `updateMatchedNode` applied (preserving the old node's identity), unmatched new nodes are inserted as-is. Sets `parent = null` on all result children. Assigns the result to `this.children`. Does not touch `this.treeCursor` — the caller handles cursor restoration.

Tests: `test/unit/parser/tree-diffing.test.js` (22 tests covering `contentSimilarity`, `matchChildren`, and `updateMatchedNode`) and `test/unit/parser/update-using.test.js` (15 tests using real README.md parsed through the DFA parser, covering identical trees, edits, insertions, deletions, reordering, type changes, mixed operations, empty trees, tiebreakers, parent references, recursive html-block diffing, duplicate nodes, and treeCursor preservation).

### Step 9: Wire up the view-switch to use `updateUsing` and discard the new tree

Changed the "leaving source2" block in `setViewMode` (in `src/web/scripts/editor/index.js`) to use structural tree diffing instead of full tree replacement. The previous Step 7 implementation did `this.syntaxTree = await parser.parse(normalised)` which discarded all node identity. Now it parses into a local `newTree` and calls `this.syntaxTree.updateUsing(newTree)`, preserving IDs of nodes that weren't changed. The empty-tree guard, `ensureTrailingParagraph()`, and cursor restoration via `absoluteOffsetToCursor` all remain unchanged — they operate on the now-updated original tree.

### Step 10: Write integration tests for source view 2

Two new spec files, both using the project's `README.md` as the fixture document:

1. **`test/integration/app-functionality/toolbar/source2-toolbar.spec.js`** — Toolbar button clicks in source2 mode. Tests that clicking bold, italic, strikethrough, heading, blockquote, list, code, and code-block toolbar buttons correctly modify the textarea content. This exercises the button-click → `getFormatter()` → `source2-formatter` code path (as opposed to `source2-hotkeys.spec.js` which tests the keyboard shortcut path).

2. **`test/integration/user-interaction/interaction/source2-roundtrip.spec.js`** — Round-trip and tree identity tests:
   - Switching to source2 shows a textarea whose content matches the tree's `toMarkdown()` output.
   - Typing in the textarea modifies the textarea value.
   - Round-trip without edits: writing → source2 → writing preserves the document unchanged.
   - Round-trip with edits: writing → source2 → make an edit → writing reflects the change.
   - Tree identity preservation: nodes that weren't edited keep their original `data-node-id` after the round-trip.

### Step 11: Improve switch-over performance

The source2 → writing switch is too slow on large documents (tested with a 50,000-word document). Profile the bottleneck and optimise accordingly.

#### Done so far

1. **Pre mirror overlay**: Added a `<pre>` element overlapping the textarea in `source-renderer-v2.js`, with identical styling (font, padding, white-space, word-wrap). The pre is `position: absolute`, `pointer-events: none`, `z-index: 0` behind the textarea (`z-index: 1`). This allows pixel-accurate coordinate lookups via the Range API on the pre's text node.

2. **Lazy mirror sync**: The pre content is not updated on every keystroke. Instead, a `mirrorDirty` flag is set on the textarea's `input` event, and the actual `pre.textContent` sync is deferred to `syncMirror()`, which is only called from `getCaretRect()`. This avoids O(n) DOM text replacement on every keystroke.

3. **`getCaretRect(offset)`**: New method on `SourceRendererV2` that syncs the mirror, creates a collapsed Range at the given character offset in the pre's text node, and returns `getBoundingClientRect()`. Used for scroll-preserving view switches.

4. **Scroll-preserving caret position on view mode switch**: When switching writing → source2, the browser selection's pixel position is captured before the switch, then after rendering the textarea `getCaretRect()` is used to find where the caret landed, and `scrollTop` is adjusted so it matches. When switching source2 → writing, the same approach is used in reverse: `getCaretRect()` captures the textarea caret position, then after the writing-mode render `window.getSelection()` locates the caret and scroll is adjusted.

5. **Removed old `source` from the view mode cycle**: `VIEW_MODE_CYCLE` in `toolbar.js` changed from `[writing, source, source2]` to `[writing, source2]`. Three integration tests that relied on the old source mode in the cycle are `.skip`-ed.

6. **Skip reparse when no changes**: Added `hasChanges()` method to `SourceRendererV2` that compares the current textarea content against the markdown that was loaded in `fullRender()`. The `setViewMode` leaving-source2 path wraps the parse + `updateUsing` call in a `hasChanges()` guard, skipping the reparse entirely when the user made no edits. Cursor restoration via `absoluteOffsetToCursor` remains outside the guard so it always runs. Also fixed `setUnsavedChanges(true)` not being called in the source2 reparse path.

7. **Cursor position integration tests**: Added `test/integration/user-interaction/interaction/source2-cursor-position.spec.js` with 5 tests covering cursor preservation across view switches, including the critical "moving caret without editing" case.

Remaining performance work (stashing writing DOM for selective updates) is tracked separately in `plans/selective-dom-updates.md`.

### Step 12: Run full test suite, fix failures

Run all existing tests to make sure nothing is broken by the new mode. Any failure — whether in new or existing tests — gets investigated and fixed.

### Step 13: Update docs

Update the developer and user-facing documentation to describe the new source view 2 mode, how it works, and how it differs from the original source view.

### Step 14: Audit the code for mentions/use of code relating to the old "Source" (not the new "Source2") view

audit pending.

### Step 15: Remove all mentions/use of code relating to the old  "Source" (not the new "Source2") view

audit pending.

### Step 16: fix "search" in source2 mode

Using the search modal in source2 mode does not highlight text correctly. We should use `C:\Users\Mike\Documents\Git\released\are-we-flying\docs\index.md`, which is a huge document where we can find terms that are easily shown as being highlighted wrong.

### Step 17: Remove old source view related code, docs, and tests

details pending, but any changes must be done on a per-file basis, with full test suite runs AND manual testing to confirm nothing broke after each reference that gets removed.

### Step 18: Rename all `source2` related code, docs, and tests so they use `source`

details pending, but any changes must be done on a per-file basis, with full test suite runs AND manual testing to confirm nothing broke after each updated reference.
