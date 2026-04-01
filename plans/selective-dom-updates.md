# Selective DOM Updates Plan

Goal: eliminate the full DOM rebuild when switching from source2 back to writing view. Keep the writing DOM alive (hidden) while source2 is active, then restore it and apply only the changes.

## Rules

Each step must be committed individually upon completion (that includes checking off the task in this document before committing). Do not batch multiple steps into a single commit. When a step requires more work than is in the document, update the document with a new approved plan before doing the work.

## Progress

- [ ] Step 1: Make `updateUsing` return diff hints
- [ ] Step 2: Stash the writing DOM when entering source2
- [ ] Step 3: Restore the writing DOM when leaving source2
- [ ] Step 4: Clean up stashed container on document load and tab switch
- [ ] Step 5: Run full test suite, fix any failures
- [ ] Step 6: Update docs

## Step Details

### Step 1: Make `updateUsing` return diff hints

Currently `SyntaxTree.updateUsing(newTree)` mutates `this.children` in place but returns nothing. The writing renderer's `renderNodes(container, { updated, added, removed })` already accepts node-ID-based hints for surgical DOM updates. Wire these together.

**In `src/parsers/old/syntax-tree.js`:**

- Modify `updateUsing` to collect three arrays of node IDs:
  - `removed`: IDs of old children that were not matched to any new child (unclaimed old nodes).
  - `added`: IDs of new children that had no match in the old tree (these are new `SyntaxNode` instances with fresh IDs).
  - `updated`: IDs of matched old nodes where `updateMatchedNode` actually changed something.
- Return `{ updated, added, removed }`.

- Modify `updateMatchedNode` to return a `boolean` indicating whether it made any changes (content, attributes, line numbers, sourceEditText, or recursive children). Currently it mutates silently; add a tracking variable that flips to `true` on any assignment.

- Handle the recursive `html-block` children case: `updateMatchedNode` already recursively calls `matchChildren` and `updateMatchedNode` for html-block children. The removed/added/updated IDs from the inner recursion should be merged into the parent call's result. Since `updateMatchedNode` is called from both `updateUsing` (top-level) and itself (html-block recursion), have it accept and populate the hint arrays.

**Unit tests:**

- Add tests to `test/unit/parser/update-using.test.js` that verify the returned `{ updated, added, removed }` hints for:
  - No changes (all three arrays empty).
  - One node content changed (appears in `updated`).
  - A node added (appears in `added`).
  - A node removed (appears in `removed`).
  - Mixed changes.
  - Html-block with changed children (child IDs appear in the correct arrays).

### Step 2: Stash the writing DOM when entering source2

When `setViewMode` switches from writing to source2, keep the writing DOM alive instead of destroying it.

**In `src/web/scripts/editor/index.js`, inside the writing → source2 path of `setViewMode`:**

1. Detach event listeners from the writing container via `this.detachContainerListeners()`.
2. Hide the writing container: set `this.container.style.display = 'none'`.
3. Remove its `id` attribute and set a stash marker: `this.container.dataset.editorStashed = ''`.
4. Save a reference: `this.writingContainer = this.container`.
5. Create a new `<div>` for source2: give it `id="editor"`, class `editor`, and append it to `#editor-container` (i.e. `this.writingContainer.parentElement`).
6. Set `this.container` to the new div and call `this.attachContainerListeners()`.
7. Proceed with source2 `fullRender` on the new container (existing code).

**Add a field** `this.writingContainer = null` in the constructor to hold the stashed reference.

**The source2 `fullRender`** continues to work unchanged — it renders into whatever `container` it receives.

### Step 3: Restore the writing DOM when leaving source2

When `setViewMode` switches from source2 back to writing, restore the stashed writing DOM and apply only the changes.

**In `src/web/scripts/editor/index.js`, inside the source2 → writing path of `setViewMode`:**

1. Capture `selectionStart` from the textarea (existing code).
2. If `hasChanges()`, reparse and call `this.syntaxTree.updateUsing(newTree)` — now returns `{ updated, added, removed }` hints. Also call `this.setUnsavedChanges(true)`.
3. Restore cursor via `absoluteOffsetToCursor` (existing code).
4. Detach event listeners from the source2 container.
5. Remove the source2 div from the DOM entirely.
6. Restore the stashed writing container: remove `data-editor-stashed`, restore `id="editor"`, set `style.display = ''`, set `contenteditable="true"`.
7. Set `this.container` to the restored writing container, reattach event listeners.
8. **If no changes**: just call `this.placeCursor()` — the writing DOM is intact, zero render cost.
9. **If changes**: call `this.renderNodes(hints)` with the diff hints from step 2, then `this.placeCursor()`. This performs surgical DOM updates (remove, replace-in-place, insert-after-sibling) for only the changed nodes.
10. Set `this.writingContainer = null`.
11. Scroll-preserve and other post-switch logic (existing code) runs as before.

**Do NOT call `fullRenderAndPlaceCursor()`** when restoring from source2. The whole point is to avoid the full rebuild.

### Step 4: Clean up stashed container on document load and tab switch

Ensure the stashed writing container is properly cleaned up when the document changes entirely.

- **`loadMarkdown()`**: If `this.writingContainer` is non-null, remove it from the DOM and set it to `null` before proceeding. The full render will rebuild from scratch.
- **`swapContainer()`**: If `this.writingContainer` is non-null, remove it from the DOM and set it to `null`. Tab switching replaces the entire container, so any stashed state is invalid.

### Step 5: Run full test suite, fix any failures

Run the full test suite (`npm test`). All existing tests must pass, including the source2 round-trip tests, cursor position tests, and the main editing tests.

### Step 6: Update docs

Update `docs/developers/architecture.md` and any other docs that describe the rendering pipeline or view-mode switching to reflect the new stash-and-restore approach.
