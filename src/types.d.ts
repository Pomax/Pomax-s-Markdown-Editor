/**
 * Global type declarations for the markdown editor.
 */

declare module 'better-sqlite3' {
    interface Statement {
        run(...params: any[]): { changes: number; lastInsertRowid: number };
        get(...params: any[]): any;
        all(...params: any[]): any[];
    }

    interface Database {
        prepare(sql: string): Statement;
        exec(sql: string): this;
        pragma(sql: string, options?: object): any;
        close(): void;
    }

    interface DatabaseConstructor {
        new(filename: string, options?: object): Database;
        (filename: string, options?: object): Database;
    }

    const Database: DatabaseConstructor;
    export default Database;
}

/**
 * View mode of the editor.
 */
type ViewMode = 'source' | 'source2' | 'writing';

/**
 * Tree-based cursor position mapped to syntax tree coordinates.
 */
interface TreeCursor {
    /** The ID of the node the cursor is in.  When inside an inline formatting
     *  element (bold, italic, etc.), this is the inline child node's ID. */
    nodeId: string;
    /** The ID of the enclosing block-level node (paragraph, heading, list-item,
     *  etc.).  When absent, nodeId is itself the block node. */
    blockNodeId?: string;
    /** Character offset within the block node's raw content string (always
     *  relative to the block, not the inline). */
    offset: number;
    /** If set, cursor is on an html-block container's opening or closing tag
     *  line (source view only). */
    tagPart?: 'opening' | 'closing';
    /** Character offset within the syntax prefix (e.g. `- [ ] `, `## `)
     *  when the cursor is inside the `.md-syntax` span in source view.
     *  When set, `offset` is 0. */
    prefixOffset?: number;
    /** Row index for table cell editing (0 = header). */
    cellRow?: number;
    /** Column index for table cell editing. */
    cellCol?: number;
}

/**
 * A non-collapsed selection range mapped to tree coordinates.
 * Both endpoints are expressed as (nodeId, offset) pairs.
 */
interface TreeRange {
    /** The ID of the node the range starts in. */
    startNodeId: string;
    /** Character offset within the start node's content. */
    startOffset: number;
    /** The ID of the node the range ends in. */
    endNodeId: string;
    /** Character offset within the end node's content. */
    endOffset: number;
}

/**
 * Position of the table of contents sidebar.
 */
type TocPosition = 'left' | 'right';

/**
 * A heading entry in the table of contents.
 */
interface TocHeading {
    /** The syntax-tree node ID. */
    id: string;
    /** Heading level: 1, 2, or 3. */
    level: number;
    /** Plain-text heading content. */
    text: string;
}

/**
 * Data for a link insertion or edit.
 */
interface LinkData {
    /** The visible link text. */
    text: string;
    /** The link URL. */
    url: string;
}

/**
 * Data for an image insertion or edit.
 */
interface ImageData {
    /** Alt text for the image. */
    alt: string;
    /** Image file path or URL. */
    src: string;
    /** Optional link URL for linked images. */
    href: string;
    /** Optional inline CSS style string. */
    style: string;
    /** New filename for the image (empty string if unchanged). */
    rename: string;
}

/**
 * Data for setting a code block language tag.
 */
interface CodeLanguageData {
    /** The language identifier (e.g. "js", "python"). */
    language: string;
}

/**
 * State of a single document tab.
 */
interface DocumentState {
    /** The markdown content. */
    content: string;
    /** Full file path or null for untitled. */
    filePath: string | null;
    /** Whether there are unsaved changes. */
    modified: boolean;
    /** Cursor position. */
    cursor: TreeCursor | null;
    /** Absolute character offset in markdown source. */
    cursorOffset: number;
    /** CRC32 hash of the markdown content. */
    contentHash: number;
    /** The parsed syntax tree. */
    syntaxTree: any;
    /** Active text selection range. */
    treeRange: TreeRange | null;
    /** Scroll position of the scroll container. */
    scrollTop: number;
    /** The active ToC heading node ID. */
    tocActiveHeadingId: string | null;
    /** Undo history. */
    undoStack: any[];
    /** Redo history. */
    redoStack: any[];
}

/**
 * Editor API exposed to the main process.
 */
interface EditorAPI {
    hasUnsavedChanges(): boolean;
    getContent(): string;
    setContent(content: string): void;
    getViewMode(): string;
    setViewMode(mode: string): void;
    setUnsavedChanges(hasChanges: boolean): void;
    placeCursorAtNode(nodeId: string, offset: number): void;
}

