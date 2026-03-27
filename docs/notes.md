
## Playwright Pitfalls

### Synthetic vs. real clicks

`locator.click()` dispatches a synthetic event that **skips** the real
browser event sequence. A real human click fires:

    mousedown → (selectionchange) → mouseup → click

If the editor re-renders on `selectionchange` (it does — see
`handleSelectionChange` in `event-handler.js`), the DOM element that received
`mousedown` may be destroyed before `click` fires. A synthetic
`locator.click()` won't reproduce this because it skips `selectionchange`.

**Whenever a test needs to click an interactive element inside the editor
(e.g., the disclosure triangle), use `page.mouse.click(x, y)` with
coordinates obtained from `locator.boundingBox()`.** This produces the
real event sequence and will catch bugs that `locator.click()` hides.

Even `page.mouse.click()` may not be enough — Playwright can fire the
full sequence so fast that `selectionchange` never gets a chance to
interleave. To faithfully reproduce real-user timing, break the click
into discrete steps with a small delay:

```js
await page.mouse.move(x, y);
await page.mouse.down();
await page.waitForTimeout(100); // let selectionchange fire
await page.mouse.up();
```

This is the only reliable way to reproduce bugs where `selectionchange`
triggers a re-render that destroys the element before `click` fires.

### `scrollHeight` and `min-height`

The editor has `min-height: calc(var(--page-max-width) * 1.414)` (A4 aspect
ratio). For small documents the content height is smaller than the
min-height, so `scrollHeight` will **not change** when content is
collapsed/hidden. Measure the bounding rect of the specific element you
care about instead.

### Locator specificity

Selectors like `locator('#editor [data-node-id]', { hasText: 'foo' })` can match **parent** container elements whose descendant text includes `'foo'`. Use pseudo-selectors (`:has()`, `:not()`, `:scope >`) or the direct child combinator (`#editor > [data-node-id]`) to be precise.

## Architecture Quick Reference

### Editing model

- The **parse tree** (`SyntaxTree`) is the single source of truth.
- The DOM is **never** the source of truth; all mutations go through the
  tree, then the renderer rebuilds the DOM.
- There are two render paths:
  - `fullRender()` — clears the entire container and rebuilds every node
    from scratch. Used for initial load, view-mode switches, and a few
    special cases. All event handlers on DOM elements are lost.
  - `renderNodes()` / `renderNodesAndPlaceCursor()` — **incremental**:
    only the specific nodes listed in the `hints` object are replaced,
    added, or removed. Event handlers on untouched elements survive.
    Both the source renderer and writing renderer support this path.
- Most editing operations use the incremental path.

### Tab switching vs. session restore

When the user **switches tabs**, the DOM container and syntax tree are preserved in `documentStates` — nothing changes. The only action needed is placing the browser selection. **Do NOT re-render or re-parse anything on tab switch.** The `restoreState` method restores `treeRange` (text selection) from the saved state, sets `editor.isRendering = true` around `focus()` + `placeSelection()`/`placeCursor()` to suppress the `selectionchange` handler, which would otherwise trigger a spurious re-render. If a `treeRange` exists, `placeSelection()` is called to restore the full selection; otherwise `placeCursor()` places a collapsed caret.

When the app **relaunches** (session restore), the DOM is rebuilt from scratch, so `fullRenderAndPlaceCursor()` is correct there.

### Inline children model

Block-level nodes that contain inline formatting (`paragraph`, `heading1`–`heading6`, `blockquote`, `list-item`) automatically build inline child `SyntaxNode` instances when their `content` is set. The `content` property is a getter/setter — setting it triggers `buildInlineChildren()` which tokenizes the raw markdown and converts the segments into a tree of inline nodes (types: `text`, `inline-code`, `inline-image`, `bold`, `italic`, `bold-italic`, `strikethrough`, `link`, plus HTML inline tags like `sub`/`sup`).

Inline children have helper methods:

- `node.isInlineNode()` — returns `true` if this node is an inline child (i.e. `getBlockParent() !== this`).
- `node.getBlockParent()` — walks `.parent` to find the nearest block-level ancestor.

