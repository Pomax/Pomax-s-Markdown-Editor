# Null Usage Audit

Audit of all `null` usage in the codebase. Every occurrence should be replaced with `undefined`, or removed entirely where the assignment is unnecessary. JSDoc type annotations using `|null` should become `|undefined`.

**Exception:** SQL keywords like `NOT NULL` are left as-is — that's SQL, not JS.

**Principle:** `null` assignments become `undefined` (or are deleted if redundant). `null` comparisons become `undefined` comparisons. `?? null` becomes `?? undefined`. JSDoc `|null` becomes `|undefined` BUT ONLY WHEN JS DOES NOT ALREADY DO THE RIGHT THING BY DEFAULT WHEN SWITCHING TO UNDEFINED.

**Cascade rule:** Removing `null` from one site can trigger a chain of required updates. For example, if `findNodeById()` changes from returning `null` to returning `undefined`, then every caller that does `=== null` on its result must also change, the JSDoc `@returns {SyntaxNode|null}` must become `@returns {SyntaxNode|undefined}`, the corresponding `.d.ts` type must update, and any test that asserts `strictEqual(result, null)` must assert `strictEqual(result, undefined)`. Each checklist item therefore covers the **full cascade** — the originating site plus every downstream consumer — as a single atomic change. Do not check off an item until every part of its cascade has been updated and tested.

**RULES FOR EACH CHECKLIST ITEM:**

1. Re-read `.instructions.md`
2. Describe the planned change, ask for approval — NO tool calls with the question
3. Wait for explicit approval
4. Make the edit
5. Run `npm test`
6. Immediately ask the user to tell you when tests are done — NO tool calls, NO checking output, NO reading terminal
7. Wait for test results
8. Check off the item in this document
9. Commit (`git add -A`, then `git commit` — as SEPARATE commands, never compound)
10. Go to the next item — start at step 1 again

## `src/electron/settings-manager.js`

- [x] L19: JSDoc `|null` type annotation for `this.db`
- [x] L20: `this.db = null` — constructor assignment
- [x] L45: JSDoc `[defaultValue=null]` param description
- [x] L48: `defaultValue = null` — default parameter value
- [x] L121: `this.db = null` — teardown assignment

## `src/electron/menu-builder.js`

- [x] L27: JSDoc `string|null` type for `filePath` in tabs array
- [x] L365: `settings.get('openFiles', null)` — default value
- [x] L374: JSDoc `number[]|null` types for `cursorPath` and `tocHeadingPath` (×2)
- [x] L386: `entry.cursorPath ?? null`
- [x] L387: `entry.tocHeadingPath ?? null`

## `src/electron/main.js`

- [x] L13–14: JSDoc `BrowserWindow|null` + `let mainWindow = null`
- [x] L27–29: JSDoc `ReturnType<typeof setTimeout>|null` + `let boundsDebounce = null`
- [x] L79: JSDoc `string|null` in filter param
- [x] L81: JSDoc `string|null` + `number[]|null` (×3) in map param
- [x] L89: `f.cursorPath ?? null`
- [x] L90: `f.tocHeadingPath ?? null`
- [x] L122: `!= null` comparisons (×2) — loose equality, catches both null and undefined
- [x] L149: `!= null` comparisons (×2) — same pattern
- [x] L179: `boundsDebounce = null`
- [x] L215: `mainWindow = null`
- [x] L291: JSDoc `string|null` return type (×2)
- [x] L315: `return null`
- [x] L337: JSDoc `number[]|null` types (×2)
- [x] L341: JSDoc `number[]|null` types (×2)
- [x] L353: `entry.cursorPath ?? null`
- [x] L354: `entry.tocHeadingPath ?? null`
- [x] L443: `settings.get('openFiles', null)`

## `src/electron/ipc-handler.js`

- [x] L34: JSDoc `string|null` + `number[]|null` (×3)
- [x] L38: JSDoc `string|null` in filter param
- [x] L40: JSDoc `string|null` + `number[]|null` (×3) in map param
- [x] L48: `f.cursorPath ?? null`
- [x] L49: `f.tocHeadingPath ?? null`
- [x] L67: `menuBuilder ?? null`
- [x] L199: `activeFile.filePath ?? null`

## `src/electron/file-manager.js`

