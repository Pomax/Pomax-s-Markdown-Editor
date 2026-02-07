/**
 * @fileoverview Syntax Tree data structures.
 * Provides a tree structure for representing parsed markdown.
 */

/**
 * @typedef {Object} NodeAttributes
 * @property {string} [language] - Language for code blocks
 * @property {number} [indent] - Indentation level for list items
 * @property {boolean} [ordered] - Whether a list is ordered
 * @property {number} [number] - Number for ordered list items
 * @property {string} [url] - URL for links and images
 * @property {string} [title] - Title for links and images
 * @property {string} [alt] - Alt text for images
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
         * The text content.
         * @type {string}
         */
        this.content = content;

        /**
         * Child nodes.
         * @type {SyntaxNode[]}
         */
        this.children = [];

        /**
         * Parent node reference.
         * @type {SyntaxNode|null}
         */
        this.parent = null;

        /**
         * Additional attributes for the node.
         * @type {NodeAttributes}
         */
        this.attributes = {};

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
     * Removes a child node.
     * @param {SyntaxNode} child - The child node to remove
     * @returns {boolean} Whether the child was found and removed
     */
    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            this.children.splice(index, 1);
            child.parent = null;
            return true;
        }
        return false;
    }

    /**
     * Inserts a node before another node.
     * @param {SyntaxNode} newNode - The node to insert
     * @param {SyntaxNode} referenceNode - The node to insert before
     * @returns {boolean} Whether the insertion was successful
     */
    insertBefore(newNode, referenceNode) {
        const index = this.children.indexOf(referenceNode);
        if (index !== -1) {
            newNode.parent = this;
            this.children.splice(index, 0, newNode);
            return true;
        }
        return false;
    }

    /**
     * Converts this node to markdown.
     * @returns {string}
     */
    toMarkdown() {
        switch (this.type) {
            case 'heading1':
                return `# ${this.content}`;
            case 'heading2':
                return `## ${this.content}`;
            case 'heading3':
                return `### ${this.content}`;
            case 'heading4':
                return `#### ${this.content}`;
            case 'heading5':
                return `##### ${this.content}`;
            case 'heading6':
                return `###### ${this.content}`;
            case 'paragraph':
                return this.content;
            case 'blockquote':
                return this.content
                    .split('\n')
                    .map((line) => `> ${line}`)
                    .join('\n');
            case 'code-block': {
                const lang = this.attributes.language || '';
                return `\`\`\`${lang}\n${this.content}\n\`\`\``;
            }
            case 'list-item': {
                const indent = '  '.repeat(this.attributes.indent || 0);
                const marker = this.attributes.ordered ? `${this.attributes.number || 1}. ` : '- ';
                return `${indent}${marker}${this.content}`;
            }
            case 'horizontal-rule':
                return '---';
            case 'table':
                return this.content;
            default:
                return this.content;
        }
    }

    /**
     * Creates a deep clone of this node.
     * @returns {SyntaxNode}
     */
    clone() {
        const cloned = new SyntaxNode(this.type, this.content);
        cloned.attributes = { ...this.attributes };
        cloned.startLine = this.startLine;
        cloned.endLine = this.endLine;

        for (const child of this.children) {
            cloned.appendChild(child.clone());
        }

        return cloned;
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
     * Removes a node from the tree.
     * @param {SyntaxNode} node - The node to remove
     * @returns {boolean} Whether the node was found and removed
     */
    removeChild(node) {
        const index = this.children.indexOf(node);
        if (index !== -1) {
            this.children.splice(index, 1);
            node.parent = null;
            return true;
        }
        return false;
    }

    /**
     * Finds a node by its ID.
     * @param {string} id - The node ID
     * @returns {SyntaxNode|null}
     */
    findNodeById(id) {
        for (const child of this.children) {
            if (child.id === id) {
                return child;
            }
            const found = this.findNodeByIdRecursive(child, id);
            if (found) {
                return found;
            }
        }
        return null;
    }

    /**
     * Recursively finds a node by ID.
     * @param {SyntaxNode} node - The node to search in
     * @param {string} id - The ID to find
     * @returns {SyntaxNode|null}
     */
    findNodeByIdRecursive(node, id) {
        for (const child of node.children) {
            if (child.id === id) {
                return child;
            }
            const found = this.findNodeByIdRecursive(child, id);
            if (found) {
                return found;
            }
        }
        return null;
    }

    /**
     * Finds the node at a given position.
     * @param {number} line - The line number (0-based)
     * @param {number} column - The column number (0-based)
     * @returns {SyntaxNode|null}
     */
    findNodeAtPosition(line, column) {
        for (const child of this.children) {
            if (line >= child.startLine && line <= child.endLine) {
                return child;
            }
        }
        return null;
    }

    /**
     * Changes the type of a node.
     * @param {SyntaxNode} node - The node to change
     * @param {string} newType - The new type
     */
    changeNodeType(node, newType) {
        node.type = newType;

        // Reset type-specific attributes
        switch (newType) {
            case 'list-item':
                if (!node.attributes.ordered) {
                    node.attributes = { ordered: false, indent: 0 };
                }
                break;
            case 'code-block':
                if (!node.attributes.language) {
                    node.attributes = { language: '' };
                }
                break;
            default:
                node.attributes = {};
        }
    }

    /**
     * Applies formatting to a selection.
     * @param {{startLine: number, startColumn: number, endLine: number, endColumn: number}} selection
     * @param {string} format - The format to apply
     */
    applyFormat(selection, format) {
        // Find the node containing the selection
        const node = this.findNodeAtPosition(selection.startLine, selection.startColumn);
        if (!node) return;

        // Apply the format to the content
        const content = node.content;
        const lines = content.split('\n');

        // For simplicity, assuming single-line selection within a node
        const startOffset = this.getOffsetInNode(node, selection.startLine, selection.startColumn);
        const endOffset = this.getOffsetInNode(node, selection.endLine, selection.endColumn);

        const before = content.substring(0, startOffset);
        const selected = content.substring(startOffset, endOffset);
        const after = content.substring(endOffset);

        let formatted;
        switch (format) {
            case 'bold':
                formatted = `**${selected}**`;
                break;
            case 'italic':
                formatted = `*${selected}*`;
                break;
            case 'code':
                formatted = `\`${selected}\``;
                break;
            case 'strikethrough':
                formatted = `~~${selected}~~`;
                break;
            case 'link':
                formatted = `[${selected}](url)`;
                break;
            default:
                formatted = selected;
        }

        node.content = before + formatted + after;
    }

    /**
     * Gets the offset within a node for a line/column position.
     * @param {SyntaxNode} node - The node
     * @param {number} line - The line number (0-based)
     * @param {number} column - The column number (0-based)
     * @returns {number}
     */
    getOffsetInNode(node, line, column) {
        const nodeStartLine = node.startLine;
        const relativeLine = line - nodeStartLine;

        const lines = node.content.split('\n');
        let offset = 0;

        for (let i = 0; i < relativeLine && i < lines.length; i++) {
            offset += lines[i].length + 1; // +1 for newline
        }

        return offset + Math.min(column, lines[relativeLine]?.length ?? 0);
    }

    /**
     * Converts the tree to markdown.
     * @returns {string}
     */
    toMarkdown() {
        const lines = [];

        for (const child of this.children) {
            lines.push(child.toMarkdown());
        }

        return lines.join('\n\n');
    }

    /**
     * Creates a deep clone of the tree.
     * @returns {SyntaxTree}
     */
    clone() {
        const cloned = new SyntaxTree();

        for (const child of this.children) {
            cloned.appendChild(child.clone());
        }

        return cloned;
    }

    /**
     * Gets the total number of nodes in the tree.
     * @returns {number}
     */
    getNodeCount() {
        let count = 0;

        /**
         * @param {SyntaxNode[]} nodes
         */
        const countRecursive = (nodes) => {
            for (const node of nodes) {
                count++;
                countRecursive(node.children);
            }
        };

        countRecursive(this.children);
        return count;
    }
}
