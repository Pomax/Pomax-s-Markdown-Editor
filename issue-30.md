# Issue #30 — Turn the markdown parser into a library

## Goal

Extract the markdown parser into a standalone library at `@tooling/parser/` with its own test infrastructure, a spec-file-driven test format, and a public `Parser` singleton API. Closes #30.

## Key decisions

- Tree description format follows `parse-markdown.js` output (indented `type "content" {attrs}`, no line numbers)
- `toDOM(document)` on `SyntaxNode` and `SyntaxTree` — produces semantic DOM with `__st_node` back-references
- `toHTML(document)` is a thin wrapper: `this.toDOM(document).outerHTML`
- `toDOM`/`toHTML` must work in both browser (native `document`) and Node.js (`jsdom`)
- `jsdom` installed at root level; `@tooling/parser/package.json` has its own npm scripts but no duplicated dependencies
- Existing parser code in `src/renderer/scripts/parser/` is untouched
- Existing tests are untouched — they are read-only sources for building spec files

## Sources of parser-relevant tests to convert

Not just the 4 files in `test/unit/parser/` — all files that exercise markdown→tree or markdown→HTML conversions:

### Unit tests
1. `test/unit/parser/dfa-parser.test.js` (~93 tests — tokenizer, block parsing, round-trips)
2. `test/unit/parser/inline-tokenizer.test.js` (~37 tests — inline tokenization, tree building, delimiter matching)
3. `test/unit/parser/syntax-tree.test.js` (~59 tests — node ops, toMarkdown, toBareText, cursor paths)
4. `test/unit/parser/apply-format-html.test.js` (6 tests — HTML tag stripping via applyFormat)
5. `test/unit/editor/clipboard-handler.test.js` (may contain markdown parsing/round-trip assertions)
6. `test/unit/editor/undo-manager.test.js` (may set up parsed trees)
7. `test/unit/table/table-modal.test.js` (table parsing)

### Integration tests
8. `test/integration/user-interaction/interaction/source-view-editing.spec.js` (verifies node types/content after edits)
9. `test/integration/user-interaction/interaction/range-handling.spec.js` (toMarkdown round-trips)
10. `test/integration/user-interaction/interaction/paste.spec.js` (verifies syntax tree after paste)
11. `test/integration/user-interaction/interaction/cursor-sync.spec.js` (verifies tree cursor after edits)
12. All other integration specs in `test/integration/app-functionality/` and `test/integration/user-interaction/content/` that set up markdown content and assert on parsed structure

### Fixture files
13. All `.md` files in `test/fixtures/` — these are real markdown documents used by integration tests and represent edge cases the parser must handle

## Plan

### Phase 1 — Scaffolding

1. Create branch off up-to-date `main`
2. Install `jsdom` at root level
3. Create directory structure:
   ```
   @tooling/parser/
       src/
       tests/
           spec-files/
           unit/
       package.json
       index.js
       README.md
   ```
4. Create `@tooling/parser/package.json` with local npm scripts (test runner, spec validation, linting)

### Phase 2 — Parser library core

5. Copy the 4 parser source files into `@tooling/parser/src/` (unchanged)
6. Create `@tooling/parser/index.js` — singleton `Parser` exposing `parse(markdown)` → `SyntaxTree`
7. Add `toDOM(document)` to `SyntaxNode` and `SyntaxTree` — produces semantic HTML DOM nodes (`<h1>`–`<h6>`, `<p>`, `<blockquote>`, `<pre><code>`, `<ul>/<ol>/<li>` with proper grouping, `<hr>`, `<img>`, `<table>`, `<details>/<summary>`, inline: `<strong>/<em>/<del>/<code>/<a>/<sub>/<sup>`), each DOM node carries `__st_node` pointing to the originating `SyntaxNode`
8. Add `toHTML(document)` as thin wrapper: `this.toDOM(document).outerHTML`

### Phase 3 — Spec file infrastructure

9. Define the spec file format — one file per topic, multiple test cases per file separated by `---`:
   ```
   # title

   description

   # markdown

   ```
   raw markdown
   ```

   # syntax tree

   ```
   indented tree description (parse-markdown.js format, no line numbers)
   ```

   # html

   ```
   expected semantic HTML
   ```

   ---

   # markdown
   ...
   (repeated for each test case)
   ```
10. Create `verify-spec-files.js` — ESM Node.js script, validates format, `node verify-spec-files.js ./tests/spec-files`
11. Create spec-file test runner — reads each spec, verifies:
    - `parse(markdown)` produces the expected syntax tree
    - `tree.toMarkdown()` yields the original markdown
    - `tree.toHTML(document)` (via jsdom) yields the expected HTML

### Phase 4 — Populate spec files

12. Read through ALL test sources listed above (unit tests, integration tests, fixture files)
13. Convert every parser-relevant test case into a spec file — group related cases logically (e.g. `headings.md`, `code-blocks.md`, `lists.md`, `inline-formatting.md`, `tables.md`, `html-blocks.md`, `images.md`, `blockquotes.md`, `complex-documents.md`, etc.)

### Phase 5 — Documentation and finalization

14. Write `@tooling/parser/README.md` documenting the parser API, spec format, and how to run tests
15. Run full existing test suite to confirm nothing is broken
16. Ask for manual testing
17. Update docs if needed, final commit + PR comment (closes #30)

### Phase 6 — Refactor parser src files

18. Break the large source files into smaller logical units that import each other (e.g. separate block-level parsing helpers from the main DFA parser class, split SyntaxNode and SyntaxTree into their own files, extract inline segment-to-node conversion, etc.)
19. Remove all underscore prefixes from variables, properties, and methods — underscores do nothing in JS, they are just a bad naming convention
