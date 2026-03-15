# Markdown Editor - Design Documentation

## Overview

This document describes the design decisions, patterns, and conventions used in the Markdown Editor. It complements the Architecture documentation and provides guidance for implementing new features.

## Design Principles

### 1. Separation of Concerns

Each class has a single, well-defined responsibility:
- **Parser**: Converts text to tree structure
- **SyntaxTree**: Holds document structure
- **Renderer**: Converts tree to DOM
- **Editor**: Coordinates all components

### 2. One Class Per File

Every class is in its own file:
```
src/web/scripts/editor/
├── editor.js              # Editor class (coordinator)
├── cursor-manager.js      # CursorManager — DOM ↔ tree cursor sync
├── table-manager.js       # TableManager — table cell editing
├── input-handler.js       # InputHandler — keyboard/beforeinput dispatch
├── edit-operations.js     # EditOperations — insert, backspace, delete, enter
├── range-operations.js    # RangeOperations — selection range deletion, Ctrl+A
├── clipboard-handler.js   # ClipboardHandler — cut, copy
├── event-handler.js       # EventHandler — click, focus, blur, drag/drop
├── image-helper.js        # ImageHelper — image modal, insert/update, path rewriting
├── link-helper.js         # LinkHelper — link edit modal
├── offset-mapping.js      # Pure functions for raw ↔ rendered offset mapping
├── undo-manager.js        # UndoManager class
├── selection-manager.js   # SelectionManager class
├── crc32.js               # CRC32 digest for content-change detection
├── cursor-persistence.js  # Cursor position ↔ absolute source offset conversion
├── page-resize.js         # Page resize handles (both source and writing modes)
└── syntax-highlighter.js  # Inline syntax highlighting
```

### 3. No Nested Function Declarations

Functions are not declared inside other functions. Instead:
- Use class methods
- Use separate utility functions
- Use arrow functions only for simple callbacks

**Wrong:**
```javascript
function outer() {
    function inner() { /* ... */ }
    inner();
}
```

**Correct:**
```javascript
function inner() { /* ... */ }

function outer() {
    inner();
}
```

### 4. No Inline Function Arguments

Functions are not declared inline as arguments:

**Wrong:**
```javascript
array.map(function(item) {
    return item.value;
});
```

**Correct:**
```javascript
function extractValue(item) {
    return item.value;
}

array.map(extractValue);
```

Exception: Simple arrow functions for trivial operations:
```javascript
array.filter(item => item.active);
```

## File Organization

### Source Structure

