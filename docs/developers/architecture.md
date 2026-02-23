# Markdown Editor - Architecture Documentation

## Overview

This document describes the high-level architecture of the Markdown Editor application. It is intended for developers who need to understand, maintain, or extend the codebase.

## Technology Stack

- **Runtime**: Electron 40+ (Node.js + Chromium)
- **Language**: JavaScript (ES Modules) with JSDoc type annotations
- **Type Checking**: TypeScript (`tsc`) via `jsconfig.json`, checking `.js` files
- **Linting / Formatting**: Biome
- **Testing**: Node.js native test runner (unit), Playwright with Firefox (integration)
- **Native Modules**: `better-sqlite3` for settings persistence
- **Packaging**: `electron-builder` for standalone executables

## Process Model

The application follows Electron's multi-process architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    Main Process                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ FileManager │  │ MenuBuilder │  │   IPCHandler    │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│                          │                              │
│              ┌───────────┴───────────┐                  │
│              │                       │                  │
│        ┌─────┴─────┐  ┌──────────────┴──┐               │
│        │APIRegistry│  │ SettingsManager │               │
│        └───────────┘  └─────────────────┘               │
└────────────────────────┬────────────────────────────────┘
                         │
                         │ IPC (via preload.cjs)
                         │
┌────────────────────────┴─────────────────────────────────────┐
│                     Renderer Process (app.js)                │
│    ┌── Editor ──────────────────────────────────────────┐    │
│    │  ┌────────────────┐  ┌──────────────────────────┐  │    │
│    │  │   DFAParser    │──│       SyntaxTree         │  │    │
│    │  └────────────────┘  └──────────────────────────┘  │    │
│    │  ┌─────────────────┐ ┌────────────────┐            │    │
│    │  │ FocusedRenderer │ │ SourceRenderer │            │    │
│    │  └─────────────────┘ └────────────────┘            │    │
│    │  ┌──────────────────┐ ┌─────────────┐              │    │
│    │  │ SelectionManager │ │ UndoManager │              │    │
│    │  └──────────────────┘ └─────────────┘              │    │
│    │  ┌───────────────┐ ┌──────────────┐                │    │
│    │  │ CursorManager │ │ TableManager │                │    │
│    │  └───────────────┘ └──────────────┘                │    │
│    │  ┌──────────────┐ ┌────────────────┐               │    │
│    │  │ InputHandler │ │ EditOperations │               │    │
│    │  └──────────────┘ └────────────────┘               │    │
│    │  ┌────────────────┐ ┌──────────────────┐           │    │
│    │  │RangeOperations │ │ ClipboardHandler │           │    │
│    │  └────────────────┘ └──────────────────┘           │    │
│    │  ┌──────────────┐ ┌─────────────┐ ┌────────────┐   │    │
│    │  │ EventHandler │ │ ImageHelper │ │ LinkHelper │   │    │
│    │  └──────────────┘ └─────────────┘ └────────────┘   │    │
│    └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌── Toolbar ──────────────────┐  ┌── MenuHandler ─────────┐ │
│  │  ┌────────────┐             │  │  ┌──────────────────┐  │ │
│  │  │ ImageModal │ (on demand) │  │  │ PreferencesModal │  │ │
│  │  └────────────┘             │  │  └──────────────────┘  │ │
│  │  ┌────────────┐             │  │  ┌────────────────┐    │ │
│  │  │ TableModal │ (on demand) │  │  │ WordCountModal │    │ │
│  │  └────────────┘             │  │  └────────────────┘    │ │
│  └─────────────────────────────┘  └────────────────────────┘ │
│                                                              │
│          ┌─────────────────┐  ┌───────────────────┐          │
│          │ KeyboardHandler │  │ TableOfContents   │          │
│          └─────────────────┘  └───────────────────┘          │
│                                                              │
│              ┌────────┐  ┌───────────┐                       │
│              │ TabBar │  │ SearchBar │                       │
│              └────────┘  └───────────┘                       │
└──────────────────────────────────────────────────────────────┘
```

## Main Process Components

### main.js

Entry point for the Electron main process. Responsibilities:
- Application lifecycle management (`app.whenReady`, `window-all-closed`, etc.)
- Window creation with security settings (`contextIsolation: true`, `nodeIntegration: false`)
- Menu setup via MenuBuilder
- IPC handler registration
- Persisting and restoring all open files across sessions (file paths, cursor paths, ToC heading paths, scroll positions)
- Sending `session:restore` events to the renderer after file restore so cursor/ToC state can be reapplied once the document is fully parsed

### FileManager

Handles all file system operations:
- Loading and saving markdown files
- File dialogs (open, save as)
- Tracking current file path and unsaved changes
- Recent files list (persisted via SettingsManager)
- Image gathering (copying referenced images into the document folder)

### MenuBuilder

Constructs the application menu:
- **File**: New, Load, Open Recent, Save, Save As, Close, Word Count, Exit
- **Edit**: Undo, Redo, Cut, Copy, Paste, Select All, Images → Gather, Preferences
- **View**: Source View (`Ctrl+1`), Focused Writing (`Ctrl+2`), open file list with checkmarks
- **Help**: Reload, Debug, About

Menu actions are sent to the renderer via the `menu:action` IPC channel.

### IPCHandler

Central hub for IPC communication. Registers handlers for:
- File operations (`file:new`, `file:load`, `file:save`, `file:saveAs`, `file:confirmClose`, etc.)
- Document operations (`document:undo`, `document:redo`)
- View operations (`view:source`, `view:focused`, `view:openFilesChanged`)
- Element operations (`element:changeType`, `element:format`)
- Settings operations (`settings:get`, `settings:set`, `settings:getAll`)
- Image operations (`image:browse`, `image:rename`)
- Path operations (`path:toRelative` — uses `node:path` for filesystem-correct relative path computation)
- API operations (`api:execute`, `api:commands`)
- App operations (`app:reload`)

### APIRegistry

Manages the external scripting API:

- Command registration with parameter schemas
- Command execution via IPC
- Parameter validation
- API documentation generation (used by `scripts/generate-api-docs.js`)

### SettingsManager

Persists and retrieves user preferences:

- Uses SQLite (`better-sqlite3`) for storage in the user's OS-defined data directory
- Key-value store with JSON serialization
- Stores: page width, margins, colors, default view mode, TOC settings, ensure-local-paths, open files list, etc.

### preload.cjs

Secure bridge between main and renderer:

- Must be CommonJS (`.cjs`) due to Electron's sandboxed preload environment
- Exposes a typed `electronAPI` object via `contextBridge.exposeInMainWorld`
- Provides file operations, settings, image operations, path utilities, and IPC event listeners
- The full API surface is defined in `src/types.d.ts`

## Renderer Process Components

### App (`app.js`)

The renderer entry point. Wires together all renderer components:

- Creates Editor, Toolbar, TabBar, TableOfContents, SearchBar, PreferencesModal, WordCountModal
- Manages multi-file document state (content, cursor, undo/redo stacks per tab)
- Handles tab creation, switching, and closing (with unsaved-changes prompts)
- Registers IPC listeners for menu actions and external API calls
- Loads persisted settings and applies them to the editor
- Listens for custom events from modals (e.g. `toc:settingsChanged`, `imageHandling:settingsChanged`)
- Sends the open-files list to the main process so the View menu stays in sync
- Exposes `editorAPI` to the main process for querying editor state
- Handles `session:restore` events to restore cursor position, ToC heading highlight, and scroll position for all tabs after a close-and-reopen. Active tab is restored live; background tabs are patched in `_documentStates`.

### Editor

Core editing coordinator (~500 lines). The Editor class owns the document
state and public API, but delegates operational concerns to focused manager
classes. Each manager receives the editor as a constructor argument and
accesses state via `this.editor`.

**Manager classes:**

| Class | File | Responsibility |
|-------|------|----------------|
| `CursorManager` | `cursor-manager.js` | DOM ↔ tree cursor synchronization and placement |
| `TableManager` | `table-manager.js` | Table cell editing, navigation, markdown building |
| `InputHandler` | `input-handler.js` | Keyboard and `beforeinput` event dispatch |
| `EditOperations` | `edit-operations.js` | Tree-level edits: insert, backspace, delete, enter |
| `RangeOperations` | `range-operations.js` | Selection range deletion and Ctrl+A |
| `ClipboardHandler` | `clipboard-handler.js` | Cut and copy operations |
| `EventHandler` | `event-handler.js` | Click, focus, blur, selectionchange, drag/drop |
| `ImageHelper` | `image-helper.js` | Image modal, insert/update, path rewriting |
| `LinkHelper` | `link-helper.js` | Link edit modal |

Additionally, `offset-mapping.js` exports pure functions for raw ↔ rendered
offset mapping (used by `CursorManager`).

The Editor itself keeps:
- Document state (`syntaxTree`, `treeRange`, `viewMode`) — cursor state lives on `syntaxTree.treeCursor`
- Rendering methods (`fullRender`, `renderNodes`, `fullRenderAndPlaceCursor`)
- Dispatches `editor:renderComplete` custom event after `fullRender()` and `renderNodes()`, used by SearchBar to re-apply highlights
- Tree helpers (`getCurrentNode`, `getSiblings`, `getNodeIndex`)
- Markdown helpers (`buildMarkdownLine`, `getPrefixLength`)
- Public API consumed by the toolbar, IPC handlers, and tests

### SearchBar

Floating draggable search panel for finding text in the editor:
- Opened via Ctrl+F (Cmd+F on macOS); closed via Escape or the close button
- Supports plain text and regex search modes, with a case-sensitivity toggle
- Plain text search requires a minimum of 2 characters
- In source view, searches against `syntaxTree.toMarkdown()` (raw markdown)
- In focused view, plain text search is confined to per-node boundaries using `SyntaxNode.toBareText()`; regex search uses `syntaxTree.toBareText()` across the full document
- Builds an offset map to translate flat-document match positions back to individual syntax-tree nodes for DOM highlighting
- Highlights matches using `<mark>` elements injected via TreeWalker-based text node splitting
- Re-applies highlights on `editor:renderComplete` events (fired after re-renders)
- Initial match selection starts at the match closest to the current cursor position
- Navigation via Enter (next), Shift+Enter (previous), and prev/next buttons
- Scrolls to the active match using `scrollIntoView({ behavior: 'instant' })`
- Draggable via mouse (repositions with CSS `left`/`top`); position resets on each open
- Appended to the `#app` element, styled in `search.css`