In **writing mode**, the renderer places `data-node-id` attributes on the inline formatting elements (`<strong>`, `<em>`, `<del>`, `<code>`, `<a>`, `<sub>`, `<sup>`, etc.) so the cursor manager can detect which inline node the cursor is inside.

### Toolbar active states

The toolbar receives the current node (possibly inline) via the `editor:selectionchange` event. `updateButtonStates(node)` walks from the node up through its parents to collect active inline formats, and resolves to the block parent for block-type button states (heading, paragraph, list, etc.). The mapping from inline node types to button IDs is defined in `Toolbar.INLINE_TYPE_TO_BUTTONS`. This map includes both markdown types (`bold`, `italic`, `strikethrough`) and their HTML tag equivalents (`strong`/`b` → bold, `em`/`i` → italic, `del`/`s` → strikethrough). Clicking a toolbar button while the cursor is inside an HTML tag strips the tag via `_findFormatSpan`'s HTML fallback path.

The three list toolbar buttons (unordered, ordered, checklist) are mutually exclusive. `toggleList(kind)` accepts `'unordered' | 'ordered' | 'checklist'` — clicking the same kind toggles back to paragraph; clicking a different kind converts the contiguous run of list items in place.

### Toolbar layout

The `#toolbar-container` uses CSS grid with three named areas: `left`, `center`, `right`. The file-button group (New, Open, Save) sits in the `left` area. The content toolbar (view mode toggle + formatting buttons) sits in the `center` area and is centred via `margin: 0 auto`. The `right` area is currently empty. File buttons dispatch document-level custom events (`file:new`, `file:loaded`, `file:save`) that the `App` class listens for.

### `data-node-id` scoping

Every rendered block element in the editor gets a `data-node-id` attribute
matching its syntax-tree node ID. In writing mode, inline formatting elements
(`<strong>`, `<em>`, etc.) also carry `data-node-id` for their inline child
nodes. The ToC sidebar **also** sets `data-node-id` on its `<a>` link
elements (same IDs). Any query like
`document.querySelector('[data-node-id="…"]')` may match the ToC link
or an inline element instead of the block editor element. **Always** scope
queries to the editor container: `this.editor.container.querySelector(…)`.

### Cursor model

The cursor state lives on the `SyntaxTree` instance as `syntaxTree.treeCursor` (not on the Editor directly).

```
syntaxTree.treeCursor = {
  nodeId: string,        // inline or block node id
  blockNodeId?: string,  // always block-level; present when nodeId is inline
  offset: number,        // character offset relative to block content
  tagPart?: string,
  cellRow?: number,
  cellCol?: number,
}
```

- `nodeId` — the id of the SyntaxNode that has focus. When the cursor is inside inline formatting (bold, italic, etc.) in writing mode, this points to the **inline child** node. Otherwise it points to the block-level node.
- `blockNodeId` — the id of the enclosing block-level node. Only set when `nodeId` is an inline child (set by `mapDOMPositionToTree`). When absent, `nodeId` is itself the block node.
- `offset` — character offset within the **block node's** raw `content` string (always relative to the block, never to the inline child).
- `tagPart` — `'opening'` or `'closing'` when the cursor is on an
  HTML tag line in source view.
- `cellRow` / `cellCol` — row and column indices when editing a table cell.

**Convenience methods on `Editor`:**

- `getCurrentNode()` — resolves `treeCursor.nodeId` to a SyntaxNode (may be inline).
- `getCurrentBlockNode()` — resolves `blockNodeId ?? nodeId` to the block-level SyntaxNode. **All editing operations must use this** because they work on the block node's `content` string.
- `getBlockNodeId()` — returns `blockNodeId ?? nodeId` as a string.
- `resolveBlockId(nodeId)` — resolves any node ID (inline or block) to its block parent's ID via `node.getBlockParent().id`. Used by `EventHandler` when comparing the current node against `lastRenderedNodeId` to decide whether a re-render is needed.

