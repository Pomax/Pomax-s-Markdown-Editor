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
    executeAPICommand(command: string, params: object): Promise<any>;
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
}

declare global {
    interface Window {
        editorAPI?: EditorAPI;
        electronAPI?: ElectronAPI;
    }
}

export {};
