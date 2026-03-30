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
- [ ] Step 6: Add hotkey support by triggering toolbar buttons
- [ ] Step 7: Reparse markdown to a new tree on switch back to writing view
- [ ] Step 8: Implement `SyntaxTree.updateUsing(newTree)` for structural tree diffing
- [ ] Step 9: Wire up the view-switch to use `updateUsing` and discard the new tree
- [ ] Step 10: Write integration tests for source view 2
- [ ] Step 11: Run full test suite, fix any failures
- [ ] Step 12: Update docs
- [ ] Step 13: Remove old source view and rename `source2` to `source`

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

### Step 6: Add hotkey support by triggering toolbar buttons

Keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+K, etc.) in `source2` mode should trigger the same logic as the toolbar buttons from Step 5. The keyboard handler dispatches to the same formatting functions. This keeps the hotkey and button behavior identical.

### Step 7: Reparse markdown to a new tree on switch back to writing view

When the user switches from `source2` to `writing` (or `source`), read the full markdown text from the textarea and parse it into a brand new syntax tree using the existing parser. This new tree represents the document state as edited in the textarea.

### Step 8: Implement `SyntaxTree.updateUsing(newTree)`

Add a method to `SyntaxTree` (in `src/parsers/old/syntax-tree.js`) that performs structural diffing between the original tree and a new tree:

- Walk both trees' children in parallel.
- Match nodes by type and content similarity (not by ID, since the new tree has fresh IDs).
- For matched nodes: update the original node's content/attributes in place, preserving its identity (ID, any references).
- For nodes in the new tree with no match: insert them as new nodes in the original tree.
- For nodes in the original tree with no match in the new tree: remove them.
- Handle reordering if nodes moved positions.

The goal is that after `updateUsing`, the original tree reflects the new content while preserving as much node identity as possible for downstream consumers.

### Step 9: Wire up the view-switch to use `updateUsing` and discard the new tree

In the editor's `setViewMode` logic for leaving `source2`:

1. Read the textarea content.
2. Parse it into `newTree`.
3. Call `this.syntaxTree.updateUsing(newTree)`.
4. Discard `newTree` — it has served its purpose.
5. Proceed with the normal full render in the target view mode using the now-updated original tree.

### Step 10: Write integration tests for source view 2

Cover at minimum:

- Switching to source2 mode shows a textarea with the document's markdown.
- Typing in the textarea modifies the content.
- Toolbar buttons apply formatting to the textarea selection.
- Hotkeys trigger the same formatting.
- Switching back to writing view reparses and shows the updated document.
- Round-trip: writing → source2 → edit → writing preserves changes correctly.
- Tree identity preservation: nodes that weren't edited keep their original IDs after the switch back.

### Step 11: Run full test suite, fix failures

Run all existing tests to make sure nothing is broken by the new mode. Any failure — whether in new or existing tests — gets investigated and fixed.

### Step 12: Update docs

Update the developer and user-facing documentation to describe the new source view 2 mode, how it works, and how it differs from the original source view.

### Step 13: Remove old source view and rename `source2` to `source`

Remove `SourceRenderer` and its file (`source-renderer.js`). Rename `SourceRendererV2` to `SourceRenderer` (and its file to `source-renderer.js`). Change the `ViewMode` type from `'source' | 'source2' | 'writing'` back to `'source' | 'writing'`. Update all references throughout the codebase: editor, toolbar, electron IPC, menus, preferences, tests, CSS classes, and docs. The app returns to two view modes, but the source view is now the textarea-based implementation.
