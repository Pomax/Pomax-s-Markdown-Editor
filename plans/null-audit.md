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

## `src/web/scripts/editor/syntax-highlighter/sql.js`

- [ ] L20: `'null'` in keyword list — **leave as-is** (SQL keyword, not JS null)
- [ ] L126: `'NULL'` in constants set — **leave as-is** (SQL constant)

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

- [ ] L97: JSDoc `string|null` type

## `src/types.d.ts`

- [ ] L96: `number | null` for `absoluteCursorOffset`
- [ ] L98: `number | null` for `savedCaretTop`
- [ ] L100: `string | null` for `anchorNodeId`
- [ ] L102: `number | null` for `savedOffsetFromTop`
- [x] L145–146: comment "or null" + `string | null` for `filePath`
- [x] L150: `TreeCursor | null` for `cursor`
- [x] L158: `TreeRange | null` for `treeRange`
- [x] L162: `string | null` for `tocActiveHeadingId`
- [x] L210: `string | null` in `notifyOpenFiles` param
- [x] L293–294: comment "or null" + `string | null` for `filePath`

## `scripts/generate-api-docs.js`

- [ ] L49: `JSON.stringify(schema, null, 4)` — **leave as-is** (built-in API requires null)
- [ ] L232: `return null`

## Parsers — `src/parsers/old/`

### `src/parsers/old/dfa-tokenizer.js`

- [ ] L14: JSDoc `DFATokenType|null` return type (×2)
- [ ] L62: `return null`
- [ ] L89: `if (type === null)` comparison

### `src/parsers/old/syntax-tree.js`

- [ ] L261: JSDoc `TreeCursor|null` type
- [ ] L263: `this.treeCursor = null`
- [x] L271: `node.parent = null`
- [x] L284: `node.parent = null`
- [ ] L293: JSDoc `SyntaxNode|null` return type
- [ ] L305: `return null`
- [ ] L312: JSDoc `SyntaxNode|null` return type
- [ ] L324: `return null`
- [ ] L333: JSDoc `SyntaxNode|null` return type
- [ ] L341: `return null`
- [ ] L524: JSDoc comment "or `null`"
- [ ] L538: JSDoc `|null` return type
- [ ] L562: `return null`
- [ ] L594: `return null`
- [ ] L618: `return null`
- [ ] L674: `return null`
- [ ] L808: JSDoc comment "Returns `null`"
- [ ] L811: JSDoc `number[]|null` return type
- [ ] L818: `return null`
- [ ] L843: `return null`
- [ ] L855: JSDoc comment "`null`"
- [ ] L858: JSDoc `number[]|null` param
- [ ] L884: JSDoc comment "Returns `null`"
- [ ] L887: JSDoc `number[]|null` return type
- [ ] L912: `return ... ? path : null`
- [ ] L919: JSDoc comment "Returns `null`"
- [ ] L921: JSDoc `number[]|null` param
- [ ] L922: JSDoc `SyntaxNode|null` return type
- [ ] L925: `return null`
- [ ] L930: `return null`
- [ ] L934: `return null`
- [x] L953: `matched.parent !== null` comparison
- [x] L954: `matched.parent = null`
- [x] L961: `nc.parent !== null` comparison
- [x] L962: `nc.parent = null`

### `src/parsers/old/syntax-node.js`

- [x] L72: JSDoc `SyntaxNode|null` type
- [x] L74: `this.parent = null`
- [x] L203: `child.parent = null`

### `src/parsers/old/dfa-parser.js`

- [ ] L155: JSDoc `SyntaxNode|null` return type
- [ ] L247: JSDoc `SyntaxNode|null` return type
- [ ] L261: `return null`
- [ ] L284: JSDoc `SyntaxNode|null` return type
- [ ] L313: `return null`
- [ ] L592: JSDoc comment "Returns null"
- [ ] L594: JSDoc `SyntaxNode|null` return type
- [ ] L600–643: many `return null` (parse failure early-returns)
- [ ] L659: JSDoc comment "Returns null"
- [ ] L661: JSDoc `SyntaxNode|null` return type
- [ ] L667–732: many `return null` (parse failure early-returns)
- [ ] L931: JSDoc comment "or null"
- [ ] L935: JSDoc `{name, count}|null` return type
- [ ] L939: `return null`
- [ ] L1069: JSDoc comment "Returns null"
- [ ] L1071: JSDoc `string|null` return type
- [ ] L1074: `return null`
- [ ] L1076: `return null`
- [ ] L1256: JSDoc `SyntaxNode|null` return type
- [ ] L1286: `return null`

### `src/parsers/old/inline-tokenizer.js`

- [ ] L62: `m !== null` in regex loop — **leave as-is**

## Parsers — `src/parsers/new/src/`

### `src/parsers/new/src/syntax-tree/syntax-node.js`

- [ ] L58: JSDoc `SyntaxNode|null` type
- [ ] L60: `this.parent = null`
- [ ] L76: JSDoc comment "null until rendered"
- [ ] L77: JSDoc `Element|null` type
- [ ] L79: `this.domNode = null`
- [ ] L134: `child.parent = null`