### DFAParser

Converts markdown text to a syntax tree using a token-driven DFA (no regular expressions):
- Character-level tokenizer (`dfa-tokenizer.js`) produces a flat token stream
- Block-level parsing (headings, paragraphs, code blocks, blockquotes, lists, images, tables, horizontal rules)
- Token-based recognition with ordered priority
- Position tracking (start/end line) for each node
- Multi-line block handling (code blocks, tables)

### SyntaxTree / SyntaxNode

Data structure for parsed documents:
- `SyntaxTree`: root container with `children` array of `SyntaxNode`
- `SyntaxNode`: type, content, attributes, children, unique ID, position info
- `toMarkdown()`: serializes back to markdown text
- `toBareText()`: returns visible/rendered text with markdown syntax stripped (heading prefixes, emphasis delimiters, link URLs, image syntax, etc. removed). Used by search in focused view.
- `clone()`: deep cloning for undo/redo snapshots
- Node lookup by ID or position
- `getPathToCursor()` / `setCursorPath(path)`: serialize and restore cursor position as an index path (array of child indices + character offset). Used for session persistence — node IDs are ephemeral but tree structure is deterministic for the same document.
- `getPathToNode(nodeId)` / `getNodeAtPath(path)`: convert between node IDs and index paths. Used to persist the active ToC heading across sessions.

