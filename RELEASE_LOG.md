# Release Log

## v2.2.0

### New Features

- **Restructure Headings (File → Restructure → Headings)**: Promotes all headings in the document so the top-most heading level becomes `#`. For example, a document whose shallowest headings are `###` will have every heading promoted by two levels. The operation is recorded as a single undo step.

### Improvements

- **File menu reorganization**: "Word Count" and "Copy File Path" are now grouped under a **File → Utilities** submenu. "Restructure" has its own section after "Close".
- **Updated About dialog**: The About box now displays the application version (from `package.json`), a short description, and a "Visit GitHub" button that opens the repository in the default browser.

## v2.1.0

### New Features

- **Drag-and-drop markdown file loading**: Dragging `.md` or `.markdown` files from the OS onto the editor now opens them as documents. Multiple markdown files can be dropped at once — each opens in its own tab. If a drop contains a mix of markdown and other files, only the markdown files are loaded; image-only drops still insert images as before.

## v2.0.0

### New Features

- **Checklist support**: Full `- [ ]` / `- [x]` checklist editing. Toolbar button converts paragraphs to checklists; checkbox click toggles checked state in writing view; Enter creates a new unchecked item; Enter on an empty item exits to a paragraph. The three list buttons (unordered, ordered, checklist) are mutually exclusive — clicking a different kind converts in place. (#88)
- **Code-block language tag UI**: Code blocks now show a clickable language tag at the top-right corner (and bottom-right for blocks of 20+ lines). Clicking opens a modal dialog to set or change the language. Untagged blocks show a dim "lang" placeholder.
- **Code-block source editing**: In source view, clicking a code block enters a single-region editing mode covering the opening fence, language tag, content, and closing fence. Typing, backspace, delete, Enter, and selection all work within the fenced block. Re-parsing happens on defocus. (#95)
- **Code-block syntax highlighting**: Lightweight syntax highlighting for 13 languages — JavaScript, Python, HTML, CSS, JSON, C, Java, Rust, Go, Ruby, Shell, SQL, and PHP. Unknown or empty languages fall back to plain text.
- **Improved paste handling**: Paste in both source and writing views now re-parses pasted markdown to preserve structure, handles multi-line paste correctly, replaces active selections, and handles CRLF line endings. (#91)

### Improvements

- **"Focused" view renamed to "Writing" view**: The View menu now shows "Writing View" (Ctrl+2) instead of "Focused View", and the renderer class has been renamed to match.
- **Toolbar active-state tracking**: Toolbar buttons now correctly reflect the formatting state at the current cursor position, walking up through inline formats and resolving the block parent for block-type buttons.
- **macOS build target changed from zip to dmg**: Users can now mount the disk image and run the app directly without extracting an archive.

## v1.7.0

### New Features

- **Bold-italic formatting (`\***text**\*`)**: The inline tokenizer now supports `***` as an atomic bold-italic delimiter. `***word***` renders as bold-italic (`<strong><em>…</em></strong>`) in focused view. Four or more consecutive asterisks (`****`+) are treated as plain text.

### Bug Fixes

- **Horizontal rule eating content at EOF**: The DFA parser's `_isHorizontalRule` treated EOF as equivalent to NEWLINE, so typing `***` at the end of a line caused the parser to consume the entire paragraph as a horizontal rule. Fixed to require an actual NEWLINE token — EOF no longer qualifies. (#70)

### Improvements

- **DFA parser is the sole parser**: The regex-based `MarkdownParser` has been removed. The DFA parser (`dfa-parser.js` / `dfa-tokenizer.js`) is now the only parsing pipeline. The parser-switching UI in preferences and the `setParser()` API have been removed. (#69)
- **Dead code removal**: Deleted `markdown-parser.js` and its test file `markdown-parser.test.js`. Updated all doc references to point to the DFA parser.

## v1.6.0

### New Features

- **Search bar**: Floating, draggable search panel opened via Ctrl+F. Supports plain text search (minimum 2 characters) and regex mode, with a case-sensitivity toggle. In source view searches raw markdown; in focused view searches rendered text per-node (plain text) or across the full document (regex). Highlights matches with `<mark>` elements, navigates with Enter/Shift+Enter, and scrolls to the active match. Re-applies highlights automatically after editor re-renders.
- **DFA-based tokenizer and parser**: New `dfa-tokenizer.js` and `dfa-parser.js` modules provide an alternative parsing pipeline using a deterministic finite automaton. Includes a standalone `scripts/parse-markdown.js` CLI tool for testing the parser output. Comprehensive unit test suite with 700+ lines of coverage.
- **Session restore (cursor, ToC, scroll)**: Closing and reopening the app now fully restores cursor position, Table of Contents heading highlight, and scroll position for all open tabs — not just the active one. Cursor and ToC heading positions are persisted as deterministic index paths (`getPathToCursor`/`setCursorPath`, `getPathToNode`/`getNodeAtPath`) that survive node ID regeneration across parses. Background tabs are restored lazily when switched to.
- **View mode dropdown in toolbar**: The toolbar now includes a dropdown for switching between source and focused view modes, complementing the existing menu and keyboard shortcuts.
- **Cursor sync integration tests**: New test suite verifying that the tree cursor stays in sync with DOM selection changes across editing operations, tab switches, and view mode changes.

### Bug Fixes

- **Cursor and document restore on close-and-reopen**: Fixed issue where cursor position, ToC heading highlight, and scroll position were lost when the app was closed and reopened. The root cause was that `cursorOffset` (a flat character offset) couldn't reliably reconstruct cursor position because node IDs are ephemeral. Replaced with tree-path-based serialization. (#62)

### Improvements

- **Cursor model moved to SyntaxTree**: `treeCursor` now lives on the `SyntaxTree` instance rather than the `Editor`, making it part of the document state that travels with tab switches and undo/redo snapshots. All editor subsystems (`CursorManager`, `EditOperations`, `EventHandler`, `TableManager`, etc.) updated to reference `syntaxTree.treeCursor`.
- **Per-tab document state expanded**: `_documentStates` now tracks `tocActiveHeadingId` for ToC heading persistence across tab switches, and `cursorPath`/`tocHeadingPath` for session restore across app restarts.
- **`SyntaxNode.toBareText()`**: New method returns visible plain text with all formatting syntax stripped (heading prefixes, emphasis delimiters, link URLs, image syntax, etc.). Used by the search system for focused-view matching.

## v1.5.0

### New Features

- **List support**: Full markdown list editing — toolbar buttons for unordered and ordered lists, Enter key continuation (new item inherits list type), empty-item exit (Enter on an empty list item converts it to a paragraph), whole-list toggle and ordered/unordered switching, ordered list renumbering on add/remove, and multi-line paste that correctly parses list items. List boundary spacing separates lists from adjacent paragraphs visually.
- **ToC scroll highlight**: The Table of Contents sidebar now highlights the heading whose section occupies the most viewport area. The active highlight updates on scroll and is kept vertically centred within the sidebar.
- **Cursor position restore**: The editor remembers the cursor position for each open file and restores it when switching tabs or restarting the app.
- **Inline image tokenization**: `![alt](src)` syntax now renders as an inline image in focused view instead of a stray `!` followed by a link.
- **Select-all cycling**: Ctrl+A cycles through three selection levels — first selects the current node, second selects the parent group (e.g., the entire contiguous list run or all children of an html-block), and third selects the entire document. Nodes without a parent group skip straight from node to document.
- **Empty element removal on delete**: Pressing delete or backspace on a selection removes the emptied element entirely (paragraph, heading, blockquote, list item, code block, table, or html-block) instead of leaving an empty shell. If the document becomes empty, a fresh paragraph is inserted.

### Bug Fixes

- **Cursor jump on inline delimiters**: Typing `*`, `_`, `~`, `<`, or `>` in focused view no longer causes the cursor to jump to the wrong position. The cursor manager now uses the inline tokenizer to map between raw markdown offsets and rendered DOM positions.

### Improvements

- **Editor refactor**: `editor.js` was split into focused manager classes — `EditOperations`, `InputHandler`, `EventHandler`, `CursorManager`, `RangeOperations`, `ClipboardHandler`, `SelectionManager`, `ImageHelper`, `LinkHelper`, and `UndoManager` — reducing the main file from ~2000 lines to a thin orchestration layer.

## v1.4.0

### New Features

- **Incremental rendering**: Edit operations now surgically patch only the affected DOM elements instead of rebuilding the entire document. `FocusedRenderer.renderNodes({ updated, added, removed })` maps node IDs to their DOM elements and replaces, inserts, or removes them in-place. Every keystroke, focus change, and formatting operation is now O(1) regardless of document size. Full renders are retained only for initialise, load, reset, view-mode switch, undo, and redo.
- **Range handling (selection support)**: Non-collapsed selections are tracked as tree-coordinate ranges (`startNodeId`, `startOffset`, `endNodeId`, `endOffset`). Typing, backspace, delete, cut, and paste all operate on the selected range. Cross-node selections delete intermediate nodes and merge the remaining endpoints. Ctrl+A is scoped to the current block node. Cut and copy write raw markdown to the clipboard.
- **Page resize by dragging**: In focused mode, invisible drag handles appear on the left and right edges of the page. Dragging a handle symmetrically resizes the page width, clamped between 300 px and the container width minus 40 px. The final width is persisted to settings. A `ResizeObserver` and scroll listener keep handles aligned as the layout changes. Handles are hidden in source mode.
- **HTML `<img>` tag support**: The parser recognises `<img>` tags as image nodes, preserving `src`, `alt`, and `style` attributes. Images render visually in focused mode and as raw HTML in source mode. The image edit modal includes a style field that round-trips the `style` attribute; clearing it converts the tag back to markdown `![alt](src)` syntax.

### Bug Fixes

- **Bold button tree-coordinate fix**: `applyFormat()` now uses tree-coordinate selection exclusively instead of DOM-derived positions, fixing four reported bugs: toggling bold off on the first word, bolding a middle word, and bolding words in paragraphs other than the first.
- **Collapsed-cursor bold toggling**: When the cursor is collapsed inside an existing bold span, the bold button now correctly removes the formatting. When collapsed on a plain word, it bolds that word.

### Improvements

- **ToC scroll uses incremental render**: Clicking a Table of Contents link now re-renders only the previously-focused and target nodes instead of the full document. A deferred `requestAnimationFrame` scroll ensures the heading lands at the top of the scroll container.
- **`detailsClosed` setting uses incremental render**: Toggling a `<details>` disclosure widget re-renders only that node. Runtime open/closed state is preserved across re-renders.
- **`rewriteImagePaths` uses incremental render**: After the initial full render, asynchronous image-path rewriting incrementally updates only the affected image nodes instead of triggering a second full render.
- **BaseModal refactor**: Image, link, and table modals now extend a shared `BaseModal` class that handles dialog creation, focus trapping, open/close lifecycle, and keyboard dismissal.

## v1.3.0

### New Features

- **Full WYSIWYG inline rendering**: Focused view now always renders inline markdown formatting (bold, italic, strikethrough, code, links) as styled elements instead of showing raw syntax. Cursor offset mapping translates positions between raw markdown and rendered DOM in both directions.
- **Inline HTML markup support**: Inline HTML tags (`<sub>`, `<sup>`, `<mark>`, `<u>`, `<b>`, `<i>`, `<strong>`, `<em>`, `<del>`, `<s>`) are rendered as native elements in focused view via a new tokenizer-based rendering pipeline.
- **Inline tokenizer**: New `inline-tokenizer.js` module tokenizes inline markdown and HTML markup into a structured tree for rendering. Supports nested formatting, backtick code spans, links, and HTML inline tags.
- **Code-block entry via Enter**: Typing a language name followed by Enter on an empty paragraph converts it to a code block with that language. Enter inside a code block inserts a newline instead of splitting the node.
- **Direct table cell editing**: Table cells in focused view support typing, backspace, delete, Enter (inserts `<br>`), and Tab/Shift+Tab navigation between cells.
- **Click-to-edit images**: Clicking an image in focused view opens the image edit modal.
- **Click-to-edit links**: Clicking a link in focused view opens a link edit modal for modifying the URL and text.
- **Link edit modal**: New modal dialog for editing link text and URL, with update and remove actions.
- **Subscript and superscript toolbar buttons**: The formatting toolbar now includes buttons for `<sub>` and `<sup>` markup.

### Bug Fixes

- **Table cell inline formatting**: Table cells now render inline markdown and HTML formatting (bold, italic, code, etc.) instead of displaying raw text.

## v1.2.0

### New Features

- **Iframe support**: `<iframe>` elements in markdown documents now render correctly in focused view. The Content Security Policy has been updated to allow frames from any HTTP/HTTPS origin.
- **External script support**: `<script>` tags with a `src` attribute are now recognised as HTML block elements and are allowed by the Content Security Policy. This enables custom HTML elements and external libraries inside markdown documents. Inline scripts (without `src`) remain blocked.
- **Remote image support**: The Content Security Policy now explicitly allows images from `file:`, `data:`, `https:`, and `http:` sources, so remote images render correctly.

### Performance

- **Targeted focus updates**: Switching focus between elements in focused view no longer rebuilds the entire DOM. Only the previously focused and newly focused nodes are re-rendered in-place, making focus changes O(1) regardless of document size.

## v1.1.0

### New Features

- **Multi-file tab editing**: Open multiple markdown documents simultaneously in tabs. A tab bar at the bottom of the window shows all open files, switchable via click or the View menu.
- **HTML block support (`<details>` / `<summary>`)**: The parser and both renderers now handle HTML container blocks. In focused view, `<details>` elements render as interactive disclosure widgets with a clickable triangle to collapse and expand content. In source view, each tag line is independently editable.
- **Table of Contents includes HTML block headings**: Headings nested inside `<details>` blocks appear in the TOC sidebar and are scrollable.
- **Click-outside-to-defocus**: Clicking outside the editor in focused view clears the cursor and hides all markdown syntax, showing a clean preview of the document.
- **Trailing paragraph invariant**: Documents ending in an HTML container block automatically get an empty trailing paragraph so the user can always add content after it.
- **Session restore**: Previously open files are remembered across sessions and reopened on launch.

### Improvements

- **Toolbar and TOC mousedown guards**: Clicking toolbar buttons and TOC links no longer causes a momentary editor defocus, preventing cursor loss during interactions.
- **Startup focus**: Loading a document now gives the editor DOM focus immediately, so the first element is properly editable without requiring a click.
- **Backspace/delete at HTML block boundaries**: Backspace at the start of a node after an HTML block and delete at the end of a node before an HTML block are handled correctly in both view modes.
- **Preferences**: New content setting to control whether `<details>` blocks start open or closed.

### Bug Fixes

- **Entry script argv filtering**: `getFilePathFromArgs()` now skips the app's own entry script, fixing a Linux-specific issue where `main.js` was mistakenly loaded as a document.
- **`bareText` preservation**: Re-parsing a single line inside an HTML block context now preserves the `bareText` flag, preventing summary text from gaining unwanted markdown syntax.

## v1.0.0

Initial release.

### Features

- **Syntactic tree document model**: Documents are parsed into a tree structure for fast editing regardless of document size.
- **Dual view modes**: Source view with syntax highlighting and focused writing (WYSIWYG-style) mode, switchable via `Ctrl+1` / `Ctrl+2`.
- **WYSIWYG toolbar**: Context-aware formatting toolbar that adapts to the current element (headings, bold, italic, links, code, lists, blockquotes).
- **Table of Contents**: Resizable sidebar with live-updating headings navigation, positionable left or right.
- **Image support**: Insert, edit, rename, and drag & drop images; gather images into the document folder.
- **Table support**: Insert and edit tables via a modal dialog.
- **Preferences**: Configurable page margins, page width, page colors, default view mode, and TOC settings.
- **Word count**: Total word count and word count excluding code blocks (File → Word Count).
- **Unlimited undo/redo**: Complete edit history with no limit.
- **A4 page layout**: Document-centric design with configurable page dimensions.
- **Scripting API**: Full IPC-based API for external automation.
- **Debug mode**: Help → Debug opens DevTools and enables context menus.
- **Standalone executables**: Pre-built binaries for Windows, macOS, and Linux via electron-builder.
