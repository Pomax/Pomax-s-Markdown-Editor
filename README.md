# Pomax's Markdown Editor

A GitHub-flavoured markdown editor built using the web stack, running in Electron, featuring a syntactic tree-based document model for fast editing of large documents (e.g. 50k+ work documents like https://pomax.github.io/are-we-flying).

![A screenshot of the editor](./screenshot-1.png)

## Current version: v1.7.0

See the [release notes](./RELEASE_NOTES.md) for what's new in this version.

### Downloads

This editor is released as a standalone, installer-free executable for Windows, MacOS, and Linux. Current download links:

- Windows exe: [Markdown.Editor.1.7.0.exe](https://github.com/Pomax/Pomax-s-Markdown-Editor/releases/download/v1.7.0/Markdown.Editor.1.7.0.exe)
- MacOS App (zipped): [Markdown.Editor-1.7.0-arm64-mac.zip](https://github.com/Pomax/Pomax-s-Markdown-Editor/releases/download/v1.7.0/Markdown.Editor-1.7.0-arm64-mac.zip)
- Linux AppImage: [Markdown.Editor-1.7.0.AppImage](https://github.com/Pomax/Pomax-s-Markdown-Editor/releases/download/v1.7.0/Markdown.Editor-1.7.0.AppImage)

Previous versions can be found over on the [Releases](https://github.com/Pomax/Pomax-s-Markdown-Editor/releases/latest) page.

## Eww, Electron?

Sorry, did you not have 8+GB if RAM and 1TB+ of disk space? Stop pretending you care about Electron, you care about whether the tools are useful or not. Yes, it's dumb that 2 MB of resources needs 100MB of UI runner, but on the other hand, it's literally a browser, and have you looked at what browsers need to support these days? Can you even _count_ the number of web APIs? =P

## Fine... so what is this?

This is part experiment, part necessary tooling: I needed a markdown editor that can actually work with huge documents without either being "split view", or needing installers that require admin rights while secretly owned by a Chinese company. I also wanted to see if Opus 4.5/4.6 was up to the task of doing normal software development. So this is a public domain licensed (i.e. no license claims whatsoever) piece of open source software that was product managed by me, and written by Opus. 

Also note that this project was not "vibe coded": the dev work uses branches, unit tests, integration tests, as well as up to date docs and requirements with acceptance criteria. All of this is standard dev practice, and no work that fails testing gets through. Also, plans get shot down plenty because they make assumptions that don't hold up, or would make it harder to work on the code. The point here is to have a codebase that is accessible to both AI agents as well as real human beings if they want to help fix something, or land a new feature.

If you intend to use an agent, every prompt should be preceded by `(re)read the ai-agent-notes first, and then ...` because agents can't pin instructions. They _will_ just remove that information from their context for no reason, at any time.

## So it's AI slop, got it.

If you think a fully featured markdown editor with a codebase that you can actually read, with design and architecture docs that accurately reflect that codebase, and over 500 tests is slop, then it might be time to start forming your own opinions again instead of just parroting others. These tools need a lot of work to make sure they do the right thing, and plenty of dev work went into making an editor that _I_ would use, and my requirements are much more demanding than most because code that can't be maintained and explained is code that shouldn't exist.

## Features

- **Fast Editing**: Documents are parsed into a syntactic tree structure, enabling efficient editing regardless of document size
- **Dual View Modes**:
  - **Source View**: Shows literal markdown with syntax highlighting
  - **Focused Writing**: WYSIWYG-style editing that hides syntax unless focused
- **WYSIWYG Toolbar**: Context-aware formatting toolbar that adapts to the current element
- **Table of Contents**: Resizable sidebar with live-updating headings navigation (left or right)
- **Image Support**: Insert, edit, rename, and drag & drop images; gather images into the document folder
- **Table Support**: Insert and edit tables via a modal dialog
- **Search**: Find text in the editor with plain text or regex, case-sensitive toggle, and match navigation (`Ctrl+F`)
- **Preferences**: Configurable page margins, page width, page colors, default view mode, and TOC settings
- **Word Count**: Total word count and word count excluding code (File → Word Count)
- **Multi-file Editing**: Open multiple documents in tabs; tab bar at bottom, switchable via View menu
- **Unlimited Undo/Redo**: Complete edit history with no limit
- **Scripting API**: Full IPC-based API for external automation
- **A4 Page Layout**: Document-centric design with configurable page dimensions
- **Debug Mode**: Help → Debug opens DevTools and enables context menus

## Running from source

You can obviously just run this project from source if you want. It's just a web stack project wrapped by Electron.

### Prerequisites

- Node.js 22.0.0 or higher

### Installation

```sh
npm install
```

You will also need to run a one-time `npx playwright install firefox --with-deps` to ensure you can run the integration tests.

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
│           ├── link/
│           ├── modal/
│           ├── table/
│           ├── tab-bar/
│           ├── toc/
│           ├── search/
│           ├── preferences/
│           └── word-count/
│
├── test/
│   ├── unit/           # Node.js native unit tests
│   └── integration/    # Playwright integration tests
│
├── docs/
│   ├── api/            # API documentation for IPC interaction
│   └── developers/     # Developer guides
│
└── scripts/            # Build utilities
```

## Testing

You run the full test suite using `npm test`. Nice and obvious. This will run linting, formatting, consistency testing, unit testing, and integration testing.

### Linting

The general linting task performs both linting and formatting using Biome, and consistency testing using the typescript transpiler set to JS with `--no-emit` so that it performs analysis only.

```sh
npm run lint
```

### Unit Tests

Unit tests use Node's built in testing framework, and can be run on their own using:

```sh
npm run test:unit
```

### Integration Tests

Integration testing uses Playwright with Firefox, and can be run on their own using:

```sh
npm run test:integration
```

To run specific individual spec files, use:

```sh
npm run test:integration -- test/integration/your.file.spec.js
```

## Building Executables

To build a standalone executable for the current platform:

```sh
npm run dist
```

Build output goes to the `dist/` directory.

Note that this tasks primarily exists for automated builds using a GitHub Actions workflow that builds all three platforms on every push to `main` that bumps up the project version in `package.json`.

## API Documentation

The editor exposes a comprehensive IPC-based API for external scripting. See [docs/api/README.md](docs/api/README.md) for full documentation.

### Quick Example

```javascript
// Execute a command via IPC (api:execute channel)
const result = await ipcRenderer.invoke('api:execute', 'document.setContent', {
    content: '# Hello World\n\nThis is a paragraph.'
});
```

# Developer Documentation

- [Getting Started](docs/developers/getting-started.md)
- [Architecture](docs/developers/architecture.md)
- [Design](docs/developers/design.md)

## License

I didn't write this code, and AI can't be trusted, so this project is Public Domain. Literally do with it what you want, I'm only losing money on this, not making any.
