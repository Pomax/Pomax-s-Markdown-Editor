# Source View 2 Migration Plan

Tracking issue: https://github.com/Pomax/Pomax-s-Markdown-Editor/issues/119

## Rules

Each step must be committed individually upon completion. Do not batch multiple steps into a single commit.

## Progress

- [x] Step 1: Create the source view 2 renderer with a `<textarea>`
- [x] Step 2: Register the `source2` view mode in the editor
- [ ] Step 3: Add a view mode toggle button with a radio group
- [ ] Step 4: Style the radio group to look like a button bar
- [ ] Step 5: Style the source view 2 textarea
- [ ] Step 6: Add toolbar button support using local text examination
- [ ] Step 7: Add hotkey support by triggering toolbar buttons
- [ ] Step 8: Reparse markdown to a new tree on switch back to writing view
- [ ] Step 9: Implement `SyntaxTree.updateUsing(newTree)` for structural tree diffing
- [ ] Step 10: Wire up the view-switch to use `updateUsing` and discard the new tree
- [ ] Step 11: Write integration tests for source view 2
- [ ] Step 12: Run full test suite, fix any failures
- [ ] Step 13: Update docs
- [ ] Step 14: Remove old source view and rename `source2` to `source`

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
- When leaving `source2`, restore `contenteditable` on the container. The actual textarea-content reparse and cursor hand-off to the parser is deferred to steps 8–10.
- `fullRender`: route `source2` to `sourceRendererV2`.
- `renderNodes`: fall through to a full render for `source2` since incremental rendering does not apply.
- Skip the code-block `sourceEditText` finalization logic when the origin or target mode is `source2`.

### Step 3: Replace the view mode toggle with a radio group

Update the toolbar code in `src/web/scripts/utility/toolbar/toolbar.js` (or wherever `createViewModeToggle` lives) to add a separate button to switch to the "source 2" view.

### Step 4: Style the radio group to look like a button bar

Add CSS (likely in the toolbar stylesheet or a new section) to hide the actual radio inputs and style the labels as a connected button group. The selected radio's label gets an active/pressed appearance. This should visually match the existing toolbar aesthetic.

### Step 5: Style the source view 2 textarea

Add CSS for the textarea inside the source view 2 container. Monospace font, full width/height of the editor area, no border distractions, consistent padding with the rest of the editor. The textarea should feel like a natural part of the editor, not a foreign form element.

### Step 6: Add toolbar button support using local text examination

When in `source2` mode, toolbar formatting buttons (bold, italic, code, link, etc.) operate on the textarea's selection directly:

- **Examine local context:** Check the text around the selection/cursor to determine what formatting applies. For example, check if the selection is wrapped in `**...**` for bold.
- **Apply formatting:** Wrap/unwrap the selection with the appropriate markdown syntax and update the textarea content and selection range.
- Block-type buttons (heading, blockquote, code block, list) examine the current line(s) and add/remove prefixes or fences.
- Auto-highlighting of buttons to reflect current state is explicitly **not required** per the issue.

### Step 7: Add hotkey support by triggering toolbar buttons

Keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+K, etc.) in `source2` mode should trigger the same logic as the toolbar buttons from Step 6. The keyboard handler dispatches to the same formatting functions. This keeps the hotkey and button behavior identical.

### Step 8: Reparse markdown to a new tree on switch back to writing view

When the user switches from `source2` to `writing` (or `source`), read the full markdown text from the textarea and parse it into a brand new syntax tree using the existing parser. This new tree represents the document state as edited in the textarea.

### Step 9: Implement `SyntaxTree.updateUsing(newTree)`

Add a method to `SyntaxTree` (in `src/parsers/old/syntax-tree.js`) that performs structural diffing between the original tree and a new tree:

- Walk both trees' children in parallel.
- Match nodes by type and content similarity (not by ID, since the new tree has fresh IDs).
- For matched nodes: update the original node's content/attributes in place, preserving its identity (ID, any references).
- For nodes in the new tree with no match: insert them as new nodes in the original tree.
- For nodes in the original tree with no match in the new tree: remove them.
- Handle reordering if nodes moved positions.

The goal is that after `updateUsing`, the original tree reflects the new content while preserving as much node identity as possible for downstream consumers.

### Step 10: Wire up the view-switch to use `updateUsing` and discard the new tree

In the editor's `setViewMode` logic for leaving `source2`:

1. Read the textarea content.
2. Parse it into `newTree`.
3. Call `this.syntaxTree.updateUsing(newTree)`.
4. Discard `newTree` — it has served its purpose.
5. Proceed with the normal full render in the target view mode using the now-updated original tree.

### Step 11: Write integration tests for source view 2

Cover at minimum:

- Switching to source2 mode shows a textarea with the document's markdown.
- Typing in the textarea modifies the content.
- Toolbar buttons apply formatting to the textarea selection.
- Hotkeys trigger the same formatting.
- Switching back to writing view reparses and shows the updated document.
- Round-trip: writing → source2 → edit → writing preserves changes correctly.
- Tree identity preservation: nodes that weren't edited keep their original IDs after the switch back.

### Step 12: Run full test suite, fix failures

Run all existing tests to make sure nothing is broken by the new mode. Any failure — whether in new or existing tests — gets investigated and fixed.

### Step 13: Update docs

Update the developer and user-facing documentation to describe the new source view 2 mode, how it works, and how it differs from the original source view.

### Step 14: Remove old source view and rename `source2` to `source`

Remove `SourceRenderer` and its file (`source-renderer.js`). Rename `SourceRendererV2` to `SourceRenderer` (and its file to `source-renderer.js`). Change the `ViewMode` type from `'source' | 'source2' | 'writing'` back to `'source' | 'writing'`. Update all references throughout the codebase: editor, toolbar, electron IPC, menus, preferences, tests, CSS classes, and docs. The app returns to two view modes, but the source view is now the textarea-based implementation.
