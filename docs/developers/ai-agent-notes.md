# AI Agent Notes

> **⚠️ CRITICAL — DO NOT FORGET THIS DOCUMENT ⚠️**
>
> This file must **never** leave session context, even if the context limit
> is exceeded. It is the single most important piece of project documentation
> for AI agents. It may **never** be cleared or partially cleared from
> context. Any context reset — whether caused by token limits, session
> boundaries, or conversation summarization — **MUST** start by rereading
> this file in full before doing any other work.

This document captures hard-won lessons, conventions, and technical details
that an AI coding assistant should know when working on this project. Read
this **before** doing any work.

---

## Working Environment

- **OS**: Windows. Default shell is `cmd.exe`.
- **Shell rule**: If you are not already in the standard command prompt, run
  `cmd` first. Then check whether you are already in the project directory —
  `cd` is almost never necessary because the terminal usually opens in the
  workspace root already. **Do not blindly prepend `cd …` to commands.**
- **Never** use `2>&1` in terminal commands.
- The project root is the workspace folder (the one containing `package.json`).

## Doing work

- **Always** create a new git branch off of `main` for any new work
- **Always** run all commands and reasoning in the foreground
- **ALways** use the active terminal to run any commands
- **Never** split commands with `;`, **always** use `&&` or if you can't,
  split them up.
- **Never** wrap commands in `cmd /c "..."`, **always** run `cmd` on its
  own first if you're not already in cmd.
- When asked to offer multiple choices, **never** present option picking
  UI, instead ask what option to select and wait for the user to type
  the answer.
- **Never** start modifying files without asking whether what you thought
  up makes sense or whether assumptions made during the reasoning step
  missed anything.
- **After starting a test run**, do **nothing** — no terminal commands, no
  file reads, no edits — until the **user explicitly says the tests have
  finished** and provides results. Terminal output may be truncated or
  returned before the command completes; never assume tests are done based
  on partial output alone.
- **Never** use multiline strings in terminal commands. `cmd.exe` treats
  each line as a separate command. Git commit messages must be a single
  line: `git commit -m "one line summary"`.

## Test Runners

| Kind        | Command                    | Framework                  |
| ----------- | -------------------------- | -------------------------- |
| Unit        | `npm run test:unit`        | Node.js native test runner |
| Integration | `npm run test:integration` | Playwright + Firefox       |

- **Do not** use vitest — the project does not use it.
- **Never** use `npx` to run tools — always use the corresponding `npm run`
  script. To run a single spec file: `npm run test:integration -- path/to/file.spec.js`.
- The user runs the full Playwright suite themselves; you can run individual
  spec files to verify your work, but do not run the entire suite without
  being asked.
- **ALways** update integrations test for UX that gets changed
- **Always** write new integration tests for new UX

## Playwright Pitfalls

### Synthetic vs. real clicks

`locator.click()` dispatches a synthetic event that **skips** the real
browser event sequence. A real human click fires:

    mousedown → (selectionchange) → mouseup → click

If the editor re-renders on `selectionchange` (it does — see
`handleSelectionChange` in `editor.js`), the DOM element that received
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

Selectors like `locator('#editor .md-line', { hasText: 'foo' })` can match
**parent** container elements whose descendant text includes `'foo'`. Use
pseudo-selectors (`:has()`, `:not()`, `:scope >`) to be precise.

## Architecture Quick Reference

### Editing model

- The **parse tree** (`SyntaxTree`) is the single source of truth.
- The DOM is **never** the source of truth; all mutations go through the
  tree, then `render()` rebuilds the DOM.
- `render()` in focused view destroys and recreates the entire DOM fragment.
  Any event handler attached to a DOM element will be lost after render.

### Cursor model

```
treeCursor = { nodeId: string, offset: number, tagPart?: string }
```

- `nodeId` — the id of the SyntaxNode that has focus.
- `offset` — character offset within the node's text content.
- `tagPart` — `'openingTag'` or `'closingTag'` when the cursor is on an
  HTML tag line in source view.

### HTML block model (details/summary)

```
html-block (type: 'html-block', tagName: 'details')
  ├── html-block (tagName: 'summary')
  │     └── paragraph (bareText: true)   ← "This is a paragraph"
  ├── heading2                           ← "## and this an h2"
  └── paragraph                          ← "better"
```