```
src/
├── electron/                  # Electron main process
│   ├── main.js               # Entry point, window creation, lifecycle
│   ├── preload.cjs           # Secure IPC bridge (must be CommonJS)
│   ├── menu-builder.js       # Application menu construction
│   ├── file-manager.js       # File load/save/recent files
│   ├── ipc-handler.js        # IPC routing and handler registration
│   ├── api-registry.js       # External scripting API
│   └── settings-manager.js   # Settings persistence (SQLite)
│
├── web/                  # Electron renderer process
│   ├── index.html            # HTML entry
│   ├── icons/                # Lucide SVG icons
│   ├── styles/               # CSS files
│   │   ├── main.css         # Base styles, CSS custom properties
│   │   ├── editor.css       # Editor and syntax highlighting styles
│   │   ├── toolbar.css      # Toolbar styles
│   │   ├── image.css        # Image dialog and element styles
│   │   ├── link.css         # Link dialog styles
│   │   ├── table.css        # Table dialog and element styles
│   │   ├── toc.css          # Table of Contents sidebar styles
│   │   ├── preferences.css  # Preferences modal styles
│   │   ├── word-count.css   # Word count modal styles
│   │   ├── search.css       # Search panel styles
│   │   └── tab-bar.css      # Tab bar styles
│   │
│   └── scripts/              # JavaScript
│       ├── app.js           # App entry, wires components together
│       ├── editor/          # Core editor components
│       │   ├── editor.js              # Editor class (coordinator)
│       │   ├── cursor-manager.js      # DOM ↔ tree cursor sync
│       │   ├── table-manager.js       # Table cell editing
│       │   ├── input-handler.js       # Keyboard/beforeinput dispatch
│       │   ├── edit-operations.js     # Insert, backspace, delete, enter
│       │   ├── range-operations.js    # Selection range deletion, Ctrl+A
│       │   ├── clipboard-handler.js   # Cut, copy
│       │   ├── event-handler.js       # Click, focus, blur, drag/drop
│       │   ├── image-helper.js        # Image modal, path rewriting
│       │   ├── link-helper.js         # Link edit modal
│       │   ├── offset-mapping.js      # Raw ↔ rendered offset mapping
│       │   ├── undo-manager.js        # UndoManager class
│       │   ├── selection-manager.js   # SelectionManager class
│       │   ├── syntax-highlighter.js  # Inline syntax highlighting
│       │   ├── parse-tree.js          # Parse tree cursor helper
│       │   └── renderers/
│       │       ├── source-renderer.js
│       │       └── writing-renderer.js
│       ├── parser/          # Markdown parser
│       │   ├── dfa-tokenizer.js
│       │   ├── dfa-parser.js
│       │   ├── inline-tokenizer.js
│       │   └── syntax-tree.js
│       ├── toolbar/         # Toolbar UI
│       │   ├── toolbar.js
│       │   ├── toolbar-button.js
│       │   └── icons.js
│       ├── handlers/        # Event handlers
│       │   ├── keyboard-handler.js
│       │   └── menu-handler.js
│       ├── image/           # Image modal
│       │   └── image-modal.js       ├── link/            # Link modal
       │   └── link-modal.js
       ├── modal/           # Base modal class
       │   └── base-modal.js│       ├── table/           # Table modal
│       │   └── table-modal.js
│       ├── toc/             # Table of Contents sidebar
│       │   └── toc.js
│       ├── preferences/     # Preferences modal
│       │   └── preferences-modal.js
│       ├── search/          # Search panel
│       │   └── search-bar.js
│       └── word-count/      # Word count modal
│           └── word-count-modal.js
│
└── types.d.ts                # Global TypeScript type declarations
```

### Test Structure

```
test/
├── unit/                     # Unit tests (Node.js native test runner)
│   ├── parser/
│   │   ├── dfa-parser.test.js
│   │   ├── syntax-tree.test.js
│   │   └── inline-tokenizer.test.js
│   ├── editor/
│   │   ├── undo-manager.test.js
│   │   ├── crc32.test.js
│   │   ├── cursor-persistence.test.js
│   │   ├── offset-mapping.test.js
│   │   └── page-resize.test.js
│   ├── table/
│   │   └── table-modal.test.js
│   └── word-count/
│       └── word-count-modal.test.js
│
└── integration/              # Integration tests (Playwright + Firefox)
    ├── test-utils.js
    ├── app-functionality/
    │   ├── app/
    │   │   ├── editor.spec.js
    │   │   ├── file-buttons.spec.js
    │   │   ├── load-images.spec.js
    │   │   ├── page-height.spec.js
    │   │   ├── page-resize.spec.js
    │   │   ├── reload.spec.js
    │   │   ├── search.spec.js
    │   │   └── session-save.spec.js
    │   ├── document/
    │   │   ├── code-block-trailing-paragraph.spec.js
    │   │   ├── details-collapse-toggle.spec.js
    │   │   ├── details-trailing-paragraph.spec.js
    │   │   ├── html-block.spec.js
    │   │   ├── html-image.spec.js
    │   │   ├── iframe.spec.js
    │   │   ├── inline-html.spec.js
    │   │   ├── toc-highlight.spec.js
    │   │   ├── toc-scroll.spec.js
    │   │   ├── underscore-emphasis.spec.js
    │   │   ├── view-mode-dropdown.spec.js
    │   │   └── view-mode-switch.spec.js
    │   └── toolbar/
    │       ├── bold-button.spec.js
    │       ├── checklist.spec.js
    │       ├── image.spec.js
    │       ├── italic-button.spec.js
    │       ├── list.spec.js
    │       ├── strikethrough-button.spec.js
    │       ├── subscript-button.spec.js
    │       ├── superscript-button.spec.js
    │       ├── table.spec.js
    │       ├── toolbar-active.spec.js
    │       └── toolbar-tooltip.spec.js
    └── user-interaction/
        ├── content/
        │   ├── backspace-after-html-block.spec.js
        │   ├── backspace-heading.spec.js
        │   ├── code-block-enter.spec.js
        │   ├── cursor-typing-delimiters.spec.js
        │   ├── details-summary-input.spec.js
        │   ├── heading-input.spec.js
        │   ├── inline-image.spec.js
        │   ├── source-view-summary-edit.spec.js
        │   └── table-cell-edit.spec.js
        └── interaction/
            ├── click-outside-defocus.spec.js
            ├── cursor-scroll.spec.js
            ├── cursor-sync.spec.js
            ├── image-click-edit.spec.js
            ├── link-click-edit.spec.js
            ├── link-single-click.spec.js
            ├── linked-image-click-edit.spec.js
            ├── paste.spec.js
            ├── range-handling.spec.js
            ├── select-all.spec.js
            └── source-view-editing.spec.js
```

