# Markdown Editor

A professional markdown editor built with Electron, featuring a syntactic tree-based document model for fast editing of large documents.

## Features

- **Fast Editing**: Documents are parsed into a syntactic tree structure, enabling efficient editing regardless of document size
- **Dual View Modes**:
  - **Source View**: Shows literal markdown with syntax highlighting
  - **Focused Writing**: WYSIWYG-style editing that hides syntax unless focused
- **WYSIWYG Toolbar**: Context-aware formatting toolbar that adapts to the current element
- **Unlimited Undo/Redo**: Complete edit history with no limit
- **Scripting API**: Full IPC-based API for external automation
- **A4 Page Layout**: Document-centric design with A4 aspect ratio

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm 9.0.0 or higher

### Installation

```bash
npm install
```

### Running the Application

```bash
npm start
```

## Project Structure

```
├── src/
│   ├── main/           # Electron main process
│   │   ├── main.js     # Application entry point
│   │   ├── preload.js  # Secure IPC bridge
│   │   ├── menu-builder.js
│   │   ├── file-manager.js
│   │   ├── ipc-handler.js
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
│           └── handlers/
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

```bash
npm run test:unit
```

### Integration Tests

```bash
npm run test:integration
```

## Code Quality

### Linting and Formatting

```bash
npm run lint        # Check for issues
npm run lint:fix    # Fix issues automatically
npm run format      # Format code
```

### Type Checking

```bash
npm run typecheck
```

## API Documentation

The editor exposes a comprehensive IPC-based API for external scripting. See [docs/api/README.md](docs/api/README.md) for full documentation.

### Quick Example

```javascript
// Execute a command via IPC
await electronAPI.executeCommand('document.setContent', {
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

MIT
