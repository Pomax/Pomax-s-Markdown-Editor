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
 * @property {string} [openingTag] - Full opening tag line for html-block nodes
 * @property {string} [closingTag] - Full closing tag line for html-block nodes
 * @property {boolean} [bareText] - Whether this node represents bare text inside an HTML container
 * @property {boolean} [_detailsOpen] - Runtime-only toggle for fake details collapse state (not serialised)
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
         * The raw text content (backing field for the `content` accessor).
         * @type {string}
         */
        this._content = content;

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

        // Build inline children for types that contain inline formatting.
        if (content && INLINE_CONTENT_TYPES.has(type)) {
            this.buildInlineChildren();
        }
    }

    /** @returns {string} */
    get content() {
        return this._content;
    }

    /** @param {string} val */
    set content(val) {
        this._content = val;
        if (INLINE_CONTENT_TYPES.has(this.type)) {
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
        if (!this._content) return;
        const tokens = tokenizeInline(this._content);
        const segments = buildInlineTree(tokens);
        for (const seg of segments) {
            this.appendChild(SyntaxNode._segmentToNode(seg));
        }
    }

    /**
     * Converts an InlineSegment (from buildInlineTree) into a SyntaxNode.
     * @param {import('./inline-tokenizer.js').InlineSegment} segment
     * @returns {SyntaxNode}
     */
    static _segmentToNode(segment) {
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
                const node = new SyntaxNode(segment.type, '');
                if (segment.href) node.attributes.href = segment.href;
                if (segment.tag) node.attributes.tag = segment.tag;
                if (segment.children) {
                    for (const child of segment.children) {
                        node.appendChild(SyntaxNode._segmentToNode(child));
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
     * Returns the nearest block-level ancestor (an INLINE_CONTENT_TYPES node),
     * or `this` if this node is itself a block-level node.
     * @returns {SyntaxNode}
     */
    getBlockParent() {
        /** @type {SyntaxNode} */
        let node = this;
        while (node.parent) {
            if (INLINE_CONTENT_TYPES.has(node.type)) return node;
            node = node.parent;
        }
        return node;
    }

    /**
     * Returns true if this node is an inline child (created by
     * buildInlineChildren), not a block-level node.
     * @returns {boolean}
     */
    isInlineNode() {
        return this.getBlockParent() !== this;
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
                const fence = '`'.repeat(this.attributes.fenceCount || 3);
                return `${fence}${lang}\n${this.content}\n${fence}`;
            }
            case 'list-item': {
                const indent = '  '.repeat(this.attributes.indent || 0);
                const marker = this.attributes.ordered ? `${this.attributes.number || 1}. ` : '- ';
                return `${indent}${marker}${this.content}`;
            }
            case 'horizontal-rule':
                return '---';
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
            case 'table':
                return this.content;
            case 'html-block': {
                // If the container has exactly one bare-text child, collapse
                // to a single line: <tag>content</tag>
                if (
                    this.children.length === 1 &&
                    this.children[0].attributes.bareText &&
                    this.children[0].type === 'paragraph'
                ) {
                    const tag = this.attributes.tagName || 'div';
                    return `<${tag}>${this.children[0].content}</${tag}>`;
                }

                const parts = [this.attributes.openingTag || ''];
                for (const child of this.children) {
                    parts.push(child.toMarkdown());
                }
                if (this.attributes.closingTag) {
                    parts.push(this.attributes.closingTag);
                }
                return parts.join('\n\n');
            }
            default:
                return this.content;
        }
    }

    /**
     * Returns the visible plain text for this node, with all inline
     * formatting syntax removed.  Images and other non-text elements
     * are omitted entirely; link text is kept but URLs are dropped.
     *
     * Used by the search system for writing-view matching, where the
     * user sees rendered text rather than raw markdown.
     *
     * @returns {string}
     */
    toBareText() {
        switch (this.type) {
            case 'heading1':
            case 'heading2':
            case 'heading3':
            case 'heading4':
            case 'heading5':
            case 'heading6':
            case 'paragraph':
            case 'blockquote':
            case 'list-item':
                return SyntaxNode._inlineChildrenToText(this.children);

            case 'code-block':
                return this.content;

            case 'table': {
                // Extract visible cell text from the pipe-delimited table.
                // Skip the separator row (e.g. |---|---|).
                const lines = this.content.split('\n');
                const textLines = [];
                for (const line of lines) {
                    if (/^\s*\|?\s*[-:]+[-|:\s]*$/.test(line)) continue;
                    const cells = line
                        .replace(/^\||\|$/g, '')
                        .split('|')
                        .map((c) => SyntaxNode._extractInlineText(c.trim()));
                    textLines.push(cells.join('\t'));
                }
                return textLines.join('\n');
            }

            case 'image':
                // Images are purely visual – no searchable text.
                return '';

            case 'horizontal-rule':
                return '';

            case 'html-block': {
                // If the container has exactly one bare-text child,
                // return just its text.
                if (
                    this.children.length === 1 &&
                    this.children[0].attributes.bareText &&
                    this.children[0].type === 'paragraph'
                ) {
                    return SyntaxNode._inlineChildrenToText(this.children[0].children);
                }

                const parts = [];
                for (const child of this.children) {
                    const text = child.toBareText();
                    if (text) parts.push(text);
                }
                return parts.join('\n\n');
            }

            default:
                return SyntaxNode._extractInlineText(this.content);
        }
    }

    /**
     * Extracts visible text from inline markdown, stripping all
     * formatting delimiters (`**`, `*`, `~~`, `` ` ``, HTML tags)
     * and removing images.  Link text is preserved; link URLs are dropped.
     *
     * @param {string} content - Raw inline markdown content
     * @returns {string}
     */
    static _extractInlineText(content) {
        const tokens = tokenizeInline(content);
        const segments = buildInlineTree(tokens);
        return SyntaxNode._segmentsToText(segments);
    }

    /**
     * Recursively extracts plain text from an InlineSegment tree.
     *
     * @param {import('./inline-tokenizer.js').InlineSegment[]} segments
     * @returns {string}
     */
    static _segmentsToText(segments) {
        let result = '';
        for (const seg of segments) {
            if (seg.type === 'text') {
                result += seg.text ?? '';
            } else if (seg.type === 'code') {
                result += seg.content ?? '';
            } else if (seg.type === 'image') {
                // Images produce no visible text.
            } else if (seg.children) {
                result += SyntaxNode._segmentsToText(seg.children);
            }
        }
        return result;
    }

    /**
     * Recursively extracts plain text from inline SyntaxNode children.
     * Similar to _segmentsToText but operates on SyntaxNode children
     * instead of InlineSegment objects.
     *
     * @param {SyntaxNode[]} children
     * @returns {string}
     */
    static _inlineChildrenToText(children) {
        let result = '';
        for (const child of children) {
            if (child.type === 'text') {
                result += child._content;
            } else if (child.type === 'inline-code') {
                result += child._content;
            } else if (child.type === 'inline-image') {
                // Images produce no visible text.
            } else if (child.children.length > 0) {
                result += SyntaxNode._inlineChildrenToText(child.children);
            }
        }
        return result;
    }

    /**
     * Creates a deep clone of this node.
     * @returns {SyntaxNode}
     */
    clone() {
        const cloned = new SyntaxNode(this.type, this.content);
        // The constructor may have auto-built inline children from
        // content; clear them so we clone the original's children
        // instead (they carry the same structure but the right IDs).
        cloned.children = [];
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

        /**
         * Tree-based cursor position.
         * @type {import('../editor/editor.js').TreeCursor|null}
         */
        this.treeCursor = null;
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
     * Recurses into container nodes (e.g. html-block) to find the
     * deepest (leaf) node that contains the position.
     * @param {number} line - The line number (0-based)
     * @param {number} column - The column number (0-based)
     * @returns {SyntaxNode|null}
     */
    findNodeAtPosition(line, column) {
        for (const child of this.children) {
            if (line >= child.startLine && line <= child.endLine) {
                return this.findDeepestNodeAtPosition(child, line, column);
            }
        }
        return null;
    }

    /**
     * Recursively descends into a node's children to find the deepest
     * node that contains the given line position.
     * @param {SyntaxNode} node
     * @param {number} line
     * @param {number} column
     * @returns {SyntaxNode}
     */
    findDeepestNodeAtPosition(node, line, column) {
        // Only descend into block-level children (e.g. html-block
        // containers).  Inline children (text, bold, italic, etc.)
        // share the parent's line range and should not be traversed.
        if (!INLINE_CONTENT_TYPES.has(node.type) && node.children.length > 0) {
            for (const child of node.children) {
                if (line >= child.startLine && line <= child.endLine) {
                    return this.findDeepestNodeAtPosition(child, line, column);
                }
            }
        }
        return node;
    }

    /**
     * Changes the type of a node.
     * @param {SyntaxNode} node - The node to change
     * @param {string} newType - The new type
     */
    changeNodeType(node, newType) {
        const wasInline = INLINE_CONTENT_TYPES.has(node.type);
        node.type = newType;
        const isInline = INLINE_CONTENT_TYPES.has(newType);

        // If transitioning between inline-containing and non-inline types,
        // rebuild or clear the inline children accordingly.
        if (isInline && !wasInline) {
            node.buildInlineChildren();
        } else if (!isInline && wasInline) {
            node.children = [];
        }

        // Reset type-specific attributes
        switch (newType) {
            case 'list-item':
                node.attributes = {
                    ordered: !!node.attributes.ordered,
                    indent: node.attributes.indent || 0,
                    ...(node.attributes.ordered ? { number: node.attributes.number || 1 } : {}),
                };
                break;
            case 'code-block':
                if (!node.attributes.language) {
                    node.attributes = {
                        language: '',
                        fenceCount: node.attributes.fenceCount || 3,
                    };
                } else {
                    node.attributes.fenceCount = node.attributes.fenceCount || 3;
                }
                break;
            default:
                node.attributes = {};
        }
    }

    /**
     * Applies formatting to a selection within a node.  If the selection
     * start falls inside an existing span of the same format, the format
     * is toggled off (delimiters removed) instead.
     *
     * @param {SyntaxNode} node - The node containing the selection
     * @param {number} startOffset - Start offset within node.content (raw)
     * @param {number} endOffset - End offset within node.content (raw)
     * @param {string} format - The format to apply
     * @returns {number} The raw offset where the cursor should be placed
     *                   after the operation (end of the affected text).
     */
    applyFormat(node, startOffset, endOffset, format) {
        const content = node.content;
        let selStart = startOffset;
        let selEnd = endOffset;

        // ── Collapsed cursor (no selection): infer the target ──────────
        if (selStart === selEnd) {
            // If inside an existing format span, toggle it off.
            const span = this._findFormatSpan(content, selStart, selStart, format);
            if (span) {
                const withoutClose =
                    content.substring(0, span.closeStart) + content.substring(span.closeEnd);
                node.content =
                    withoutClose.substring(0, span.openStart) +
                    withoutClose.substring(span.openEnd);
                const contentLen = span.closeStart - span.openEnd;
                return span.openStart + contentLen;
            }
            // Otherwise, find the word around the cursor and bold it.
            const bounds = this._findWordBoundaries(content, startOffset);
            if (bounds.start === bounds.end) return startOffset; // no word
            selStart = bounds.start;
            selEnd = bounds.end;
        }

        // ── Toggle-off: check if the selection overlaps an existing span ─
        const span = this._findFormatSpan(content, selStart, selEnd, format);
        if (span) {
            // Remove closing delimiter first (higher offset) then opening,
            // so that removing the first doesn't shift the second's position.
            const withoutClose =
                content.substring(0, span.closeStart) + content.substring(span.closeEnd);
            node.content =
                withoutClose.substring(0, span.openStart) + withoutClose.substring(span.openEnd);
            // Cursor goes to end of the now-unformatted text.
            const contentLen = span.closeStart - span.openEnd;
            return span.openStart + contentLen;
        }

        // ── Mutual exclusion: sub ↔ sup — strip the opposite first ──
        if (format === 'subscript' || format === 'superscript') {
            const opposite = format === 'subscript' ? 'superscript' : 'subscript';
            const oppositeSpan = this._findFormatSpan(node.content, selStart, selEnd, opposite);
            if (oppositeSpan) {
                // Remove the opposite wrapper, then re-wrap with the new format.
                const withoutClose =
                    node.content.substring(0, oppositeSpan.closeStart) +
                    node.content.substring(oppositeSpan.closeEnd);
                node.content =
                    withoutClose.substring(0, oppositeSpan.openStart) +
                    withoutClose.substring(oppositeSpan.openEnd);
                // Adjust selection to the now-unwrapped content region.
                selStart = oppositeSpan.openStart;
                selEnd = oppositeSpan.openStart + (oppositeSpan.closeStart - oppositeSpan.openEnd);
            }
        }

        // ── Toggle-on: wrap the selected text in format markers ──────────
        const before = node.content.substring(0, selStart);
        let selected = node.content.substring(selStart, selEnd);
        const after = node.content.substring(selEnd);

        // Trim trailing whitespace so markers hug the text
        // (e.g. **word** not **word **).
        const trimmed = selected.replace(/\s+$/, '');
        const trailingWS = selected.substring(trimmed.length);
        selected = trimmed;

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
            case 'subscript':
                formatted = `<sub>${selected}</sub>`;
                break;
            case 'superscript':
                formatted = `<sup>${selected}</sup>`;
                break;
            case 'link':
                formatted = `[${selected}](url)`;
                break;
            default:
                formatted = selected;
        }

        node.content = before + formatted + trailingWS + after;
        // Cursor goes right after the closing delimiter.
        return selStart + formatted.length;
    }

    /**
     * Searches for an existing format span whose content region overlaps
     * the selection [selStart, selEnd].  Returns the raw positions of the
     * open/close delimiters, or `null` if no matching span is found.
     *
     * The overlap check is:
     *   selStart <= contentEnd  AND  selEnd >= contentStart
     *
     * This handles the common case where `renderedOffsetToRawOffset` maps
     * the selection start to *before* the opening delimiter (raw offset 0)
     * while the selection end lands at the closing delimiter boundary.
     *
     * @param {string} content  - The raw node content
     * @param {number} selStart - Selection start (raw offset)
     * @param {number} selEnd   - Selection end (raw offset)
     * @param {string} format   - 'bold' | 'italic' | 'strikethrough' | 'code'
     * @returns {{ openStart: number, openEnd: number,
     *             closeStart: number, closeEnd: number } | null}
     */
    _findFormatSpan(content, selStart, selEnd, format) {
        const tokens = tokenizeInline(content);

        // ── Code is a single token, not a paired open/close ─────────
        if (format === 'code') {
            let rawPos = 0;
            for (const token of tokens) {
                const tokenStart = rawPos;
                rawPos += token.raw.length;
                if (token.type === 'code') {
                    const contentStart = tokenStart + 1; // after opening `
                    const contentEnd = rawPos - 1; // before closing `
                    if (selStart <= contentEnd && selEnd >= contentStart) {
                        return {
                            openStart: tokenStart,
                            openEnd: contentStart,
                            closeStart: contentEnd,
                            closeEnd: rawPos,
                        };
                    }
                }
            }
            return null;
        }

        // ── Paired delimiters: bold / italic / strikethrough ────────
        /** @type {Record<string, { open: string, close: string, htmlTags?: string[] }>} */
        const typeMap = {
            bold: { open: 'bold-open', close: 'bold-close', htmlTags: ['strong', 'b'] },
            italic: { open: 'italic-open', close: 'italic-close', htmlTags: ['em', 'i'] },
            strikethrough: {
                open: 'strikethrough-open',
                close: 'strikethrough-close',
                htmlTags: ['del', 's'],
            },
        };
        const spec = typeMap[format];

        // ── HTML-tag formats: subscript / superscript ───────────
        if (!spec) {
            /** @type {Record<string, string>} */
            const htmlTagMap = {
                subscript: 'sub',
                superscript: 'sup',
            };
            const tagName = htmlTagMap[format];
            if (!tagName) return null; // link — no toggle

            let rawPos = 0;
            /** @type {{ rawStart: number, rawEnd: number }[]} */
            const htmlOpens = [];

            for (const token of tokens) {
                const tokenStart = rawPos;
                rawPos += token.raw.length;

                if (token.type === 'html-open' && token.tag === tagName) {
                    htmlOpens.push({ rawStart: tokenStart, rawEnd: rawPos });
                } else if (
                    token.type === 'html-close' &&
                    token.tag === tagName &&
                    htmlOpens.length > 0
                ) {
                    const open = /** @type {{ rawStart: number, rawEnd: number }} */ (
                        htmlOpens.pop()
                    );
                    if (selStart <= tokenStart && selEnd >= open.rawEnd) {
                        return {
                            openStart: open.rawStart,
                            openEnd: open.rawEnd,
                            closeStart: tokenStart,
                            closeEnd: rawPos,
                        };
                    }
                }
            }
            return null;
        }

        let rawPos = 0;
        /** @type {{ rawStart: number, rawEnd: number }[]} */
        const opens = [];

        for (const token of tokens) {
            const tokenStart = rawPos;
            rawPos += token.raw.length;

            if (token.type === spec.open) {
                opens.push({ rawStart: tokenStart, rawEnd: rawPos });
            } else if (token.type === spec.close && opens.length > 0) {
                const open = /** @type {{ rawStart: number, rawEnd: number }} */ (opens.pop());
                // Content region is between open-end (open.rawEnd) and
                // close-start (tokenStart).  Check overlap with selection.
                if (selStart <= tokenStart && selEnd >= open.rawEnd) {
                    return {
                        openStart: open.rawStart,
                        openEnd: open.rawEnd,
                        closeStart: tokenStart,
                        closeEnd: rawPos,
                    };
                }
            }
        }

        // ── Fall back to HTML-tag equivalents (e.g. <strong> for bold) ──
        if (spec.htmlTags) {
            for (const tagName of spec.htmlTags) {
                let htmlPos = 0;
                /** @type {{ rawStart: number, rawEnd: number }[]} */
                const htmlOpens = [];

                for (const token of tokens) {
                    const tokenStart = htmlPos;
                    htmlPos += token.raw.length;

                    if (token.type === 'html-open' && token.tag === tagName) {
                        htmlOpens.push({ rawStart: tokenStart, rawEnd: htmlPos });
                    } else if (
                        token.type === 'html-close' &&
                        token.tag === tagName &&
                        htmlOpens.length > 0
                    ) {
                        const open = /** @type {{ rawStart: number, rawEnd: number }} */ (
                            htmlOpens.pop()
                        );
                        if (selStart <= tokenStart && selEnd >= open.rawEnd) {
                            return {
                                openStart: open.rawStart,
                                openEnd: open.rawEnd,
                                closeStart: tokenStart,
                                closeEnd: htmlPos,
                            };
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * Finds the word boundaries around a raw offset in the content string.
     * A "word" is a contiguous run of non-whitespace characters.
     *
     * @param {string} content - The raw node content
     * @param {number} offset  - A raw offset within content
     * @returns {{ start: number, end: number }}
     */
    _findWordBoundaries(content, offset) {
        const pos = Math.min(offset, content.length);

        // Scan backwards for start of word.
        let start = pos;
        while (start > 0 && !/\s/.test(content[start - 1])) {
            start--;
        }

        // Scan forwards for end of word.
        let end = pos;
        while (end < content.length && !/\s/.test(content[end])) {
            end++;
        }

        return { start, end };
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
     * Returns the plain visible text of the entire document with all
     * formatting and syntax stripped.  Used by the search system for
     * writing-view matching.
     *
     * @returns {string}
     */
    toBareText() {
        const parts = [];

        for (const child of this.children) {
            const text = child.toBareText();
            if (text !== '') parts.push(text);
        }

        return parts.join('\n\n');
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

    /**
     * Returns the path from the tree root to the node that currently has the
     * cursor, with the cursor's character offset appended as the final element.
     *
     * Every element except the last is a zero-based child index at that level
     * of the tree.  The last element is `treeCursor.offset` (the character
     * position within the node's content).
     *
     * Returns `null` when there is no active cursor or the cursor's node
     * cannot be found in the tree.
     *
     * @returns {number[]|null}
     *
     * @example
     * // Cursor at offset 5 in the 3rd child of the 1st top-level node:
     * tree.getPathToCursor(); // → [0, 2, 5]
     */
    getPathToCursor() {
        if (!this.treeCursor) return null;

        /** @type {number[]} */
        const path = [];
        const treeCursor = this.treeCursor;

        /**
         * @param {SyntaxNode[]} children
         * @returns {boolean}
         */
        const search = (children) => {
            for (let i = 0; i < children.length; i++) {
                if (children[i].id === treeCursor.nodeId) {
                    path.push(i);
                    return true;
                }
                if (children[i].children.length > 0) {
                    path.push(i);
                    if (search(children[i].children)) return true;
                    path.pop();
                }
            }
            return false;
        };

        if (!search(this.children)) return null;

        path.push(treeCursor.offset);
        return path;
    }

    /**
     * Restores the cursor from a path previously produced by
     * {@link getPathToCursor}.  Each element except the last is a
     * zero-based child index used to descend into the tree; the last
     * element is the character offset within the target node's content.
     *
     * Does nothing if `cursorPath` is `null`, empty, or any index is
     * out of bounds.
     *
     * @param {number[]|null} cursorPath
     */
    setCursorPath(cursorPath) {
        if (!cursorPath) return;
        if (cursorPath.length < 2) return;

        let children = this.children;
        for (let i = 0; i < cursorPath.length - 1; i++) {
            const index = cursorPath[i];
            if (index < 0 || index >= children.length) return;
            const node = children[index];
            if (i === cursorPath.length - 2) {
                this.treeCursor = { nodeId: node.id, offset: cursorPath[cursorPath.length - 1] };
                return;
            }
            children = node.children;
        }
    }

    /**
     * Returns the index path from the tree root to the node with the
     * given ID.  Each element is a zero-based child index at that level.
     *
     * Returns `null` when the node cannot be found.
     *
     * @param {string} nodeId
     * @returns {number[]|null}
     */
    getPathToNode(nodeId) {
        /** @type {number[]} */
        const path = [];

        /**
         * @param {SyntaxNode[]} children
         * @returns {boolean}
         */
        const search = (children) => {
            for (let i = 0; i < children.length; i++) {
                if (children[i].id === nodeId) {
                    path.push(i);
                    return true;
                }
                if (children[i].children.length > 0) {
                    path.push(i);
                    if (search(children[i].children)) return true;
                    path.pop();
                }
            }
            return false;
        };

        return search(this.children) ? path : null;
    }

    /**
     * Resolves an index path (produced by {@link getPathToNode}) back
     * to the node at that position in the tree.
     *
     * Returns `null` when any index is out of bounds.
     *
     * @param {number[]|null} nodePath
     * @returns {SyntaxNode|null}
     */
    getNodeAtPath(nodePath) {
        if (!nodePath || nodePath.length === 0) return null;

        let children = this.children;
        for (let i = 0; i < nodePath.length; i++) {
            const index = nodePath[i];
            if (index < 0 || index >= children.length) return null;
            if (i === nodePath.length - 1) return children[index];
            children = children[index].children;
        }
        return null;
    }
}