**Rule of thumb:** code that _reads_ the cursor to detect formatting uses `getCurrentNode()` (to see the inline node); code that _mutates_ content or checks block type uses `getCurrentBlockNode()`.

Node IDs are ephemeral (regenerated on every parse), so cursor and ToC heading positions are persisted as **index paths** — arrays of zero-based child indices that walk the tree from root to the target node. For cursors the final element is the character offset. Methods: `getPathToCursor()` / `setCursorPath()` for cursors, `getPathToNode()` / `getNodeAtPath()` for arbitrary nodes (e.g. the active ToC heading).

### Checklist (checkmark list) model

Checklist items are regular `list-item` nodes distinguished by `attributes.checked` (a boolean). When `checked` is `undefined`, the item is an ordinary bullet or ordered list item. When `checked` is `false` or `true`, the item is a checklist item and serializes with `- [ ] ` or `- [x] ` prefix.

- **Parser**: `_parseUnorderedListItem` detects `[ ] ` / `[x] ` / `[X] ` after the list marker, strips it from content, and sets `attributes.checked`.
- **Writing renderer**: checklist items render an `<input type="checkbox">` with the mousedown guard. The click handler toggles `node.attributes.checked`, records an undo snapshot, and calls `renderNodesAndPlaceCursor`.
- **Source renderer**: the checkbox prefix is included in the prefix `<span>`.
- **Enter key**: pressing Enter inside a checklist item creates a new item with `checked: false` (not inherited from the parent item's state).
- **`toggleList(kind)`**: converts between the three list kinds. When switching to `'checklist'`, sets `checked = false`; when switching away, deletes `checked`.
- **Multi-select across html-block boundaries**: `toggleList` is `async`. When `treeRange` spans nodes that include html-block containers, a `dialog:confirm` prompt asks the user whether to lift the children out of the html-block. On cancel, the operation aborts and the selection is preserved. The `dialog:confirm` IPC channel is registered in `ipc-handler.js` → `registerDialogHandlers()` and exposed via `window.electronAPI.confirmDialog(message)` in `preload.cjs`.
- **`getNodesInRange()`**: recursively enters html-block children so that all leaf nodes within the range are collected, not just the html-block wrapper.

### HTML block model (details/summary)

```
html-block (type: 'html-block', tagName: 'details')
  ├── html-block (tagName: 'summary')
  │     └── paragraph                        ← "This is a paragraph"
  ├── heading2                           ← "## and this an h2"
  └── paragraph                          ← "better"
```

- An html-element with exactly one paragraph child is rendered as a
  collapsed single line (e.g., `<summary>text</summary>`) in both
  `toMarkdown()` and source view. No special flag is needed — the
  structural condition (`children.length === 1 && type === 'paragraph'`)
  is sufficient.
- In **source view**, each line is rendered independently; the opening tag, child lines, and closing tag are separate `[data-node-id]` elements.
- In **writing view**, the `<details>` block is rendered as a **fake
  disclosure widget** using `<div>` elements (never a real `<details>`
  element — the native element caused too many quirks):

  ```
  div.md-html-element[data-node-id]
    div.md-html-container.html-details([data-open])
      div.html-summary
        span.dropdown   ← clickable ▶/▼
        div
          div.md-paragraph[data-node-id]
      div
        div.md-heading2[data-node-id]
        div.md-paragraph[data-node-id]
  ```

- Collapse/expand state is stored as `node.runtime.detailsOpen`
  (runtime-only — not serialized to markdown).
- Default open/closed state is controlled by a user preference
  (`detailsClosed` setting in the Content preferences section).

### The `mousedown` guard

Interactive elements inside the editor (like the disclosure triangle,
checklist checkboxes, and code-block language tag spans) must intercept
**`mousedown`** with `preventDefault()` + `stopPropagation()`. Without
this, `mousedown` moves the caret, which fires `selectionchange`, which
triggers a full re-render that destroys the element before `click` arrives.

### Dialog state save/restore

When a dialog steals focus from the editor (e.g. the code-language modal
opened by clicking a language tag), the focus loss triggers
`selectionchange` which corrupts `treeCursor` and nulls `treeRange`. Any
code that opens a modal from within the editor must:

1. **Save** both `treeCursor` (shallow copy) and `treeRange` (shallow copy
   or null) **before** calling `modal.open()`.
2. **Restore** both after the dialog closes (whether accepted or cancelled)
   and after any `recordAndRender` call.
3. Call `placeSelection()` (if there was a range) or `placeCursor()` (if
   collapsed) to rebuild the DOM selection from the restored tree state.
4. Set `isRendering = true` around the placement call and clear it via
   `queueMicrotask` to suppress the async `selectionchange` that the
   placement itself triggers.

### Backspace/delete at html-block boundaries

- **Backspace at offset 0** when the previous sibling is an html-block
  container: source view → no-op; writing view → merge into the last child
  of the html-block.
- **Delete at end of node** when the next sibling is an html-block
  container: source view → no-op; writing view → merge the first child of
  the html-block into the current node.

## Settings System

- **Main process**: `SettingsManager` persists settings in SQLite via
  `better-sqlite3`. A module-level singleton `settings` is exported from
  `settings-manager.js` — import it directly anywhere in the main process
  instead of passing instances through constructors.
- **Renderer**: communicates via `window.electronAPI.getSetting(key)` /
  `setSetting(key, value)` (IPC bridge in `preload.cjs`).
- **Preferences modal**: `PreferencesModal` class with sidebar nav sections.
  Dispatches custom events (e.g., `content:settingsChanged`) when settings
  are saved.
- **App wiring**: `app.js` listens for settings events and applies them to
  the editor instance, then calls `render()`.

### Reload

`Help → Reload` (`Ctrl+Shift+R`) does **not** touch the database. It calls
`webContents.reloadIgnoringCache()` to reload the front-end (HTML, CSS, JS),
then runs the same startup sequence: reads settings from the DB, restores
open files from disk based on the persisted `openFiles` list. Unsaved changes
and untitled documents do not survive a reload.

## Playwright Workers

- The Playwright config sets `fullyParallel: true` and `workers: 8` on
  Windows (2 on macOS, 4 on Linux). Tests within a single spec file run
  in parallel across workers.
- Each worker gets its own `beforeAll` / `afterAll`, so shared resources
  like HTTP servers are spun up per-worker (each on its own port).
- When running a single spec file, Playwright will still use up to 8
  workers to parallelize the tests inside it.

## Range Handling (Selection)

### TreeRange

```
TreeRange = { startNodeId, startOffset, endNodeId, endOffset }
```

- Populated by `syncCursorFromDOM()` when the DOM selection is non-collapsed.
- `null` when the selection is collapsed (i.e., just a caret).
- Used by `deleteSelectedRange()`, `getSelectedMarkdown()`, and all input
  handlers that must respect an active selection.

**Selection preservation (`editorInteractionPending`)**:

The syntax tree owns the selection — external UI interactions (toolbar clicks, dialog focus, tab-bar clicks) must **never** clear `treeRange`. This is enforced by an `editorInteractionPending` flag on the `Editor` instance:

1. `handleMouseDown` (on the editor container) and `handleKeyDown` set `editorInteractionPending = true`.
2. `handleSelectionChange` reads the flag, clears it, and passes `{ preserveRange: !fromEditor }` to `syncCursorFromDOM()`.
3. When `preserveRange` is `true` and the DOM selection is collapsed, `syncCursorFromDOM` **does not** null `treeRange` — the existing range from step 1 is preserved intact.

This means toolbar buttons with `mousedown preventDefault` (which prevent the editor from losing focus) will not accidentally clear the user's text selection in the tree.

**`placeSelection()`**:

Rebuilds the DOM selection from `editor.treeRange`. Called by `setViewMode()` after a full render so the user's selection survives a view-mode switch. Delegates to `cursorManager.placeSelection()`, which uses `resolveOffsetInDOM(nodeId, offset)` to map tree coordinates back to DOM text-node positions.

### `deleteSelectedRange()`

Returns `{ before, hints }` where `before` is the pre-edit tree snapshot and
`hints` is `{ updated: string[], removed?: string[] }`. Handles:

- **Same-node**: substring removal within a single node.
- **Cross-node**: trims start/end nodes, splices out intermediates, merges
  the end-node remainder into the start node.

**Critical**: when `deleteSelectedRange()` is called as a *sub-step* of
another operation (e.g., `insertTextAtCursor`, `handleEnterKey`), the caller
must propagate `hints.removed` into the final render hints. Failing to do
so causes stale DOM nodes to remain after re-render.

### `handleSelectAll()` (Ctrl+A)

Context-restricted: selects only the content of the currently focused node,
not the entire document.

### Cut / Copy / Paste

- `handleCut` and `handleCopy` (in `clipboard-handler.js`) call
  `event.preventDefault()` and write raw markdown to `clipboardData`
  so it round-trips correctly.
- `handleCut` then calls `deleteSelectedRange()` to remove selected content.
- Paste goes through `insertTextAtCursor` which handles range deletion first.

### `mapDOMPositionToTree(domNode, domOffset)`

Extracted helper that maps a single DOM position (node + offset) to tree
coordinates `{ nodeId, blockNodeId, offset }`. Called twice by `syncCursorFromDOM()` for
anchor and focus positions. When the cursor is inside an inline formatting
element (one with `data-node-id` whose node returns `isInlineNode() === true`),
the method records the inline node's id as `nodeId`, continues walking up
to find the block parent for `blockNodeId` and offset computation.

## Playwright Lessons

### Cross-node selection in writing mode

Keyboard-based selection (Shift+ArrowDown) and mouse drag do not work reliably for cross-node selection in writing mode because the editor re-renders when the cursor moves between nodes, destroying the selection. Use a programmatic helper that sets both the DOM `Range` and `editor.treeRange` directly:

```js
async function setCrossNodeSelection(page, startText, startOff, endText, endOff) {
  // 1. Click inside the editor to ensure focus
  const startLine = page.locator('[data-node-id]', { hasText: startText }).first();
  await startLine.click();

  // 2. Set DOM Range + treeRange programmatically
  await page.evaluate(({ sText, sOff, eText, eOff }) => {
    const editor = document.getElementById('editor');
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let startNode, endNode;
    while (walker.nextNode()) {
      if (!startNode && walker.currentNode.textContent.includes(sText))
        startNode = walker.currentNode;
      if (walker.currentNode.textContent.includes(eText))
        endNode = walker.currentNode;
    }
    const range = document.createRange();
    range.setStart(startNode, sOff);
    range.setEnd(endNode, eOff);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    // Set treeRange directly since syncCursorFromDOM may not fire reliably
    const api = window.__editor;
    api.syncCursorFromDOM();
  }, { sText: startText, sOff: startOff, eText: endText, eOff: endOff });
}
```

**Important**: the helper must also verify that `treeRange` was set (via `window.__editor`), because DOM selection events during re-renders are unreliable. The `page.evaluate` args must be passed as an object (not an array) to satisfy TSC's type inference.

### Test self-containment for fullyParallel

With `fullyParallel: true`, tests within a single spec file may run in any
order across different workers. Every test must set up its own state (load
content, set view mode) rather than depending on prior tests. Module-level
`page` variables are instantiated per-worker, not shared across tests.

## CSS Conventions

- Editor styles are in `src/web/styles/editor.css`.
- The fake details widget uses `.html-details`, `[data-open]`,
  `.html-summary`, `.dropdown` classes. The summary content and body divs are targeted positionally (`.html-summary > div` and `.html-details > div:not(.html-summary)`).
- Collapse is achieved via `.html-details:not([data-open]) > div:not(.html-summary) { display: none; }`.
- Checklist items use `.md-list-item input[type="checkbox"]` for styling. They render with `display: block` and `list-style-type: none` so the checkbox replaces the bullet.
- `.writing-view .md-list-item[data-has-focus]` unsets `margin-left`, `padding-left`, `margin-right`, and `padding-right` to prevent the general focused-line padding shift from visually misaligning list items.
