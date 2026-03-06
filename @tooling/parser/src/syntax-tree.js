/**
 * @fileoverview Syntax Tree data structures.
 * Provides a tree structure for representing parsed markdown.
 */

import { buildInlineTree, tokenizeInline } from './inline-tokenizer.js';

/**
 * Node types whose content contains inline formatting and should be
 * modelled as inline child nodes (text, bold, italic, link, etc.).
 * @type {Set<string>}
 */
const INLINE_CONTENT_TYPES = new Set([
    'paragraph',
    'heading1',
    'heading2',
    'heading3',
    'heading4',
    'heading5',
    'heading6',
    'blockquote',
    'list-item',
]);

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
 * @property {string} [tagName] - HTML tag name for html-block nodes
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
         * (html-block), children are other block-level nodes.
         * @type {SyntaxNode[]}
         */
        this.children = [];

        /**
         * Parent node reference.
         * @type {SyntaxNode|null}
         */
        this.parent = null;

        /**
         * HTML tag name for html-block and html-inline nodes.
         * @type {string}
         */
        this.tagName = '';

        /**
         * Additional attributes for the node.
         * @type {NodeAttributes}
         */
        this.attributes = {};

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

        // Build inline children for types that contain inline formatting.
        if (content && INLINE_CONTENT_TYPES.has(type)) {
            this.buildInlineChildren();
        }
    }

    /**
     * (Re)builds inline child nodes from this node's raw content.
     * Only meaningful for inline-containing types (paragraph, heading,
     * blockquote, list-item).
     */
    buildInlineChildren() {
        this.children = [];
        if (!this.content) return;
        const tokens = tokenizeInline(this.content);
        const segments = buildInlineTree(tokens);
        for (const seg of segments) {
            this.appendChild(SyntaxNode.segmentToNode(seg));
        }
    }

    /**
     * Converts an InlineSegment (from buildInlineTree) into a SyntaxNode.
     * @param {import('./inline-tokenizer.js').InlineSegment} segment
     * @returns {SyntaxNode}
     */
    static segmentToNode(segment) {
        switch (segment.type) {
            case 'text':
                return new SyntaxNode('text', segment.text ?? '');
            case 'code':
                return new SyntaxNode('inline-code', segment.content ?? '');
            case 'image': {
                const img = new SyntaxNode('inline-image', '');
                img.attributes.alt = segment.alt ?? '';
                img.attributes.src = segment.src ?? '';
                return img;
            }
            default: {
                // Containers: bold, italic, bold-italic, strikethrough,
                // link, and HTML inline tags (sub, sup, etc.)
                const isHtmlInline = !!segment.tag;
                const node = new SyntaxNode(isHtmlInline ? 'html-inline' : segment.type, '');
                if (isHtmlInline) node.tagName = segment.tag;
                if (segment.href) node.attributes.href = segment.href;
                if (segment.children) {
                    for (const child of segment.children) {
                        node.appendChild(SyntaxNode.segmentToNode(child));
                    }
                }
                return node;
            }
        }
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
                const fence = '`'.repeat(this.attributes.fenceCount || 3);
                const code = this.children.length > 0 ? this.children[0].content : this.content;
                return `${fence}${lang}\n${code}\n${fence}`;
            }
            case 'list': {
                return this.children.map((child) => child.toMarkdown(depth)).join('\n');
            }
            case 'list-item': {
                const listParent = this.parent;
                const indent = listParent ? '  '.repeat(listParent.attributes.indent || 0) : '';
                const marker = listParent?.attributes.ordered
                    ? `${listParent.attributes.number || 1}. `
                    : `${listParent?.runtime.marker || '-'} `;
                const checkbox =
                    typeof this.attributes.checked === 'boolean'
                        ? this.attributes.checked
                            ? '[x] '
                            : '[ ] '
                        : '';
                const lines = [`${indent}${marker}${checkbox}${this.content}`];
                for (const child of this.children) {
                    if (child.type === 'list') {
                        lines.push(child.toMarkdown(depth));
                    }
                }
                return lines.join('\n');
            }
            case 'horizontal-rule': {
                const hrMarker = this.attributes.marker || '-';
                const hrCount = this.attributes.count || 3;
                return hrMarker.repeat(hrCount);
            }
            case 'image': {
                const imgAlt = this.attributes.alt ?? this.content;
                const imgSrc = this.attributes.url ?? '';
                const imgStyle = this.attributes.style ?? '';
                if (imgStyle) {
                    const altAttr = imgAlt ? ` alt="${imgAlt}"` : '';
                    return `<img src="${imgSrc}"${altAttr} style="${imgStyle}" />`;
                }
                if (this.attributes.href) {
                    return `[![${imgAlt}](${imgSrc})](${this.attributes.href})`;
                }
                return `![${imgAlt}](${imgSrc})`;
            }
            case 'table': {
                const rows = [];
                for (const child of this.children) {
                    const cells = child.children.map((cell) => {
                        const text = cell.children.length > 0 ? cell.children[0].content : '';
                        return ` ${text} `;
                    });
                    rows.push(`|${cells.join('|')}|`);
                    // Insert separator after header
                    if (child.type === 'header') {
                        const sep = child.children.map(() => '---');
                        rows.push(`|${sep.join('|')}|`);
                    }
                }
                return rows.join('\n');
            }
            case 'html-block': {
                const indent = '  '.repeat(depth);
                // If the container has exactly one bare-text child, collapse
                // to a single line: <tag>content</tag>
                if (
                    this.children.length === 1 &&
                    this.children[0].attributes.bareText &&
                    this.children[0].type === 'paragraph'
                ) {
                    const tag = this.tagName || 'div';
                    return `${indent}<${tag}>${this.children[0].content}</${tag}>`;
                }

                const lines = [`${indent}${this.runtime.openingTag || ''}`];
                for (const child of this.children) {
                    if (child.type === 'html-block') {
                        lines.push(child.toMarkdown(depth + 1));
                    } else {
                        lines.push('');
                        lines.push(child.toMarkdown());
                        lines.push('');
                    }
                }
                if (this.runtime.closingTag) {
                    lines.push(`${indent}${this.runtime.closingTag}`);
                }
                // Collapse multiple consecutive blank lines
                const result = lines.join('\n').replace(/\n{3,}/g, '\n\n');
                return result;
            }
            default:
                return this.content;
        }
    }

    /**
     * Renders inline SyntaxNode children into a DOM container.
     * @param {Document} doc
     * @param {SyntaxNode[]} children
     * @param {Element|DocumentFragment} container
     */
    static appendInlineChildrenToDOM(doc, children, container) {
        for (const child of children) {
            container.appendChild(SyntaxNode.inlineChildToDOM(doc, child));
        }
    }

    /**
     * Converts a single inline SyntaxNode child to a DOM node.
     * @param {Document} doc
     * @param {SyntaxNode} child
     * @returns {Node}
     */
    static inlineChildToDOM(doc, child) {
        switch (child.type) {
            case 'text':
                return doc.createTextNode(child.content);

            case 'inline-code': {
                const code = doc.createElement('code');
                code.__st_node = child;
                code.textContent = child.content;
                return code;
            }

            case 'inline-image': {
                const img = doc.createElement('img');
                img.__st_node = child;
                img.setAttribute('src', child.attributes.src ?? '');
                img.setAttribute('alt', child.attributes.alt ?? '');
                return img;
            }

            case 'bold': {
                const el = doc.createElement('strong');
                el.__st_node = child;
                SyntaxNode.appendInlineChildrenToDOM(doc, child.children, el);
                return el;
            }

            case 'italic': {
                const el = doc.createElement('em');
                el.__st_node = child;
                SyntaxNode.appendInlineChildrenToDOM(doc, child.children, el);
                return el;
            }

            case 'bold-italic': {
                const strong = doc.createElement('strong');
                strong.__st_node = child;
                const em = doc.createElement('em');
                SyntaxNode.appendInlineChildrenToDOM(doc, child.children, em);
                strong.appendChild(em);
                return strong;
            }

            case 'strikethrough': {
                const el = doc.createElement('del');
                el.__st_node = child;
                SyntaxNode.appendInlineChildrenToDOM(doc, child.children, el);
                return el;
            }

            case 'link': {
                const a = doc.createElement('a');
                a.__st_node = child;
                a.setAttribute('href', child.attributes.href ?? '');
                SyntaxNode.appendInlineChildrenToDOM(doc, child.children, a);
                return a;
            }

            case 'html-inline': {
                const el = doc.createElement(child.tagName);
                el.__st_node = child;
                SyntaxNode.appendInlineChildrenToDOM(doc, child.children, el);
                return el;
            }

            default: {
                const el = doc.createElement(child.type);
                el.__st_node = child;
                SyntaxNode.appendInlineChildrenToDOM(doc, child.children, el);
                return el;
            }
        }
    }

    /**
     * Renders raw inline markdown content to a DocumentFragment.
     * Used for table cells and other contexts where inline children
     * aren't pre-built as SyntaxNodes.
     * @param {Document} doc
     * @param {string} content
     * @returns {DocumentFragment}
     */
    static renderInlineContentToDOM(doc, content) {
        const frag = doc.createDocumentFragment();
        const tokens = tokenizeInline(content);
        const segments = buildInlineTree(tokens);
        for (const seg of segments) {
            frag.appendChild(SyntaxNode.segmentToDOM(doc, seg));
        }
        return frag;
    }

    /**
     * Converts an InlineSegment to a DOM node.
     * @param {Document} doc
     * @param {import('./inline-tokenizer.js').InlineSegment} segment
     * @returns {Node}
     */
    static segmentToDOM(doc, segment) {
        switch (segment.type) {
            case 'text':
                return doc.createTextNode(segment.text ?? '');

            case 'code': {
                const code = doc.createElement('code');
                code.textContent = segment.content ?? '';
                return code;
            }

            case 'image': {
                const img = doc.createElement('img');
                img.setAttribute('src', segment.src ?? '');
                img.setAttribute('alt', segment.alt ?? '');
                return img;
            }

            case 'bold': {
                const el = doc.createElement('strong');
                if (segment.children) {
                    for (const child of segment.children) {
                        el.appendChild(SyntaxNode.segmentToDOM(doc, child));
                    }
                }
                return el;
            }

            case 'italic': {
                const el = doc.createElement('em');
                if (segment.children) {
                    for (const child of segment.children) {
                        el.appendChild(SyntaxNode.segmentToDOM(doc, child));
                    }
                }
                return el;
            }

            case 'bold-italic': {
                const strong = doc.createElement('strong');
                const em = doc.createElement('em');
                if (segment.children) {
                    for (const child of segment.children) {
                        em.appendChild(SyntaxNode.segmentToDOM(doc, child));
                    }
                }
                strong.appendChild(em);
                return strong;
            }

            case 'strikethrough': {
                const el = doc.createElement('del');
                if (segment.children) {
                    for (const child of segment.children) {
                        el.appendChild(SyntaxNode.segmentToDOM(doc, child));
                    }
                }
                return el;
            }

            case 'link': {
                const a = doc.createElement('a');
                a.setAttribute('href', segment.href ?? '');
                if (segment.children) {
                    for (const child of segment.children) {
                        a.appendChild(SyntaxNode.segmentToDOM(doc, child));
                    }
                }
                return a;
            }

            default: {
                // HTML inline tags (sub, sup, mark, u, etc.)
                const tag = segment.tag || segment.type;
                const el = doc.createElement(tag);
                if (segment.children) {
                    for (const child of segment.children) {
                        el.appendChild(SyntaxNode.segmentToDOM(doc, child));
                    }
                }
                return el;
            }
        }
    }

    /**
     * Converts this node to a DOM element. Each element gets an
     * `__st_node` property referencing this SyntaxNode.
     *
     * @param {Document} doc - The Document to create elements with.
     * @returns {Element}
     */
    toDOM(doc) {
        switch (this.type) {
            case 'heading1':
            case 'heading2':
            case 'heading3':
            case 'heading4':
            case 'heading5':
            case 'heading6': {
                const level = this.type.charAt(this.type.length - 1);
                const el = doc.createElement(`h${level}`);
                el.__st_node = this;
                SyntaxNode.appendInlineChildrenToDOM(doc, this.children, el);
                return el;
            }

            case 'paragraph': {
                const el = doc.createElement('p');
                el.__st_node = this;
                SyntaxNode.appendInlineChildrenToDOM(doc, this.children, el);
                return el;
            }

            case 'blockquote': {
                const el = doc.createElement('blockquote');
                el.__st_node = this;
                SyntaxNode.appendInlineChildrenToDOM(doc, this.children, el);
                return el;
            }

            case 'code-block': {
                const pre = doc.createElement('pre');
                pre.__st_node = this;
                const code = doc.createElement('code');
                if (this.attributes.language) {
                    code.setAttribute('class', `language-${this.attributes.language}`);
                }
                code.textContent = this.children.length > 0 ? this.children[0].content : this.content;
                pre.appendChild(code);
                return pre;
            }

            case 'list': {
                const isOrdered = this.attributes.ordered;
                const listEl = doc.createElement(isOrdered ? 'ol' : 'ul');
                listEl.__st_node = this;
                if (isOrdered && this.attributes.number > 1) {
                    listEl.setAttribute('start', String(this.attributes.number));
                }
                for (const child of this.children) {
                    listEl.appendChild(child.toDOM(doc));
                }
                return listEl;
            }

            case 'list-item': {
                const li = doc.createElement('li');
                li.__st_node = this;
                if (typeof this.attributes.checked === 'boolean') {
                    const checkbox = doc.createElement('input');
                    checkbox.setAttribute('type', 'checkbox');
                    if (this.attributes.checked) {
                        checkbox.setAttribute('checked', '');
                    }
                    li.appendChild(checkbox);
                    li.appendChild(doc.createTextNode(' '));
                }
                // Append inline children (text, bold, etc.) but not nested lists
                const inlineChildren = this.children.filter((c) => c.type !== 'list');
                SyntaxNode.appendInlineChildrenToDOM(doc, inlineChildren, li);
                // Append nested list children
                for (const child of this.children) {
                    if (child.type === 'list') {
                        li.appendChild(child.toDOM(doc));
                    }
                }
                return li;
            }

            case 'horizontal-rule': {
                const hr = doc.createElement('hr');
                hr.__st_node = this;
                return hr;
            }

            case 'image': {
                const alt = this.attributes.alt ?? this.content ?? '';
                const src = this.attributes.url ?? '';
                const style = this.attributes.style ?? '';

                const figure = doc.createElement('figure');
                figure.__st_node = this;

                if (alt) {
                    const figcaption = doc.createElement('figcaption');
                    figcaption.textContent = alt;
                    figure.appendChild(figcaption);
                }

                const img = doc.createElement('img');
                img.setAttribute('src', src);
                img.setAttribute('alt', alt);
                if (style) img.setAttribute('style', style);

                if (this.attributes.href) {
                    const a = doc.createElement('a');
                    a.setAttribute('href', this.attributes.href);
                    a.appendChild(img);
                    figure.appendChild(a);
                } else {
                    figure.appendChild(img);
                }

                return figure;
            }

            case 'table': {
                const table = doc.createElement('table');
                table.__st_node = this;

                const thead = doc.createElement('thead');
                const tbody = doc.createElement('tbody');

                for (const child of this.children) {
                    const tr = doc.createElement('tr');
                    const isHeader = child.type === 'header';
                    for (const cell of child.children) {
                        const el = doc.createElement(isHeader ? 'th' : 'td');
                        const text = cell.children.length > 0 ? cell.children[0].content : '';
                        el.appendChild(SyntaxNode.renderInlineContentToDOM(doc, text));
                        tr.appendChild(el);
                    }
                    if (isHeader) {
                        thead.appendChild(tr);
                    } else {
                        tbody.appendChild(tr);
                    }
                }

                if (thead.childNodes.length > 0) {
                    table.appendChild(thead);
                }
                if (tbody.childNodes.length > 0) {
                    table.appendChild(tbody);
                }

                return table;
            }

            case 'html-block': {
                const tagName = this.tagName || 'div';
                const el = doc.createElement(tagName);
                el.__st_node = this;

                if (this.runtime.openingTag) {
                    const temp = doc.createElement('div');
                    temp.innerHTML = this.runtime.openingTag;
                    const sourceEl = temp.firstElementChild;
                    if (sourceEl) {
                        for (const attr of sourceEl.attributes) {
                            el.setAttribute(attr.name, attr.value);
                        }
                    }
                }

                if (
                    this.children.length === 1 &&
                    this.children[0].attributes.bareText &&
                    this.children[0].type === 'paragraph'
                ) {
                    SyntaxNode.appendInlineChildrenToDOM(doc, this.children[0].children, el);
                } else {
                    renderBlockChildrenToDOM(doc, this.children, el);
                }

                return el;
            }

            default: {
                const el = doc.createElement('div');
                el.__st_node = this;
                el.textContent = this.content;
                return el;
            }
        }
    }
}

// ── DOM rendering helpers ───────────────────────────────────────────

/**
 * Renders an array of block-level SyntaxNode children into a DOM
 * container.
 * @param {Document} doc
 * @param {SyntaxNode[]} children
 * @param {Element} container
 */
function renderBlockChildrenToDOM(doc, children, container) {
    for (const child of children) {
        container.appendChild(child.toDOM(doc));
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
        const lines = [];

        for (const child of this.children) {
            lines.push(child.toMarkdown());
        }

        return lines.join('\n\n') + '\n';
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
        const d = doc || this.doc;
        const container = d.createElement('div');
        renderBlockChildrenToDOM(d, this.children, container);
        return container;
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
