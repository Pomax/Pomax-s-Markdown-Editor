# Preview Window

The **View → Preview** menu item (shortcut `CmdOrCtrl+3`) opens a separate `BrowserWindow` that renders the current document as real HTML. Scripts, styles, links, and images all work because they are genuine DOM elements served over HTTP.

## How it works

1. **`SyntaxTree.toHTML()`** returns `{ head: string, body: string }`. Head-level html-block elements (`style`, `script`, `link`, `meta`, `base`) are placed in `head`; everything else goes in `body`. The static set `SyntaxTree.HEAD_TAGS` controls the split. Each `SyntaxNode.toHTML()` converts a single node to its HTML representation (headings, paragraphs, blockquotes, code-blocks, list-items, images, tables, html-blocks, etc.). Inline children are recursively rendered via `SyntaxNode._inlineChildrenToHTML()`.
2. **Menu handler** (`menu-handler.js → handlePreview()`) calls `syntaxTree.toHTML()`, destructures `{ head, body }`, and sends both plus the document's `filePath` to `window.electronAPI.openPreview(head, body, filePath)`.
3. **Preload bridge** (`preload.cjs → openPreview`) forwards the three arguments over IPC channel `preview:open`.
4. **IPC handler** (`ipc-handler.js → registerPreviewHandlers()`) receives `(head, body, filePath)` and:
   - Spins up a local HTTP server on `127.0.0.1` with a random port.
   - `GET /` serves the generated HTML document (head + body assembled into a full `<!DOCTYPE html>` page).
   - All other request paths serve static files from the document's directory, with MIME type lookup via `IPCHandler.MIME_TYPES` and directory-traversal protection.
   - Opens a new `BrowserWindow` (sandboxed, no preload, no nodeIntegration) and loads `http://127.0.0.1:<port>/`.
   - When the preview window is closed, the HTTP server is shut down.
5. For **unsaved documents** (`filePath` is `null`), the server still serves the HTML at `/` but relative resource requests return 404.

## Key files

| File | Role |
|------|------|
| `src/renderer/scripts/parser/syntax-tree.js` | `SyntaxNode.toHTML()`, `SyntaxTree.toHTML()`, `HEAD_TAGS` |
| `src/renderer/scripts/handlers/menu-handler.js` | `handlePreview()` — triggers the preview |
| `src/main/ipc-handler.js` | `registerPreviewHandlers()` — HTTP server + BrowserWindow |
| `src/main/preload.cjs` | `openPreview(head, body, filePath)` bridge |
| `src/main/menu-builder.js` | "Preview" menu item in View menu (CmdOrCtrl+3) |
| `src/types.d.ts` | `openPreview` type declaration on ElectronAPI |
| `test/unit/parser/to-html.test.js` | Unit tests for toHTML() |
| `test/integration/app-functionality/document/preview-window.spec.js` | Integration tests for preview window |

## Status (work in progress)

Manual testing is not yet complete. The following needs to be verified:
- CSS from `<style>` and `<link>` tags is applied in the preview
- `<script>` tags execute
- Images with relative paths load
- The preview window is isolated from the editor
