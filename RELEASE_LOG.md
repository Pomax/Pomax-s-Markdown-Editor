# Release Log

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

### Testing & CI

- **Extensive integration test coverage**: New integration tests for code-block entry, table cell editing, image click-to-edit, link click-to-edit, linked-image click-to-edit, and inline HTML rendering.
- **Inline tokenizer unit tests**: Unit test suite for the tokenizer covering markdown formatting, HTML tags, code spans, links, and edge cases.
- **macOS CI stability**: Platform-aware Home/End key sequences in tests (`Meta+ArrowLeft`/`Meta+ArrowRight` on macOS), increased Electron launch timeout to 60s, and reduced worker count to 2 on macOS to prevent flakiness.
- **CI workflow cleanup**: Removed secondary version script; added `no-ci` label support to skip validation on labelled PRs.

---

## v1.2.0

### New Features

- **Iframe support**: `<iframe>` elements in markdown documents now render correctly in focused view. The Content Security Policy has been updated to allow frames from any HTTP/HTTPS origin.
- **External script support**: `<script>` tags with a `src` attribute are now recognised as HTML block elements and are allowed by the Content Security Policy. This enables custom HTML elements and external libraries inside markdown documents. Inline scripts (without `src`) remain blocked.
- **Remote image support**: The Content Security Policy now explicitly allows images from `file:`, `data:`, `https:`, and `http:` sources, so remote images render correctly.

### Performance

- **Targeted focus updates**: Switching focus between elements in focused view no longer rebuilds the entire DOM. Only the previously focused and newly focused nodes are re-rendered in-place, making focus changes O(1) regardless of document size.

---

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

### Testing & CI

- **Cross-platform CI**: Added a GitHub Actions validation workflow that runs the full test suite on Windows, macOS, and Linux on every pull request.
- **Shared test utilities**: Integration tests use a common `test-utils.js` with `launchApp()`, `loadContent()`, and `defocusEditor()` helpers, plus a fixed A4 viewport for deterministic layout.
- **Test fixtures**: In-repo markdown and image fixtures replace external file dependencies.
- **Linux CI hardening**: Virtual framebuffer (`xvfb-run`) for headless Electron, `--no-sandbox` for GitHub Actions runners, and entry-script filtering to prevent argv conflicts.

### Bug Fixes

- **Entry script argv filtering**: `getFilePathFromArgs()` now skips the app's own entry script, fixing a Linux-specific issue where `main.js` was mistakenly loaded as a document.
- **`bareText` preservation**: Re-parsing a single line inside an HTML block context now preserves the `bareText` flag, preventing summary text from gaining unwanted markdown syntax.

---

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
