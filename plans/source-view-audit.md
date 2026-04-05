# Old Source View Audit

Audit of all remaining references to the old "source" view mode (not "source2") in the codebase. Every item is categorized by what kind of removal it requires.

**Principle:** If a comment/JSDoc describes dead code, it is listed with that dead code — not as a separate comment item.

**RULES FOR EACH CHECKLIST ITEM:**

1. Re-read `.instructions.md`
2. Describe the planned change, ask for approval — NO tool calls with the question
3. Wait for explicit approval
4. Make the edit
5. Run `npm test`
6. Immediately ask the user to tell you when tests are done — NO tool calls, NO checking output, NO reading terminal
7. Wait for test results
8. Ask the user to manually test, describe how — NO tool calls with the question
9. Wait for manual test confirmation
10. Check off the item in this document
11. Commit (`git add -A`, then `git commit` — as SEPARATE commands, never compound)
12. Go to the next item — start at step 1 again

**Comment-only and doc-only changes still need manual testing confirmation. No exceptions.**

## 1. Files to delete entirely

- [ ] `src/web/scripts/editor/renderers/source-renderer.js` — entire old per-node source renderer
- [ ] `src/web/styles/source-view.css` — old `.source-view` stylesheet

## 2. Dead code (only executes in old source mode)

Items are grouped by file. Comments describing the dead code are part of the same item.

### `src/web/scripts/editor/index.js`

- [ ] L35: `import { SourceRenderer } from './renderers/source-renderer.js'` — dead import
- [ ] L59–60: `this.sourceRenderer = new SourceRenderer(this)` — dead instantiation
- [ ] L188–230: `finalizeCodeBlockSourceEdit(node)` method + its JSDoc — only used by old source view's `sourceEditText` workflow
- [ ] L506: `const renderer = this.viewMode === 'writing' ? this.writingRenderer : this.sourceRenderer` — dead branch; source2 is handled earlier
- [ ] L814–829: `sourceEditText` finalization loop in `setViewMode` — only triggers for old source mode code-blocks

### `src/web/scripts/editor/edit-operations/insert.js`

- [ ] L36–55: `tagPart` html-block routing + comment at L36 — `data-tag-part` DOM attribute only set by old source renderer
- [ ] L80–115: prefix editing block + comment "Source-view prefix editing" — `.md-syntax` prefix spans only exist in old source view; `prefixOffset` on treeCursor is dead
- [ ] L131–135: `sourceEditText` manipulation gated on `viewMode === 'source'`
- [ ] L249–250: prefix adjustment gated on `viewMode === 'source'`

### `src/web/scripts/editor/edit-operations/delete.js`

- [ ] L24–44: `tagPart` html-block routing + comment — same as insert.js
- [ ] L73–113: prefix editing block + comment "Source-view prefix editing" — same as insert.js
- [ ] L122–123: `sourceEditText.length` check for effective code-block length
- [ ] L136–139: `sourceEditText` manipulation gated on `viewMode === 'source'`
- [ ] L171–172: prefix adjustment gated on `viewMode === 'source'`
- [ ] L183–184: `sourceEditText !== null` check + `finalizeCodeBlockSourceEdit()` call
- [ ] L194: `if (ops.editor.viewMode === 'source')` no-op branch for html-block container boundary

### `src/web/scripts/editor/edit-operations/backspace.js`

- [ ] L24–42: `tagPart` html-block routing + comment — same as insert.js
- [ ] L73–115: prefix editing block + comment "Source-view prefix editing" — same as insert.js
- [ ] L169–173: comment "in source view the full text is in sourceEditText" — describes dead source-view code-block behavior
- [ ] L179: `node.sourceEditText = null` — clearing dead property

### `src/web/scripts/editor/edit-operations/enter.js`

- [ ] L91–94: `sourceEditText` manipulation gated on `viewMode === 'source'`

### `src/web/scripts/editor/handlers/clipboard-handler.js`

- [ ] L37–38: JSDoc paragraph "**Source view** — returns the raw substring(s)…" — describes the dead `getSelectedMarkdownSource()` method below
- [ ] L56: `return this.getSelectedMarkdownSource()` — only reachable for old source mode (source2 early-returns before this)
- [ ] L60–97: `getSelectedMarkdownSource()` method + its JSDoc — dead code

### `src/web/scripts/editor/handlers/event-handler.js`

- [ ] L206–211: `sourceEditText !== null` check + `finalizeCodeBlockSourceEdit()` on click-away
- [ ] L447–452: same pattern in `handleSelectionChange` — duplicate `sourceEditText` finalization