## Coding Conventions

### JSDoc Type Annotations

All functions, classes, and significant variables should have JSDoc:

```javascript
/**
 * Parses markdown text into a syntax tree.
 * @param {string} markdown - The markdown text to parse
 * @returns {SyntaxTree} The parsed syntax tree
 */
function parse(markdown) {
    // ...
}
```

### Class Structure

```javascript
/**
 * @fileoverview Description of this file.
 */

import { Dependency } from './dependency.js';

/**
 * Description of the class.
 */
export class MyClass {
    /**
     * @param {Type} param - Description
     */
    constructor(param) {
        /** @type {Type} */
        this.property = param;
    }

    /**
     * Description of method.
     * @param {Type} param - Description
     * @returns {Type} Description
     */
    methodName(param) {
        // Implementation
    }
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `SyntaxTree` |
| Functions | camelCase | `parseMarkdown` |
| Variables | camelCase | `nodeCount` |
| Constants | UPPER_SNAKE | `MAX_RETRIES` |
| Private | underscore prefix | `_privateMethod` |
| Files | kebab-case | `syntax-tree.js` |
| CSS classes | kebab-case | `md-heading-marker` |

### Import/Export

Use ES Modules:
```javascript
// Named exports
export { ClassName };
export function utilityFunction() {}

// Named imports
import { ClassName, utilityFunction } from './module.js';
```

## Component Patterns

### Editor Pattern

The Editor class uses a coordinator pattern. It delegates concerns to
focused manager classes that receive the editor as a constructor argument:

```javascript
class Editor {
    constructor(container) {
        this.parser = new DFAParser();
        this.syntaxTree = null;
        this.sourceRenderer = new SourceRenderer(this);
        this.writingRenderer = new WritingRenderer(this);
        this.undoManager = new UndoManager();

        // Task managers
        this.cursorManager = new CursorManager(this);
        this.tableManager = new TableManager(this);
        this.inputHandler = new InputHandler(this);
        this.editOperations = new EditOperations(this);
        this.rangeOperations = new RangeOperations(this);
        this.clipboardHandler = new ClipboardHandler(this);
        this.eventHandler = new EventHandler(this);
        this.imageHelper = new ImageHelper(this);
        this.linkHelper = new LinkHelper(this);
    }

    loadMarkdown(markdown) {
        this.syntaxTree = this.parser.parse(markdown);
        this.undoManager.clear();
        this.fullRenderAndPlaceCursor();
    }
}
```

Each manager accesses editor state via `this.editor` and calls back into
the editor's public API (e.g. `this.editor.recordAndRender()`,
`this.editor.placeCursor()`). The editor itself keeps the public API
surface, document state, and rendering methods.
```

### Parser Pattern

The parser uses a token-driven DFA. A character-level tokenizer produces a flat token stream, then the parser dispatches to block-specific sub-parsers based on the current token:

```javascript
class DFAParser {
    parse(markdown) {
        const tokens = tokenize(markdown);
        const tree = new SyntaxTree();
        const ctx = { tokens, pos: 0, line: 0 };

        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type !== 'EOF') {
            if (ctx.tokens[ctx.pos].type === 'NEWLINE') {
                ctx.line++;
                ctx.pos++;
                continue;
            }
            const node = this._parseBlock(ctx);
            if (node) tree.appendChild(node);
        }
        return tree;
    }
}
```

### Renderer Pattern

