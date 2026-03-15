/**
 * Type declarations for the @tooling/parser package.
 */

declare module 'jsdom' {
  class JSDOM {
    constructor(html: string);
    window: Window & typeof globalThis;
  }
}

/**
 * Add an index signature so attributes can be read/written by dynamic key.
 */
interface NodeAttributes {
  [key: string]: any;
}

/**
 * Runtime-only data attached to a SyntaxNode (not serialised).
 */
interface NodeRuntime {
  marker?: string;
  openingTag?: string;
  closingTag?: string;
  [key: string]: any;
}

/**
 * A position within the syntax tree, identified by node ID and character offset.
 */
interface TreePosition {
  nodeId: string;
  offset: number;
  blockNodeId?: string;
  tagPart?: 'opening' | 'closing';
  cellRow?: number;
  cellCol?: number;
}
