/**
 * @fileoverview Syntax Tree data structures.
 * Provides a tree structure for representing parsed markdown.
 */

import { SyntaxNode } from './syntax-node.js';
import { CursorManager } from '../cursor-manager.js';
import { renderTreeToDOM, renderTreeToMarkdown, renderTreeToText } from '../formats/index.js';

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

    /**
     * Cursor and selection state for this tree.
     * @type {CursorManager}
     */
    this.cursor = new CursorManager(this);
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