- [x] L18–19: JSDoc comment "or null" + `string|null` type
- [x] L21: `this.currentFilePath = null`
- [x] L160: `this.currentFilePath = null`
- [x] L175: JSDoc `string|null` return type + "or null" text (×2)
- [x] L179: `return null`
- [x] L186: JSDoc `string|null` return type + "or null" text (×2)

## `src/web/scripts/app.js`

- [x] L53: `initPageResizeHandles(editorContainer) ?? null`
- [x] L92: `this.tabBar.addTab(firstTabId, null, true)`
- [x] L112: `this.cursorDebounce = null`
- [x] L152: `await this.createNewTab(null, '')`
- [x] L160: `detail.filePath || null`
- [x] L299: `this.toc?.lockedHeadingId ?? null`
- [x] L303: `dataset.nodeId ?? null`
- [x] L311: `treeCursor ? { ...treeCursor } : null`
- [x] L315: `treeRange ? { ...treeRange } : null`
- [x] L356: `state.cursor ? { ...state.cursor } : null`
- [x] L357: `treeCursor?.nodeId ?? null`
- [x] L385: `state?.treeRange ? { ...state.treeRange } : null`
- [x] L399: `state?.tocActiveHeadingId ?? null`
- [x] L429: `tab.filePath === null`
- [x] L440: JSDoc `number[]|null` types (×2)
- [x] L471: `treeCursor ? { ...treeCursor } : null`
- [x] L489: `let tocNode = null`
- [x] L550: JSDoc `string|null`
- [x] L568: JSDoc `string|null` + "or null" text (×2)
- [x] L697: `this.tabBar.addTab(newId, null, true)`
- [x] L745: `cursorPath: /** @type {number[]|null} */ (null)` (×2)
- [x] L746: `tocHeadingPath: /** @type {number[]|null} */ (null)` (×2)
- [x] L763: `/** @type {HTMLElement|null} */` cast
- [x] L765: `null` (ternary false branch)
- [x] L776: `getPathToCursor() ?? null`
- [x] L777: `state.tocActiveHeadingId ?? null`
- [x] L835: `result.value !== null`
- [x] L862: `result.value !== null`
- [x] L873: `result.value !== null`
- [x] L884: `result.value !== null`
- [x] L926: `this.cursorDebounce = null`
- [x] L934: `this.editor?.currentFilePath ?? null`
- [x] L942: `treeCursor?.nodeId ?? null`
- [x] L979: `await this.createNewTab(null, '')`
- [x] L359–360: `ReturnType<typeof setTimeout>|null` + `cursorDebounce = null`

## `src/web/scripts/editor/crc32.js`

- [x] L9–10: JSDoc `Uint32Array|null` + `let TABLE = null`

## `src/web/scripts/editor/page-resize.js`

- [x] L160–161: JSDoc `number|null` + `let rafId = null`
- [x] L182: `if (rafId !== null) return`
- [x] L185: `rafId = null` — inside rAF callback
- [x] L204: `if (rafId !== null)` — cleanup guard
- [x] L206: `rafId = null` — cleanup assignment

## `src/web/scripts/editor/range-operations.js`

- [x] L66–67: JSDoc `|null` return type + "or null" comment
- [x] L71: `return null` — no range/tree guard
- [x] L76: `return null` — no start/end node guard
- [x] L88: `this.editor.treeRange = null` — clear after same-node delete
- [x] L98: `return null` — sibling index guard
- [x] L122: `siblings[i].parent = null` — detach removed nodes
- [x] L131: `this.editor.treeRange = null` — clear after cross-node delete

## `src/web/scripts/editor/index.js`

- [x] L71: JSDoc `SyntaxNode|null` return type
- [x] L74: `?? null` fallback
- [x] L181: JSDoc `SyntaxNode|null` return type
- [x] L184: `return null`
- [x] L192: JSDoc `string|null` return type
- [x] L195: `return null`
- [x] L202–203: JSDoc `string|null` param + `string|null` return type
- [x] L206: `return null`
- [x] L217: JSDoc `SyntaxNode|null` return type
- [x] L221: `return null`
- [x] L285: `/** @type {Node|null} */` cast
- [x] L362: `treeCursor?.nodeId ?? null`
- [x] L503: `return null`
- [x] L505: `return null`
- [x] L512: `return null`
- [x] L572: `this.currentFilePath = null`
- [x] L741: `currentNode.parent = null`
- [x] L894: `child.parent = null`
- [x] L910: `this.treeRange = null`
- [x] L1119: `this.treeRange = null`

