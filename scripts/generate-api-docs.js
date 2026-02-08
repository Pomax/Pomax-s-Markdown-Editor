/**
 * @fileoverview API Documentation Generator.
 * Generates API documentation from the APIRegistry.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @typedef {Object} ParamDef
 * @property {string} type
 * @property {string} description
 * @property {boolean} required
 */

/**
 * @typedef {Object} CommandDef
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {Object<string, ParamDef>} params
 */

/**
 * Generates the API documentation.
 */
async function generateAPIDocs() {
    console.log('Generating API documentation...');

    // Import the API registry to get command definitions
    const { APIRegistry } = await import('../src/main/api-registry.js');
    const registry = new APIRegistry();
    const commands = registry.getCommandList();
    const version = registry.getVersion();

    // Generate JSON schema
    const schema = {
        apiVersion: version,
        generatedAt: new Date().toISOString(),
        commands: commands,
    };

    // Write JSON file
    const jsonPath = path.join(__dirname, '..', 'docs', 'api', `api-v${version}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(schema, null, 4), 'utf-8');
    console.log(`Generated: ${jsonPath}`);

    // Generate Markdown documentation
    const markdown = generateMarkdown(/** @type {CommandDef[]} */ (commands), version);
    const mdPath = path.join(__dirname, '..', 'docs', 'api', 'README.md');
    await fs.writeFile(mdPath, markdown, 'utf-8');
    console.log(`Generated: ${mdPath}`);

    console.log('API documentation generated successfully!');
}

/**
 * Generates Markdown documentation from commands.
 * @param {CommandDef[]} commands - The command definitions
 * @param {string} version - The API version
 * @returns {string} The generated Markdown
 */
function generateMarkdown(commands, version) {
    const lines = [];

    // Header
    lines.push('# Markdown Editor API Documentation');
    lines.push('');
    lines.push('## Overview');
    lines.push('');
    lines.push(
        'The Markdown Editor exposes a comprehensive API for external scripting via IPC (Inter-Process Communication). This allows automation tools, scripts, and other applications to interact with the editor programmatically.',
    );
    lines.push('');
    lines.push('## API Version');
    lines.push('');
    lines.push(`Current Version: **${version}**`);
    lines.push('');
    lines.push(`*Generated: ${new Date().toISOString()}*`);
    lines.push('');

    // Connection info
    lines.push('## Connection');
    lines.push('');
    lines.push("External applications can connect to the editor via Electron's IPC mechanism.");
    lines.push('');
    lines.push('### IPC Channels');
    lines.push('');
    lines.push('- **Request Channel**: `api:execute`');
    lines.push('- **Response**: Returned via the invoke mechanism');
    lines.push('');

    // Group commands by category
    /** @type {Object<string, CommandDef[]>} */
    const categories = {};
    for (const cmd of commands) {
        if (!categories[cmd.category]) {
            categories[cmd.category] = [];
        }
        categories[cmd.category].push(cmd);
    }

    // Table of contents
    lines.push('## Command Categories');
    lines.push('');
    for (const category of Object.keys(categories).sort()) {
        const title = category.charAt(0).toUpperCase() + category.slice(1);
        lines.push(`- [${title} Commands](#${category}-commands)`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    // Generate documentation for each category
    for (const category of Object.keys(categories).sort()) {
        const title = category.charAt(0).toUpperCase() + category.slice(1);
        lines.push(`## ${title} Commands`);
        lines.push('');

        for (const cmd of categories[category]) {
            lines.push(`### \`${cmd.name}\``);
            lines.push('');
            lines.push(cmd.description);
            lines.push('');

            // Parameters
            const paramEntries = Object.entries(cmd.params);
            if (paramEntries.length > 0) {
                lines.push('**Parameters:**');
                lines.push('');
                lines.push('| Name | Type | Required | Description |');
                lines.push('|------|------|----------|-------------|');
                for (const [paramName, paramDef] of paramEntries) {
                    lines.push(
                        `| ${paramName} | ${paramDef.type} | ${paramDef.required ? 'Yes' : 'No'} | ${paramDef.description} |`,
                    );
                }
                lines.push('');
            } else {
                lines.push('**Parameters:** None');
                lines.push('');
            }

            // Response
            lines.push('**Returns:**');
            lines.push('```json');
            lines.push('{');
            lines.push('    "success": true');
            lines.push('}');
            lines.push('```');
            lines.push('');

            // Example
            if (paramEntries.length > 0) {
                lines.push('**Example:**');
                lines.push('```javascript');
                /** @type {Object<string, any>} */
                const exampleParams = {};
                for (const [paramName, paramDef] of paramEntries) {
                    exampleParams[paramName] = getExampleValue(paramDef.type);
                }
                lines.push(
                    `await electronAPI.executeCommand('${cmd.name}', ${JSON.stringify(exampleParams)});`,
                );
                lines.push('```');
                lines.push('');
            }

            lines.push('---');
            lines.push('');
        }
    }

    // Error handling section
    lines.push('## Error Handling');
    lines.push('');
    lines.push('All commands return an error object when they fail:');
    lines.push('');
    lines.push('```json');
    lines.push('{');
    lines.push('    "success": false,');
    lines.push('    "error": "Error message describing what went wrong"');
    lines.push('}');
    lines.push('```');
    lines.push('');
    lines.push('### Common Errors');
    lines.push('');
    lines.push('- `Unknown command: <name>` - The command does not exist');
    lines.push('- `Missing required parameter: <name>` - A required parameter was not provided');
    lines.push('- `No active window` - No editor window is currently active');
    lines.push('');

    // Version history
    lines.push('## Version History');
    lines.push('');
    lines.push(`### ${version} (Current)`);
    lines.push('');
    lines.push('- File operations (new, load, save, saveAs, getRecentFiles)');
    lines.push('- Document operations (undo, redo, getContent, setContent, insertText)');
    lines.push('- View operations (setMode, getMode)');
    lines.push('- Element operations (changeType, applyFormat)');
    lines.push('- Cursor operations (getPosition, setPosition)');
    lines.push('- Selection operations (get, set)');
    lines.push('- Application operations (reload)');
    lines.push('');

    return lines.join('\n');
}

/**
 * Gets an example value for a parameter type.
 * @param {string} type - The parameter type
 * @returns {*} An example value
 */
function getExampleValue(type) {
    switch (type) {
        case 'string':
            return 'example';
        case 'number':
            return 0;
        case 'boolean':
            return true;
        case 'object':
            return {};
        case 'array':
            return [];
        default:
            return null;
    }
}

// Run the generator
generateAPIDocs().catch(console.error);
