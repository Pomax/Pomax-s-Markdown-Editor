/**
 * @fileoverview Syntax Tree data structures.
 * Provides a tree structure for representing parsed markdown.
 */

import {
  renderNodeToDOM,
  renderNodeToMarkdown,
  renderNodeToText,
} from "../formats/index.js";

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
   * Adds a child node.
   * @param {SyntaxNode} child - The child node to add
   */
  appendChild(child) {
    child.parent = this;
    this.children.push(child);
  }

  /**
   * Converts this node to a DOM element. Each element gets an
   * `__st_node` property referencing this SyntaxNode.
   *
   * @param {Document} doc - The Document to create elements with.
   * @returns {Element}
   */
  toDOM(doc = this.doc) {
    return renderNodeToDOM(doc, this);
  }

  /**
   * Converts the node  to an HTML string.
   * @param {Document} [doc] - The Document to create elements with. Falls back to this.doc.
   * @returns {string}
   */
  toHTML(doc = this.doc) {
    return this.toDOM(doc).outerHTML;
  }

  /**
   * Converts this node to markdown.
   * @param {number} [depth=0] - HTML nesting depth for indentation
   * @returns {string}
   */
  toMarkdown(depth = 0) {
    return renderNodeToMarkdown(this, depth);
  }

  /**
   * Converts the node to a text serialization.
   * @returns {string}
   */
  toString() {
    return renderNodeToText(this);
  }
}
