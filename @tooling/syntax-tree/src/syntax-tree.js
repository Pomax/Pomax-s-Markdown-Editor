/**
 * @fileoverview Syntax Tree data structures.
 * Provides a tree structure for representing parsed markdown.
 */

import { serializeNodeMarkdown, serializeTreeMarkdown } from './render-tree-as-markdown.js';
import { renderNodeToDOM, renderTreeToDOM } from './render-tree-as-dom.js';

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
    constructor(type, content = '') {
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
        this.tagName = '';

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
     * Converts this node to markdown.
     * @param {number} [depth=0] - HTML nesting depth for indentation
     * @returns {string}
     */
    toMarkdown(depth = 0) {
        return serializeNodeMarkdown(this, depth);
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
     * Adds a child node to the tree.
     * @param {SyntaxNode} node - The node to add
     */
    appendChild(node) {
        node.parent = null;
        this.children.push(node);
    }

    /**
     * Converts the tree to markdown.
     * @returns {string}
     */
    toMarkdown() {
        return serializeTreeMarkdown(this);
    }

    /**
     * Converts the tree to a DOM element.
     * Every element gets an `__st_node` property referencing the
     * originating SyntaxNode.
     *
     * @param {Document} [doc] - The Document to create elements with. Falls back to this.doc.
     * @returns {Element}
     */
    toDOM(doc) {
        return renderTreeToDOM(doc || this.doc, this);
    }

    /**
     * Converts the tree to an HTML string.
     * @param {Document} [doc] - The Document to create elements with. Falls back to this.doc.
     * @returns {string}
     */
    toHTML(doc) {
        return this.toDOM(doc || this.doc).outerHTML;
    }
}
