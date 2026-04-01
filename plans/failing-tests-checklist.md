# Failing Tests Checklist

We removed the s`etSourceView` function from the codebase, and indiscriminantly renamed `getSourceView` in tests to `getSource2View`. This is incredibly wrong, because the two functions behave differently, but the important thing is that we go through every failing test, ONE BY ONE (not "more than one test at a time" or "all tests at the same time", you are ONLY allowed to examining A SINGLE TEST and fix it at a time), and determine whether the test needs fixing because it's still a good test, just using the wrong code, or whether the test is meaningless because source2 view (which is just a plain textarea) behaves nothing like source view (which was a DOM with markdown classes).

After every test that you update (rather than remove) you should run just that specific test to confirm that it works before moving on. You also need to ask me whether I agree with your assessment on whether to delete or fix before you modify the file it is in.

All test results AND DETAILS are found in the test-results.txt file. Integration tests may not be run to verify failures: the test-results.txt file fully captures all information.

Each test must be examined individually to determine whether it should be fixed or deleted.

And remember: the point of tests are **to test behaviour** and we **changed the underlying structure** so the job is to confirm that (A) **the tests still make sense at all** and if so (b) **how to rewrite them based on the fact that source2 is a textarea**

## search.spec.js
- [x] #30 :104 — plain text search highlights matches in source view (FIXED: implemented source2 highlight via pre mirror)
- [x] #33 :218 — Shift+Enter navigates to previous match (PASSED: cascade failure from prior test, no change needed)
- [x] #34 :301 — highlights are removed when search bar closes (PASSED: fixed by #30 highlight implementation)
- [x] #36 :342 — regex can match across element boundaries (DELETED: pointless in source2, regex works on plain text by definition)
- [x] #38 :287 — source view search matches markdown syntax — DELETED (trivially true for plain text)
- [x] #39 :397 — initial match is closest to cursor position — FIXED (source2 cursor via textarea selectionStart)
- [x] #41 :164 — regex search finds pattern matches — PASSED (cascade failure)
- [x] #44 :127 — plain text search is case insensitive by default — PASSED (cascade failure)
- [x] #50 :380 — regex search still works with single character — PASSED (cascade failure)

Missing:

