/**
 * @fileoverview Syntax Tree data structures.
 * Provides a tree structure for representing parsed markdown.
 */

export {
  renderTreeToText,
  renderTreeToMarkdown,
  renderTreeToDOM,
} from "../../renderers/src/index.js";

import {
  renderTreeToText,
  renderTreeToMarkdown,
  renderTreeToDOM,
} from "../../renderers/src/index.js";

/**
 * @typedef {Object} NodeAttributes
 * @property {string} [language] - Language for code blocks
 * @property {number} [fenceCount] - Number of backticks in the code fence (3 or more)
 * @property {number} [indent] - Indentation level for list items
 * @property {boolean} [ordered] - Whether a list is ordered
 * @property {number} [number] - Number for ordered list items
 * @property {string} [url] - URL for links and images
 * @property {string} [title] - Title for links and images
 * @property {string} [alt] - Alt text for images
 * @property {string} [href] - Link URL for linked images or link nodes
 * @property {string} [src] - Image source URL (for inline-image nodes)
 * @property {string} [tag] - HTML tag name (for inline HTML element nodes)
 * @property {string} [style] - Inline CSS style string for HTML images
 * @property {string} [tagName] - HTML tag name for html-element nodes
 * @property {boolean} [checked] - Whether a checklist item is checked
 * @property {boolean} [bareText] - Whether this node represents bare text inside an HTML container
 */

/**
 * Counter for generating unique node IDs.
 * @type {number}
 */
let nodeIdCounter = 0;

/**
 * Generates a unique node ID.
 * @returns {string}
 */
function generateNodeId() {
  return `node-${++nodeIdCounter}`;
}

/**
 * Represents a node in the syntax tree.
 */
export class SyntaxNode {
  /**
   * @param {string} type - The node type (heading1-6, paragraph, etc.)
   * @param {string} content - The text content of the node
   */
  constructor(type, content = "") {
    /**
     * Unique identifier for this node.
     * @type {string}
     */
    this.id = generateNodeId();

    /**
     * The Document associated with this node, used for DOM rendering.
     */
    this.doc = globalThis.document;

    /**
     * The type of node.
     * @type {string}
     */
    this.type = type;

    /**
     * The raw text content.
     * @type {string}
     */
    this.content = content;

    /**
     * Child nodes.  For inline-containing block types (paragraph,
     * heading, blockquote, list-item), children are inline nodes
     * (text, bold, italic, link, etc.).  For container blocks
     * (html-element), children are other block-level nodes.
     * @type {SyntaxNode[]}
     */
    this.children = [];

    /**
     * Parent node reference.
     * @type {SyntaxNode|null}
     */
    this.parent = null;

    /**
     * HTML tag name for html-element nodes.
     * @type {string}
     */
    this.tagName = "";

    /**
     * Additional attributes for the node.
     * @type {NodeAttributes}
     */
    this.attributes = {};

    /**
     * The DOM element produced by toDOM() / renderNodeToDOM().
     * Set by the renderer; null until the node has been rendered.
     * @type {Element|null}
     */
    this.domNode = null;

    /**
     * Whether this node contains raw (non-markdown) content.
     * @type {boolean}
     */
    this.raw = false;

    /**
     * Runtime-only data (not serialised).
     * @type {Object}
     */
    this.runtime = {};

    /**
     * Starting line in the source (0-based).
     * @type {number}
     */
    this.startLine = 0;

    /**
     * Ending line in the source (0-based).
     * @type {number}
     */
    this.endLine = 0;
  }

  /**
   * Inserts a child node at the given index.
   * Index 0 prepends, index === children.length appends.
   * @param {SyntaxNode} child - The child node to insert
   * @param {number} index - The position to insert at
   */
  insertChild(child, index) {
    child.parent = this;
    this.children.splice(index, 0, child);
  }

  /**
   * Appends a child node (convenience wrapper around insertChild).
   * @param {SyntaxNode} child - The child node to add
   */
  appendChild(child) {
    this.insertChild(child, this.children.length);
  }

  /**
   * Removes a child node.
   * @param {SyntaxNode} child - The child node to remove
   * @throws {Error} If the child is not found
   */
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx === -1) throw new Error(`Child not found`);
    this.children.splice(idx, 1);
    child.parent = null;
  }

  /**
   * Converts this node to markdown.
   * @returns {string}
   */
  toMarkdown() {
    return renderTreeToMarkdown(this);
  }

  /**
   * Converts this node to a DOM element. Each element gets an
   * `__st_node` property referencing this SyntaxNode.
   *
   * @param {Document} doc - The Document to create elements with.
   * @returns {Element}
   */
  toDOM(doc) {
    return renderNodeToDOM(doc, this);
  }
}

/**
 * Represents the root of a syntax tree.
 */
export class SyntaxTree {
  constructor() {
    /**
     * Root children nodes.
     * @type {SyntaxNode[]}
     */
    this.children = [];
  }

  /**
   * Inserts a child node at the given index.
   * Index 0 prepends, index === children.length appends.
   * Tree-level children have parent = null.
   * @param {SyntaxNode} node - The child node to insert
   * @param {number} index - The position to insert at
   */
  insertChild(node, index) {
    node.parent = null;
    this.children.splice(index, 0, node);
  }

  /**
   * Appends a child node to the tree (convenience wrapper around insertChild).
   * @param {SyntaxNode} node - The node to add
   */
  appendChild(node) {
    this.insertChild(node, this.children.length);
  }

  /**
   * Removes a child node from the tree.
   * @param {SyntaxNode} node - The child node to remove
   * @throws {Error} If the node is not found
   */
  removeChild(node) {
    const idx = this.children.indexOf(node);
    if (idx === -1) throw new Error(`Child not found`);
    this.children.splice(idx, 1);
    node.parent = null;
  }

  /**
   * Converts the tree to markdown.
   * @returns {string}
   */
  async toMarkdown() {
    return renderTreeToMarkdown(this);
  }

  /**
   * Converts the tree to a DOM element.
   * Every element gets an `__st_node` property referencing the
   * originating SyntaxNode.
   *
   * @param {Document} [doc] - The Document to create elements with. Falls back to this.doc.
   * @returns {Element}
   */
  async toDOM() {
    if (!this.doc) {
      throw new Error(`No document was set for this tree`);
    }
    return renderTreeToDOM(this.doc, this);
  }

  /**
   * Converts the tree to an HTML string.
   * @param {Document} [doc] - The Document to create elements with. Falls back to this.doc.
   * @returns {string}
   */
  async toHTML() {
    return this.toDOM().outerHTML;
  }

  /**
   * Converts the tree to a plain text representation for debugging.
   * @returns {string}
   */
  toString() {
    return renderTreeToText(this);
  }
}
