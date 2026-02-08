# Getting Started with Markdown Editor Development

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18.0.0 or higher)
- **npm** (v9.0.0 or higher)
- **Git**

## Initial Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd markdown-editor
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Application

```bash
npm start
```

This will launch the Electron application.

## Project Overview

### Directory Structure

```
markdown-editor/
├── src/                    # Source code
│   ├── main/              # Electron main process
│   └── renderer/          # Electron renderer process
├── test/                  # Test files
│   ├── unit/             # Unit tests
│   └── integration/      # Integration tests
├── docs/                  # Documentation
│   ├── api/              # API documentation
│   └── developers/       # Developer guides
├── scripts/              # Utility scripts
├── package.json          # Project configuration
└── playwright.config.js  # Playwright test config
```

### Key Files

| File | Purpose |
|------|---------|
| `src/main/main.js` | Application entry point |
| `src/main/preload.cjs` | Secure IPC bridge |
| `src/renderer/index.html` | UI entry point |
| `src/renderer/scripts/app.js` | Renderer entry point |

## Running Tests

### Unit Tests

Run all unit tests:
```bash
npm run test:unit
```

Run a specific test file:
```bash
node --test test/unit/parser/markdown-parser.test.js
```

### Integration Tests

First, install Playwright Firefox browser:
```bash
npx playwright install firefox
```

Run integration tests:
```bash
npm run test:integration
```

## Code Quality

### Linting and Formatting

We use Biome for linting and code formatting:

```bash
# Check for lint errors
npm run lint

# Fix lint errors automatically
npm run lint:fix

# Format code
npm run format
```

### Type Checking

We use TypeScript (`tsc`) to check our JavaScript code with JSDoc annotations:

```bash
npm run typecheck
```

## Development Workflow

### Making Changes

1. Create a new branch for your feature/fix
2. Make your changes following the coding conventions
3. Add tests for new functionality
4. Run all tests to ensure nothing is broken
5. Update documentation if needed
6. Submit a pull request

### Code Style

- Use ES Modules (`import`/`export`)
- Add JSDoc comments to all public APIs
- One class per file
- No nested function declarations
- No inline function arguments (except trivial arrow functions)
- Run `npm run lint:fix` before committing

### Type Checking

We use JSDoc for type annotations and TypeScript for type checking. Run `npm run typecheck` to verify types.

Example:
```javascript
/**
 * @param {string} markdown - The markdown to parse
 * @returns {SyntaxTree}
 */
function parse(markdown) {
    // ...
}
```

## Common Tasks

### Adding a New Toolbar Button

1. Open `src/renderer/scripts/toolbar/toolbar.js`
2. Add a new entry to `getButtonConfigs()`:
   ```javascript
   {
       id: 'my-button',
       label: 'My Button',
       icon: '★',
       action: 'format:myformat',
       applicableTo: ['paragraph'],
   }
   ```
3. Add a Lucide SVG icon entry in `src/renderer/scripts/toolbar/icons.js`:
   ```javascript
   'my-button': '<svg xmlns="http://www.w3.org/2000/svg" ...>...</svg>',
   ```
4. Add a button color rule in `src/renderer/styles/toolbar.css`:
   ```css
   .toolbar-button[data-button-id="my-button"] { color: #0d6efd; }
   ```
5. Handle the action in `Editor.applyFormat()` if needed

### Adding a New Markdown Element

1. Add pattern to `MarkdownParser`:
   ```javascript
   {
       type: 'my-element',
       pattern: /^@(.*)$/,
       handler: this.parseMyElement.bind(this),
   }
   ```

2. Add handler method:
   ```javascript
   parseMyElement(lines, index, match) {
       const node = new SyntaxNode('my-element', match[1]);
       return { node, nextIndex: index + 1 };
   }
   ```

3. Add rendering in `SourceRenderer` and `FocusedRenderer`

4. Add `toMarkdown()` case in `SyntaxNode`

### Adding a New API Command

1. Open `src/main/api-registry.js`
2. Add command in `registerBuiltInCommands()`:
   ```javascript
   this.registerCommand({
       name: 'myCategory.myCommand',
       description: 'Does something useful',
       category: 'myCategory',
       params: {
           param1: {
               type: 'string',
               description: 'A parameter',
               required: true,
           },
       },
       handler: async (params, webContents) => {
           webContents.send('api:external', 'myAction', params.param1);
           return { success: true };
       },
   });
   ```

3. Update API documentation

### Modifying the Menu

1. Open `src/main/menu-builder.js`
2. Modify the appropriate `build*Menu()` method
3. Add handlers if needed

## Debugging

### Main Process

Add this to your launch configuration or use:
```bash
electron --inspect=5858 .
```

Then connect Chrome DevTools to `chrome://inspect`.

### Renderer Process

Press F12 in the application window to open DevTools.

### Logging

Use `console.log()` for debugging:
- Main process logs appear in the terminal
- Renderer process logs appear in DevTools console

## Building for Production

(To be implemented)

```bash
npm run build
```

## Getting Help

- Read the [Architecture documentation](./architecture.md)
- Read the [Design documentation](./design.md)
- Check the [API documentation](../api/README.md)
- Look at existing code for examples
- Ask questions in the team chat

## Common Issues

### "electronAPI is not defined"

This means the preload script isn't loaded. Check:
1. The `preload` path in `main.js` is correct
2. `contextIsolation` is `true` in webPreferences

### Tests fail with "Cannot find module"

Ensure you're using the correct import paths. ESM requires:
- Full file extensions (`.js`)
- Proper relative paths (`./` or `../`)

### Changes not reflected in the app

Try:
1. Restart the application
2. Clear any caches
3. Check for console errors
