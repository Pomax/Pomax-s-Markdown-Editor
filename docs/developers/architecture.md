# Markdown Editor - Architecture Documentation

## Overview

This document describes the high-level architecture of the Markdown Editor application. It is intended for developers who need to understand, maintain, or extend the codebase.

## Technology Stack

- **Runtime**: Electron (Node.js + Chromium)
- **Language**: JavaScript (ES Modules)
- **Type Checking**: JSDoc type annotations
- **Testing**: Node.js native test runner (unit), Playwright (integration)

## Project Structure

```
markdown-editor/
├── src/
│   ├── main/           # Electron main process
│   └── renderer/       # Electron renderer process (UI)
├── test/
│   ├── unit/           # Unit tests
│   └── integration/    # Playwright integration tests
├── docs/
│   ├── api/            # API documentation
│   └── developers/     # Developer documentation
└── scripts/            # Build and utility scripts
```

## Process Model

The application follows Electron's multi-process architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    Main Process                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ FileManager │  │ MenuBuilder │  │   IPCHandler    │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
│                          │                              │
│              ┌───────────┼───────────┐                  │
│              │           │           │                  │
│        ┌─────┴─────┐ ┌──┴────────┐  │                  │
│        │ APIRegistry│ │ Settings  │  │                  │
│        └───────────┘ │  Manager  │  │                  │
│                      └───────────┘  │                  │
└────────────────────────┬────────────────────────────────┘
                         │ IPC
┌────────────────────────┴────────────────────────────────┐
│                   Renderer Process                       │
│  ┌────────┐  ┌─────────┐  ┌──────────────────────────┐ │
│  │ Editor │──│ Parser  │──│      SyntaxTree          │ │
│  └────────┘  └─────────┘  └──────────────────────────┘ │
│       │                                                  │
│  ┌────┴────┐  ┌───────────┐  ┌───────────────────────┐ │
│  │ Toolbar │  │ Renderers │  │      UndoManager      │ │
│  └─────────┘  └───────────┘  └───────────────────────┘ │
│                                                          │
│  ┌────────────┐ ┌────────────┐ ┌───────────────────┐   │
│  │ ImageModal │ │ TableModal │ │ SelectionManager  │   │
│  └────────────┘ └────────────┘ └───────────────────┘   │
│                                                          │
│  ┌───────────────────┐  ┌──────────────────────────┐   │
│  │ TableOfContents   │  │   PreferencesModal       │   │
│  └───────────────────┘  └──────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## Main Process Components

### main.js

Entry point for the Electron main process. Responsibilities:
- Application lifecycle management
- Window creation and management
- Menu setup
- IPC handler registration

### FileManager

Handles all file system operations:
- Loading markdown files
- Saving documents
- File dialogs
- Tracking current file path and unsaved changes

### MenuBuilder

Constructs the application menu:
- File menu (New, Load, Open Recent, Save, Save As, Exit)
- Edit menu (Undo, Redo, Cut, Copy, Paste)
- View menu (Source View, Focused Writing)
- Help menu (About, Keyboard Shortcuts)

### IPCHandler

Central hub for IPC communication:
- Registers all IPC handlers
- Routes messages to appropriate handlers
- Bridges main process services with renderer

### APIRegistry

Manages the external scripting API:
- Command registration
- Command execution
- Parameter validation
- API documentation generation

### SettingsManager

Persists and retrieves user preferences:
- Uses SQLite (better-sqlite3) for storage in the user data directory
- Key-value store with JSON serialization
- Exposes `getSetting` / `setSetting` IPC handlers
- Stores page width, margins, colors, view mode, TOC settings, etc.

### preload.cjs

Secure bridge between main and renderer:
- Exposes limited API via contextBridge
- Provides type-safe interface
- Ensures security through context isolation

## Renderer Process Components

### Editor

Core editing component:
- Manages document state
- Coordinates parsing and rendering
- Handles user input
- Manages undo/redo

### MarkdownParser

Converts markdown text to syntax tree:
- Block-level parsing (headings, paragraphs, code blocks, etc.)
- Pattern-based recognition
- Position tracking for each node

### SyntaxTree

Data structure for parsed documents:
- Tree of SyntaxNode objects
- Fast node lookup by ID or position
- Serialization to markdown
- Deep cloning for undo/redo

### Renderers

#### SourceRenderer
Displays markdown with syntax highlighting:
- Shows literal markdown syntax
- Color-codes different element types
- Maintains editability

#### FocusedRenderer
WYSIWYG-style display:
- Hides syntax when not focused
- Shows formatted output (rendered images, tables, horizontal rules, etc.)
- Reveals raw markdown syntax on element focus (click any element to edit)
- Supports click-to-focus on non-text elements like images and horizontal rules

### UndoManager

Unlimited undo/redo history:
- Maintains undo and redo stacks
- Batches rapid changes
- No memory limit (as per requirements)

### SelectionManager

Tracks and manipulates text selection:
- Converts between DOM and logical positions
- Tracks current node at cursor
- Dispatches selection change events

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
- Sections: Default View, Page Width, Margins, Colors, Table of Contents
- Reads and writes settings via IPC to the SettingsManager
- Applies CSS custom property changes immediately on save

### Toolbar

WYSIWYG formatting toolbar:
- Lucide SVG icons with per-button coloring
- Context-aware button visibility
- Element-specific formatting options
- Keyboard shortcut indicators
- Automatic scaling on narrow windows via ResizeObserver

## Data Flow

### Document Loading

```
User clicks Load
       │
       ▼
MenuBuilder.handleLoad()
       │
       ▼
FileManager.load() ──► File Dialog
       │
       ▼
IPC: file:loaded
       │
       ▼
MenuHandler.handleLoaded()
       │
       ▼
Editor.loadMarkdown()
       │
       ▼
MarkdownParser.parse()
       │
       ▼
SyntaxTree created
       │
       ▼
Renderer.render()
```

### User Input

```
User types character
       │
       ▼
Editor.handleKeyDown()
       │
       ▼
Get current content
       │
       ▼
MarkdownParser.parse()
       │
       ▼
Update SyntaxTree
       │
       ▼
UndoManager.recordChange()
       │
       ▼
Renderer.render() (if focused mode)
```

### Undo Operation

```
User presses Ctrl+Z
       │
       ▼
KeyboardHandler or Menu
       │
       ▼
Editor.undo()
       │
       ▼
UndoManager.undo()
       │
       ▼
Restore previous content
       │
       ▼
MarkdownParser.parse()
       │
       ▼
Renderer.render()
```

## View Modes

### Source View

- Displays raw markdown with syntax highlighting
- All markdown syntax is visible
- Syntax characters are styled differently
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

## Memory Management

As per requirements, the application runs with unlimited memory:
- Node.js flag `--max-old-space-size=0` removes heap limit
- Undo history has no cap
- Large documents are supported

## Security Model

- Context isolation enabled
- Node integration disabled in renderer
- All IPC goes through preload script
- Limited API surface exposed to renderer
- Content Security Policy enforced