### Renderers

#### SourceRenderer
Displays markdown with syntax highlighting:
- Shows literal markdown syntax
- Color-codes different element types (headings, code, emphasis, etc.)
- Uses `SyntaxHighlighter` for inline syntax coloring
- Maintains editability

#### FocusedRenderer
WYSIWYG-style display:
- Hides syntax when not focused
- Shows formatted output (rendered images, tables, horizontal rules, etc.)
- Reveals raw markdown syntax on element focus (click to edit)
- Supports click-to-focus on non-text elements like images and horizontal rules

### UndoManager

Unlimited undo/redo history:
- Maintains undo and redo stacks of markdown snapshots
- Batches rapid changes (debounced)
- No memory limit

### SelectionManager

Tracks and manipulates text selection:
- Converts between DOM positions and logical tree cursor positions
- Tracks current node at cursor
- Dispatches selection change events

### Range Handling

When the user has a non-collapsed selection (highlighted text), the editor
tracks it as a `TreeRange`:

```
TreeRange = { startNodeId, startOffset, endNodeId, endOffset }
```

Key behaviors:
- **Typing/pasting with selection**: deletes the selected range first, then inserts
- **Backspace/Delete with selection**: deletes the selected range
- **Ctrl+A**: context-restricted to the current node (not the whole document)
- **Cut**: writes raw markdown to clipboard, then deletes the range
- **Copy**: writes raw markdown to clipboard without mutation
- **Cross-node deletion**: trims endpoints, removes intermediates, merges remaining text

### SyntaxHighlighter

