/**
 * @fileoverview IPC Handler for main process.
 * Manages all IPC communication between main and renderer processes,
 * as well as external scripting API calls.
 */

import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { BrowserWindow, dialog, ipcMain, session } from 'electron';
import { APIRegistry } from './api-registry.js';
import { getPixelsPerMillimeter } from './main.js';
import { settings } from './settings-manager.js';

/**
 * Handles IPC communication for the application.
 */
export class IPCHandler {
    /**
     * @param {import('./file-manager.js').FileManager} fileManager - The file manager instance
     */
    constructor(fileManager) {
        /** @type {import('./file-manager.js').FileManager} */
        this.fileManager = fileManager;

        /** @type {APIRegistry} */
        this.apiRegistry = new APIRegistry();

        /** @type {boolean} */
        this.hasUnsavedChanges = false;
    }

    /**
     * Persists the open-files list to the settings database so the
     * state survives ungraceful exits.
     * @param {{filePath: string|null, active: boolean, cursorOffset?: number, contentHash?: number, scrollTop?: number, cursorPath?: number[]|null, tocHeadingPath?: number[]|null}[]} files
     */
    _persistOpenFiles(files) {
        const entries = files
            .filter(/** @param {{filePath: string|null}} f */ (f) => f.filePath)
            .map(
                /** @param {{filePath: string|null, active: boolean, cursorOffset?: number, contentHash?: number, scrollTop?: number, cursorPath?: number[]|null, tocHeadingPath?: number[]|null}} f */ (
                    f,
                ) => ({
                    filePath: f.filePath,
                    active: f.active,
                    cursorOffset: f.cursorOffset ?? 0,
                    contentHash: f.contentHash ?? 0,
                    scrollTop: f.scrollTop ?? 0,
                    cursorPath: f.cursorPath ?? null,
                    tocHeadingPath: f.tocHeadingPath ?? null,
                }),
            );

        // Only persist when there are real (saved-to-disk) files.
        // If the list is empty (e.g. only untitled docs), leave the DB
        // untouched so a previous session's state isn't wiped before a
        // restore can occur.  The graceful close handler still cleans up.
        if (entries.length > 0) {
            settings.set('openFiles', entries);
        }
    }

    /**
     * Registers all IPC handlers.
     * @param {import('./menu-builder.js').MenuBuilder} [menuBuilder] - The menu builder (for reload support)
     */
    registerHandlers(menuBuilder) {
        this.menuBuilder = menuBuilder ?? null;
        this.registerFileHandlers();
        this.registerDocumentHandlers();
        this.registerViewHandlers();
        this.registerElementHandlers();
        this.registerDialogHandlers();
        this.registerAppHandlers();
        this.registerSettingsHandlers();
        this.registerImageHandlers();
        this.registerPathHandlers();
        this.registerAPIHandlers();
        this.registerPreviewHandlers();
    }

    /**
     * Registers file-related IPC handlers.
     */
    registerFileHandlers() {
        ipcMain.handle('file:new', async () => {
            const result = this.fileManager.newDocument();
            this.broadcastToRenderers('document:reset');
            return result;
        });

        ipcMain.handle('file:load', async () => {
            const window = BrowserWindow.getFocusedWindow();
            if (!window) {
                return { success: false, message: 'No active window' };
            }
            return this.fileManager.load(window);
        });

        ipcMain.handle('file:save', async (event, content) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (!window) {
                return { success: false, message: 'No active window' };
            }
            const result = await this.fileManager.save(window, content);
            if (result.success && this.menuBuilder) {
                this.menuBuilder.refreshMenu();
            }
            return result;
        });