- [x] test that search does NOT match the wrong thing in writing mode. (ADDED)
- [x] test that search highlights in code blocks in writing mode are placed correctly. (FIXED: walk .md-content instead of whole element; ADDED test)
- [x] test that verifies the cursor position does not change when exiting search via "esc": place cursor somewhere in document, search for "ckae" (won't find anything), then hit esc. The cursor should NOT move to the start of the document. (FIXED: close() now focuses textarea/placeCursor; ADDED tests for both views)
- [x] test that verifies the view is the same scroll position when searching for a term with zero hits rather than "wherever it was when it last matched something while typing". This needs a _large_ document (e.g. lorem fixture), the cursor in the middle, then search for "loremelephant" (typed as individual letters). By the time we have 0 results, the scroll position should be restored to where we were prior to starting the search. (FIXED: save scrollTop on open, restore when matches drop to zero; ADDED test)


## session-save.spec.js
- [x] #46 :151 — reopening the app restores cursor position and ToC heading (FIXED: increased test timeout to 30s — test launches two Electron instances)

## view-mode-dropdown.spec.js
- [x] #112 :95 — toggle stays in sync when view mode changes via menu (FIXED: removed defunct `source` mode step, now tests writing → source2 → writing)

## code-block-language-tag.spec.js
- [x] #263 :171 — cursor offset is correct in source view after changing language in writing view

## heading-input.spec.js
- [x] #274 :28 — typing "# main" letter by letter creates a heading with correct content (already passing)

## source-view-summary-edit.spec.js
- [x] #309 :42 — typing a character on the summary line in source view inserts it without rewriting the line (DELETED: source2 is a textarea, no DOM rewriting possible)

## click-outside-defocus.spec.js
- [x] #326 :122 — defocus is a no-op in source view (DELETED: trivially true for textarea, no syntax to hide)

## paste.spec.js
- [x] #356 :61 — single-line paste inserts text at cursor (source view) (DELETED: native textarea paste, nothing to test)
- [x] #371 :61 — multi-line paste creates correct node structure (source view) (DELETED: native textarea paste, nothing to test)
- [x] #372 :79 — paste replaces active selection (source view) (DELETED: native textarea behaviour)
- [x] #373 :96 — paste over multi-node selection removes intermediate nodes (source view) (DELETED: native textarea behaviour)
- [x] #374 :120 — pasting markdown heading creates a heading node (source view) (DELETED: parser doesn't care how text arrived)
- [x] #375 :139 — multi-line paste with CRLF line endings works correctly (source view) (FIXED: click textarea, read textarea value instead of getMarkdown)
- [x] #376 :156 — paste does not trigger a full render (source view) (DELETED: no rendering in textarea, concept doesn't apply)

## range-handling.spec.js
- [x] #387 :443 — cross-node copy produces markdown with block prefixes (already passing, original failure was afterAll hook timeout)

## inline-image.spec.js
- [x] #282 :74 — image syntax round-trips through source view correctly (FIXED: check textarea value instead of [data-node-id])
- [x] #283 :95 — removing ! in source view converts inline image to link (FIXED: use textarea + HOME constant for cross-platform)

## cursor-typing-delimiters.spec.js
- [x] #271 :203 — typing after closing ** produces plain text, not bold (FIXED: read textarea inputValue instead of [data-node-id])
- [x] #279 :147 — typing ***word*** renders as bold inside italic in source view (DELETED: just a toMarkdown unit test, not an integration test)
- [x] #280 :172 — typing after closing * produces plain text, not italic — DELETED (toMarkdown unit test)
- [x] #286 :226 — typing after closing ~~ produces plain text, not strikethrough — DELETED (toMarkdown unit test)

## subscript-button.spec.js
- [x] #193 :118 — subscript first word produces correct markdown — DELETED (toMarkdown unit test)
- [x] #194 :133 — subscript middle word produces correct markdown — DELETED (toMarkdown unit test)
- [x] #195 :148 — subscript first word of second paragraph produces correct markdown — DELETED (toMarkdown unit test)
- [x] #196 :165 — subscript middle word of second paragraph produces correct markdown — DELETED (toMarkdown unit test)
- [ ] #202 :272 — clicking subscript with cursor on a plain word applies subscript

## superscript-button.spec.js
- [ ] #203 :118 — superscript first word produces correct markdown
- [ ] #204 :133 — superscript middle word produces correct markdown
- [ ] #205 :148 — superscript first word of second paragraph produces correct markdown
- [ ] #207 :165 — superscript middle word of second paragraph produces correct markdown
- [ ] #208 :272 — clicking superscript with cursor on a plain word applies superscript

## code-block-enter.spec.js
- [ ] #240 :148 — source view: typing ``` + Enter creates an empty code block
- [ ] #241 :184 — source view: typing ```` + Enter creates a code block with fenceCount 4
- [ ] #242 :220 — source view: backtick fence text is not converted until Enter
- [ ] #260 :166 — source view: typing ```js + Enter creates a code block with language
- [ ] #261 :202 — source view: typing ``````js + Enter creates a code block with fenceCount 6 and language

## toolbar-active.spec.js
- [ ] #224 :296 — clicking italic button inside <em> tag strips the tag
- [ ] #227 :268 — clicking bold button inside <strong> tag strips the tag
- [ ] #229 :338 — clicking strikethrough button inside <s> tag strips the tag
- [ ] #247 :310 — clicking italic button inside <i> tag strips the tag
- [ ] #252 :282 — clicking bold button inside <b> tag strips the tag
- [ ] #262 :324 — clicking strikethrough button inside <del> tag strips the tag

## italic-button.spec.js
- [ ] #139 :114 — italicizing first word produces correct markdown
- [ ] #141 :146 — italicizing middle word produces correct markdown
- [ ] #144 :178 — italicizing first word of second paragraph produces correct markdown
- [ ] #149 :127 — toggling italic off restores plain text
- [ ] #150 :337 — clicking italic with cursor on a plain word italicizes that word
- [ ] #151 :159 — toggling italic off middle word restores plain text
- [ ] #153 :195 — italicizing middle word of second paragraph produces correct markdown

## cursor-sync.spec.js
- [ ] #332 :47 — cursors sync after typing text
- [ ] #334 :136 — cursors sync after backspace merges paragraphs
- [ ] #335 :79 — cursors sync after backspace
- [ ] #336 :115 — cursors sync after Enter splits a paragraph
- [ ] #341 :238 — cursors sync after creating and exiting a list item
- [ ] #342 :290 — treeCursor persists after blur in writing view
- [ ] #346 :157 — cursors sync after clicking a different node

## bold-button.spec.js
- [ ] #113 :124 — bolding first word produces correct markdown
- [ ] #114 :160 — bolding middle word produces correct markdown
- [ ] #115 :194 — bolding first word of second paragraph produces correct markdown
- [ ] #117 :367 — clicking bold with cursor on a plain word bolds that word
- [ ] #123 :173 — toggling bold off middle word restores plain text
- [ ] #125 :137 — toggling bold off restores plain text
- [ ] #126 :214 — bolding middle word of second paragraph produces correct markdown
- [ ] #128 :382 — clicking bold with cursor inside bold text removes bold

## strikethrough-button.spec.js
- [ ] #183 :146 — strikethrough middle word produces correct markdown
- [ ] #184 :178 — strikethrough first word of second paragraph produces correct markdown
- [ ] #187 :114 — strikethrough first word produces correct markdown
- [ ] #192 :336 — clicking strikethrough with cursor on a plain word applies strikethrough
- [ ] #197 :159 — toggling strikethrough off middle word restores plain text
- [ ] #198 :195 — strikethrough middle word of second paragraph produces correct markdown
- [ ] #199 :127 — toggling strikethrough off restores plain text
- [ ] #200 :349 — clicking strikethrough with cursor inside struck-through text removes it

## checklist.spec.js
- [ ] #118 :40 — source view renders checklist prefix for unchecked item
- [ ] #121 :76 — clicking checklist button converts paragraph to checklist item
- [ ] #122 :112 — clicking bullet button on checklist item switches to bullet list
- [ ] #124 :168 — clicking checklist button on ordered list switches to checklist
- [ ] #127 :49 — source view renders checklist prefix for checked item
- [ ] #129 :94 — clicking checklist button on checklist item toggles back to paragraph
- [ ] #130 :132 — clicking ordered button on checklist item switches to ordered list
- [ ] #131 :244 — Enter on empty checklist item exits to paragraph
- [ ] #132 :186 — clicking checkbox in writing view toggles checked state
- [ ] #133 :383 — multi-select across html-block converts all nodes to checklist after confirm
- [ ] #140 :150 — clicking checklist button on bullet list switches to checklist
- [ ] #142 :266 — switching entire contiguous checklist run to bullet via toolbar
- [ ] #145 :219 — Enter key in checklist item creates new unchecked checklist item
- [ ] #148 :465 — typing x into checkbox brackets in source view checks the item

## list.spec.js
- [ ] #154 :88 — clicking bullet list button on bullet list item toggles back to paragraph
- [ ] #155 :45 — clicking bullet list button converts paragraph to unordered list item
- [ ] #156 :177 — heading button on list item converts to heading
- [ ] #157 :126 — Enter key in a list item creates a new list item
- [ ] #159 :230 — source view: Enter between marker and content splits into empty item and new item
- [ ] #160 :286 — switching list type converts the entire contiguous list
- [ ] #161 :155 — Enter on empty list item exits the list to a paragraph
- [ ] #162 :107 — clicking numbered list button on bullet list item switches to ordered
- [ ] #163 :335 — pasting multi-line markdown with list items creates correct nodes
- [ ] #164 :67 — clicking numbered list button converts paragraph to ordered list item
- [ ] #165 :201 — Enter in ordered list creates item with incremented number
- [ ] #167 :262 — toggling off a list item converts the entire contiguous list to paragraphs
- [ ] #168 :310 — Enter on empty middle ordered item renumbers remaining items
- [ ] #172 :372 — pasting multi-line markdown with CRLF line endings parses correctly

## source-view-prefix-edit.spec.js
- [ ] #284 :119 — Heading1 prefix: insert in prefix
- [ ] #285 :183 — Heading2 prefix: delete in prefix
- [ ] #287 :135 — Heading1 prefix: delete in prefix
- [ ] #288 :241 — Blockquote prefix: backspace in prefix
- [ ] #289 :197 — Heading2 prefix: backspace in prefix
- [ ] #290 :301 — Ordered list prefix: insert in prefix
- [ ] #291 :360 — Checklist prefix: delete in prefix
- [ ] #292 :419 — Code fence three ticks: backspace on opening fence
- [ ] #293 :151 — Heading1 prefix: backspace in prefix
- [ ] #294 :213 — Blockquote prefix: insert in prefix
- [ ] #295 :257 — Unordered list prefix: insert in prefix
- [ ] #296 :478 — Code fence eight ticks: insert on opening fence
- [ ] #297 :375 — Checklist prefix: backspace in prefix
- [ ] #298 :315 — Ordered list prefix: delete in prefix
- [ ] #299 :434 — Code fence three ticks with language: insert in language tag
- [ ] #300 :540 — Code fence eight ticks with language: delete in language tag
- [ ] #301 :169 — Heading2 prefix: insert in prefix
- [ ] #302 :494 — Code fence eight ticks: delete on opening fence
- [ ] #303 :227 — Blockquote prefix: delete in prefix
- [ ] #304 :271 — Unordered list prefix: delete in prefix
- [ ] #305 :392 — Code fence three ticks: insert on opening fence
- [ ] #306 :329 — Ordered list prefix: backspace in prefix
- [ ] #307 :448 — Code fence three ticks with language: delete in language tag
- [ ] #308 :554 — Code fence eight ticks with language: backspace in language tag
- [ ] #310 :509 — Code fence eight ticks: backspace on opening fence
- [ ] #312 :345 — Checklist prefix: insert in prefix
- [ ] #313 :285 — Unordered list prefix: backspace in prefix
- [ ] #314 :406 — Code fence three ticks: delete on opening fence
- [ ] #315 :462 — Code fence three ticks with language: backspace in language tag
- [ ] #317 :525 — Code fence eight ticks with language: insert in language tag
