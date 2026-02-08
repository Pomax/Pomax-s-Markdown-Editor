/**
 * @fileoverview API Registry for external scripting.
 * Manages available API commands and their execution.
 * This registry is used for IPC-based scripting from external processes.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * @typedef {Object} APICommand
 * @property {string} name - The command name
 * @property {string} description - Description of what the command does
 * @property {string} category - Command category (file, document, view, element, etc.)
 * @property {Object<string, ParamDefinition>} params - Parameter definitions
 * @property {APIHandler} handler - The command handler function
 */

/**
 * @callback APIHandler
 * @param {Record<string, any>} params - Command parameters
 * @param {Electron.WebContents} webContents - The web contents to send messages to
 * @returns {Promise<{success: boolean, [key: string]: any}>}
 */

/**
 * @typedef {Object} ParamDefinition
 * @property {string} type - The parameter type (string, number, boolean, object)
 * @property {string} description - Description of the parameter
 * @property {boolean} required - Whether the parameter is required
 * @property {*} [defaultValue] - Default value if not provided
 */

/**
 * Registry for external scripting API commands.
 */
export class APIRegistry {
    constructor() {
        /**
         * Map of command name to command definition.
         * @type {Map<string, APICommand>}
         */
        this.commands = new Map();

        /**
         * API version.
         * @type {string}
         */
        this.version = '1.0.0';

        this.registerBuiltInCommands();
    }

    /**
     * Registers the built-in API commands.
     */
    registerBuiltInCommands() {
        // File commands
        this.registerCommand({
            name: 'file.new',
            description: 'Creates a new empty document',
            category: 'file',
            params: {},
            handler: async (params, webContents) => {
                webContents.send('api:external', 'file:new');
                return { success: true };
            },
        });

        this.registerCommand({
            name: 'file.load',
            description: 'Opens a file dialog to load a markdown file',
            category: 'file',
            params: {},
            handler: async (params, webContents) => {
                webContents.send('api:external', 'file:load');
                return { success: true };
            },
        });

        this.registerCommand({
            name: 'file.save',
            description: 'Saves the current document',
            category: 'file',
            params: {},
            handler: async (params, webContents) => {
                webContents.send('api:external', 'file:save');
                return { success: true };
            },
        });

        this.registerCommand({
            name: 'file.saveAs',
            description: 'Opens a save dialog to save the document with a new name',
            category: 'file',
            params: {},
            handler: async (params, webContents) => {
                webContents.send('api:external', 'file:saveAs');
                return { success: true };
            },
        });

        // Document commands
        this.registerCommand({
            name: 'document.undo',
            description: 'Undoes the last action',
            category: 'document',
            params: {},
            handler: async (params, webContents) => {
                webContents.send('api:external', 'edit:undo');
                return { success: true };
            },
        });

        this.registerCommand({
            name: 'document.redo',
            description: 'Redoes the last undone action',
            category: 'document',
            params: {},
            handler: async (params, webContents) => {
                webContents.send('api:external', 'edit:redo');
                return { success: true };
            },
        });

        this.registerCommand({
            name: 'document.getContent',
            description: 'Gets the current document content as markdown',
            category: 'document',
            params: {},
            handler: async (params, webContents) => {
                webContents.send('api:external', 'document:getContent');
                return { success: true, pending: true };
            },
        });

        this.registerCommand({
            name: 'document.setContent',
            description: 'Sets the document content from markdown',
            category: 'document',
            params: {
                content: {
                    type: 'string',
                    description: 'The markdown content to set',
                    required: true,
                },
            },
            handler: async (params, webContents) => {
                webContents.send('api:external', 'document:setContent', params.content);
                return { success: true };
            },
        });

        this.registerCommand({
            name: 'document.insertText',
            description: 'Inserts text at the current cursor position',
            category: 'document',
            params: {
                text: {
                    type: 'string',
                    description: 'The text to insert',
                    required: true,
                },
            },
            handler: async (params, webContents) => {
                webContents.send('api:external', 'document:insertText', params.text);
                return { success: true };
            },
        });

        // View commands
        this.registerCommand({
            name: 'view.setMode',
            description: 'Sets the view mode',
            category: 'view',
            params: {
                mode: {
                    type: 'string',
                    description: 'The view mode: "source" or "focused"',
                    required: true,
                },
            },
            handler: async (params, webContents) => {
                const action = params.mode === 'source' ? 'view:source' : 'view:focused';
                webContents.send('api:external', action);
                return { success: true };
            },
        });

        this.registerCommand({
            name: 'view.getMode',
            description: 'Gets the current view mode',
            category: 'view',
            params: {},
            handler: async (params, webContents) => {
                webContents.send('api:external', 'view:getMode');
                return { success: true, pending: true };
            },
        });

        // Element commands
        this.registerCommand({
            name: 'element.changeType',
            description: 'Changes the type of the current element',
            category: 'element',
            params: {
                type: {
                    type: 'string',
                    description:
                        'The new element type (heading1-6, paragraph, blockquote, code, list, etc.)',
                    required: true,
                },
            },
            handler: async (params, webContents) => {
                webContents.send('api:external', 'element:changeType', params.type);
                return { success: true };
            },
        });

        this.registerCommand({
            name: 'element.applyFormat',
            description: 'Applies inline formatting to the current selection',
            category: 'element',
            params: {
                format: {
                    type: 'string',
                    description: 'The format to apply (bold, italic, code, strikethrough, link)',
                    required: true,
                },
            },
            handler: async (params, webContents) => {
                webContents.send('api:external', 'element:format', params.format);
                return { success: true };
            },
        });

        // Cursor commands
        this.registerCommand({
            name: 'cursor.getPosition',
            description: 'Gets the current cursor position',
            category: 'cursor',
            params: {},
            handler: async (params, webContents) => {
                webContents.send('api:external', 'cursor:getPosition');
                return { success: true, pending: true };
            },
        });

        this.registerCommand({
            name: 'cursor.setPosition',
            description: 'Sets the cursor position',
            category: 'cursor',
            params: {
                line: {
                    type: 'number',
                    description: 'The line number (0-based)',
                    required: true,
                },
                column: {
                    type: 'number',
                    description: 'The column number (0-based)',
                    required: true,
                },
            },
            handler: async (params, webContents) => {
                webContents.send('api:external', 'cursor:setPosition', params.line, params.column);
                return { success: true };
            },
        });

        // Selection commands
        this.registerCommand({
            name: 'selection.get',
            description: 'Gets the current selection',
            category: 'selection',
            params: {},
            handler: async (params, webContents) => {
                webContents.send('api:external', 'selection:get');
                return { success: true, pending: true };
            },
        });

        this.registerCommand({
            name: 'selection.set',
            description: 'Sets the selection range',
            category: 'selection',
            params: {
                startLine: {
                    type: 'number',
                    description: 'The start line (0-based)',
                    required: true,
                },
                startColumn: {
                    type: 'number',
                    description: 'The start column (0-based)',
                    required: true,
                },
                endLine: {
                    type: 'number',
                    description: 'The end line (0-based)',
                    required: true,
                },
                endColumn: {
                    type: 'number',
                    description: 'The end column (0-based)',
                    required: true,
                },
            },
            handler: async (params, webContents) => {
                webContents.send('api:external', 'selection:set', params);
                return { success: true };
            },
        });

        // Application commands
        this.registerCommand({
            name: 'app.reload',
            description:
                'Reloads the application UI while preserving document content, cursor position, and file association',
            category: 'app',
            params: {},
            handler: async (params, webContents) => {
                webContents.send('api:external', 'app:reload');
                return { success: true };
            },
        });

        this.registerCommand({
            name: 'file.getRecentFiles',
            description: 'Gets the list of recently opened file paths (most recent first)',
            category: 'file',
            params: {},
            handler: async (params, webContents) => {
                webContents.send('api:external', 'file:getRecentFiles');
                return { success: true };
            },
        });

        // Image commands
        this.registerCommand({
            name: 'image.rename',
            description: 'Renames an image file on disk',
            category: 'image',
            params: {
                oldPath: {
                    type: 'string',
                    description: 'The current absolute file path of the image',
                    required: true,
                },
                newName: {
                    type: 'string',
                    description: 'The new filename (not a full path)',
                    required: true,
                },
            },
            handler: async (params) => {
                try {
                    const dir = path.dirname(params.oldPath);
                    const newPath = path.join(dir, params.newName);

                    if (params.oldPath === newPath) {
                        return { success: true, newPath: params.oldPath };
                    }

                    try {
                        await fs.access(newPath);
                        return {
                            success: false,
                            error: `A file named "${params.newName}" already exists.`,
                        };
                    } catch {
                        // Target doesn't exist, safe to rename
                    }

                    await fs.rename(params.oldPath, newPath);
                    return { success: true, newPath };
                } catch (err) {
                    return { success: false, error: /** @type {Error} */ (err).message };
                }
            },
        });
    }

