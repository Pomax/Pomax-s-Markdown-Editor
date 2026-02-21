# Getting Started with Markdown Editor Development

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v22.0.0 or higher)
- **npm** (comes with Node.js)
- **Git**

## Initial Setup

### 1. Clone the Repository

```sh
git clone <repository-url>
cd markdown-editor
```

### 2. Install Dependencies

```sh
npm install
```

This also runs `electron-builder install-app-deps` via the `postinstall` script, which rebuilds native modules (e.g. `better-sqlite3`) against the installed Electron version.

### 3. Run the Application

```sh
npm start
```

This will launch the Electron application.

## Project Overview

### Directory Structure

```
markdown-editor/
├── src/                    # Source code
│   ├── main/              # Electron main process
│   │   ├── main.js        # Application entry point
│   │   ├── preload.cjs    # Secure IPC bridge (CommonJS)
│   │   ├── menu-builder.js
│   │   ├── file-manager.js
│   │   ├── ipc-handler.js
│   │   ├── settings-manager.js
│   │   └── api-registry.js
│   │
│   └── renderer/          # Electron renderer process
│       ├── index.html
│       ├── icons/         # Lucide SVG icons (copied at build time)
│       ├── styles/
│       │   ├── main.css
│       │   ├── editor.css
│       │   ├── toolbar.css
│       │   ├── image.css
│       │   ├── table.css
│       │   ├── toc.css
│       │   ├── preferences.css
│       │   ├── word-count.css
│       │   ├── search.css
│       │   └── tab-bar.css
│       └── scripts/
│           ├── app.js           # Renderer entry point
│           ├── editor/          # Core editor, undo, selection, renderers
│           ├── parser/          # Markdown parser + syntax tree
│           ├── toolbar/         # Formatting toolbar + icons
│           ├── handlers/        # Keyboard + menu event handlers
│           ├── image/           # Image insert/edit modal
│           ├── table/           # Table insert/edit modal
│           ├── tab-bar/         # Multi-file tab bar
│           ├── toc/             # Table of Contents sidebar
│           ├── search/          # Search panel
│           ├── preferences/     # Preferences modal
│           └── word-count/      # Word count modal
│
├── test/
│   ├── unit/              # Node.js native unit tests
│   └── integration/       # Playwright integration tests
│
├── docs/
│   ├── api/               # API documentation
│   └── developers/        # Developer guides (you are here)
│
├── scripts/               # Build and utility scripts
│   ├── copy-icons.js      # Copies Lucide SVG icons into src/renderer/icons
│   ├── generate-api-docs.js
│   └── clean-dist.js      # Removes intermediate build artifacts from dist/
│
├── .github/workflows/     # GitHub Actions CI
│   └── build.yml          # Builds executables for Win/Mac/Linux on push
│
├── package.json
├── biome.json             # Biome linter/formatter config
├── jsconfig.json          # TypeScript type-checking config (for JSDoc)
├── playwright.config.js   # Playwright integration test config
└── requirements.md        # Product requirements
```

### Key Files

| File | Purpose |
|------|---------|
| `src/main/main.js` | Application entry point, window creation, lifecycle |
| `src/main/preload.cjs` | Secure IPC bridge (must be CommonJS) |
| `src/main/ipc-handler.js` | Registers all IPC handlers, routes messages |
| `src/main/file-manager.js` | File load/save/recent files |
| `src/main/menu-builder.js` | Application menu construction |
| `src/main/settings-manager.js` | Settings persistence via SQLite |
| `src/main/api-registry.js` | External scripting API |
| `src/renderer/scripts/app.js` | Renderer entry point, wires everything together |
| `src/renderer/scripts/editor/editor.js` | Core editor class (coordinator) |
| `src/renderer/scripts/parser/markdown-parser.js` | Markdown → syntax tree |
| `src/renderer/scripts/parser/syntax-tree.js` | SyntaxTree / SyntaxNode data structures |
| `src/types.d.ts` | Global TypeScript type declarations |

## Running Tests

### Unit Tests

Run all unit tests:
```sh
npm run test:unit
```

Run a specific test file:
```sh
node --test test/unit/parser/markdown-parser.test.js
```

### Integration Tests

First, install Playwright Firefox browser (one time):
```sh
npx playwright install firefox
```

Run integration tests:
```sh
npm run test:integration
```

### All Tests + Lint

```sh
npm run test
```

This runs `lint` → `test:unit` → `test:integration` in sequence.

## Code Quality

### Linting and Formatting