## `src/web/scripts/editor/edit-operations/insert.js`

- [x] L14–15: JSDoc `string|null` + `let rangeDeleteBefore = null`

## `src/web/scripts/editor/edit-operations/enter.js`

- [x] L14–15: JSDoc `string|null` + `let rangeDeleteBefore = null`

## `src/web/scripts/editor/edit-operations/index.js`

- [x] L84: `node.parent = null`

## `src/web/scripts/editor/edit-operations/delete.js`

- [x] L117: `firstChild.parent = null`
- [x] L121: `next.parent = null`
- [x] L135: `next.parent = null`

## `src/web/scripts/editor/edit-operations/backspace.js`

- [x] L166: `node.parent = null`
- [x] L176: `node.parent = null`

## `src/web/scripts/editor/handlers/clipboard-handler.js`

- [x] L187: `m !== null` in regex loop — **EXCEPTION** (built-in API)\n- [x] L191: `m !== null` in regex loop — **EXCEPTION** (built-in API)

## `src/web/scripts/editor/handlers/event-handler.js`

- [x] L39: ternary `? event.target : null`
- [x] L44: ternary `: null`
- [x] L70: `/** @type {HTMLElement|null} */` cast
- [x] L76: `? findNodeById(nodeId) : null`
- [x] L103: `this.mouseDownLanguageTag = null`
- [x] L109: `/** @type {HTMLElement|null} */` cast
- [x] L110: `.closest?.() ?? null`
- [x] L113: `? findNodeById(nodeId) : null`
- [x] L131: `/** @type {HTMLElement|null} */` cast
- [x] L156: `this.mouseDownAnchor = null`
- [x] L175: `treeCursor?.nodeId ?? null`
- [x] L294: `currentNode.parent = null`
- [x] L345: `/** @type {HTMLElement|null} */` cast
- [x] L373: `/** @type {Node|null} */` cast
- [x] L403: `treeCursor?.nodeId ?? null`
- [x] L420: `this.mouseDownAnchor = null`
- [x] L430: `this.mouseDownLanguageTag = null`
- [x] L463: ternary `: null`
- [x] L464: `treeRange ? { ...treeRange } : null`

## `src/web/scripts/editor/handlers/menu-handler.js`

- [x] L40: `this.cleanupMenuListener = null`
- [x] L138: `result.filePath || null`
- [x] L153: `result.filePath || null`

## `src/web/scripts/editor/handlers/keyboard-handler.js`

- [x] L74: `this.keydownHandler = null`
- [x] L101: JSDoc `ShortcutConfig|null` return type
- [x] L109: `return null`
- [x] L157: `/** @type {HTMLElement|null} */` cast

## `src/web/scripts/editor/managers/undo-manager.js`

- [x] L40: JSDoc `Change|null` return type (×2)
- [x] L44: `return null`
- [x] L52: `return null`
- [x] L57: JSDoc `Change|null` return type (×2)
- [x] L61: `return null`
- [x] L69: `return null`

## `src/web/scripts/editor/managers/selection-manager.js`

- [x] L21: `this.currentSelection = null`
- [x] L22: `this.currentNode = null`
- [x] L89: `document.createTreeWalker(..., null)` — DOM API, leave as-is
- [x] L110: `this.currentNode = null`
- [x] L132: JSDoc `SelectionState|null` return type
- [x] L140: JSDoc `SyntaxNode|null` return type
- [x] L211: JSDoc `{node, offset}|null` return type
- [x] L215: `document.createTreeWalker(..., null)` — DOM API, leave as-is
- [x] L241: `return null`

## `src/web/scripts/editor/managers/cursor-manager.js`

- [x] L54: `this.editor.treeRange = null`
- [x] L61: `this.editor.treeRange = null`
- [x] L84: JSDoc `{cursor}|null` return type
- [x] L87–88: JSDoc `string|null` + `let inlineNodeId = null`
- [x] L90: `/** @type {Node|null} */` cast
- [x] L138: `return null`
- [x] L160: `document.createTreeWalker(..., null)` — DOM API, leave as-is
- [x] L280: `/** @type {Element|null} */` cast
- [x] L314: `document.createTreeWalker(..., null)` — DOM API, leave as-is
- [x] L394: JSDoc `{node, offset}|null` return type
- [x] L398: `return null`
- [x] L411: `document.createTreeWalker(..., null)` — DOM API, leave as-is
- [x] L429: `return null`