### `src/parsers/new/src/syntax-tree/syntax-tree.js`

- [ ] L25: JSDoc comment "parent = null"
- [ ] L30: `node.parent = null`
- [ ] L51: `node.parent = null`

### `src/parsers/new/src/syntax-tree/tree-utils.js`

- [ ] L30: JSDoc `SyntaxNode|null` return type
- [ ] L38: `return null`
- [ ] L47: JSDoc `SyntaxNode|null` return type
- [ ] L53–54: `child.startLine != null && child.endLine != null` — loose equality, catches both
- [ ] L62: `return null`
- [ ] L67: JSDoc comment "or null"
- [ ] L69: JSDoc `SyntaxNode|null` return type
- [ ] L73: `while (current != null)` — loose equality
- [ ] L74: JSDoc comment "return null"
- [ ] L75: `return null`
- [ ] L80: `return null`
- [ ] L105: JSDoc `number[]|null` return type
- [ ] L114: `return null`
- [ ] L121: JSDoc `SyntaxNode|null` return type
- [ ] L124: `return null`
- [ ] L129: `return null`

### `src/parsers/new/src/syntax-tree/tree-selection.js`

- [ ] L117: JSDoc `number[]|null` return type
- [ ] L139: `return null`
- [ ] L147: JSDoc comment "or null"
- [ ] L151: JSDoc `number[]|null` param
- [ ] L152: JSDoc `TreePosition|null` return type
- [ ] L155: `return null`
- [ ] L156: `return null`
- [ ] L161: `return null`
- [ ] L168: `return null`

### `src/parsers/new/src/syntax-tree/tree-mutations.js`

- [ ] L142: `selection: null`
- [ ] L266: JSDoc comment "or `null`"
- [ ] L272: JSDoc `|null` return type
- [ ] L296: `return null`
- [ ] L305: `return null`
- [ ] L328: `return null`
- [ ] L381: `return null`
- [ ] L521: JSDoc `SyntaxNode|null` return type
- [ ] L524: `return null`
- [ ] L526: `return null`
- [ ] L528: `return cell ?? null`
- [ ] L584: `let headerCell = null`
- [ ] L610: `selection: null`
- [ ] L621: `selection: null`
- [ ] L636: `selection: null`
- [ ] L653: `selection: null`
- [ ] L716: JSDoc `SyntaxNode|null` in parseFn param
- [ ] L718: JSDoc `selection: null` in return type (×2)
- [ ] L719: JSDoc comment "or null"
- [ ] L732: `return null`
- [ ] L740: `return null`
- [ ] L751: `selection: null`
- [ ] L759: JSDoc comment "returned null"
- [ ] L764: `return null`
- [ ] L771: JSDoc comment "`null`"

### `src/parsers/new/src/parser/dfa-parser.js`

- [ ] L165: JSDoc `SyntaxNode|null` return type
- [ ] L259: JSDoc `SyntaxNode|null` return type
- [ ] L273: `return null`
- [ ] L295: JSDoc `SyntaxNode|null` return type
- [ ] L324: `return null`
- [ ] L712: JSDoc comment "Returns null"
- [ ] L714: JSDoc `SyntaxNode|null` return type
- [ ] L720–763: many `return null` (parse failure early-returns)
- [ ] L779: JSDoc comment "Returns null"
- [ ] L781: JSDoc `SyntaxNode|null` return type
- [ ] L787–852: many `return null` (parse failure early-returns)
- [ ] L984: JSDoc comment "or null"
- [ ] L988: JSDoc `{name, count}|null` return type
- [ ] L992: `return null`
- [ ] L1026: JSDoc comment "Returns null"
- [ ] L1028: JSDoc `string|null` return type
- [ ] L1031: `return null`
- [ ] L1033: `return null`
- [ ] L1189: JSDoc `SyntaxNode|null` return type
- [ ] L1219: `return null`

### `src/parsers/new/src/parser/dfa-tokenizer.js`

- [ ] L27: JSDoc `DFATokenType|null` return type (×2)
- [ ] L75: `return null`
- [ ] L102: `if (type === null)` comparison

### `src/parsers/new/src/parser/inline-tokenizer.js`

- [ ] L62: `m !== null` in regex loop — **leave as-is**

### `src/parsers/new/src/parser/parse-line.js`

- [ ] L21: JSDoc `SyntaxNode|null` return type
- [ ] L23: JSDoc comment "or null"
- [ ] L26: `return null`
- [ ] L40: `return null`
- [ ] L52: JSDoc comment "returns null"

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

### `test/unit/word-count/word-count-modal.test.js`

- [ ] L12–13: `getWordCounts(null)` — test with null input

### `test/unit/editor/undo-manager.test.js`

- [ ] L58: `assert.ok(change !== null)`
- [ ] L63/65: test "return null" + `assert.strictEqual(change, null)`
- [ ] L87: `assert.ok(change !== null)`
- [ ] L92/94: test "return null" + `assert.strictEqual(change, null)`

