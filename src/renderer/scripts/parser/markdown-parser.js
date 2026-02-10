/**
 * @fileoverview Markdown Parser.
 * Converts markdown text into a syntax tree structure.
 */

import { SyntaxNode, SyntaxTree } from './syntax-tree.js';

/**
 * GFM type 6 block-level HTML tag names (case-insensitive).
 * @see https://github.github.com/gfm/#html-blocks
 * @type {Set<string>}
 */
const HTML_BLOCK_TAGS = new Set([
    'address',
    'article',
    'aside',
    'base',
    'basefont',
    'blockquote',
    'body',
    'caption',
    'center',
    'col',
    'colgroup',
    'dd',
    'details',
    'dialog',
    'dir',
    'div',
    'dl',
    'dt',
    'fieldset',
    'figcaption',
    'figure',
    'footer',
    'form',
    'frame',
    'frameset',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'head',
    'header',
    'hr',
    'html',
    'iframe',
    'legend',
    'li',
    'link',
    'main',
    'menu',
    'menuitem',
    'nav',
    'noframes',
    'ol',
    'optgroup',
    'option',
    'p',
    'param',
    'search',
    'section',
    'source',
    'summary',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'title',
    'tr',
    'track',
    'ul',
]);

/**
 * Matches an opening HTML block tag at the start of a line.
 * Captures: (1) tag name, (2) rest of line after the tag.
 * Handles self-contained tags like `<div>`, `<div class="x">`, and
 * opening-only tags like `<details open>`.
 * @type {RegExp}
 */
