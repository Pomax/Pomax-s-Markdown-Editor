/**
 * @fileoverview Syntax Tree data structures.
 * Provides a tree structure for representing parsed markdown.
 */

import { SyntaxNode } from "./syntax-node.js";
import {
  renderTreeToDOM,
  renderTreeToMarkdown,
  renderTreeToText,
} from "../formats/index.js";

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
   * Adds a child node to the tree.
   * @param {SyntaxNode} node - The node to add
   */
  appendChild(node) {
    node.parent = null;
    this.children.push(node);
  }

  /**
   * Converts the tree to a DOM element.
   * Every element gets an `__st_node` property referencing the
   * originating SyntaxNode.
   *
   * @param {Document} [doc] - The Document to create elements with. Falls back to this.doc.
   * @returns {Element}
   */
  toDOM(doc = this.doc) {
    return renderTreeToDOM(doc, this);
  }

  /**
   * Converts the tree to an HTML string.
   * @param {Document} [doc] - The Document to create elements with. Falls back to this.doc.
   * @returns {string}
   */
  toHTML(doc = this.doc) {
    return this.toDOM(doc).outerHTML;
  }

  /**
   * Converts the tree to markdown.
   * @returns {string}
   */
  toMarkdown() {
    return renderTreeToMarkdown(this);
  }

  /**
   * Converts the tree to a text serialization.
   * @returns {string}
   */
  toString() {
    return renderTreeToText(this);
  }
}
