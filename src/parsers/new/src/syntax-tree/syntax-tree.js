import { SyntaxNode } from './syntax-node.js';

import { renderTreeToText, renderTreeToMarkdown, renderTreeToDOM } from '../renderers/index.js';

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
     * The Document associated with this node, used for DOM rendering.
     */
    this.doc = globalThis.document;
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
   * @returns {Promise<string>}
   */
  async toMarkdown() {
    return renderTreeToMarkdown(this);
  }

  /**
   * Converts the tree to a DOM element.
   * Every element gets an `__st_node` property referencing the
   * originating SyntaxNode.
   *
   * @returns {Promise<Element>}
   */
  async toDOM() {
    if (!this.doc) {
      throw new Error(`No document was set for this tree`);
    }
    return renderTreeToDOM(this.doc, this);
  }

  /**
   * Converts the tree to an HTML string.
   * @returns {Promise<string>}
   */
  async toHTML() {
    return (await this.toDOM()).outerHTML;
  }

  /**
   * Converts the tree to a plain text representation for debugging.
   * @returns {string}
   */
  toString() {
    return renderTreeToText(this);
  }
}