Renderers convert syntax tree nodes to DOM:

```javascript
class SourceRenderer {
    render(syntaxTree, container) {
        container.innerHTML = '';
        for (const node of syntaxTree.children) {
            const element = this.renderNode(node);
            container.appendChild(element);
        }
    }

    renderNode(node) {
        switch (node.type) {
            case 'heading1':
                return this.renderHeading(node);
            case 'paragraph':
                return this.renderParagraph(node);
            // ...
        }
    }
}
```

## Event Handling

### Custom Events

Use CustomEvent for component communication:

```javascript
// Dispatch
const event = new CustomEvent('editor:selectionchange', {
    detail: { selection, node }
});
this.container.dispatchEvent(event);

// Listen
editor.container.addEventListener('editor:selectionchange', handleSelection);
```

### IPC Events

Use the preload API for IPC:

```javascript
// In renderer
window.electronAPI.onMenuAction((action, ...args) => {
    handleAction(action, args);
});

// In main
window.webContents.send('menu:action', 'file:save');
```

## State Management

### Document State

The document state is the SyntaxTree:
- Single source of truth
- Immutable operations (create new nodes)
- Serializable to markdown

### UI State

UI state is managed locally:
- View mode in Editor
- Button states in Toolbar
- Selection in SelectionManager

### Undo State

Undo state is managed by UndoManager:
- Before/after content snapshots
- Unlimited history stack
- Batching for rapid changes

## Error Handling

### Graceful Degradation

```javascript
async function loadFile() {
    try {
        const result = await fileManager.load();
        if (result.success) {
            editor.loadMarkdown(result.content);
        }
    } catch (error) {
        console.error('Failed to load file:', error);
        // Show user-friendly message
    }
}
```

### API Error Responses

```javascript
function executeCommand(command, params) {
    if (!commands.has(command)) {
        return { success: false, error: `Unknown command: ${command}` };
    }
    // ...
}
```

## CSS Architecture

### Custom Properties

Use CSS custom properties for theming:

```css
:root {
    --color-primary: #0d6efd;
    --spacing-md: 1rem;
    --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.button {
    color: var(--color-primary);
    padding: var(--spacing-md);
    font-family: var(--font-family);
}
```

### BEM-like Naming

```css
.md-line { }              /* Block */
.md-line.md-heading1 { }  /* Block with modifier */
.md-heading-marker { }    /* Element within context */
```

## Testing Guidelines

### Unit Tests

Test individual functions and classes:

```javascript
describe('DFAParser', () => {
    it('should parse heading level 1', () => {
        const parser = new DFAParser();
        const tree = parser.parse('# Title');
        assert.strictEqual(tree.children[0].type, 'heading1');
    });
});
```

### Integration Tests

Test complete user workflows:

```javascript
test('should allow typing in the editor', async () => {
    const editor = await page.locator('#editor');
    await editor.click();
    await page.keyboard.type('Hello');
    const content = await editor.innerText();
    expect(content).toContain('Hello');
});
```

## Adding New Features

### Adding a New Element Type

1. Add block dispatch case in `DFAParser._parseBlock()`
2. Create sub-parser method in `DFAParser`
3. Add `toMarkdown()` case in `SyntaxNode`
4. Add render method in `SourceRenderer`
5. Add render method in `WritingRenderer`
6. Add button config in `Toolbar.getButtonConfigs()` (if it should appear in the toolbar)
7. Add a Lucide SVG icon entry in `toolbar/icons.js`
8. Add a button color rule in `toolbar.css`
9. Add tests for parser and rendering
10. Update documentation

### Adding a New API Command

1. Add command in `APIRegistry.registerBuiltInCommands()`
2. Handle the action in the renderer via the `onExternalAPI` listener in `app.js`
3. Update `docs/api/README.md`
4. Update `docs/api/api-v*.json`
5. Add tests for the command

### Adding a New Preference

1. Add a default constant in `preferences-modal.js`
2. Add a nav link (`data-section`) and fieldset with controls
3. Add a load method (called from `open()`)
4. Add save logic that persists via `setSetting` and dispatches a custom event
5. Add CSS styles in `preferences.css`
6. Wire the custom event listener in `app.js` to update runtime state
7. Add tests if the preference has complex logic