### `src/web/scripts/editor/handlers/menu-handler.js`

- [ ] L177–181: `handleViewSource()` method + JSDoc — dead; only called if old "source" mode selected

### `src/web/scripts/editor/managers/cursor-manager.js`

- [ ] L126–130: `inPrefix` / negative-rawOffset logic + comment "`.md-syntax` prefix span (source view only)" — `.md-syntax` spans only exist in old source renderer
- [ ] L138–140: `if (inPrefix) cursor.prefixOffset = -(rawOffset + 1)` — sets dead field
- [ ] L141–143: `tagPart` recording from `data-tag-part` DOM attribute — only set by old source renderer
- [ ] L155–163: JSDoc paragraph "In source view, when the cursor is inside the `.md-syntax` prefix span…" — describes dead behavior
- [ ] L179: `parentEl.classList?.contains('md-syntax')` check — `.md-syntax` only from old renderer
- [ ] L189–193: `if (this.editor.viewMode === 'source')` prefix offset logic — dead branch
- [ ] L249–272: `computePrefixOffset()` method + JSDoc — only callable when `.md-syntax` spans exist (old source view)
- [ ] L382–406: `prefixOffset` cursor-placement code — places DOM cursor inside `.md-syntax` spans

### `src/web/scripts/editor/managers/cursor-persistence.js`

- [ ] L49–56: `tagPart` handling code + comment "source view tagPart" — `tagPart` on cursor is dead
- [ ] L59–64: `prefixOffset` handling code + comment "source view" — `prefixOffset` on cursor is dead
- [ ] L198–203: `prefixOffset` creation code + comment "source view" — same as above

### `src/parsers/old/syntax-node.js`

- [ ] L84–90: `sourceEditText` property initialization + comment
- [ ] L235–274: `enterSourceEditMode()` / `exitSourceEditMode()` / `sourceEditLength` — entire source-edit machinery
- [ ] L304: `sourceEditText` check in `toMarkdown()`

### `src/parsers/old/syntax-tree.js`

- [ ] L181–182: `sourceEditText = null` in `updateMatchedNode()`

### `src/types.d.ts`

- [ ] L47–48: `tagPart` field + JSDoc "(source view only)" — dead field on TreeCursor
- [ ] L49–52: `prefixOffset` field + JSDoc "in source view" — dead field on TreeCursor

### `test/unit/parser/tree-diffing.test.js`

- [ ] L215–225: test "clears sourceEditText to null" — tests dead source-edit machinery

## 3. View switching (routes to or enables old 'source' mode)

- [ ] `src/types.d.ts` L31: `type ViewMode = 'source' | 'source2' | 'writing'` — remove `'source' |`
- [ ] `src/web/index.html` L11: `<link rel="stylesheet" href="styles/source-view.css">` — old stylesheet still linked
- [ ] `src/web/scripts/utility/preferences/preferences-modal.js` L118–121: `<option value="source">Source</option>` in dropdown — remove
- [ ] `src/web/scripts/utility/preferences/preferences-modal.js` L700: `result.value === 'source'` check — still accepts old mode value
- [ ] `src/web/scripts/utility/preferences/preferences-modal.js` L883: `viewSelect.value === 'source' ? 'source' : 'writing'` — broken ternary; maps source2 to writing
- [ ] `src/web/scripts/editor/handlers/menu-handler.js` L180–181: `setViewMode('source')` / `toolbar.setViewMode('source')` — wired to old source mode
- [ ] `src/web/scripts/utility/toolbar/toolbar.js` VIEW_MODE_LABELS: `source: 'Source View'` entry — remove
- [ ] `src/electron/api-registry.js` L155: description says `"source", "source2", or "writing"` — should only list `source2` and `writing`

## 4. Stale comments on live code

Comments that say "source" but describe live code that actually works with source2. The code is correct; only the comment is wrong.

- [ ] `src/web/scripts/editor/formatters/tree-formatter.js` L2: "source view modes" — TreeFormatter is used for writing mode only (source2 has its own formatter); remove "source"
- [ ] `src/web/scripts/editor/formatters/tree-formatter.js` L11: "Used for `writing` and `source` view modes" — should say just `writing`
- [ ] `src/web/scripts/utility/search/search-bar.js` L6: "in source view" — search-bar is used for source2; should say "source2 view"
- [ ] `src/web/scripts/utility/search/search-bar.js` L164: "source ↔ writing switches" — should say "source2"
- [ ] `src/web/scripts/utility/search/search-bar.js` L380: "In source mode" — should say "source2"
- [ ] `src/web/scripts/utility/search/search-bar.js` L384: "Source mode" — should say "source2"
- [ ] `src/web/scripts/utility/search/search-bar.js` L635: "In source mode" — should say "source2"
- [ ] `src/web/scripts/utility/search/search-bar.js` L651: "in source mode" — should say "source2"
- [ ] `src/web/styles/editor.css` L56: comment "visible in source view" — `.md-syntax` rule; writing view uses this too
- [ ] `src/web/scripts/editor/managers/cursor-persistence.js` L2: "absolute source offset" — "source" here means "markdown source text" not the view mode — **verify if this is actually a false positive**

