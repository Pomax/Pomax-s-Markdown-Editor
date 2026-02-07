/**
 * @fileoverview Markdown Parser.
 * Converts markdown text into a syntax tree structure.
 */

import { SyntaxNode, SyntaxTree } from './syntax-tree.js';

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
