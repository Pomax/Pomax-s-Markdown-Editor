# Markdown Editor API Documentation

## Overview

The Markdown Editor exposes a comprehensive API for external scripting via IPC (Inter-Process Communication). This allows automation tools, scripts, and other applications to interact with the editor programmatically.

## API Version

Current Version: **1.0.0**

## Connection

External applications can connect to the editor via Electron's IPC mechanism. The API uses a request-response pattern where commands are sent as IPC messages and results are returned asynchronously.

### IPC Channels

- **Request Channel**: `api:execute`
- **Response Channel**: Response is returned via the invoke mechanism

### Message Format

```json
{
    "command": "command.name",
    "params": {
        "param1": "value1",
        "param2": "value2"
    }
}
```

### Response Format

```json
{
    "success": true,
    "data": {},
    "error": null
}
```

## Command Categories

- [File Commands](#file-commands)
- [Document Commands](#document-commands)
- [View Commands](#view-commands)
- [Element Commands](#element-commands)
- [Cursor Commands](#cursor-commands)
- [Selection Commands](#selection-commands)

---

## File Commands

### `file.new`

Creates a new empty document.

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

**Example:**
```javascript
await electronAPI.executeCommand('file.new', {});
```

---

### `file.load`

Opens a file dialog to load a markdown file.

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

### `file.save`

Saves the current document.

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

### `file.saveAs`

Opens a save dialog to save the document with a new name.

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

## Document Commands

### `document.undo`

Undoes the last action.

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

### `document.redo`

Redoes the last undone action.

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

### `document.getContent`

Gets the current document content as markdown.

**Parameters:** None

**Returns:**
```json
{
    "success": true,
    "pending": true
}
```

Note: The actual content is delivered via a separate IPC message.

---

### `document.setContent`

Sets the document content from markdown.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| content | string | Yes | The markdown content to set |

**Returns:**
```json
{
    "success": true
}
```

**Example:**
```javascript
await electronAPI.executeCommand('document.setContent', {
    content: '# Hello World\n\nThis is a paragraph.'
});
```

---

### `document.insertText`

Inserts text at the current cursor position.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | string | Yes | The text to insert |

**Returns:**
```json
{
    "success": true
}
```

---

## View Commands

### `view.setMode`

Sets the view mode.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| mode | string | Yes | The view mode: "source" or "focused" |

**Returns:**
```json
{
    "success": true
}
```

**Example:**
```javascript
await electronAPI.executeCommand('view.setMode', { mode: 'focused' });
```

---

### `view.getMode`

Gets the current view mode.

**Parameters:** None

**Returns:**
```json
{
    "success": true,
    "pending": true
}
```

---

## Element Commands

### `element.changeType`

Changes the type of the current element.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| type | string | Yes | The new element type |

**Supported Types:**
- `heading1` through `heading6`
- `paragraph`
- `blockquote`
- `code-block`
- `list-item`

**Returns:**
```json
{
    "success": true
}
```

**Example:**
```javascript
await electronAPI.executeCommand('element.changeType', { type: 'heading1' });
```

---

### `element.applyFormat`

Applies inline formatting to the current selection.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| format | string | Yes | The format to apply |

**Supported Formats:**
- `bold`
- `italic`
- `code`
- `strikethrough`
- `link`

**Returns:**
```json
{
    "success": true
}
```

**Example:**
```javascript
await electronAPI.executeCommand('element.applyFormat', { format: 'bold' });
```

---

## Cursor Commands

### `cursor.getPosition`

Gets the current cursor position.

**Parameters:** None

**Returns:**
```json
{
    "success": true,
    "pending": true
}
```

---

### `cursor.setPosition`

Sets the cursor position.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| line | number | Yes | The line number (0-based) |
| column | number | Yes | The column number (0-based) |

**Returns:**
```json
{
    "success": true
}
```

**Example:**
```javascript
await electronAPI.executeCommand('cursor.setPosition', { line: 5, column: 10 });
```

---

## Selection Commands

### `selection.get`

Gets the current selection.

**Parameters:** None

**Returns:**
```json
{
    "success": true,
    "pending": true
}
```

---

### `selection.set`

Sets the selection range.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| startLine | number | Yes | The start line (0-based) |
| startColumn | number | Yes | The start column (0-based) |
| endLine | number | Yes | The end line (0-based) |
| endColumn | number | Yes | The end column (0-based) |

**Returns:**
```json
{
    "success": true
}
```

**Example:**
```javascript
await electronAPI.executeCommand('selection.set', {
    startLine: 0,
    startColumn: 0,
    endLine: 0,
    endColumn: 10
});
```

---

## Error Handling

All commands return an error object when they fail:

```json
{
    "success": false,
    "error": "Error message describing what went wrong"
}
```

### Common Errors

- `Unknown command: <name>` - The command does not exist
- `Missing required parameter: <name>` - A required parameter was not provided
- `No active window` - No editor window is currently active

---

## Scripting Examples

### Node.js Example

```javascript
const { ipcRenderer } = require('electron');

async function typeText(text) {
    await ipcRenderer.invoke('api:execute', 'document.insertText', { text });
}

async function makeBold() {
    await ipcRenderer.invoke('api:execute', 'element.applyFormat', { format: 'bold' });
}
```

### Python Example (using pyautogui for IPC)

```python
import subprocess
import json

def execute_command(command, params):
    # This would require setting up an IPC bridge
    # Example using a hypothetical bridge
    message = json.dumps({
        'command': command,
        'params': params
    })
    # Send via IPC mechanism
    pass
```

---

## Version History

### 1.0.0 (Initial Release)

- File operations (new, load, save, saveAs)
- Document operations (undo, redo, getContent, setContent, insertText)
- View operations (setMode, getMode)
- Element operations (changeType, applyFormat)
- Cursor operations (getPosition, setPosition)
- Selection operations (get, set)