const HTML_OPEN_TAG_RE = /^<([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>(.*)$/;

/**
 * Matches a self-closed HTML block tag on a single line.
 * e.g. `<summary>Some text</summary>` or `<summary class="x">text</summary>`
 * Captures: (1) tag name, (2) attributes (if any), (3) inner text content.
 * @type {RegExp}
 */
const HTML_SELF_CLOSED_RE = /^<([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^>]*)?)>(.*?)<\/\1\s*>$/;

/**
 * Matches a closing HTML block tag.
 * Captures: (1) tag name.
 * @type {RegExp}
 */
const HTML_CLOSE_TAG_RE = /^<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/;

/**
 * Parses markdown text into a syntax tree.
 */
export class MarkdownParser {
    constructor() {
        /**
         * Block-level patterns for parsing.
         * @type {Array<{type: string, pattern: RegExp, handler: function}>}
         */
        this.blockPatterns = this.initializeBlockPatterns();
    }

    /**
     * Initializes the block-level parsing patterns.
     * @returns {Array<{type: string, pattern: RegExp, handler: function}>}
     */
    initializeBlockPatterns() {
        return [
            {
                type: 'heading',
                pattern: /^(#{1,6})\s+(.*)$/,
                handler: this.parseHeading.bind(this),
            },
            {
                type: 'code-block-fence',
                pattern: /^```(\w*)$/,
                handler: this.parseCodeBlockStart.bind(this),
            },
            {
                type: 'blockquote',
                pattern: /^>\s*(.*)$/,
                handler: this.parseBlockquote.bind(this),
            },
            {
                type: 'unordered-list',
                pattern: /^(\s*)[-*+]\s+(.*)$/,
                handler: this.parseUnorderedListItem.bind(this),
            },
            {
                type: 'ordered-list',
                pattern: /^(\s*)(\d+)\.\s+(.*)$/,
                handler: this.parseOrderedListItem.bind(this),
            },
            {
                type: 'horizontal-rule',
                pattern: /^([-*_])\1{2,}\s*$/,
                handler: this.parseHorizontalRule.bind(this),
            },
            {
                type: 'linked-image',
                pattern: /^\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)$/,
                handler: this.parseLinkedImage.bind(this),
            },
            {
                type: 'image',
                pattern: /^!\[([^\]]*)\]\(([^)]+)\)$/,
                handler: this.parseImage.bind(this),
            },
            {
                type: 'table-row',
                pattern: /^\|(.+)\|$/,
                handler: this.parseTableRow.bind(this),
            },
        ];
    }

    /**
     * Parses markdown text into a syntax tree.
     * @param {string} markdown - The markdown text to parse
     * @returns {SyntaxTree}
     */
    parse(markdown) {
        const tree = new SyntaxTree();
        const lines = markdown.split('\n');

        let i = 0;
        while (i < lines.length) {
            const result = this.parseLine(lines, i);
            if (result.node) {
                tree.appendChild(result.node);
            }
            i = result.nextIndex;
        }

        return tree;
    }

    /**
     * Parses a single line of markdown and returns the resulting node.
     * Useful for re-parsing a line when its content changes during editing.
     * @param {string} line - The line to parse
     * @returns {SyntaxNode|null}
     */
    parseSingleLine(line) {
        const result = this.parseLine([line], 0);
        return result.node;
    }

    /**
     * Parses a line and returns the resulting node and next line index.
     * @param {string[]} lines - All lines
     * @param {number} index - Current line index
     * @returns {{node: SyntaxNode|null, nextIndex: number}}
     */
    parseLine(lines, index) {
        const line = lines[index];

        // Empty line
        if (line.trim() === '') {
            return { node: null, nextIndex: index + 1 };
        }

        // Check for HTML block-level opening tag
        const htmlResult = this.tryParseHtmlBlock(lines, index);
        if (htmlResult) {
            return htmlResult;
        }

        // Try each block pattern
        for (const pattern of this.blockPatterns) {
            const match = line.match(pattern.pattern);
            if (match) {
                return pattern.handler(lines, index, match);
            }
        }

        // Default to paragraph
        return this.parseParagraph(lines, index);
    }

    /**
     * Parses a heading.
     * @param {string[]} lines
     * @param {number} index
     * @param {RegExpMatchArray} match
     * @returns {{node: SyntaxNode, nextIndex: number}}
     */
    parseHeading(lines, index, match) {
        const level = match[1].length;
        const content = match[2];

        const node = new SyntaxNode(`heading${level}`, content);
        node.startLine = index;
        node.endLine = index;

        return { node, nextIndex: index + 1 };
    }

    /**
     * Parses a code block starting fence.
     * @param {string[]} lines
     * @param {number} index
     * @param {RegExpMatchArray} match
     * @returns {{node: SyntaxNode, nextIndex: number}}
     */
    parseCodeBlockStart(lines, index, match) {
        const language = match[1] || '';
        const contentLines = [];
        let endIndex = index + 1;

        // Find the closing fence
        while (endIndex < lines.length) {
            if (lines[endIndex].match(/^```\s*$/)) {
                endIndex++;
                break;
            }
            contentLines.push(lines[endIndex]);
            endIndex++;
        }

        const node = new SyntaxNode('code-block', contentLines.join('\n'));
        node.attributes = { language };
        node.startLine = index;
        node.endLine = endIndex - 1;

        return { node, nextIndex: endIndex };
    }

    /**
     * Parses a blockquote.
     * @param {string[]} lines
     * @param {number} index
     * @param {RegExpMatchArray} match
     * @returns {{node: SyntaxNode, nextIndex: number}}
     */
    parseBlockquote(lines, index, match) {
        const contentLines = [match[1]];
        let endIndex = index + 1;

        // Continue collecting blockquote lines
        while (endIndex < lines.length) {
            const nextMatch = lines[endIndex].match(/^>\s*(.*)$/);
            if (nextMatch) {
                contentLines.push(nextMatch[1]);
                endIndex++;
            } else {
                break;
            }
        }

        const node = new SyntaxNode('blockquote', contentLines.join('\n'));
        node.startLine = index;
        node.endLine = endIndex - 1;

        return { node, nextIndex: endIndex };
    }

    /**
     * Parses an unordered list item.
     * @param {string[]} lines
     * @param {number} index
     * @param {RegExpMatchArray} match
     * @returns {{node: SyntaxNode, nextIndex: number}}
     */
    parseUnorderedListItem(lines, index, match) {
        const indent = Math.floor(match[1].length / 2);
        const content = match[2];

        const node = new SyntaxNode('list-item', content);
        node.attributes = { ordered: false, indent };
        node.startLine = index;
        node.endLine = index;

        return { node, nextIndex: index + 1 };
    }

    /**
     * Parses an ordered list item.
     * @param {string[]} lines
     * @param {number} index
     * @param {RegExpMatchArray} match
     * @returns {{node: SyntaxNode, nextIndex: number}}
     */
    parseOrderedListItem(lines, index, match) {
        const indent = Math.floor(match[1].length / 2);
        const number = Number.parseInt(match[2], 10);
        const content = match[3];

        const node = new SyntaxNode('list-item', content);
        node.attributes = { ordered: true, number, indent };
        node.startLine = index;
        node.endLine = index;

        return { node, nextIndex: index + 1 };
    }

    /**
     * Parses a horizontal rule.
     * @param {string[]} lines
     * @param {number} index
     * @param {RegExpMatchArray} match
     * @returns {{node: SyntaxNode, nextIndex: number}}
     */
    parseHorizontalRule(lines, index, match) {
        const node = new SyntaxNode('horizontal-rule', '');
        node.startLine = index;
        node.endLine = index;

        return { node, nextIndex: index + 1 };
    }

    /**
     * Parses an image.
     * @param {string[]} lines
     * @param {number} index
     * @param {RegExpMatchArray} match
     * @returns {{node: SyntaxNode, nextIndex: number}}
     */
    parseImage(lines, index, match) {
        const alt = match[1];
        const src = match[2];

        const node = new SyntaxNode('image', alt);
        node.attributes = { alt, url: src };
        node.startLine = index;
        node.endLine = index;

        return { node, nextIndex: index + 1 };
    }

    /**
     * Parses a linked image.
     * @param {string[]} lines
     * @param {number} index
     * @param {RegExpMatchArray} match
     * @returns {{node: SyntaxNode, nextIndex: number}}
     */
    parseLinkedImage(lines, index, match) {
        const alt = match[1];
        const src = match[2];
        const href = match[3];

        const node = new SyntaxNode('image', alt);
        node.attributes = { alt, url: src, href };
        node.startLine = index;
        node.endLine = index;

        return { node, nextIndex: index + 1 };
    }

    /**
     * Parses a table row (collects entire table).
     * @param {string[]} lines
     * @param {number} index
     * @param {RegExpMatchArray} match
     * @returns {{node: SyntaxNode, nextIndex: number}}
     */
    parseTableRow(lines, index, match) {
        const tableLines = [lines[index]];
        let endIndex = index + 1;

        // Collect all table rows
        while (endIndex < lines.length) {
            if (lines[endIndex].match(/^\|(.+)\|$/) || lines[endIndex].match(/^[\s|:-]+$/)) {
                tableLines.push(lines[endIndex]);
                endIndex++;
            } else {
                break;
            }
        }

        const node = new SyntaxNode('table', tableLines.join('\n'));
        node.startLine = index;
        node.endLine = endIndex - 1;

        return { node, nextIndex: endIndex };
    }

    /**
     * Tries to parse an HTML block-level element at the given line.
     * Returns null if the line does not start with a recognised block tag.
     *
     * @param {string[]} lines - All lines
     * @param {number} index - Current line index
     * @returns {{node: SyntaxNode, nextIndex: number}|null}
     */
    tryParseHtmlBlock(lines, index) {
        const line = lines[index];

        // Check for a self-closed tag on a single line first,
        // e.g. `<summary>Some text</summary>`.
        const selfClosed = line.match(HTML_SELF_CLOSED_RE);
        if (selfClosed) {
            const tagName = selfClosed[1].toLowerCase();
            if (HTML_BLOCK_TAGS.has(tagName)) {
                return this.parseSelfClosedHtmlBlock(index, tagName, line, selfClosed[3]);
            }
        }

        const match = line.match(HTML_OPEN_TAG_RE);
        if (!match) return null;

        const tagName = match[1].toLowerCase();
        if (!HTML_BLOCK_TAGS.has(tagName)) return null;

        return this.parseHtmlBlock(lines, index, tagName, line);
    }

    /**
     * Parses a self-closed HTML block element where the opening and closing
     * tags are on the same line (e.g. `<summary>Text here</summary>`).
     *
     * Rather than storing this as a leaf node, we create a normal container
     * html-block with separate opening/closing tags and a single child
     * paragraph whose `bareText` attribute is set.  When serialised back
     * to markdown, a container whose only child is `bareText` collapses
     * to the single-line form `<tag>content</tag>`.
     *
     * @param {number} index - Line index
     * @param {string} tagName - Lower-cased tag name
     * @param {string} fullLine - The full source line
     * @param {string} innerText - Text content between the tags
     * @returns {{node: SyntaxNode, nextIndex: number}}
     */
    parseSelfClosedHtmlBlock(index, tagName, fullLine, innerText) {
        // Extract the opening tag portion (everything up to and including the first '>').
        const gtPos = fullLine.indexOf('>');
        const openingTag = fullLine.substring(0, gtPos + 1);

        const node = new SyntaxNode('html-block', '');
        node.attributes = {
            tagName,
            openingTag,
            closingTag: `</${tagName}>`,
        };
        node.startLine = index;
        node.endLine = index;

        // The inner text becomes a bare-text paragraph child.
        const child = new SyntaxNode('paragraph', innerText.trim());
        child.attributes = { bareText: true };
        child.startLine = index;
        child.endLine = index;
        node.appendChild(child);

        return { node, nextIndex: index + 1 };
    }

    /**
     * Parses an HTML block-level container element.
     *
     * The opening tag line is stored as `openingTag`, the closing tag as
     * `closingTag`, and everything in between is recursively parsed as
     * markdown, producing child nodes.
     *
     * @param {string[]} lines - All lines
     * @param {number} index - Index of the opening-tag line
     * @param {string} tagName - Lower-cased tag name
     * @param {string} openingTagLine - The full opening-tag line
     * @returns {{node: SyntaxNode, nextIndex: number}}
     */
    parseHtmlBlock(lines, index, tagName, openingTagLine) {
        const closingPattern = new RegExp(`^</${tagName}\\s*>`, 'i');
        let endIndex = index + 1;
        const bodyLines = [];

        // Collect lines until we find the matching closing tag or EOF
        while (endIndex < lines.length) {
            if (lines[endIndex].match(closingPattern)) {
                break;
            }
            bodyLines.push(lines[endIndex]);
            endIndex++;
        }

        const closingTagLine = endIndex < lines.length ? lines[endIndex] : '';
        const nextIndex = endIndex < lines.length ? endIndex + 1 : endIndex;

        // Create the container node
        const node = new SyntaxNode('html-block', '');
        node.attributes = {
            tagName,
            openingTag: openingTagLine,
            closingTag: closingTagLine,
        };
        node.startLine = index;
        node.endLine = nextIndex - 1;

        // Recursively parse body content as markdown, producing child nodes
        let i = 0;
        while (i < bodyLines.length) {
            const result = this.parseLine(bodyLines, i);
            if (result.node) {
                // Adjust line numbers to be document-relative
                const offset = index + 1; // body starts one line after opening tag
                this.adjustLineNumbers(result.node, offset);
                node.appendChild(result.node);
            }
            i = result.nextIndex;
        }

        return { node, nextIndex };
    }

    /**
     * Recursively adjusts startLine/endLine on a node and its children
     * by adding an offset. Used when parsing body content of an HTML block
     * so that line numbers are document-relative.
     *
     * @param {SyntaxNode} node
     * @param {number} offset
     */
    adjustLineNumbers(node, offset) {
        node.startLine += offset;
        node.endLine += offset;
        for (const child of node.children) {
            this.adjustLineNumbers(child, offset);
        }
    }

    /**
     * Parses a paragraph.
     * @param {string[]} lines
     * @param {number} index
     * @returns {{node: SyntaxNode, nextIndex: number}}
     */
    parseParagraph(lines, index) {
        const contentLines = [lines[index]];
        let endIndex = index + 1;

        // Continue collecting paragraph lines until we hit a blank line or block element
        while (endIndex < lines.length) {
            const nextLine = lines[endIndex];

            // Check if next line is blank
            if (nextLine.trim() === '') {
                break;
            }

            // Check if next line starts a block element
            let isBlock = false;
            for (const pattern of this.blockPatterns) {
                if (nextLine.match(pattern.pattern)) {
                    isBlock = true;
                    break;
                }
            }

            // Also check for HTML block tags
            if (!isBlock) {
                const htmlMatch = nextLine.match(HTML_OPEN_TAG_RE);
                if (htmlMatch && HTML_BLOCK_TAGS.has(htmlMatch[1].toLowerCase())) {
                    isBlock = true;
                }
            }

            if (isBlock) {
                break;
            }

            contentLines.push(nextLine);
            endIndex++;
        }

        const node = new SyntaxNode('paragraph', contentLines.join('\n'));
        node.startLine = index;
        node.endLine = endIndex - 1;

        return { node, nextIndex: endIndex };
    }
}