/**
 * Electron API exposed via preload script.
 */
interface ElectronAPI {
    onMenuAction(callback: (action: string, ...args: any[]) => void): () => void;
    onExternalAPI(callback: (method: string, ...args: any[]) => void): () => void;
    setUnsavedChanges(hasChanges: boolean): void;
    confirmClose(): Promise<{ action: 'save' | 'saveAs' | 'discard' | 'cancel' }>;
    saveFile(content: string): Promise<{ success: boolean; filePath?: string; message?: string }>;
    saveFileAs(content: string): Promise<{ success: boolean; filePath?: string; message?: string }>;
    loadFile(): Promise<{ success: boolean; content?: string; filePath?: string; message?: string }>;
    newFile(): Promise<{ success: boolean }>;
    confirmDialog(options: { type?: string; title?: string; message: string; detail?: string; buttons?: string[]; defaultId?: number; cancelId?: number }): Promise<{ response: number }>;
    reload(): Promise<{ success: boolean }>;
    getRecentFiles(): Promise<{ success: boolean; files: string[] }>;
    getSettings(): Promise<{ success: boolean; settings: Record<string, any> }>;
    getSetting(key: string): Promise<{ success: boolean; value: any }>;
    setSetting(key: string, value: any): Promise<{ success: boolean }>;
    browseForImage(): Promise<{ success: boolean; filePath?: string }>;
    renameImage(oldPath: string, newName: string): Promise<{ success: boolean; newPath?: string; message?: string }>;
    toRelativeImagePath(imagePath: string, documentPath: string): Promise<string>;
    getPathForFile(file: File): string;
    executeAPICommand(command: string, params: object): Promise<any>;
    setWritingView(): Promise<{ success: boolean }>;
    changeElementType(elementType: string): Promise<{ success: boolean; message?: string }>;
    applyFormat(format: string): Promise<{ success: boolean; message?: string }>;
    undo(): Promise<{ success: boolean; message?: string }>;
    redo(): Promise<{ success: boolean; message?: string }>;
    notifyOpenFiles(files: Array<{ id: string; filePath: string | null; label: string; active: boolean }>): Promise<{ success: boolean }>;
}

/**
 * Node attributes for syntax tree nodes.
 */
interface NodeAttributes {
    /** Language for code blocks. */
    language?: string;
    /** Number of backticks in the code fence (3 or more). */
    fenceCount?: number;
    /** Indentation level for list items. */
    indent?: number;
    /** Whether a list is ordered. */
    ordered?: boolean;
    /** Number for ordered list items. */
    number?: number;
    /** URL for links and images. */
    url?: string;
    /** Title for links and images. */
    title?: string;
    /** Alt text for images. */
    alt?: string;
    /** Link URL for linked images or link nodes. */
    href?: string;
    /** Image source URL (for inline-image nodes). */
    src?: string;
    /** HTML tag name (for inline HTML element nodes). */
    tag?: string;
    /** Inline CSS style string for HTML images. */
    style?: string;
    /** HTML tag name for html-block nodes. */
    tagName?: string;
    /** Full opening tag line for html-block nodes. */
    openingTag?: string;
    /** Full closing tag line for html-block nodes. */
    closingTag?: string;
    /** Verbatim body for raw content tags (script, style, textarea). */
    rawContent?: string;
    /** Whether a checklist item is checked. */
    checked?: boolean;
    /** Whether this node represents bare text inside an HTML container. */
    bareText?: boolean;
    /** Runtime-only toggle for fake details collapse state (not serialised). */
    detailsOpen?: boolean;
}

/**
 * Result of a word count operation.
 */
interface WordCountResult {
    /** Total word count. */
    total: number;
    /** Word count excluding code blocks and inline code. */
    excludingCode: number;
}

/**
 * Configuration for a toolbar button.
 */
interface ButtonConfig {
    /** Button identifier. */
    id: string;
    /** Display label. */
    label: string;
    /** Icon or symbol. */
    icon: string;
    /** Action to perform. */
    action: string;
    /** Element types this button applies to. */
    applicableTo?: string[];
    /** Keyboard shortcut in platform-agnostic notation (e.g. "Mod+B"). */
    shortcut?: string;
}

/**
 * Information about a file tab.
 */
interface TabInfo {
    /** Unique identifier for the tab. */
    id: string;
    /** Display label (filename). */
    label: string;
    /** Full file path, or null for untitled. */
    filePath: string | null;
    /** Whether the tab has unsaved changes. */
    modified: boolean;
    /** Whether the tab is currently active. */
    active: boolean;
}