## 5. Documentation

- [ ] `docs/developers/architecture.md` L44: diagram still shows `SourceRenderer` box
- [ ] `docs/developers/architecture.md` L112: "Source View (Ctrl+1)" — outdated shortcut info
- [ ] `docs/developers/architecture.md` L203: syntax-highlighter described as "for source view"
- [ ] `docs/developers/architecture.md` L222: "In source view, searches against…"
- [ ] `docs/developers/architecture.md` L280–289: entire "SourceRenderer (legacy)" section
- [ ] `docs/developers/architecture.md` L529: "Source View (legacy)" section
- [ ] `docs/developers/design.md` L325: shows `this.sourceRenderer = new SourceRenderer(this)`
- [ ] `docs/developers/design.md` L400: `class SourceRenderer {}` skeleton
- [ ] `docs/developers/design.md` L569: "Add render method in `SourceRenderer`"
- [ ] `docs/developers/getting-started.md` L216: "Add rendering in both `SourceRenderer` and `WritingRenderer`"
- [ ] `docs/notes.md` L62, 127, 147, 165–168: "source view" / "source renderer" mentions describing old view behavior
- [ ] `docs/ai/ai-agent-notes.md` L126, 173, 176, 336–337: "source view" mentions and reference to `source-view.css`
- [ ] `docs/api/README.md` L397: says mode is `"source"` or `"writing"` — should be `"source2"` or `"writing"`
- [ ] `docs/api/api-v1.0.0.json` L78: description says `"source"` or `"writing"` — should be `"source2"` or `"writing"`
- [ ] `plans/migration-plan.md` L57: table row references `enterSourceEditMode()` / `exitSourceEditMode()` / `sourceEditLength`
- [ ] `plans/migration-plan.md` L154: paragraph describes `enterSourceEditMode` / `exitSourceEditMode` plan

## 6. Renderers (defensive cleanup)

- [ ] `src/web/scripts/editor/renderers/writing-renderer.js` L60: `container.classList.remove('source-view')` — harmless defensive cleanup; can remove once old CSS file is deleted
- [ ] `src/web/scripts/editor/renderers/source-renderer-v2.js` L56: `container.classList.remove('source-view')` — same

## 7. Integration tests referencing "source view"

These may be testing source2 functionality with stale "source view" naming, or may be testing dead old-source behavior. Each needs verification.

- [ ] `test/integration/user-interaction/content/code-block-language-tag.spec.js` L81: test name "source view does not render language tag spans"
- [ ] `test/integration/user-interaction/content/code-block-language-tag.spec.js` L167: test name "cursor offset is correct in source view after changing language"
- [ ] `test/integration/user-interaction/content/inline-image.spec.js` L75: test name "image syntax round-trips through source view correctly"
- [ ] `test/integration/user-interaction/content/inline-image.spec.js` L95: test name "removing ! in source view converts inline image to link"
- [ ] `test/integration/user-interaction/content/code-block-enter.spec.js` L8: comment "Typing tests are run in both writing view and source view"
- [ ] `test/integration/user-interaction/content/backspace-after-html-block.spec.js` L6, L9: comments referencing "Source view"

## False positives (not old view references)

- `src/web/scripts/editor/syntax-highlighter/shell.js` L28: `source` is a bash keyword
- `src/parsers/old/dfa-parser.js` L70, L102: `source` is a code-block language name
- `src/parsers/new/src/parser/dfa-parser.js` L81, L111: same
- `src/parsers/new/src/parser/inline-tokenizer.js` L27: same
- `src/web/scripts/app.js` L554: "source of positional truth" — English word
- `src/electron/menu-builder.js` L551, L570: "image source" — unrelated
- `test/integration/user-interaction/interaction/cursor-sync.spec.js` L6: "single source of truth" — English usage
- `test/integration/test-utils.js` L228–246: `setSource2View()` / `getSourceLineText()` — source2 helpers, not old source