### `test/unit/parser/syntax-tree.test.js`

- [ ] L76: `assert.strictEqual(child.parent, null)`
- [ ] L214/216: test "return null" + `assert.strictEqual(found, null)`
- [ ] L231/238: test "return null" + `assert.strictEqual(found, null)`
- [ ] L392–396: test "null when treeCursor is null" + `tree.treeCursor = null` + assertion
- [ ] L399/403: test "null when cursor node not in tree" + assertion
- [ ] L497–502: test "does nothing when path is null" + `setCursorPath(null)` + assertions
- [ ] L508/510/516/518/534: `tree.treeCursor = null` setup

### `test/unit/parser/update-using.test.js`

- [ ] L277/284: test "sets parent to null" + `assert.strictEqual(child.parent, null)`

### `test/unit/editor/cursor-persistence.test.js`

- [ ] L179/182: test "returns null" + `assert.equal(cursor, null)`

### `test/integration/test-utils.js`

- [ ] L135: `/** @type {HTMLElement|null} */` cast in `page.evaluate()`

### `test/integration/` files

Many integration tests use `null` in `page.evaluate()` callbacks and assertions — these should all be updated to use `undefined` where the source code now returns/assigns `undefined` instead of `null`.

## `src/web/scripts/editor/types.js`

> **⚠️ DO LAST** — This file declares class field types used everywhere. Changing it triggers cascades in almost every consumer. Process every other file first, then do types.js as the final pass.

This file is almost entirely JSDoc `|null` type annotations paired with `= null` class field initializers. Every field follows the same pattern: change `|null` → `|undefined` in the JSDoc and delete the `= null` initializer (uninitialized fields are `undefined` by default).

- [ ] L39–40: `SyntaxTree|null` + `syntaxTree = null`
- [x] L77–78: `string|null` + `currentFilePath = null`
- [x] L89–90: `TreeRange|null` + `treeRange = null`
- [x] L91–92: `string|null` + `lastRenderedNodeId = null`
- [ ] L100–101: `HTMLTextAreaElement|null` + `textarea = null`
- [ ] L102–103: `HTMLPreElement|null` + `pre = null`
- [ ] L113–114: `HTMLElement|null` + `mouseDownAnchor = null`
- [ ] L115–116: `HTMLElement|null` + `mouseDownLanguageTag = null`
- [ ] L117–118: `CodeLanguageModal|null` + `codeLanguageModal = null`
- [ ] L128–129: `((event: KeyboardEvent) => void)|null` + `keydownHandler = null`
- [ ] L137–138: `function|null` + `cleanupMenuListener = null`
- [ ] L154–155: `SelectionState|null` + `currentSelection = null`
- [ ] L156–157: `SyntaxNode|null` + `currentNode = null`
- [ ] L180–181: `LinkModal|null` + `linkModal = null`
- [ ] L187–188: `ImageModal|null` + `imageModal = null`
- [ ] L215–216: `HTMLElement|null` + `toolbarElement = null`
- [ ] L219–220: `HTMLButtonElement|null` + `viewModeToggle = null`
- [ ] L221–222: `LinkModal|null` + `linkModal = null`
- [ ] L223–224: `TableModal|null` + `tableModal = null`
- [ ] L245–246: `HTMLElement|null` + `container = null`
- [ ] L247–248: `HTMLInputElement|null` + `input = null`
- [ ] L249–250: `HTMLElement|null` + `matchCount = null`
- [ ] L265–266: `string|null` + `searchViewMode = null`
- [ ] L269–270: `(() => void)|null` + `renderCompleteHandler = null`
- [ ] L284–285: `((e: Event) => void)|null` + `scrollHandler = null`
- [x] L286–287: `string|null` + `lockedHeadingId = null`
- [ ] L297–298: `string|null` + `activeTabId = null`
- [ ] L299–300: `((tabId: string) => void)|null` + `onTabSelect = null`
- [ ] L301–302: `((tabId: string) => void)|null` + `onTabClose = null`
- [ ] L306–307: `HTMLDialogElement|null` + `dialog = null` (LinkModal)
- [ ] L312–313: `HTMLElement|null` + `previousFocus = null`
- [ ] L317–318: `HTMLDialogElement|null` + `dialog = null` (TableModal)
- [ ] L324–325: `HTMLDialogElement|null` + `dialog = null` (ImageModal)
- [ ] L337–338: `Editor|null` + `editor = null`
- [ ] L339–340: `Toolbar|null` + `toolbar = null`
- [ ] L341–342: `MenuHandler|null` + `menuHandler = null`
- [ ] L343–344: `KeyboardHandler|null` + `keyboardHandler = null`
- [ ] L345–346: `SearchBar|null` + `searchBar = null`
- [ ] L347–348: `TableOfContents|null` + `toc = null`
- [ ] L349–350: `TabBar|null` + `tabBar = null`
- [ ] L355–356: `HTMLElement|null` + `scrollContainer = null`