## `src/web/scripts/editor/managers/cursor-persistence.js`

- [x] L123: JSDoc `TreeCursor|null` return type (×2)
- [x] L131: JSDoc `TreeCursor|null` return type
- [x] L213: `return null`
- [x] L224: `return null`

## `src/web/scripts/editor/content-types/table/table-modal.js`

- [x] L16–17: JSDoc `TableData|null` + `existing = null`
- [x] L59: JSDoc `TableData|null` param
- [x] L62: `existing ?? null`

## `src/web/scripts/editor/content-types/table/table-manager.js`

- [x] L86–87: JSDoc `HTMLElement|null` + `let cell = null`
- [x] L88: `/** @type {Node|null} */` cast
- [x] L120: `document.createTreeWalker(..., null)` — DOM API, leave as-is
- [x] L142–143: JSDoc `HTMLTableCellElement|null` + `let cell = null`
- [x] L148: `headerRow?.cells[col] ?? null`
- [x] L154: `bodyRow?.cells[col] ?? null`
- [x] L159: `document.createTreeWalker(..., null)` — DOM API, leave as-is

## `src/web/scripts/editor/content-types/image/image-helper.js`

- [x] L115: `currentNode.parent = null` — detach replaced paragraph node

## `src/web/scripts/editor/formatters/source2-formatter.js`

- [x] L173: JSDoc `HTMLTextAreaElement|null` return type
- [x] L423: JSDoc comment "Returns null"
- [x] L426: JSDoc `{start, end}|null` return type
- [x] L430: `return null`
- [x] L438: `return null`

## `src/web/scripts/editor/renderers/source/index.js`

- [x] L107: JSDoc `DOMRect|null` return type
- [x] L110: `return null`
- [x] L115: `return null`
- [x] L134: `let savedCaretTop = null`
- [x] L179: `absoluteCursorOffset: null`
- [x] L181: `anchorNodeId: null`
- [x] L182: `savedOffsetFromTop: null`
- [x] L204: `absoluteCursorOffset !== null`
- [x] L214: `savedCaretTop !== null && absoluteCursorOffset !== null` (×2)
- [x] L225: `{ detail: { node: null } }`

## `src/web/scripts/editor/renderers/writing/index.js`

- [x] L221: `? children[children.length - 1] : null`
- [x] L264: JSDoc `HTMLElement|null` return type
- [x] L452–453: JSDoc `HTMLInputElement|null` + `let checkbox = null`
- [x] L495: `visualNumber != null` — loose equality, leave as `!= null` or change to `!= undefined`
- [x] L730–731: JSDoc `SyntaxNode|null` + `let summaryNode = null`
- [x] L1061: `let absoluteCursorOffset = null`
- [x] L1073: `let savedCaretTop = null`
- [x] L1093–1094: JSDoc `string|null` + `let anchorNodeId = null`
- [x] L1095: `let savedOffsetFromTop = null`
- [x] L1105: ternary `: null`
- [x] L1124: `dataset.nodeId ?? null`
- [x] L1162: `savedOffsetFromTop !== null`
- [x] L1173: `savedCaretTop !== null`

## `src/web/scripts/editor/syntax-highlighter/patterns.js`

- [x] L84: JSDoc `string|null` return type
- [x] L89: `return m ? m[0] : null`

## `src/web/scripts/utility/tab-bar/tab-bar.js`

- [x] L3: JSDoc `string|null`
- [x] L120: JSDoc `string|null` + "or null" text (×2)
- [x] L168: JSDoc `string|null`

## `src/web/scripts/utility/modal/base-modal.js`

- [x] L68: JSDoc "may be null/undefined"
- [x] L135–136: JSDoc `EventTarget|null` + `let mouseDownTarget = null`
- [x] L144: `mouseDownTarget = null`
- [x] L164: JSDoc "or `null` if cancelled"
- [x] L168: `Promise.resolve(null)`
- [x] L172: `/** @type {HTMLElement|null} */` cast
- [x] L191: `this.resolve(null)` — cancel signal
- [x] L214: `this.previousFocus = null`
- [x] L229: JSDoc `Element|null` return type
- [x] L232: `?? null`
- [x] L237: JSDoc `HTMLButtonElement|null` return type
- [x] L240–241: `/** @type {HTMLButtonElement|null} */` cast + `?? null`

## `src/web/scripts/utility/preferences/preferences-modal.js`

