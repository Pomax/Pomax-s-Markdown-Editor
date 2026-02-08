# Markdown Editor

A "professional" markdown editor built with Electron, featuring a syntactic tree-based document model for fast editing of large documents.

![A screenshot of the editor](./screenshot-1.png)

## Download

Pre-built standalone executables for Windows, macOS, and Linux are available on the [Releases](https://github.com/Pomax/Pomax-s-Markdown-Editor/releases/latest) page. No installation or Node.js required — just download and run.

## what is this?

This is a project that was product managed by a real human (me, Pomax!) but written by Claude Opus 4.5/4.6, which is the first LLM that seems to be alright at programming. It was written in a way to be accessible by new devs as well as other AI agents, so it should be pretty damn easy to add new functionality. If using an AI, tell it to first read the `requirements.md` and `docs/developers` files, and then get to work.

PRs are of course welcome, provided it's preceded by you filing an issue to explain what it is you want to do, why you think that should be part of the codebase, and how you're going to do that: either by yourself, or by using an AI. Note that if you want to use an AI agent, the only one I'm going to even consider fixes from is Opus 4.6 - I've watched ChatGPT and Qwen literally destroy the good work Opus has produced and replace it with completely bullshit nonsense.

No on has time for that.

## Features

- **Fast Editing**: Documents are parsed into a syntactic tree structure, enabling efficient editing regardless of document size

- **Dual View Modes**:

  - **Source View**: Shows literal markdown with syntax highlighting

  - **Focused Writing**: WYSIWYG-style editing that hides syntax unless focused

- **WYSIWYG Toolbar**: Context-aware formatting toolbar that adapts to the current element

- **Table of Contents**: Resizable sidebar with live-updating headings navigation (left or right)

- **Image Support**: Insert, edit, rename, and drag & drop images; gather images into the document folder

- **Table Support**: Insert and edit tables via a modal dialog

- **Preferences**: Configurable page margins, page width, page colors, default view mode, and TOC settings

- **Word Count**: Total word count and word count excluding code (File → Word Count)

- **Unlimited Undo/Redo**: Complete edit history with no limit

- **Scripting API**: Full IPC-based API for external automation

- **A4 Page Layout**: Document-centric design with configurable page dimensions

- **Debug Mode**: Help → Debug opens DevTools and enables context menus

## Getting Started

### Prerequisites

- Node.js 22.0.0 or higher

### Installation

```sh
npm install
```

### Running the Application

```sh
npm start
```

## Project Structure

```
├── src/
│   ├── main/           # Electron main process
│   │   ├── main.js     # Application entry point
│   │   ├── preload.cjs # Secure IPC bridge
│   │   ├── menu-builder.js
│   │   ├── file-manager.js
│   │   ├── ipc-handler.js
│   │   ├── settings-manager.js
│   │   └── api-registry.js
│   │
│   └── renderer/       # Electron renderer process
│       ├── index.html
│       ├── styles/
│       └── scripts/
│           ├── app.js
│           ├── editor/
│           ├── parser/
│           ├── toolbar/
│           ├── handlers/
│           ├── image/
│           ├── table/
│           ├── toc/
│           ├── preferences/
│           └── word-count/
│
├── test/
│   ├── unit/           # Node.js native unit tests
│   └── integration/    # Playwright integration tests
│
├── docs/
│   ├── api/            # API documentation
│   └── developers/     # Developer guides
│
└── scripts/            # Build utilities
```

## Usage

### File Operations

- **New**: `Ctrl+N` - Create a new document

- **Load**: `Ctrl+O` - Open a markdown file

- **Save**: `Ctrl+S` - Save the current document

- **Save As**: `Ctrl+Shift+S` - Save with a new filename

### View Modes

- **Source View**: `Ctrl+1` - Show raw markdown with syntax highlighting

- **Focused Writing**: `Ctrl+2` - WYSIWYG mode with hidden syntax

### Formatting Shortcuts

- **Bold**: `Ctrl+B`

- **Italic**: `Ctrl+I`

- **Link**: `Ctrl+K`

- **Inline Code**: `Ctrl+\``

- **Heading 1-6**: `Ctrl+Alt+1` through `Ctrl+Alt+6`

- **Paragraph**: `Ctrl+Alt+0`

- **Blockquote**: `Ctrl+Shift+Q`

- **Code Block**: `Ctrl+Shift+C`

### Edit Operations

- **Undo**: `Ctrl+Z`

- **Redo**: `Ctrl+Y` or `Ctrl+Shift+Z`

## Testing

### Unit Tests

```sh
npm run test:unit
```

### Integration Tests

```sh
npm run test:integration
```

## Code Quality

### Linting, Formatting, and Type Checking

All code quality checks are run together:

```sh
npm run lint        # Runs lint:fix + lint:format + lint:typing
```

Individual steps:

```sh
npm run lint:fix    # Auto-fix lint issues (Biome)
npm run lint:format # Auto-format code (Biome)
npm run lint:typing # Type check via tsc (JSDoc annotations)
```

## Building Executables

To build a standalone executable for the current platform:

```sh
npm run dist
```

Or target a specific platform:

```sh
npm run dist:win    # Windows portable .exe
npm run dist:mac    # macOS .zip
npm run dist:linux  # Linux AppImage
```

Build output goes to the `dist/` directory.

Automated builds use a GitHub Actions workflow that builds all three platforms on every push to `main` and publishing them as a [GitHub Releases](https://github.com/Pomax/Pomax-s-Markdown-Editor/releases/latest).

## API Documentation

The editor exposes a comprehensive IPC-based API for external scripting. See [docs/api/README.md](docs/api/README.md) for full documentation.

### Quick Example

```javascript
// Execute a command via IPC (api:execute channel)
const result = await ipcRenderer.invoke('api:execute', 'document.setContent', {
    content: '# Hello World\n\nThis is a paragraph.'
});
```

## Developer Documentation

- [Getting Started](docs/developers/getting-started.md)

- [Architecture](docs/developers/architecture.md)

- [Design](docs/developers/design.md)

## Technology Stack

- **Electron**: Application framework

- **JavaScript**: ES Modules with JSDoc type annotations

- **HTML/CSS**: UI rendering

- **Biome**: Linting and code formatting

- **TypeScript**: Type checking (with `--allowJs --noEmit`)

- **Node.js Test Runner**: Unit testing

- **Playwright**: Integration testing (Firefox)

## Design Principles

1. **Separation of Concerns**: Each class has a single responsibility

2. **One Class Per File**: All classes are in their own files

3. **No Nested Functions**: Functions are not declared inside other functions

4. **No Inline Callbacks**: Functions are not declared inline as arguments

5. **Type Safety via JSDoc**: Comprehensive type annotations

## License

Public Domain