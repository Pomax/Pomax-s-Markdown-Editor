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
  constructor(type, content = ``) {
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
    this.tagName = ``;

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
     * @type {NodeRuntime}
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
   * @returns {Promise<string>}
   */
  async toMarkdown() {
    const { renderTreeToMarkdown } = await import(`../renderers/markdown.js`);
    return renderTreeToMarkdown(this);
  }

  /**
   * Converts this node to a DOM element. Each element gets an
   * `__st_node` property referencing this SyntaxNode.
   *
   * @param {Document} doc - The Document to create elements with.
   * @returns {Promise<Element>}
   */
  async toDOM(doc) {
    const { renderTreeToDOM } = await import(`../renderers/dom.js`);
    return renderTreeToDOM(doc, this);
  }
}
