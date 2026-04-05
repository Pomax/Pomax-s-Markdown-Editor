## Plan: Replace Old Parser with New Parser

The old parser ([src/parsers/old/](src/parsers/old/)) is deeply integrated across 10 production files and ~9 test files. The new parser ([src/parsers/new/](src/parsers/new/)) already implements **most** of the needed functionality internally but only exports 6 symbols from its root [src/parsers/new/index.js](src/parsers/new/index.js). The work breaks down into parser-side gaps, editor-side rewrites, and type-name reconciliation.

---

### Phase 1 — New Parser: Expand Exports & Fill Gaps *(all in [src/parsers/new/](src/parsers/new/))*

1. **Add `clone()` to `SyntaxNode` and `SyntaxTree`** — deep copy for undo snapshots and clipboard. New IDs, no `domNode`/`runtime` copy. *(Files: [src/parsers/new/src/syntax-tree/syntax-node.js](src/parsers/new/src/syntax-tree/syntax-node.js), [src/parsers/new/src/syntax-tree/syntax-tree.js](src/parsers/new/src/syntax-tree/syntax-tree.js))*
2. **Add `getNodeCount()` to tree-utils** — recursive node count for word-count modal. *(File: [src/parsers/new/src/syntax-tree/tree-utils.js](src/parsers/new/src/syntax-tree/tree-utils.js))*
3. **Expand root exports in [src/parsers/new/index.js](src/parsers/new/index.js)** — re-export all 7 tree-utils, 15 tree-mutations, 8 tree-selection functions, `tokenizeInline`, `findMatchedTokenIndices`, `parseInlineContent`, and 4 renderer functions. Currently only 6 symbols are exported.
4. **Run new parser's own tests** to verify nothing breaks.

### Phase 2 — Editor: Update Import Paths *(mechanical, parallel with Phase 1)*

Change all imports from `parsers/old/*` to `parsers/new` in 10 production files:

| File | Key change |
|------|-----------|
| editor/index.js | `parser.parse(text)` → `parse(text)` |
| source/index.js | Same parser import change |
| writing/index.js | Drop `buildInlineTree` — inline children are already on nodes |
| [src/web/scripts/editor/offset-mapping.js](src/web/scripts/editor/offset-mapping.js) | Import `tokenizeInline`, `findMatchedTokenIndices` from new parser |
| [src/web/scripts/editor/handlers/event-handler.js](src/web/scripts/editor/handlers/event-handler.js) | Import `SyntaxNode` from new parser |
| edit-operations/index.js | + import standalone mutation functions |
| [src/web/scripts/editor/edit-operations/enter.js](src/web/scripts/editor/edit-operations/enter.js) | Same |
| [src/web/scripts/editor/range-operations.js](src/web/scripts/editor/range-operations.js) | Same |
| [src/web/scripts/editor/content-types/image/image-helper.js](src/web/scripts/editor/content-types/image/image-helper.js) | Same |
| [scripts/parse-markdown.js](scripts/parse-markdown.js) | `parser.parse()` → `parse()` |

### Phase 3 — Editor: API Shape Migration *(depends on Phase 1+2)*

The old parser uses instance methods; the new parser uses standalone functions.

1. **Tree queries** — `tree.findNodeById(id)` → `findNodeById(tree, id)`; same pattern for `findNodeAtPosition`, `getBlockParent`, `isInlineNode`, `toBareText`, `getNodeCount`
2. **Tree mutations** — `tree.changeNodeType(node, type)` → `changeNodeType(node, type)`; `tree.applyFormat(...)` → `applyFormat(...)`; `node.insertBefore(new, ref)` → `node.insertChild(new, node.children.indexOf(ref))`
3. **Content setter → explicit `rebuildInlineChildren()`** — **HIGHEST RISK ITEM.** Every `node.content = newText` on paragraph/heading/blockquote/list-item must be followed by `rebuildInlineChildren(node)`. Missing one = stale inline children = broken rendering. Must audit every assignment in edit-operations/index.js, [src/web/scripts/editor/edit-operations/enter.js](src/web/scripts/editor/edit-operations/enter.js), [src/web/scripts/editor/range-operations.js](src/web/scripts/editor/range-operations.js), [src/web/scripts/editor/handlers/event-handler.js](src/web/scripts/editor/handlers/event-handler.js).
4. **Cursor management** — simplest path: add `treeCursor` property to new `SyntaxTree` (avoids massive refactor). Path serialization: `getPathToCursor(tree, cursor)` / `setCursorFromPath(tree, path)`.
5. **Async `toMarkdown()`** — new parser's `node.toMarkdown()` is async. Every call site must `await`.