Inline syntax highlighting for source view:
- Colors markdown syntax characters (e.g. `**`, `_`, `` ` ``, `[`, `]`)
- Handles nested formatting
- Applied per-line within the source renderer

### ParseTree

Lightweight helper used during keyboard input processing:
- Tracks cursor position across parse/re-render cycles
- Maps between text offsets and tree node positions

### Toolbar

WYSIWYG formatting toolbar:
- Lucide SVG icons with per-button coloring
- Context-aware button visibility (buttons only shown when applicable to current element type)
- Element type buttons (H1–H3, paragraph, blockquote, code block)
- Format buttons (bold, italic, strikethrough, inline code, link, image, table)
- List buttons (unordered, ordered)
- View mode dropdown selector
- Keyboard shortcut indicators in tooltips
- Automatic scaling on narrow windows via ResizeObserver

### TableOfContents

Sidebar showing a navigable document outline:
- Extracts h1–h3 headings from the syntax tree
- Renders a nested, clickable tree of links
- Scrolls the editor to the clicked heading
- Auto-refreshes via MutationObserver when the document changes
- Supports show/hide toggle and left/right positioning
- Resizable width via drag handle, persisted to settings

### PreferencesModal

Settings dialog for user preferences:
- Sidebar navigation with section links
- Sections: Default View, Page Width, Margins, Colors, Table of Contents, Image Handling
- Image Handling: "Ensure local paths" checkbox (auto-rewrites downstream image paths to relative form)
- Reads and writes settings via IPC to the SettingsManager
- Applies CSS custom property changes immediately on save
- Dispatches custom events so `app.js` can update runtime state

### ImageModal

Modal for inserting and editing images:
- Browse for image file
- Set alt text and optional link URL
- Rename image file on disk
- Shows live image preview

### TableModal

Modal for inserting and editing tables:
- Set row and column counts
- Edit cell contents in a grid
- Generates markdown table syntax

### WordCountModal

Modal displaying document statistics:
- Total word count
- Word count excluding code blocks and inline code

### TabBar

Bottom tab bar for multi-file editing:
- Displays one tab button per open document
- Active tab is visually highlighted; modified tabs show a dot indicator
- Click to switch tabs; close button on each tab (with unsaved-changes prompt)
- Tooltips show the full absolute file path
- Disambiguates tabs with identical filenames by appending the minimum parent directory path (e.g. "README.md — docs")
- Exports `getDisambiguatedLabels()` utility used by both the tab bar and the View menu

## Data Flow

### Document Loading

```
User clicks File → Load
       │
       ▼
IPC: file:load → FileManager → File Dialog
       │
       ▼
Returns { content, filePath } to renderer
       │
       ▼
MenuHandler dispatches 'file:loaded' event
       │
       ▼
App: reuse pristine tab or create new tab
       │
       ▼
Editor.loadMarkdown()
       │
       ▼
DFAParser.parse() → SyntaxTree
       │
       ▼
rewriteImagePaths() (async, if ensureLocalPaths enabled)
       │
       ▼
Renderer.render() → DOM
       │
       ▼
App._notifyOpenFiles() → IPC → View menu rebuild
```

### User Input

```
User types a character
       │
       ▼
InputHandler.handleBeforeInput() / handleKeyDown()
       │
       ▼
EditOperations updates current node content
       │
       ▼
UndoManager.recordChange()
       │
       ▼
Re-parse affected node if needed
       │
       ▼
Renderer.render()
```

### Settings Change

```
User opens Edit → Preferences
       │
       ▼
PreferencesModal loads current settings via IPC
       │
       ▼
User changes values and clicks Save
       │
       ▼
PreferencesModal saves via IPC (settings:set)
       │
       ▼
Dispatches custom event (e.g. imageHandling:settingsChanged)
       │
       ▼
App.js listener updates Editor properties
       │
       ▼
CSS custom properties updated → immediate visual change
```

## View Modes

### Source View

- Displays raw markdown with syntax highlighting
- All markdown syntax is visible
- Syntax characters are styled with distinct colors
- Best for users who know markdown

### Focused Writing View

- Hides markdown syntax for unfocused elements
- Shows formatted preview (rendered images, tables, horizontal rules)
- Reveals syntax only for the active element
- Click any element (including non-text elements like images) to focus and edit
- Best for distraction-free writing

## External API

The application exposes an IPC-based API for external scripting:

1. External process connects via IPC
2. Sends command request with parameters
3. IPCHandler routes to APIRegistry
4. APIRegistry validates and executes command
5. Result returned via IPC response

See `docs/api/README.md` for full API documentation.

## Security Model

- `contextIsolation: true` — renderer runs in a separate JavaScript context
- `nodeIntegration: false` — no `require()` or `process` in renderer
- `webSecurity: false` — allows loading local `file://` images
- All IPC goes through the preload script
- Limited API surface exposed to renderer (defined in `preload.cjs` and `types.d.ts`)

## Build & CI

- **Local builds**: `npm run dist:win`, `dist:mac`, `dist:linux`
- **CI**: GitHub Actions workflow (`.github/workflows/build.yml`) builds all three platforms on push to `main`
- **Packaging**: `electron-builder` creates standalone executables (portable `.exe`, `.zip`, `AppImage`)
- **Native modules**: `better-sqlite3` is rebuilt per-platform via `@electron/rebuild`
- **Artifacts**: Published as GitHub Releases