/**
 * A search match in the document text.
 */
interface SearchMatch {
    /** Start offset in the full document string. */
    docStart: number;
    /** End offset in the full document string. */
    docEnd: number;
}

/**
 * A segment of a search match within a single node.
 */
interface NodeSegment {
    /** Node ID. */
    nodeId: string;
    /** Start within the node's text. */
    startOffset: number;
    /** End within the node's text. */
    endOffset: number;
}

/**
 * Maps a node's text to its position in the flat document string.
 */
interface OffsetMapEntry {
    /** Node ID. */
    nodeId: string;
    /** Where this node's text begins in the flat document. */
    docStart: number;
    /** Where this node's text ends in the flat document. */
    docEnd: number;
    /** The node's text (markdown or bare). */
    text: string;
}

/**
 * Token type produced by the syntax highlighter.
 */
type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'operator'
    | 'punctuation' | 'function' | 'type' | 'constant'
    | 'attribute' | 'tag' | 'text';

/**
 * Per-language definition for the syntax highlighter.
 */
interface LangDef {
    /** Comment patterns. */
    comments: RegExp[];
    /** String literal patterns. */
    strings: RegExp[];
    /** Reserved keywords. */
    keywords: Set<string>;
    /** Type names. */
    types: Set<string>;
    /** Built-in constants. */
    constants: Set<string>;
    /** Extra pattern to try before the generic identifier rule. */
    extraBefore?: RegExp;
    /** Token type for extraBefore matches. */
    extraBeforeType?: TokenType;
    /** Whether keywords/types/constants are case-insensitive. */
    caseInsensitive?: boolean;
    /** Custom tokeniser function. */
    tokenise?: (code: string, lang: LangDef) => Array<{ type: TokenType, text: string }>;
}

/**
 * State of the text selection in the editor.
 */
interface SelectionState {
    /** Start line (0-based). */
    startLine: number;
    /** Start column (0-based). */
    startColumn: number;
    /** End line (0-based). */
    endLine: number;
    /** End column (0-based). */
    endColumn: number;
    /** Whether the selection is collapsed (cursor only). */
    isCollapsed: boolean;
}

/**
 * A single undo/redo entry.
 */
interface Change {
    /** The type of change. */
    type: string;
    /** The content before the change. */
    before: string;
    /** The content after the change. */
    after: string;
    /** When the change occurred. */
    timestamp: number;
}

/**
 * Configuration for a keyboard shortcut.
 */
interface ShortcutConfig {
    /** The key value (event.key). */
    key: string;
    /** The physical key code (event.code), used when Shift transforms the key character. */
    code?: string;
    /** Whether Ctrl is required. */
    ctrl?: boolean;
    /** Whether Shift is required. */
    shift?: boolean;
    /** Whether Alt is required. */
    alt?: boolean;
    /** Whether Meta (Cmd on Mac) is required. */
    meta?: boolean;
    /** The action to perform. */
    action: string;
}

/**
 * Data for a table insertion or edit.
 */
interface TableData {
    /** Number of body rows (not counting the header). */
    rows: number;
    /** Number of columns. */
    columns: number;
    /** 2-D array [row][col] including the header row. */
    cells: string[][];
}

/**
 * An external API command definition.
 */
interface APICommand {
    /** The command name. */
    name: string;
    /** Description of what the command does. */
    description: string;
    /** Command category (file, document, view, element, etc.). */
    category: string;
    /** Parameter definitions. */
    params: Record<string, ParamDefinition>;
    /** The command handler function. */
    handler: APIHandler;
}

/**
 * Handler function for an API command.
 */
type APIHandler = (params: Record<string, any>, webContents: any) => Promise<{ success: boolean, [key: string]: any }>;

/**
 * Definition of a single API command parameter.
 */
interface ParamDefinition {
    /** The parameter type (string, number, boolean, object). */
    type: string;
    /** Description of the parameter. */
    description: string;
    /** Whether the parameter is required. */
    required: boolean;
    /** Default value if not provided. */
    defaultValue?: any;
}

/**
 * Token type for the DFA character-level tokenizer.
 */
type DFATokenType = 'TEXT' | 'NEWLINE' | 'HASH' | 'SPACE' | 'TAB' | 'GT' | 'DASH' | 'STAR'
    | 'UNDERSCORE' | 'TILDE' | 'BACKTICK' | 'PIPE' | 'BANG' | 'LBRACKET'
    | 'RBRACKET' | 'LPAREN' | 'RPAREN' | 'LT' | 'FSLASH' | 'DIGIT' | 'DOT'
    | 'PLUS' | 'COLON' | 'EOF';