    /**
     * Registers a new API command.
     * @param {APICommand} command - The command to register
     */
    registerCommand(command) {
        this.commands.set(command.name, command);
    }

    /**
     * Executes an API command.
     * @param {string} commandName - The name of the command to execute
     * @param {Object} params - The command parameters
     * @param {Electron.WebContents} webContents - The web contents to send messages to
     * @returns {Promise<Object>} The command result
     */
    async executeCommand(commandName, params, webContents) {
        const command = this.commands.get(commandName);

        if (!command) {
            return {
                success: false,
                error: `Unknown command: ${commandName}`,
            };
        }

        // Validate required parameters
        for (const [paramName, paramDef] of Object.entries(command.params)) {
            if (paramDef.required && !(paramName in params)) {
                return {
                    success: false,
                    error: `Missing required parameter: ${paramName}`,
                };
            }
        }

        try {
            return await command.handler(params, webContents);
        } catch (err) {
            const error = /** @type {Error} */ (err);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Gets the list of available commands with their documentation.
     * @returns {Array<{name: string, description: string, category: string, params: Object}>}
     */
    getCommandList() {
        const commands = [];

        for (const [name, command] of this.commands) {
            commands.push({
                name,
                description: command.description,
                category: command.category,
                params: command.params,
            });
        }

        return commands;
    }

    /**
     * Gets the API version.
     * @returns {string}
     */
    getVersion() {
        return this.version;
    }
}