- `bareText: true` means the node's text was originally wrapped in an HTML
  tag (e.g., `<summary>text</summary>`) and is rendered without markdown
  block-level syntax in source view (no `#`, `>`, etc. prefix — just the
  raw tag + text).
- In **source view**, each line is rendered independently; the opening tag,
  child lines, and closing tag are separate `.md-line` elements.
- In **focused view**, the `<details>` block is rendered as a **fake
  disclosure widget** using `<div>` elements (never a real `<details>`
  element — the native element caused too many quirks):

  ```
  div.md-line.md-html-block
    div.md-html-container.md-details(.md-details--open)
      div.md-details-summary
        span.md-details-triangle   ← clickable ▶/▼
        div.md-details-summary-content
          div.md-line.md-paragraph
      div.md-details-body
        div.md-line.md-heading2
        div.md-line.md-paragraph
  ```

- Collapse/expand state is stored as `node.attributes._detailsOpen`
  (runtime-only — not serialized to markdown).
- Default open/closed state is controlled by a user preference
  (`detailsClosed` setting in the Content preferences section).

### The `mousedown` guard

Interactive elements inside the editor (like the disclosure triangle) must
intercept **`mousedown`** with `preventDefault()` + `stopPropagation()`.
Without this, `mousedown` moves the caret, which fires `selectionchange`,
which triggers a full re-render that destroys the element before `click`
arrives.

### bareText preservation

When `insertTextAtCursor`, `handleBackspace`, or `handleDelete` re-parse a
single line via `parseSingleLine`, they must check whether the node had
`bareText: true` before the re-parse and restore it afterward, because
`parseSingleLine` does not know about the HTML-block context.

### Backspace/delete at html-block boundaries

- **Backspace at offset 0** when the previous sibling is an html-block
  container: source view → no-op; focused view → merge into the last child
  of the html-block.
- **Delete at end of node** when the next sibling is an html-block
  container: source view → no-op; focused view → merge the first child of
  the html-block into the current node.

## Settings System

- **Main process**: `SettingsManager` persists settings in SQLite via
  `better-sqlite3`.
- **Renderer**: communicates via `window.electronAPI.getSetting(key)` /
  `setSetting(key, value)` (IPC bridge in `preload.cjs`).
- **Preferences modal**: `PreferencesModal` class with sidebar nav sections.
  Dispatches custom events (e.g., `content:settingsChanged`) when settings
  are saved.
- **App wiring**: `app.js` listens for settings events and applies them to
  the editor instance, then calls `render()`.

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
- Used by `deleteSelectedRange()`, `_getSelectedMarkdown()`, and all input
  handlers that must respect an active selection.

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

- `_handleCut` and `_handleCopy` call `event.preventDefault()` and write
  raw markdown to `clipboardData` so it round-trips correctly.
- `_handleCut` then calls `deleteSelectedRange()` to remove selected content.
- Paste goes through `insertTextAtCursor` which handles range deletion first.

### `_mapDOMPositionToTree(domNode, domOffset)`

Extracted helper that maps a single DOM position (node + offset) to tree
coordinates `{ nodeId, offset }`. Called twice by `syncCursorFromDOM()` for
anchor and focus positions.

## Playwright Lessons

### Cross-node selection in focused mode

Keyboard-based selection (Shift+ArrowDown) does not work reliably for
cross-node selection in focused mode because the editor re-renders when the
cursor moves between nodes, destroying the selection. Use a programmatic
helper that sets a DOM `Range` via `page.evaluate()`:

```js
async function setCrossNodeSelection(page, startText, startOff, endText, endOff) {
  await page.evaluate((args) => {
    // Find nodes by textContent, walk to text nodes, set Range
  }, [startText, startOff, endText, endOff]);
}
```

### Test self-containment for fullyParallel

With `fullyParallel: true`, tests within a single spec file may run in any
order across different workers. Every test must set up its own state (load
content, set view mode) rather than depending on prior tests. Module-level
`page` variables are instantiated per-worker, not shared across tests.

## CSS Conventions

- Editor styles are in `src/renderer/styles/editor.css`.
- The fake details widget uses `.md-details`, `.md-details--open`,
  `.md-details-summary`, `.md-details-triangle`, `.md-details-summary-content`,
  `.md-details-body` classes.
- Collapse is achieved via `.md-details:not(.md-details--open) .md-details-body { display: none; }`.
