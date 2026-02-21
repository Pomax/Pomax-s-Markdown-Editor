# Markdown Editor API Documentation

## Overview

The Markdown Editor exposes a comprehensive API for external scripting via IPC (Inter-Process Communication). This allows automation tools, scripts, and other applications to interact with the editor programmatically.

## API Version

Current Version: **1.0.0**

*Generated: 2026-02-21T18:07:37.089Z*

## Connection

External applications can connect to the editor via Electron's IPC mechanism.

### IPC Channels

- **Request Channel**: `api:execute`
- **Response**: Returned via the invoke mechanism

## Command Categories

- [App Commands](#app-commands)
- [Cursor Commands](#cursor-commands)
- [Document Commands](#document-commands)
- [Element Commands](#element-commands)
- [File Commands](#file-commands)
- [Image Commands](#image-commands)
- [Selection Commands](#selection-commands)
- [View Commands](#view-commands)

---

## App Commands

### `app.reload`

Reloads the application UI while preserving document content, cursor position, and file association

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

## Cursor Commands

### `cursor.getPosition`

Gets the current cursor position

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

### `cursor.setPosition`

Sets the cursor position

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
await electronAPI.executeCommand('cursor.setPosition', {"line":0,"column":0});
```

---

## Document Commands

### `document.undo`

Undoes the last action

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

### `document.redo`

Redoes the last undone action

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

### `document.getContent`

Gets the current document content as markdown

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

### `document.setContent`

Sets the document content from markdown

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
await electronAPI.executeCommand('document.setContent', {"content":"example"});
```

---

### `document.insertText`

Inserts text at the current cursor position

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

**Example:**
```javascript
await electronAPI.executeCommand('document.insertText', {"text":"example"});
```

---

## Element Commands

### `element.changeType`

Changes the type of the current element

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| type | string | Yes | The new element type (heading1-6, paragraph, blockquote, code, list, etc.) |

**Returns:**
```json
{
    "success": true
}
```

**Example:**
```javascript
await electronAPI.executeCommand('element.changeType', {"type":"example"});
```

---

### `element.applyFormat`

Applies inline formatting to the current selection

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| format | string | Yes | The format to apply (bold, italic, code, strikethrough, link) |

**Returns:**
```json
{
    "success": true
}
```

**Example:**
```javascript
await electronAPI.executeCommand('element.applyFormat', {"format":"example"});
```

---

## File Commands

### `file.new`

Creates a new empty document

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

### `file.load`

Opens a file dialog to load a markdown file

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

### `file.save`

Saves the current document

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

### `file.saveAs`

Opens a save dialog to save the document with a new name

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

### `file.getRecentFiles`

Gets the list of recently opened file paths (most recent first)

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

## Image Commands

### `image.rename`

Renames an image file on disk

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| oldPath | string | Yes | The current absolute file path of the image |
| newName | string | Yes | The new filename (not a full path) |

**Returns:**
```json
{
    "success": true
}
```

**Example:**
```javascript
await electronAPI.executeCommand('image.rename', {"oldPath":"example","newName":"example"});
```

---

## Selection Commands

### `selection.get`

Gets the current selection

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
```

---

### `selection.set`

Sets the selection range

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
await electronAPI.executeCommand('selection.set', {"startLine":0,"startColumn":0,"endLine":0,"endColumn":0});
```

---

## View Commands

### `view.setMode`

Sets the view mode

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
await electronAPI.executeCommand('view.setMode', {"mode":"example"});
```

---

### `view.getMode`

Gets the current view mode

**Parameters:** None

**Returns:**
```json
{
    "success": true
}
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

## Version History

### 1.0.0 (Current)

- File operations (new, load, save, saveAs, getRecentFiles)
- Document operations (undo, redo, getContent, setContent, insertText)
- View operations (setMode, getMode)
- Element operations (changeType, applyFormat)
- Cursor operations (getPosition, setPosition)
- Selection operations (get, set)
- Application operations (reload)
