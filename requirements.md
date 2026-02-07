We're going to make a markdown editor that uses Electron as its application layer, and HTML, CSS, and JavaScript (pure ESM, no TypeScript, but with type hinting done via JSDoc).

It should be able to load and parse .md files into a syntactic tree structure to make edits by the user fast, no matter how long the document is, and that tree structure should be convertible into both a "source view" document, with the literal markdown text shown and some minimal styling to visually distinguish things like headings, paragraphs, tables etc., and a "focussed writing" view where the markdown syntax is hidden from the user unless their cursors is on a specific element.

Users should be able to change element identities using a standard WYSIWYG button bar that is show for the element their cursor is on, with appropriate element-specific buttons. We'll put all our source code in a `src` master folder, with a parallel folder called `test` where we will be creating node-native unit tests (in `test/unit` and playwright based integration tests (in `test/integration`).

We'll want code to be housed in "its own files", so instead of a 2000 line single script, classes go in their own files, reusable functions go in their own files, we will not be using function declarations inside other functions, nor will we declare functions as inline call arguments.

Design wise, the user should be presented with a window that uses the A4 ratio, and is a blank page. There should be a "file" menu with a "new" option to start a new document, a "load" option that loads in an .md file for editing, and a "save" option that saves the current document state back to the file system. There should also be a "save as" option that does the same as "save" but gives the user a file dialog so they can pick a specific document filename. Finally, there should also be an "exit" option that, if the document has unsaved changes, prompts the user to either save, save as, or discard changes, after which the application should terminate.

Document changes should have an unlimited undo/redo history (which means we will also need to run Electron or Node with an unbounded memory limit).

Additionally, the application should listen for IPC messages with an API that allows scripting languages like Node, Python, etc. to act as if they are the user. As such, anything the application can do should be exposed via an IPC-message API, with documentation for how to call the API in a `docs/api` folder. The API should be versioned, and the documentation should be auto-generated. Write this code with future maintenance in mind: have both architectural and design documentation in `docs/developers` that cover the important aspects of the codebase, detailed enough that a junior engineer can understand the overall implementation and knows where to start if they need to do any maintenance work.

Development notes:

- we will use pure ESM JavaScript
- we will add type hinting using JSDoc
- we will use `biome` for linting and code formatting
- we will use `tsc` with the `--allow-js` and `--no-emit` flags to perform correctness testing
- we will use `playwright` with firefox, not chromium, for integration testing

Agent notes:

- all command line tasks must be executed using `cmd`, which you should issue as its own command if we're in powershell, rather than using it as a `cmd /k` prefix from inside powershell.
- Never summarize the conversation history when you finish a task. Simply say that you have finished.