We use Biome for linting and code formatting, and TypeScript for type checking via JSDoc annotations. The `lint` script runs all three:

```sh
# Run all checks (lint + format + type check)
npm run lint

# Individual steps:
npm run lint:fix       # Biome lint with auto-fix
npm run lint:format    # Biome format
npm run lint:typing    # TypeScript type checking (tsc)
```

## Building Executables

Build a standalone executable for the current platform:

```sh
npm run dist
```

Or target a specific platform:

```sh
npm run dist:win    # Windows portable .exe
npm run dist:mac    # macOS .zip
npm run dist:linux  # Linux AppImage
```

Output goes to `dist/`. The GitHub Actions workflow (`.github/workflows/build.yml`) builds all three platforms automatically on every push to `main` and publishes them as a GitHub Release.

## Development Workflow

### Making Changes

1. Make your changes following the coding conventions (see [Design](./design.md))
2. Add tests for new functionality
3. Run `npm run lint` to check for issues
4. Run `npm run test` to ensure nothing is broken
5. Update documentation if needed

### Code Style

- Use ES Modules (`import`/`export`)
- Add JSDoc comments to all public APIs
- One class per file
- No nested function declarations
- No inline function arguments (except trivial arrow functions)
- Run `npm run lint` before committing

## Common Tasks

### Adding a New Toolbar Button

1. Add a new entry to `getButtonConfigs()` in `src/renderer/scripts/toolbar/toolbar.js`
2. Add a Lucide SVG icon entry in `src/renderer/scripts/toolbar/icons.js`
3. Add a button color rule in `src/renderer/styles/toolbar.css`
4. Handle the action in `Editor.applyFormat()` if needed

### Adding a New Markdown Element

1. Add pattern to `MarkdownParser.blockPatterns` in `src/renderer/scripts/parser/markdown-parser.js`
2. Add handler method in `MarkdownParser`
3. Add `toMarkdown()` case in `SyntaxNode` (`src/renderer/scripts/parser/syntax-tree.js`)
4. Add rendering in both `SourceRenderer` and `FocusedRenderer`
5. Add tests for parser and rendering
6. Update documentation

### Adding a New API Command

1. Add command in `APIRegistry.registerBuiltInCommands()` (`src/main/api-registry.js`)
2. Handle it in the renderer via `app.js` → `onExternalAPI` listener
3. Update `docs/api/README.md` and `docs/api/api-v*.json`
4. Add tests

### Adding a New Preference

1. Add a default constant and UI (fieldset + controls) in `src/renderer/scripts/preferences/preferences-modal.js`
2. Add a nav link, a load method, and save logic with a custom event dispatch
3. Add CSS styles in `src/renderer/styles/preferences.css`
4. Wire the custom event listener in `src/renderer/scripts/app.js`
5. Persist via `setSetting` / `getSetting` IPC calls

### Modifying the Menu

1. Open `src/main/menu-builder.js`
2. Modify the appropriate menu section in `buildTemplate()`
3. Menu actions are sent to the renderer via `menu:action` IPC channel
4. Handle new actions in `src/renderer/scripts/handlers/menu-handler.js`

## Debugging

### Using Debug Mode

Help → Debug opens DevTools and enables right-click context menus with "Inspect Element".

### Main Process

Main process logs appear in the terminal where `npm start` was run.

### Renderer Process

Renderer logs appear in the DevTools console (open via Help → Debug or F12).

## Security Model

The app uses Electron's recommended security settings:
- `contextIsolation: true` — renderer cannot access Node.js
- `nodeIntegration: false` — no `require()` in renderer
- `webSecurity: false` — allows loading local `file://` images
- All IPC goes through the preload script (`preload.cjs`)
- The renderer only sees the API surface defined in `preload.cjs`

## Common Issues

### "electronAPI is not defined"

The preload script isn't loaded. Check:
1. The `preload` path in `main.js` is correct
2. `contextIsolation` is `true` in webPreferences

### Tests fail with "Cannot find module"

ESM requires full file extensions and proper relative paths:
```javascript
import { MyClass } from './my-class.js';  // .js is required
```

### Native module errors after Electron upgrade

Rebuild native dependencies:
```sh
npx electron-builder install-app-deps
```

### Changes not reflected in the app

1. Restart the application (`npm start`)
2. Check the DevTools console for errors (Help → Debug)

## Further Reading

- [Architecture](./architecture.md) — component overview and data flow
- [Design](./design.md) — coding conventions and patterns
- [API Documentation](../api/README.md) — external scripting API
