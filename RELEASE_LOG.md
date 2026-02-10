# Release Log

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