/**
 * A single DFA token.
 */
interface DFAToken {
    /** Token type. */
    type: DFATokenType;
    /** The raw character(s). */
    value: string;
}

/**
 * Token type for inline markdown/HTML tokenization.
 */
type InlineTokenType = 'text' | 'bold-open' | 'bold-close' | 'italic-open' | 'italic-close'
    | 'bold-italic-open' | 'bold-italic-close'
    | 'strikethrough-open' | 'strikethrough-close' | 'code'
    | 'link-open' | 'link-close' | 'link-href'
    | 'image'
    | 'html-open' | 'html-close';

/**
 * A single inline token.
 */
interface InlineToken {
    /** Token type. */
    type: InlineTokenType;
    /** The original source text of the token. */
    raw: string;
    /** Inner content (for code spans / text). */
    content?: string;
    /** HTML tag name (for html-open / html-close). */
    tag?: string;
    /** Link URL (for link-href). */
    href?: string;
    /** Alt text (for image tokens). */
    alt?: string;
    /** Image URL (for image tokens). */
    src?: string;
}

/**
 * An inline segment: either plain text, a code span, or a formatted
 * container with children.
 */
interface InlineSegment {
    /** Segment type. */
    type: 'text' | 'code' | 'image' | 'bold' | 'italic' | 'strikethrough' | 'link' | string;
    /** Plain text content (type === 'text'). */
    text?: string;
    /** Code content (type === 'code'). */
    content?: string;
    /** Link URL (type === 'link'). */
    href?: string;
    /** Alt text (type === 'image'). */
    alt?: string;
    /** Image URL (type === 'image'). */
    src?: string;
    /** HTML tag name (for html inline elements). */
    tag?: string;
    /** Child segments for containers. */
    children?: InlineSegment[];
}

/**
 * The main editor class.
 */
type Editor = import('./web/scripts/editor/index.js').Editor;

/**
 * A single node in the syntax tree.
 */
type SyntaxNode = import('./parsers/old/syntax-node.js').SyntaxNode;

/**
 * The full parsed syntax tree.
 */
type SyntaxTree = import('./parsers/old/syntax-tree.js').SyntaxTree;

/**
 * Manages file operations (open, save, recent files).
 */
type FileManager = import('./electron/file-manager.js').FileManager;

/**
 * The application menu builder.
 */
type MenuBuilder = import('./electron/menu-builder.js').MenuBuilder;

/**
 * The editor toolbar.
 */
type Toolbar = import('./web/scripts/utility/toolbar/toolbar.js').Toolbar;

/**
 * Grouped editing operations (enter, backspace, delete, insert).
 */
type EditOperations = import('./web/scripts/editor/edit-operations/index.js').EditOperations;

/**
 * Modal dialog for image insertion/editing.
 */
type ImageModal = import('./web/scripts/editor/content-types/image/image-modal.js').ImageModal;

/**
 * View-mode-specific formatter.
 * The toolbar and editor delegate formatting operations to the formatter
 * returned by `editor.getFormatter()`, which varies by view mode.
 */
interface Formatter {
    /** Applies an inline format (bold, italic, strikethrough, code, subscript, superscript, link). */
    applyFormat(format: string): void;
    /** Changes the block type of the current element (heading1, paragraph, blockquote, code-block, etc.). */
    changeElementType(elementType: string): void;
    /** Toggles list formatting on the current node. */
    toggleList(kind: 'unordered' | 'ordered' | 'checklist'): Promise<void>;
    /** Inserts or updates an image at the cursor. */
    insertOrUpdateImage(alt: string, src: string, href: string, style?: string): void;
    /** Inserts or updates a table at the cursor. */
    insertOrUpdateTable(tableData: TableData): void;
    /** Inserts or updates a link at the cursor (source2 only). */
    insertOrUpdateLink?(text: string, url: string): void;
    /** Returns prefill data for the link modal (source2 only). */
    getLinkPrefill?(): Partial<LinkData>;
    /** Saves the textarea cursor position before a modal steals focus (source2 only). */
    saveCursorPosition?(): void;
    /** Restores the previously saved cursor position (source2 only). */
    restoreCursorPosition?(): void;
}

interface Window {
    editorAPI?: EditorAPI;
    electronAPI?: ElectronAPI;
}