        ipcMain.handle('file:saveAs', async (event, content) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (!window) {
                return { success: false, message: 'No active window' };
            }
            const result = await this.fileManager.saveAs(window, content);
            if (result.success && this.menuBuilder) {
                this.menuBuilder.refreshMenu();
            }
            return result;
        });

        ipcMain.handle('file:setUnsavedChanges', async (event, hasChanges) => {
            this.hasUnsavedChanges = hasChanges;
            this.fileManager.setUnsavedChanges(hasChanges);
        });

        ipcMain.handle('file:confirmClose', async (event) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (!window) {
                return { action: 'cancel' };
            }
            const result = await dialog.showMessageBox(window, {
                type: 'warning',
                buttons: ['Save', 'Save As...', 'Discard', 'Cancel'],
                defaultId: 0,
                cancelId: 3,
                title: 'Unsaved Changes',
                message: 'You have unsaved changes. What would you like to do?',
            });
            const actions = ['save', 'saveAs', 'discard', 'cancel'];
            return { action: actions[result.response] };
        });

        ipcMain.handle('file:getRecentFiles', async () => {
            return { success: true, files: this.fileManager.getRecentFiles() };
        });
    }

    /**
     * Registers document-related IPC handlers.
     */
    registerDocumentHandlers() {
        ipcMain.handle('document:undo', async (event) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                window.webContents.send('menu:action', 'edit:undo');
            }
            return { success: true };
        });

        ipcMain.handle('document:redo', async (event) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                window.webContents.send('menu:action', 'edit:redo');
            }
            return { success: true };
        });
    }

    /**
     * Registers view-related IPC handlers.
     */
    registerViewHandlers() {
        ipcMain.handle('view:source', async (event) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                window.webContents.send('menu:action', 'view:source');
            }
            return { success: true };
        });

        ipcMain.handle('view:writing', async (event) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                window.webContents.send('menu:action', 'view:writing');
            }
            return { success: true };
        });

        ipcMain.handle('view:openFilesChanged', async (_event, files) => {
            if (this.menuBuilder) {
                this.menuBuilder.openFiles = files ?? [];
                this.menuBuilder.refreshMenu();
            }
            // Keep fileManager.currentFilePath in sync with the active tab
            const fileList = files ?? [];
            const activeFile = fileList.find(/** @param {{active: boolean}} f */ (f) => f.active);
            if (activeFile) {
                this.fileManager.currentFilePath = activeFile.filePath ?? null;
            }
            // Eagerly persist the open-files list so the state survives
            // ungraceful exits (SIGINT, SIGKILL, crashes).
            this._persistOpenFiles(fileList);
            return { success: true };
        });
    }

    /**
     * Common MIME types for static file serving in the preview server.
     * @type {Record<string, string>}
     */
    static MIME_TYPES = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.otf': 'font/otf',
        '.mp3': 'audio/mpeg',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'audio/ogg',
        '.wav': 'audio/wav',
        '.pdf': 'application/pdf',
        '.xml': 'application/xml',
        '.txt': 'text/plain',
        '.wasm': 'application/wasm',
    };

    /**
     * Registers preview-related IPC handlers.
     */
    registerPreviewHandlers() {
        ipcMain.handle('preview:open', async (_event, head, body, filePath) => {
            const docDir = filePath ? path.dirname(filePath) : null;

            // Read page dimension settings
            const pageWidth = settings.get('pageWidth', { useFixed: true, width: 210, unit: 'mm' });
            const margins = settings.get('margins', { top: 25, right: 25, bottom: 25, left: 25 });

            // Build a CSS width value for the page
            const pageWidthCSS = pageWidth.useFixed
                ? '210mm'
                : `${pageWidth.width}${pageWidth.unit}`;

            // Inject default styling into the head so the preview matches the editor layout
            const previewStyle = `<style data-preview-defaults>
body {
  max-width: ${pageWidthCSS};
  margin: 0 auto;
  padding: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
  box-sizing: border-box;
}
.markdown-body {
  font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol";
}</style>`;

            // Post-process body: add heading IDs, build ToC, strip {:...} directives
            const processedBody = IPCHandler._processPreviewBody(body);

            const fullHTML = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n${previewStyle}\n${head}\n</head>\n<body>\n<div class="markdown-body">\n${processedBody}\n</div>\n</body>\n</html>`;

            // Spin up a local HTTP server to serve the preview
            const server = http.createServer(async (req, res) => {
                const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
                const requestPath = decodeURIComponent(url.pathname);

                // Root path serves the generated HTML document
                if (requestPath === '/') {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(fullHTML);
                    return;
                }

                // All other paths serve static files from the document's directory
                if (!docDir) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }

                const safePath = path.normalize(requestPath).replace(/^\.\.[/\\]/, '');
                const absPath = path.join(docDir, safePath);

                // Prevent directory traversal above the document's folder
                if (!absPath.startsWith(docDir)) {
                    res.writeHead(403);
                    res.end('Forbidden');
                    return;
                }

                try {
                    const stat = await fs.stat(absPath);
                    if (!stat.isFile()) {
                        res.writeHead(404);
                        res.end('Not found');
                        return;
                    }
                    const ext = path.extname(absPath).toLowerCase();
                    const mime = IPCHandler.MIME_TYPES[ext] ?? 'application/octet-stream';
                    res.writeHead(200, { 'Content-Type': mime });
                    createReadStream(absPath).pipe(res);
                } catch {
                    res.writeHead(404);
                    res.end('Not found');
                }
            });

            // Listen on a random available port
            await new Promise((resolve) =>
                server.listen({ port: 0, host: '127.0.0.1' }, () => resolve(undefined)),
            );
            const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;

            // Compute the preview window width in pixels from page settings
            const pxPerMm = getPixelsPerMillimeter() || 3.78; // fallback if not yet measured
            let contentWidthMm;
            if (pageWidth.useFixed) {
                contentWidthMm = 210;
            } else if (pageWidth.unit === 'mm') {
                contentWidthMm = pageWidth.width;
            } else {
                // Width is already in px — convert to mm for consistent calculation
                contentWidthMm = pageWidth.width / pxPerMm;
            }
            const totalWidthPx = Math.round(contentWidthMm * pxPerMm) + 20; // 20px for scrollbar
            const windowHeight = Math.round(totalWidthPx * Math.SQRT2);

            // Restore saved preview window bounds, falling back to computed defaults
            const savedBounds = settings.get('previewWindowBounds', null);
            const windowOptions = savedBounds
                ? {
                      x: savedBounds.x,
                      y: savedBounds.y,
                      width: savedBounds.width,
                      height: savedBounds.height,
                  }
                : { width: totalWidthPx, height: windowHeight };

            const previewWindow = new BrowserWindow({
                ...windowOptions,
                webPreferences: {
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: true,
                    partition: 'preview',
                },
                title: 'Preview',
            });

            previewWindow.setMenu(null);

            // Extract all explicit URLs from the document's src and href attributes
            const documentURLs = new Set();
            const urlPattern = /(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
            for (const urlMatch of fullHTML.matchAll(urlPattern)) {
                const url = urlMatch[1] ?? urlMatch[2];
                if (url && /^https?:\/\//i.test(url)) {
                    documentURLs.add(url);
                }
            }

            // Build allow-list domain patterns from the setting
            const allowListResult = settings.get('allowList', []);
            const allowList = Array.isArray(allowListResult) ? allowListResult : [];
            const allowPatterns = allowList.map((/** @type {string} */ d) => {
                const escaped = d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return new RegExp(`\\b${escaped}$`);
            });

            // Block all external requests by default; allow local, document-explicit, and allow-listed
            const blockedURLs = new Set();
            previewWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
                let parsed;
                try {
                    parsed = new URL(details.url);
                } catch {
                    callback({ cancel: true });
                    return;
                }

                // Always allow requests to the local preview server and devtools
                if (parsed.hostname === '127.0.0.1' || parsed.protocol === 'devtools:') {
                    callback({});
                    return;
                }

                // Allow URLs explicitly present in the document
                if (documentURLs.has(details.url)) {
                    callback({});
                    return;
                }

                // Allow domains on the allow list (including subdomains)
                for (const pattern of allowPatterns) {
                    if (pattern.test(parsed.hostname)) {
                        callback({});
                        return;
                    }
                }

                // Block everything else
                if (!blockedURLs.has(details.url)) {
                    blockedURLs.add(details.url);
                    console.log(`Disallowed domain for url: ${details.url}`);
                }
                callback({ cancel: true });
            });

            previewWindow.webContents.on('before-input-event', (e, input) => {
                if (input.key === 'F12' && input.type === 'keyDown') {
                    previewWindow.webContents.toggleDevTools();
                    e.preventDefault();
                }
            });

            // Persist preview window bounds on move and resize
            const saveBounds = () => settings.set('previewWindowBounds', previewWindow.getBounds());
            previewWindow.on('move', saveBounds);
            previewWindow.on('resize', saveBounds);

            // Shut down the server when the preview window closes
            previewWindow.on('closed', () => server.close());

            await previewWindow.loadURL(`http://127.0.0.1:${port}/`);

            return { success: true };
        });
    }

    /**
     * Registers element-related IPC handlers.
     */
    registerElementHandlers() {
        ipcMain.handle('element:changeType', async (event, elementType) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                window.webContents.send('menu:action', 'element:changeType', elementType);
            }
            return { success: true };
        });

        ipcMain.handle('element:format', async (event, format) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                window.webContents.send('menu:action', 'element:format', format);
            }
            return { success: true };
        });
    }

    /**
     * Registers dialog-related IPC handlers.
     */
    registerDialogHandlers() {
        ipcMain.handle('dialog:confirm', async (event, options) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (!window) return { response: 1 };
            const result = await dialog.showMessageBox(window, {
                type: options.type ?? 'warning',
                title: options.title ?? 'Confirm',
                message: options.message ?? '',
                detail: options.detail ?? undefined,
                buttons: options.buttons ?? ['OK', 'Cancel'],
                defaultId: options.defaultId ?? 0,
                cancelId: options.cancelId ?? 1,
            });
            return { response: result.response };
        });
    }

    /**
     * Registers application-level IPC handlers (reload, etc.).
     */
    registerAppHandlers() {
        ipcMain.handle('app:reload', async () => {
            if (this.menuBuilder) {
                await this.menuBuilder.handleReload();
            }
            return { success: true };
        });
    }

    /**
     * Registers settings-related IPC handlers.
     */
    registerSettingsHandlers() {
        ipcMain.handle('settings:getAll', async () => {
            return { success: true, settings: settings.getAll() };
        });

        ipcMain.handle('settings:get', async (_event, key) => {
            return { success: true, value: settings.get(key) };
        });

        ipcMain.handle('settings:set', async (_event, key, value) => {
            settings.set(key, value);
            return { success: true };
        });
    }

    /**
     * Registers image-related IPC handlers.
     */
    registerImageHandlers() {
        ipcMain.handle('image:browse', async (event) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (!window) {
                return { success: false };
            }

            const result = await dialog.showOpenDialog(window, {
                title: 'Select Image',
                filters: [
                    {
                        name: 'Images',
                        extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'],
                    },
                    { name: 'All Files', extensions: ['*'] },
                ],
                properties: ['openFile'],
            });

            if (result.canceled || result.filePaths.length === 0) {
                return { success: false };
            }

            return { success: true, filePath: result.filePaths[0] };
        });

        ipcMain.handle('image:rename', async (_event, oldPath, newName) => {
            try {
                const dir = path.dirname(oldPath);
                const newPath = path.join(dir, newName);

                if (oldPath === newPath) {
                    return { success: true, newPath: oldPath };
                }

                // Check if the target already exists
                try {
                    await fs.access(newPath);
                    return { success: false, message: `A file named "${newName}" already exists.` };
                } catch {
                    // Target doesn't exist, safe to rename
                }

                await fs.rename(oldPath, newPath);
                return { success: true, newPath };
            } catch (err) {
                return { success: false, message: /** @type {Error} */ (err).message };
            }
        });
    }

    /**
     * Registers path-related IPC handlers.
     */
    registerPathHandlers() {
        ipcMain.handle('path:toRelative', (_event, imagePath, documentPath) => {
            if (!imagePath || !documentPath) return imagePath;

            // Normalise the image path: strip file:/// prefix, decode
            let absImage = imagePath;
            if (absImage.startsWith('file:///')) {
                absImage = decodeURIComponent(absImage.slice(8));
            }

            // Resolve both to absolute, normalised paths
            const resolved = path.resolve(absImage);
            const docDir = path.dirname(path.resolve(documentPath));

            // Check whether the image sits at or below the document directory
            const rel = path.relative(docDir, resolved);
            if (rel.startsWith('..') || path.isAbsolute(rel)) {
                return imagePath;
            }

            // Return a POSIX-style relative path prefixed with ./
            return `./${rel.replace(/\\/g, '/')}`;
        });
    }

    /**
     * Registers external API handlers for scripting.
     */
    registerAPIHandlers() {
        ipcMain.handle('api:execute', async (event, command, params) => {
            return this.apiRegistry.executeCommand(command, params, event.sender);
        });

        ipcMain.handle('api:commands', async () => {
            return this.apiRegistry.getCommandList();
        });
    }

    /**
     * Broadcasts a message to all renderer processes.
     * @param {string} channel - The IPC channel
     * @param {...any} args - The arguments to send
     */
    broadcastToRenderers(channel, ...args) {
        const windows = BrowserWindow.getAllWindows();
        for (const window of windows) {
            window.webContents.send(channel, ...args);
        }
    }

    /**
     * Generates a slug ID from heading text.
     * @param {string} text - The heading text
     * @param {Set<string>} usedIds - Set of already-used IDs for dedup
     * @returns {string}
     */
    static _slugify(text, usedIds) {
        let slug = text
            .toLowerCase()
            .replace(/<[^>]*>/g, '')
            .replace(/&[^;]+;/g, '')
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        if (!slug) slug = 'heading';
        let candidate = slug;
        let counter = 2;
        while (usedIds.has(candidate)) {
            candidate = `${slug}-${counter++}`;
        }
        usedIds.add(candidate);
        return candidate;
    }

    /**
     * Post-processes preview HTML body:
     * - Adds id attributes to h1/h2/h3 headings
     * - Strips `<p>{:...}</p>` directives (except `{:toc}`)
     * - Replaces `<p>{:toc}</p>` with a generated table of contents
     * @param {string} body
     * @returns {string}
     */
    static _processPreviewBody(body) {
        const usedIds = new Set();
        /** @type {{level: number, id: string, text: string}[]} */
        const headings = [];

        // Add id attributes to h1, h2, h3 and collect them for ToC
        let processed = body.replace(/<(h[1-3])>(.*?)<\/\1>/gi, (_match, tag, content) => {
            const level = Number(tag[1]);
            const plainText = content.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '');
            const id = IPCHandler._slugify(plainText, usedIds);
            headings.push({ level, id, text: content });
            return `<${tag} id="${id}">${content}</${tag}>`;
        });

        // Build the ToC HTML from collected headings
        let tocHTML = '';
        if (headings.length > 0) {
            let toc =
                '<section id="markdown-toc"><h1 id="nav-toc-title">Table of Contents</h1><ul id="nav-toc">';
            let currentLevel = 1;
            for (const h of headings) {
                while (h.level > currentLevel) {
                    toc += '<ul>';
                    currentLevel++;
                }
                while (h.level < currentLevel) {
                    toc += '</ul></li>';
                    currentLevel--;
                }
                toc += `<li><a href="#${h.id}">${h.text}</a>`;
            }
            while (currentLevel > 1) {
                toc += '</ul></li>';
                currentLevel--;
            }
            toc += '</li></ul></section>';
            tocHTML = toc;
        }

        // Replace directives: exact <p>{:toc}</p> becomes ToC, all others are stripped
        processed = processed.replace(/<p>\{:[^}]+\}<\/p>/gi, (match) => {
            switch (match) {
                case '<p>{:toc}</p>':
                    return tocHTML;
            }
            return '';
        });

        return processed;
    }
}