- [x] L462–463: JSDoc `Element|null` + `let closest = null`
- [x] L559: JSDoc comment "or `null`"
- [x] L561: JSDoc `string|null` return type
- [x] L571: `return null`
- [x] L776: `result.value !== null`
- [x] L814: `result.value !== null`
- [x] L833: `result.value !== null`
- [x] L852: `result.value !== null`

## `src/web/scripts/utility/word-count/word-count-modal.js`

- [x] L56: JSDoc `SyntaxTree|null` param
- [x] L141: JSDoc `SyntaxTree|null` param

## `src/web/scripts/utility/toc/toc.js`

- [x] L53: `this.lockedHeadingId = null`
- [x] L510: `this.observer = null`
- [x] L517: `this.scrollHandler = null`
- [x] L525: JSDoc `TableOfContents|null` param
- [x] L536: JSDoc `TableOfContents|null` param
- [x] L547: JSDoc `TableOfContents|null` param

## `src/web/scripts/utility/search/search-bar.js`

- [x] L196: `this.renderCompleteHandler = null`
- [x] L262: `/** @type {HTMLTextAreaElement|null} */` cast
- [x] L436: `m !== null` in regex loop — **leave as-is** (regex exec returns null)
- [x] L454: `m !== null` in regex loop — **leave as-is**
- [x] L540: `/** @type {HTMLTextAreaElement|null} */` cast
- [x] L615: `/** @type {Text|null} */` cast
- [x] L618: `/** @type {Text|null} */` cast in while loop

## `src/web/scripts/utility/toolbar/toolbar.js`

- [x] L323: `this.updateButtonStates(null)`
- [x] L624–625: JSDoc `TableData|null` + `let existing = null`
- [x] L678: JSDoc `SyntaxNode|null` param
- [x] L696: `/** @type {SyntaxNode|null} */` cast

## `src/electron/preload.cjs`

- [x] L97: JSDoc `string|null` type

## `scripts/generate-api-docs.js`

- [x] L49: `JSON.stringify(schema, null, 4)` — **leave as-is** (built-in API requires null)
- [x] L232: `return null`

### `test/unit/word-count/word-count-modal.test.js`

- [x] L12–13: `getWordCounts(null)` — test with null input (already updated in prior commit)

### `test/unit/editor/undo-manager.test.js`

- [x] L58: `assert.ok(change !== null)` (already updated in prior commit)
- [x] L63/65: test "return null" + `assert.strictEqual(change, null)` (already updated in prior commit)
- [x] L87: `assert.ok(change !== null)` (already updated in prior commit)
- [x] L92/94: test "return null" + `assert.strictEqual(change, null)` (already updated in prior commit)

### `test/unit/editor/cursor-persistence.test.js`

- [x] L179/182: test "returns null" + `assert.equal(cursor, null)` (already updated in prior commit)

### `test/integration/test-utils.js`

- [x] L135: `/** @type {HTMLElement|null} */` cast in `page.evaluate()` — leave as-is (DOM API)

## `src/types.d.ts`

- [x] L96: `number | null` for `absoluteCursorOffset` (already updated in prior commit)
- [x] L98: `number | null` for `savedCaretTop` (already updated in prior commit)
- [x] L100: `string | null` for `anchorNodeId` (already updated in prior commit)
- [x] L102: `number | null` for `savedOffsetFromTop` (already updated in prior commit)
- [x] L145–146: comment "or null" + `string | null` for `filePath`
- [x] L150: `TreeCursor | null` for `cursor`
- [x] L158: `TreeRange | null` for `treeRange`
- [x] L162: `string | null` for `tocActiveHeadingId`
- [x] L210: `string | null` in `notifyOpenFiles` param
- [x] L293–294: comment "or null" + `string | null` for `filePath`

## `src/web/scripts/editor/types.js`

> **⚠️ DO LAST** — This file declares class field types used everywhere. Changing it triggers cascades in almost every consumer. Process every other file first, then do types.js as the final pass.

This file is almost entirely JSDoc `|null` type annotations paired with `= null` class field initializers. Every field follows the same pattern: change `|null` → `|undefined` in the JSDoc and delete the `= null` initializer (uninitialized fields are `undefined` by default).

