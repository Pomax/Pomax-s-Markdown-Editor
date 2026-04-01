# Failing Tests Checklist

We removed the s`etSourceView` function from the codebase, and indiscriminantly renamed `getSourceView` in tests to `getSource2View`. This is incredibly wrong, because the two functions behave differently, but the important thing is that we go through every failing test, ONE BY ONE (not "more than one test at a time" or "all tests at the same time", you are ONLY allowed to examining A SINGLE TEST and fix it at a time), and determine whether the test needs fixing because it's still a good test, just using the wrong code, or whether the test is meaningless because source2 view (which is just a plain textarea) behaves nothing like source view (which was a DOM with markdown classes).

After every test that you update (rather than remove) you should run just that specific test to confirm that it works before moving on. You also need to ask me whether I agree with your assessment on whether to delete or fix before you modify the file it is in.

Each test must be examined individually to determine whether it should be fixed or deleted.

## search.spec.js
- [ ] #30 :104 — plain text search highlights matches in source view
- [ ] #33 :218 — Shift+Enter navigates to previous match
- [ ] #34 :301 — highlights are removed when search bar closes
- [ ] #36 :342 — regex can match across element boundaries
- [ ] #38 :287 — source view search matches markdown syntax
- [ ] #39 :397 — initial match is closest to cursor position
- [ ] #41 :164 — regex search finds pattern matches
- [ ] #44 :127 — plain text search is case insensitive by default
- [ ] #50 :380 — regex search still works with single character

## session-save.spec.js
- [ ] #46 :151 — reopening the app restores cursor position and ToC heading

## view-mode-dropdown.spec.js
- [ ] #112 :95 — toggle stays in sync when view mode changes via menu

## bold-button.spec.js
- [ ] #113 :124 — bolding first word produces correct markdown
- [ ] #114 :160 — bolding middle word produces correct markdown
- [ ] #115 :194 — bolding first word of second paragraph produces correct markdown
- [ ] #117 :367 — clicking bold with cursor on a plain word bolds that word
- [ ] #123 :173 — toggling bold off middle word restores plain text
- [ ] #125 :137 — toggling bold off restores plain text
- [ ] #126 :214 — bolding middle word of second paragraph produces correct markdown
- [ ] #128 :382 — clicking bold with cursor inside bold text removes bold

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

## italic-button.spec.js
- [ ] #139 :114 — italicizing first word produces correct markdown
- [ ] #141 :146 — italicizing middle word produces correct markdown
- [ ] #144 :178 — italicizing first word of second paragraph produces correct markdown
- [ ] #149 :127 — toggling italic off restores plain text
- [ ] #150 :337 — clicking italic with cursor on a plain word italicizes that word
- [ ] #151 :159 — toggling italic off middle word restores plain text
- [ ] #153 :195 — italicizing middle word of second paragraph produces correct markdown

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

## strikethrough-button.spec.js
- [ ] #183 :146 — strikethrough middle word produces correct markdown
- [ ] #184 :178 — strikethrough first word of second paragraph produces correct markdown
- [ ] #187 :114 — strikethrough first word produces correct markdown
- [ ] #192 :336 — clicking strikethrough with cursor on a plain word applies strikethrough
- [ ] #197 :159 — toggling strikethrough off middle word restores plain text
- [ ] #198 :195 — strikethrough middle word of second paragraph produces correct markdown
- [ ] #199 :127 — toggling strikethrough off restores plain text
- [ ] #200 :349 — clicking strikethrough with cursor inside struck-through text removes it

## subscript-button.spec.js
- [ ] #193 :118 — subscript first word produces correct markdown
- [ ] #194 :133 — subscript middle word produces correct markdown
- [ ] #195 :148 — subscript first word of second paragraph produces correct markdown
- [ ] #196 :165 — subscript middle word of second paragraph produces correct markdown
- [ ] #202 :272 — clicking subscript with cursor on a plain word applies subscript

## superscript-button.spec.js
- [ ] #203 :118 — superscript first word produces correct markdown
- [ ] #204 :133 — superscript middle word produces correct markdown
- [ ] #205 :148 — superscript first word of second paragraph produces correct markdown
- [ ] #207 :165 — superscript middle word of second paragraph produces correct markdown
- [ ] #208 :272 — clicking superscript with cursor on a plain word applies superscript

## toolbar-active.spec.js
- [ ] #224 :296 — clicking italic button inside <em> tag strips the tag
- [ ] #227 :268 — clicking bold button inside <strong> tag strips the tag
- [ ] #229 :338 — clicking strikethrough button inside <s> tag strips the tag
- [ ] #247 :310 — clicking italic button inside <i> tag strips the tag
- [ ] #252 :282 — clicking bold button inside <b> tag strips the tag
- [ ] #262 :324 — clicking strikethrough button inside <del> tag strips the tag

## code-block-enter.spec.js
- [ ] #240 :148 — source view: typing ``` + Enter creates an empty code block
- [ ] #241 :184 — source view: typing ```` + Enter creates a code block with fenceCount 4
- [ ] #242 :220 — source view: backtick fence text is not converted until Enter
- [ ] #260 :166 — source view: typing ```js + Enter creates a code block with language
- [ ] #261 :202 — source view: typing ``````js + Enter creates a code block with fenceCount 6 and language

## code-block-language-tag.spec.js
- [ ] #263 :171 — cursor offset is correct in source view after changing language in writing view

## cursor-typing-delimiters.spec.js
- [ ] #271 :203 — typing after closing ** produces plain text, not bold
- [ ] #279 :147 — typing ***word*** renders as bold inside italic in source view
- [ ] #280 :172 — typing after closing * produces plain text, not italic
- [ ] #286 :226 — typing after closing ~~ produces plain text, not strikethrough

## heading-input.spec.js
- [ ] #274 :28 — typing "# main" letter by letter creates a heading with correct content

## inline-image.spec.js
- [ ] #282 :74 — image syntax round-trips through source view correctly
- [ ] #283 :95 — removing ! in source view converts inline image to link

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

## source-view-summary-edit.spec.js
- [ ] #309 :42 — typing a character on the summary line in source view inserts it without rewriting the line

## click-outside-defocus.spec.js
- [ ] #326 :122 — defocus is a no-op in source view

## cursor-sync.spec.js
- [ ] #332 :47 — cursors sync after typing text
- [ ] #334 :136 — cursors sync after backspace merges paragraphs
- [ ] #335 :79 — cursors sync after backspace
- [ ] #336 :115 — cursors sync after Enter splits a paragraph
- [ ] #341 :238 — cursors sync after creating and exiting a list item
- [ ] #342 :290 — treeCursor persists after blur in writing view
- [ ] #346 :157 — cursors sync after clicking a different node

## paste.spec.js
- [ ] #356 :61 — single-line paste inserts text at cursor (source view)

## range-handling.spec.js
- [ ] #387 :443 — cross-node copy produces markdown with block prefixes