### Phase 4 — Editor: Type Name Reconciliation (~17+ call sites)

1. **`linked-image` → `image` + `attributes.href`** — ~7 sites checking `type === 'linked-image'` → `type === 'image' && node.attributes.href`
2. **`html-block` → `html-element`** — ~10 sites
3. **Inline HTML: `child.attributes.tag` → `child.tagName`** — writing renderer inline dispatch
4. **Image attributes: `attributes.url` → `attributes.src`** — wherever image URL is accessed
5. **`table-cell` → `cell`** — if used anywhere

### Phase 5 — Writing Renderer Updates *(depends on Phase 3+4)*

- Remove `buildInlineTree` / `appendSegments` fallback — inline children are already `SyntaxNode` objects on `node.children`
- Handle potential `list` wrapper node — new parser may produce `list` → `list-item` hierarchy vs old parser's flat `list-item` nodes
- Inline node structure: `tagName` is top-level property, not in `attributes`

### Phase 6 — Tests (~9 unit test files) *(parallel with Phase 3-5)*

Update imports, instance→standalone calls, type names, and add `rebuildInlineChildren()` where tests set `node.content`. Files: `dfa-parser.test.js`, `syntax-tree.test.js`, `apply-format-html.test.js`, `inline-tokenizer.test.js`, `tree-diffing.test.js`, `update-using.test.js`, `cursor-persistence.test.js`, `clipboard-handler.test.js`, `word-count-modal.test.js`.

### Phase 7 — Integration Tests & Manual Verification

Run full suite, then manually test: mixed inline formatting, source↔writing view switching, toolbar buttons, undo/redo, paste, HTML blocks, images/linked-images, tables, code blocks, checklists.

---

### Edge Cases & Risks

| Risk | Severity | Detail |
|------|----------|--------|
| **Missing `rebuildInlineChildren()`** | HIGH | Silent stale children; one missed `node.content =` assignment breaks rendering |
| **`list` wrapper node** | MEDIUM | If new parser wraps list-items in a `list` container, rendering logic needs restructuring |
| **Async `toMarkdown()`** | MEDIUM | Old was sync, new is async — missing `await` will produce `[object Promise]` |
| **Fuzzy matching regression** | MEDIUM | Old uses Levenshtein fuzzy match; new uses exact+positional. Large edits may lose node identity → full re-renders instead of surgical DOM updates |
| **`url` → [src](src) attribute rename** | LOW | Image attribute name difference could cause broken images |
| **Inline token differences** | LOW | If `tokenizeInline` produces different token types/structure, offset-mapping breaks subtly |

### Decisions

- **Direct migration** (change editor code) rather than adapter/wrapper — cleaner, no ongoing indirection
- **`treeCursor`**: add property to new SyntaxTree rather than refactoring all cursor code out
- **`buildInlineTree` removal**: writing renderer walks `node.children` (SyntaxNodes) instead of InlineSegments
- **Excluded**: not changing new parser's matching algorithm (accept behavioral difference)

### Scale Summary

- **~4** small additions to the new parser
- **~10** production files to modify
- **~9** test files to modify
- **~17+** type-name call sites
- Every `node.content =` assignment needs audit
- High integration-test risk due to many subtle interactions