- [x] L39–40: `SyntaxTree|null` + `syntaxTree = null`
- [x] L77–78: `string|null` + `currentFilePath = null`
- [x] L89–90: `TreeRange|null` + `treeRange = null`
- [x] L91–92: `string|null` + `lastRenderedNodeId = null`
- [x] L100–101: `HTMLTextAreaElement|null` + `textarea = null`
- [x] L102–103: `HTMLPreElement|null` + `pre = null`
- [x] L113–114: `HTMLElement|null` + `mouseDownAnchor = null`
- [x] L115–116: `HTMLElement|null` + `mouseDownLanguageTag = null`
- [x] L117–118: `CodeLanguageModal|null` + `codeLanguageModal = null`
- [x] L128–129: `((event: KeyboardEvent) => void)|null` + `keydownHandler = null`
- [x] L137–138: `function|null` + `cleanupMenuListener = null`
- [x] L154–155: `SelectionState|null` + `currentSelection = null`
- [x] L156–157: `SyntaxNode|null` + `currentNode = null`
- [x] L180–181: `LinkModal|null` + `linkModal = null`
- [x] L187–188: `ImageModal|null` + `imageModal = null`
- [x] L215–216: `HTMLElement|null` + `toolbarElement = null`
- [x] L219–220: `HTMLButtonElement|null` + `viewModeToggle = null`
- [x] L221–222: `LinkModal|null` + `linkModal = null`
- [x] L223–224: `TableModal|null` + `tableModal = null`
- [x] L245–246: `HTMLElement|null` + `container = null`
- [x] L247–248: `HTMLInputElement|null` + `input = null`
- [x] L249–250: `HTMLElement|null` + `matchCount = null`
- [x] L265–266: `string|null` + `searchViewMode = null`
- [x] L269–270: `(() => void)|null` + `renderCompleteHandler = null`
- [x] L284–285: `((e: Event) => void)|null` + `scrollHandler = null`
- [x] L286–287: `string|null` + `lockedHeadingId = null`
- [x] L297–298: `string|null` + `activeTabId = null`
- [x] L299–300: `((tabId: string) => void)|null` + `onTabSelect = null`
- [x] L301–302: `((tabId: string) => void)|null` + `onTabClose = null`
- [x] L306–307: `HTMLDialogElement|null` + `dialog = null` (LinkModal)
- [x] L312–313: `HTMLElement|null` + `previousFocus = null`
- [x] L317–318: `HTMLDialogElement|null` + `dialog = null` (TableModal)
- [x] L324–325: `HTMLDialogElement|null` + `dialog = null` (ImageModal)
- [x] L337–338: `Editor|null` + `editor = null`
- [x] L339–340: `Toolbar|null` + `toolbar = null`
- [x] L341–342: `MenuHandler|null` + `menuHandler = null`
- [x] L343–344: `KeyboardHandler|null` + `keyboardHandler = null`
- [x] L345–346: `SearchBar|null` + `searchBar = null`
- [x] L347–348: `TableOfContents|null` + `toc = null`
- [x] L349–350: `TabBar|null` + `tabBar = null`
- [x] L355–356: `HTMLElement|null` + `scrollContainer = null`

### `test/integration/user-interaction/content/details-summary-input.spec.js`

- [x] L63: `return null` in page.evaluate
- [x] L66: `return para ? para.textContent : null` in page.evaluate

### `test/integration/user-interaction/interaction/source2-cursor-position.spec.js`

- [x] L43: `?? null` in page.evaluate
- [x] L54: `/** @type {HTMLTextAreaElement|null} */` cast — **leave as-is** (DOM API)

### `test/integration/user-interaction/interaction/range-handling.spec.js`

- [x] L79–82: `/** @type {Element|null} */` + `let startEl = null` + `/** @type {Element|null} */` + `let endEl = null` in page.evaluate

### `test/integration/user-interaction/interaction/paste.spec.js`

- [x] L126: `return null` in page.evaluate

### `test/integration/user-interaction/interaction/cursor-sync.spec.js`

- [x] L8: comment "non-null (or null after blur)" — update text
- [x] L42/57/74/92/110/131/144/167/189/207/215/223/241/255/264: `?? null` in page.evaluate (×15)
- [x] L260: `/** @type {HTMLElement|null} */` cast — **leave as-is** (DOM API)

### `test/integration/user-interaction/content/cursor-typing-delimiters.spec.js`

- [x] L62: `return null` in page.evaluate
- [x] L73: `return null` in page.evaluate
- [x] L78: `document.createTreeWalker(..., null)` — **leave as-is** (DOM API)

### `test/integration/user-interaction/content/code-block-language-tag.spec.js`

