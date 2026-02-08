/**
 * Global type declarations for the markdown editor.
 */

/**
 * Editor API exposed to the main process.
 */
interface EditorAPI {
    hasUnsavedChanges(): boolean;
    getContent(): string;
    setContent(content: string): void;
    getViewMode(): string;
    setUnsavedChanges(hasChanges: boolean): void;
}

/**
 * Electron API exposed via preload script.
 */
interface ElectronAPI {
    onMenuAction(callback: (action: string, ...args: any[]) => void): () => void;
    onExternalAPI(callback: (method: string, ...args: any[]) => void): () => void;
    setUnsavedChanges(hasChanges: boolean): void;
    saveFile(content: string): Promise<{ success: boolean; filePath?: string; message?: string }>;
    saveFileAs(content: string): Promise<{ success: boolean; filePath?: string; message?: string }>;
    loadFile(): Promise<{ success: boolean; content?: string; filePath?: string; message?: string }>;
    newFile(): Promise<{ success: boolean }>;
    reload(): Promise<{ success: boolean }>;
    getRecentFiles(): Promise<{ success: boolean; files: string[] }>;
    getSettings(): Promise<{ success: boolean; settings: Record<string, any> }>;
    getSetting(key: string): Promise<{ success: boolean; value: any }>;
    setSetting(key: string, value: any): Promise<{ success: boolean }>;
    browseForImage(): Promise<{ success: boolean; filePath?: string }>;
    getPathForFile(file: File): string;
    executeAPICommand(command: string, params: object): Promise<any>;
    setSourceView(): Promise<{ success: boolean }>;
    setFocusedView(): Promise<{ success: boolean }>;
    changeElementType(elementType: string): Promise<{ success: boolean; message?: string }>;
    applyFormat(format: string): Promise<{ success: boolean; message?: string }>;
    undo(): Promise<{ success: boolean; message?: string }>;
    redo(): Promise<{ success: boolean; message?: string }>;
}

/**
 * Node attributes for syntax tree nodes.
 */
interface NodeAttributes {
    language?: string;
    indent?: number;
    ordered?: boolean;
    number?: number;
    url?: string;
    title?: string;
    alt?: string;
    href?: string;
}

declare global {
    interface Window {
        editorAPI?: EditorAPI;
        electronAPI?: ElectronAPI;
    }
}

export {};
