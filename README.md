# Pomax's Markdown Editor

A GitHub-flavoured markdown editor built using the web stack, running in Electron, featuring a syntactic tree-based document model for fast editing of large documents (e.g. 50k+ work documents like https://pomax.github.io/are-we-flying).

![A screenshot of the editor](./screenshot-1.png)

## Current version: v2.1.0

See the [release log](./RELEASE_LOG.md) for what's new in this version.

### Downloads

This editor is released as a standalone, installer-free executable for Windows, MacOS, and Linux. The current download links are:

- Windows exe: [Markdown.Editor.1.7.0.exe](https://github.com/Pomax/Pomax-s-Markdown-Editor/releases/download/v1.7.0/Markdown.Editor.1.7.0.exe)
- MacOS dmg: [Markdown.Editor-1.7.0-arm64.dmg](https://github.com/Pomax/Pomax-s-Markdown-Editor/releases/download/v1.7.0/Markdown.Editor-1.7.0-arm64.dmg)
- Linux AppImage: [Markdown.Editor-1.7.0.AppImage](https://github.com/Pomax/Pomax-s-Markdown-Editor/releases/download/v1.7.0/Markdown.Editor-1.7.0.AppImage)

Note: Linux users will need to mark the AppImage as executable before first run: `chmod +x Markdown.Editor-1.7.0.AppImage`

Previous versions can be found over on the [Releases](https://github.com/Pomax/Pomax-s-Markdown-Editor/releases/latest) page.

## Eww, Electron?

Sorry, did you not have 8+GB if RAM and 1TB+ of disk space? Stop pretending you care about Electron, you care about whether the tools are useful or not. Yes, it's dumb that 2 MB of resources needs 100MB of UI runner, but on the other hand, it's literally a browser, and have you looked at what browsers need to support these days? Can you even _count_ the number of web APIs? =P

# Fine... so what is this?

This is part experiment, part "solving a problem I have that no one else will solve for me": I need a wysiwyg GitHub flavoured markdown editor with full "html in markdown" support, and the ability to load 50,000+ word documents backed by a document tree, so that edits aren't based on "updating a single, giant, string". Which rules out literally every markdown editor out there. Think of you favourite markdown editor: it fails at least one of those criteria.

That's the tooling part, the experimental part is where I am not writing this code, I am instead directing code generation tools to write the code for me, in order to understand where and how those tools break down. Primarily, this codebase is developed by Opus 4.6, and it gets it wrong. A lot. Which in turn means I learn something about which seemingly simple problem descriptions are orders of magnitude too complex, and which order of operations are guaranteed to yield nonsense, or at best hours instead of minutes of work.

## So this is a vibe coded project?

Not really, no. This is literally an experiment into how _not_ to vibe code, and instead use these tools in a way that actually makes the same amount of sense as any other IDE automation. Because there is _so much_ these tools can't do, without telling you, and if you just let them "do their thing" instead of making them perform very specific targetted tasks based on you tracking the task list and acceptance criteria, that's on you.

## Well I don't want to use something made by AI

That's fine. There's a reason I gave this project the name that it has: this is a tool that ***I*** need. I'm putting it up on GitHub with a public domain license because that's what I do with almost everything I make, and if you don't like it, no one's forcing you to use it, or even keep reading.

# Running from source

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

# Testing

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

## License

I didn't write this code, and AI can't be trusted, so this project is Public Domain. Literally do with it what you want, I'm only losing money on this while I figure out a way in which these tools make sense.