- [x] L174/211/224: `?? null` in page.evaluate (×3)
- [x] L245/260: `return null` in page.evaluate (×2)

### `test/integration/app-functionality/app/session-save.spec.js`

- [x] L62/128/130/132/143/265: `return null` in page.evaluate (×6)
- [x] L145/268: `?? null` in page.evaluate (×2)
- [x] L219/239: `.get('openFiles', null)` (×2)

### `test/integration/app-functionality/app/search.spec.js`

- [x] L485: `tc ? {...} : null` in page.evaluate
- [x] L500: `return null` in page.evaluate
- [x] L502: `?? null` in page.evaluate

### `test/integration/app-functionality/app/reload.spec.js`

- [x] L41–42: `cursorPath: null` + `tocHeadingPath: null`

### `test/integration/app-functionality/app/copy-file-path.spec.js`

- [x] L33: `?? null` in page.evaluate

### `test/integration/app-functionality/document/toc-scroll.spec.js`

- [x] L64: `return null` in page.evaluate

### `test/integration/app-functionality/document/toc-highlight.spec.js`

- [x] L159: `return null` in page.evaluate

### `test/integration/app-functionality/document/style-element-injection.spec.js`

- [x] L74/101/144: `h ? getComputedStyle(h).color : null` in page.evaluate (×3)

### `test/integration/app-functionality/document/details-collapse-toggle.spec.js`

- [x] L60/85: error message text "is null" — **leave as-is** (English text, not JS null)

### `test/integration/app-functionality/toolbar/bold-button.spec.js`

- [x] L73/92/256/293/346: `return null` in page.evaluate helpers (×5)
- [x] L237/242/276/279: `return null` guard in page.evaluate helpers (×4)
- [x] L327: `return null` in page.evaluate

### `test/integration/app-functionality/toolbar/italic-button.spec.js`

- [x] L66/84/230/266/316: `return null` in page.evaluate helpers (×5)
- [x] L213/216/249/252: `return null` guard in page.evaluate helpers (×4)
- [x] L298: `return null` in page.evaluate

### `test/integration/app-functionality/toolbar/strikethrough-button.spec.js`

- [x] L66/84/230/265/315: `return null` in page.evaluate helpers (×5)
- [x] L213/216/248/251: `return null` guard in page.evaluate helpers (×4)
- [x] L297: `return null` in page.evaluate

### `test/integration/app-functionality/toolbar/superscript-button.spec.js`

- [x] L69/87/135/186: `return null` in page.evaluate helpers (×4)
- [x] L118/121: `return null` guard in page.evaluate helpers (×2)
- [x] L168: `return null` in page.evaluate

### `test/integration/app-functionality/toolbar/subscript-button.spec.js`

- [x] L69/87/135/186: `return null` in page.evaluate helpers (×4)
- [x] L118/121: `return null` guard in page.evaluate helpers (×2)
- [x] L168: `return null` in page.evaluate

## Exceptions — DO NOT CHANGE

These occurrences of `null` should be left alone:

1. **SQL keywords**: `NOT NULL` in SQL strings (`settings-manager.js` L37), `'null'`/`'NULL'` in SQL syntax highlighter (`sql.js` L20, L126)
2. **`JSON.stringify(x, null, n)`**: Built-in API requires `null` as second arg (`generate-api-docs.js` L49)
3. **`document.createTreeWalker(el, filter, null)`**: DOM API requires `null` for optional filter (`selection-manager.js` L89/L215, `cursor-manager.js` L160/L314/L411, `table-manager.js` L120/L159, `cursor-typing-delimiters.spec.js` L78)
4. **`regex.exec() !== null`** in while loops: This is the canonical regex iteration pattern (`clipboard-handler.js` L187/L191, `inline-tokenizer.js` L62, `search-bar.js` L436/L454)
5. **`!= null` loose equality checks** that intentionally catch both null and undefined: These can stay as-is or be changed to `!== undefined` — noted per-item above
6. **Syntax-highlighter language constants**: These are language keyword/constant strings, not JS null values — `c.js` L83 (`nullptr`), L140 (`NULL`); `java.js` L94 (`null`); `json.js` L79 (`null`); `javascript.js` L90 (`null`); `php.js` L86 (`null`/`NULL`)

## Tests

Test files also contain `null` usage (assertions, setup values, evaluate callbacks). These should be updated to match the new source conventions after each source file is changed.
