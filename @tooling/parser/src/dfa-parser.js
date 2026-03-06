/**
 * @fileoverview DFA-based markdown parser.
 *
 * Consumes a token stream produced by {@link tokenize} and walks a
 * deterministic finite automaton to build a {@link SyntaxTree}.
 * No regex is used.  Newlines are tokens like any other character;
 * the input is never split into lines.
 */

import { tokenize } from './dfa-tokenizer.js';
import { SyntaxNode, SyntaxTree } from './syntax-tree.js';

// ── Block-level HTML tag set (GFM type 6) ───────────────────────────

/** @type {Set<string>} */
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
    'img',
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
    'script',
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

const HTML_VOID_TAGS = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
]);

// ── DFA Parser ──────────────────────────────────────────────────────

/**
 * Parses markdown text into a syntax tree using a token-driven DFA.
 */
export class DFAParser {
    /**
     * Parses a full markdown document.
     * @param {string} markdown
     * @param {Document} [doc]
     * @returns {SyntaxTree}
     */
    parse(markdown, doc) {
        const tokens = tokenize(markdown);
        const tree = new SyntaxTree();
        if (doc) tree.doc = doc;
        const ctx = { tokens, pos: 0, line: 0 };

        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type !== 'EOF') {
            // Skip blank lines between blocks
            if (ctx.tokens[ctx.pos].type === 'NEWLINE') {
                ctx.line++;
                ctx.pos++;
                continue;
            }

            const node = this.parseBlock(ctx);
            if (node) {
                if (node.type === 'list-item') {
                    const listNode = this.groupListItems(node, ctx);
                    tree.appendChild(listNode);
                } else {
                    tree.appendChild(node);
                }
            }
        }

        return tree;
    }

    // ── Block dispatch ──────────────────────────────────────────

    /**
     * Determines what block element starts at the current position
     * and dispatches to the appropriate sub-parser.
     *
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode|null}
     */
    parseBlock(ctx) {
        const tok = ctx.tokens[ctx.pos];

        // Heading: one or more HASH at start of line, followed by a space
        if (tok.type === 'HASH') {
            const saved = ctx.pos;
            const node = this.parseHeading(ctx);
            if (node) return node;
            ctx.pos = saved;
        }

        // Code fence: three or more BACKTICK tokens
        if (
            tok.type === 'BACKTICK' &&
            this.lookType(ctx, 1) === 'BACKTICK' &&
            this.lookType(ctx, 2) === 'BACKTICK'
        ) {
            const saved = ctx.pos;
            const node = this.parseCodeBlock(ctx);
            if (node) return node;
            ctx.pos = saved;
        }

        // Blockquote: GT at start
        if (tok.type === 'GT') {
            return this.parseBlockquote(ctx);
        }

        // Unordered list: DASH/STAR/PLUS followed by SPACE, or indented
        if (this.isUnorderedListStart(ctx)) {
            return this.parseUnorderedListItem(ctx);
        }

        // Ordered list: DIGIT(s) DOT SPACE
        if (this.isOrderedListStart(ctx)) {
            return this.parseOrderedListItem(ctx);
        }

        // Horizontal rule: three or more DASH/STAR/UNDERSCORE
        if (this.isHorizontalRule(ctx)) {
            return this.parseHorizontalRule(ctx);
        }

        // HTML block: <tagname...> (possibly indented)
        if (tok.type === 'LT' && this.isHtmlBlockStart(ctx)) {
            return this.parseHtmlBlock(ctx);
        }
        if ((tok.type === 'SPACE' || tok.type === 'TAB') && this.isIndentedHtmlBlockStart(ctx)) {
            this.skipWhitespace(ctx);
            return this.parseHtmlBlock(ctx);
        }

        // Table: starts with PIPE
        if (tok.type === 'PIPE') {
            return this.parseTable(ctx);
        }

        // Linked image: [![alt](src)](href)
        if (tok.type === 'LBRACKET' && this.lookType(ctx, 1) === 'BANG') {
            const saved = ctx.pos;
            const node = this.tryParseLinkedImage(ctx);
            if (node) return node;
            ctx.pos = saved;
        }

        // Image: ![alt](src)
        if (tok.type === 'BANG' && this.lookType(ctx, 1) === 'LBRACKET') {
            const saved = ctx.pos;
            const node = this.tryParseImage(ctx);
            if (node) return node;
            ctx.pos = saved;
        }

        // Default: paragraph
        return this.parseParagraph(ctx);
    }

    // ── Heading ─────────────────────────────────────────────────

    /**
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode|null}
     */
    parseHeading(ctx) {
        const startLine = ctx.line;
        let level = 0;

        // Count hashes
        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'HASH') {
            level++;
            ctx.pos++;
        }

        // A space after the hashes is required for a valid heading
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'SPACE') {
            return null;
        }

        if (level > 6) level = 6;

        // Skip all spaces after hashes
        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'SPACE') {
            ctx.pos++;
        }

        // Collect content until NEWLINE or EOF
        const content = this.consumeToEndOfLine(ctx);

        const node = new SyntaxNode(`heading${level}`, content);
        node.startLine = startLine;
        node.endLine = startLine;
        return node;
    }

    // ── Code block ──────────────────────────────────────────────

    /**
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode|null}
     */
    parseCodeBlock(ctx) {
        const startLine = ctx.line;

        // Count consecutive backticks (must be 3 or more)
        let fenceCount = 0;
        while (
            ctx.pos + fenceCount < ctx.tokens.length &&
            ctx.tokens[ctx.pos + fenceCount].type === 'BACKTICK'
        ) {
            fenceCount++;
        }
        ctx.pos += fenceCount;

        // Collect language identifier (until NEWLINE or EOF)
        let language = '';
        while (
            ctx.pos < ctx.tokens.length &&
            ctx.tokens[ctx.pos].type !== 'NEWLINE' &&
            ctx.tokens[ctx.pos].type !== 'EOF'
        ) {
            language += ctx.tokens[ctx.pos].value;
            ctx.pos++;
        }
        language = language.trim();

        // The opening fence MUST be followed by a NEWLINE — EOF is not valid
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'NEWLINE') {
            return null;
        }
        ctx.line++;
        ctx.pos++;

        // Collect body until closing fence (exact same backtick count at start of line)
        let content = '';
        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type !== 'EOF') {
            // Check for closing fence: exactly fenceCount backticks
            let closingCount = 0;
            const closeStart = ctx.pos;
            while (
                ctx.pos + closingCount < ctx.tokens.length &&
                ctx.tokens[ctx.pos + closingCount].type === 'BACKTICK'
            ) {
                closingCount++;
            }
            if (closingCount === fenceCount) {
                // Verify the rest of the line is only whitespace or newline/EOF
                let afterFence = ctx.pos + closingCount;
                let validClose = true;
                while (
                    afterFence < ctx.tokens.length &&
                    ctx.tokens[afterFence].type !== 'NEWLINE' &&
                    ctx.tokens[afterFence].type !== 'EOF'
                ) {
                    if (ctx.tokens[afterFence].type !== 'SPACE') {
                        validClose = false;
                    }
                    afterFence++;
                }
                if (validClose) {
                    // Closing fence found — skip the backticks and trailing content
                    ctx.pos = afterFence;
                    // Skip the newline after closing fence
                    if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'NEWLINE') {
                        ctx.line++;
                        ctx.pos++;
                    }
                    break;
                }
            }

            // Not a closing fence — consume as content
            if (ctx.tokens[ctx.pos].type === 'NEWLINE') {
                content += '\n';
                ctx.line++;
            } else {
                content += ctx.tokens[ctx.pos].value;
            }
            ctx.pos++;
        }

        // Remove trailing newline from content if present
        if (content.endsWith('\n')) {
            content = content.slice(0, -1);
        }

        const node = new SyntaxNode('code-block', '');
        node.attributes = { language, fenceCount };
        node.appendChild(new SyntaxNode('text', content));
        node.startLine = startLine;
        node.endLine = ctx.line > startLine ? ctx.line - 1 : startLine;
        return node;
    }

    // ── Blockquote ──────────────────────────────────────────────

    /**
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode}
     */
    parseBlockquote(ctx) {
        const startLine = ctx.line;
        const contentLines = [];

        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'GT') {
            // Skip GT
            ctx.pos++;
            // Skip optional space after >
            if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'SPACE') {
                ctx.pos++;
            }
            // Collect to end of line
            contentLines.push(this.consumeToEndOfLine(ctx));
        }

        const node = new SyntaxNode('blockquote', contentLines.join('\n'));
        node.startLine = startLine;
        node.endLine = ctx.line > startLine ? ctx.line - 1 : startLine;
        return node;
    }

    // ── List items ──────────────────────────────────────────────

    /**
     * Checks if current position is start of unordered list item.
     * Pattern: optional spaces, then DASH/STAR/PLUS, then SPACE.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     * @returns {boolean}
     */
    isUnorderedListStart(ctx) {
        let i = ctx.pos;
        // Skip leading spaces
        while (
            i < ctx.tokens.length &&
            (ctx.tokens[i].type === 'SPACE' || ctx.tokens[i].type === 'TAB')
        ) {
            i++;
        }
        // Must be DASH, STAR, or PLUS
        if (i >= ctx.tokens.length) return false;
        const t = ctx.tokens[i].type;
        if (t !== 'DASH' && t !== 'STAR' && t !== 'PLUS') return false;
        // Followed by SPACE
        i++;
        if (i >= ctx.tokens.length) return false;
        return ctx.tokens[i].type === 'SPACE';
    }

    /**
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode}
     */
    parseUnorderedListItem(ctx) {
        const startLine = ctx.line;

        // Count leading spaces for indent
        let spaces = 0;
        while (
            ctx.pos < ctx.tokens.length &&
            (ctx.tokens[ctx.pos].type === 'SPACE' || ctx.tokens[ctx.pos].type === 'TAB')
        ) {
            spaces += ctx.tokens[ctx.pos].type === 'TAB' ? 2 : 1;
            ctx.pos++;
        }
        const indent = Math.floor(spaces / 2);

        // Skip the marker (DASH/STAR/PLUS) and record which one it was
        const markerToken = ctx.tokens[ctx.pos];
        const marker = markerToken.value;
        ctx.pos++;
        // Skip the SPACE after marker
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'SPACE') {
            ctx.pos++;
        }

        const content = this.consumeToEndOfLine(ctx);

        // Detect checklist syntax: [ ] or [x]/[X] at the start of content
        let checkedAttr;
        let itemContent = content;
        if (content.startsWith('[ ] ')) {
            checkedAttr = false;
            itemContent = content.slice(4);
        } else if (content.startsWith('[x] ') || content.startsWith('[X] ')) {
            checkedAttr = true;
            itemContent = content.slice(4);
        }

        const node = new SyntaxNode('list-item', itemContent);
        node.attributes = { ordered: false, indent };
        node.runtime.marker = marker;
        if (typeof checkedAttr === 'boolean') {
            node.attributes.checked = checkedAttr;
        }

        node.startLine = startLine;
        node.endLine = startLine;
        return node;
    }

    /**
     * Checks if current position is start of ordered list item.
     * Pattern: optional spaces, then DIGIT(s), then DOT, then SPACE.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     * @returns {boolean}
     */
    isOrderedListStart(ctx) {
        let i = ctx.pos;
        // Skip leading spaces
        while (
            i < ctx.tokens.length &&
            (ctx.tokens[i].type === 'SPACE' || ctx.tokens[i].type === 'TAB')
        ) {
            i++;
        }
        // Must have at least one DIGIT
        if (i >= ctx.tokens.length || ctx.tokens[i].type !== 'DIGIT') return false;
        while (i < ctx.tokens.length && ctx.tokens[i].type === 'DIGIT') {
            i++;
        }
        // Then DOT
        if (i >= ctx.tokens.length || ctx.tokens[i].type !== 'DOT') return false;
        i++;
        // Then SPACE
        if (i >= ctx.tokens.length || ctx.tokens[i].type !== 'SPACE') return false;
        return true;
    }

    /**
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode}
     */
    parseOrderedListItem(ctx) {
        const startLine = ctx.line;

        // Count leading spaces for indent
        let spaces = 0;
        while (
            ctx.pos < ctx.tokens.length &&
            (ctx.tokens[ctx.pos].type === 'SPACE' || ctx.tokens[ctx.pos].type === 'TAB')
        ) {
            spaces += ctx.tokens[ctx.pos].type === 'TAB' ? 2 : 1;
            ctx.pos++;
        }
        const indent = Math.floor(spaces / 2);

        // Collect digit chars for the number
        let numStr = '';
        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'DIGIT') {
            numStr += ctx.tokens[ctx.pos].value;
            ctx.pos++;
        }
        const number = Number.parseInt(numStr, 10);

        // Skip DOT
        ctx.pos++;
        // Skip SPACE
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'SPACE') {
            ctx.pos++;
        }

        const content = this.consumeToEndOfLine(ctx);

        const node = new SyntaxNode('list-item', content);
        node.attributes = { ordered: true, number, indent };
        node.startLine = startLine;
        node.endLine = startLine;
        return node;
    }

    // ── List grouping ───────────────────────────────────────────

    /**
     * Groups consecutive list-item nodes into a list container node.
     * Called when parse() encounters a list-item from parseBlock.
     * Handles nesting: deeper-indented items become a nested list
     * that is appended as a child of the preceding list-item.
     *
     * @param {SyntaxNode} firstItem - The first list-item already parsed
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode} A list node containing list-item children
     */
    groupListItems(firstItem, ctx) {
        const baseIndent = firstItem.attributes.indent || 0;

        // Build the list node with attributes from the first item
        const listNode = new SyntaxNode('list', '');
        const listAttrs = { ordered: firstItem.attributes.ordered };
        if (firstItem.attributes.ordered && firstItem.attributes.number !== undefined) {
            listAttrs.number = firstItem.attributes.number;
        }
        listAttrs.indent = baseIndent;
        if (!firstItem.attributes.ordered && firstItem.runtime.marker) {
            listNode.runtime.marker = firstItem.runtime.marker;
        }
        if (typeof firstItem.attributes.checked === 'boolean') {
            listAttrs.checked = true;
        }
        listNode.attributes = listAttrs;
        listNode.startLine = firstItem.startLine;

        // Strip list-level attrs from the item, keep only checked
        this.stripListAttrsFromItem(firstItem);
        listNode.appendChild(firstItem);

        // Consume subsequent list items at the same or deeper indent
        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type !== 'EOF') {
            // Skip blank lines
            if (ctx.tokens[ctx.pos].type === 'NEWLINE') {
                ctx.line++;
                ctx.pos++;
                continue;
            }

            // Check if next block is a list item
            if (!this.isUnorderedListStart(ctx) && !this.isOrderedListStart(ctx)) break;

            // Peek at the indent of the next item
            const savedPos = ctx.pos;
            const savedLine = ctx.line;
            const nextItem = this.parseBlock(ctx);
            if (!nextItem || nextItem.type !== 'list-item') {
                ctx.pos = savedPos;
                ctx.line = savedLine;
                break;
            }

            const nextIndent = nextItem.attributes.indent || 0;

            if (nextIndent === baseIndent) {
                // Same level — sibling list-item
                if (typeof nextItem.attributes.checked === 'boolean' && !listNode.attributes.checked) {
                    listNode.attributes.checked = true;
                }
                this.stripListAttrsFromItem(nextItem);
                listNode.appendChild(nextItem);
            } else if (nextIndent > baseIndent) {
                // Deeper — nested list as child of the last list-item
                const nestedList = this.groupListItems(nextItem, ctx);
                const lastItem = listNode.children[listNode.children.length - 1];
                lastItem.appendChild(nestedList);
            } else {
                // Shallower — put it back, we're done
                ctx.pos = savedPos;
                ctx.line = savedLine;
                break;
            }
        }

        listNode.endLine = listNode.children[listNode.children.length - 1].endLine;
        return listNode;
    }

    /**
     * Strips list-level attributes (ordered, indent, number) from a
     * list-item node, keeping only item-level attributes (checked).
     * @param {SyntaxNode} item
     */
    stripListAttrsFromItem(item) {
        const attrs = {};
        if (typeof item.attributes.checked === 'boolean') {
            attrs.checked = item.attributes.checked;
        }
        item.attributes = attrs;
    }

    // ── Horizontal rule ─────────────────────────────────────────

    /**
     * Checks if current position is a horizontal rule.
     * Three or more of the same character (DASH, STAR, UNDERSCORE)
     * with only optional trailing spaces before newline/EOF.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     * @returns {boolean}
     */
    isHorizontalRule(ctx) {
        const t = ctx.tokens[ctx.pos].type;
        if (t !== 'DASH' && t !== 'STAR' && t !== 'UNDERSCORE') return false;

        let i = ctx.pos;
        let count = 0;
        while (i < ctx.tokens.length && ctx.tokens[i].type === t) {
            count++;
            i++;
        }
        if (count < 3) return false;

        // Only spaces allowed after the run, then NEWLINE (not EOF)
        while (i < ctx.tokens.length && ctx.tokens[i].type === 'SPACE') {
            i++;
        }
        return i < ctx.tokens.length && ctx.tokens[i].type === 'NEWLINE';
    }

    /**
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode}
     */
    parseHorizontalRule(ctx) {
        const startLine = ctx.line;
        const tokenType = ctx.tokens[ctx.pos].type;
        const marker = tokenType === 'DASH' ? '-' : tokenType === 'STAR' ? '*' : '_';
        let count = 0;
        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === tokenType) {
            count++;
            ctx.pos++;
        }

        // Consume trailing spaces and newline
        this.consumeToEndOfLine(ctx);

        const node = new SyntaxNode('horizontal-rule', '');
        node.attributes.marker = marker;
        node.attributes.count = count;
        node.startLine = startLine;
        node.endLine = startLine;
        return node;
    }

    // ── Images ──────────────────────────────────────────────────

    /**
     * Tries to parse ![alt](src). Returns null if it doesn't match.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode|null}
     */
    tryParseImage(ctx) {
        const startLine = ctx.line;

        // Expect BANG LBRACKET
        if (ctx.tokens[ctx.pos].type !== 'BANG') return null;
        ctx.pos++;
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'LBRACKET') return null;
        ctx.pos++;

        // Collect alt text until RBRACKET
        let alt = '';
        while (
            ctx.pos < ctx.tokens.length &&
            ctx.tokens[ctx.pos].type !== 'RBRACKET' &&
            ctx.tokens[ctx.pos].type !== 'NEWLINE' &&
            ctx.tokens[ctx.pos].type !== 'EOF'
        ) {
            alt += ctx.tokens[ctx.pos].value;
            ctx.pos++;
        }
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'RBRACKET') return null;
        ctx.pos++; // skip ]

        // Expect LPAREN
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'LPAREN') return null;
        ctx.pos++;

        // Collect src until RPAREN
        let src = '';
        while (
            ctx.pos < ctx.tokens.length &&
            ctx.tokens[ctx.pos].type !== 'RPAREN' &&
            ctx.tokens[ctx.pos].type !== 'NEWLINE' &&
            ctx.tokens[ctx.pos].type !== 'EOF'
        ) {
            src += ctx.tokens[ctx.pos].value;
            ctx.pos++;
        }
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'RPAREN') return null;
        ctx.pos++; // skip )

        // Must be end of line for a block-level image
        if (
            ctx.pos < ctx.tokens.length &&
            ctx.tokens[ctx.pos].type !== 'NEWLINE' &&
            ctx.tokens[ctx.pos].type !== 'EOF'
        ) {
            return null;
        }
        // Skip newline
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'NEWLINE') {
            ctx.line++;
            ctx.pos++;
        }

        const node = new SyntaxNode('image');
        node.attributes = { alt, url: src };
        node.startLine = startLine;
        node.endLine = startLine;
        return node;
    }

    /**
     * Tries to parse [![alt](src)](href). Returns null if no match.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode|null}
     */
    tryParseLinkedImage(ctx) {
        const startLine = ctx.line;

        // Expect [ ! [
        if (ctx.tokens[ctx.pos].type !== 'LBRACKET') return null;
        ctx.pos++;
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'BANG') return null;
        ctx.pos++;
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'LBRACKET') return null;
        ctx.pos++;

        // Collect alt until ]
        let alt = '';
        while (
            ctx.pos < ctx.tokens.length &&
            ctx.tokens[ctx.pos].type !== 'RBRACKET' &&
            ctx.tokens[ctx.pos].type !== 'NEWLINE' &&
            ctx.tokens[ctx.pos].type !== 'EOF'
        ) {
            alt += ctx.tokens[ctx.pos].value;
            ctx.pos++;
        }
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'RBRACKET') return null;
        ctx.pos++; // ]

        // Expect (
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'LPAREN') return null;
        ctx.pos++;

        // Collect src until )
        let src = '';
        while (
            ctx.pos < ctx.tokens.length &&
            ctx.tokens[ctx.pos].type !== 'RPAREN' &&
            ctx.tokens[ctx.pos].type !== 'NEWLINE' &&
            ctx.tokens[ctx.pos].type !== 'EOF'
        ) {
            src += ctx.tokens[ctx.pos].value;
            ctx.pos++;
        }
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'RPAREN') return null;
        ctx.pos++; // )

        // Expect ] (
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'RBRACKET') return null;
        ctx.pos++;
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'LPAREN') return null;
        ctx.pos++;

        // Collect href until )
        let href = '';
        while (
            ctx.pos < ctx.tokens.length &&
            ctx.tokens[ctx.pos].type !== 'RPAREN' &&
            ctx.tokens[ctx.pos].type !== 'NEWLINE' &&
            ctx.tokens[ctx.pos].type !== 'EOF'
        ) {
            href += ctx.tokens[ctx.pos].value;
            ctx.pos++;
        }
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type !== 'RPAREN') return null;
        ctx.pos++; // )

        // Must be end of line for block-level
        if (
            ctx.pos < ctx.tokens.length &&
            ctx.tokens[ctx.pos].type !== 'NEWLINE' &&
            ctx.tokens[ctx.pos].type !== 'EOF'
        ) {
            return null;
        }
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'NEWLINE') {
            ctx.line++;
            ctx.pos++;
        }

        const node = new SyntaxNode('image');
        node.attributes = { alt, url: src, href };
        node.startLine = startLine;
        node.endLine = startLine;
        return node;
    }

    /**
     * Extracts all attribute key-value pairs from an HTML tag string.
     * @param {string} raw - The full opening tag, e.g. `<img src="pic.jpg" alt="test" />`
     * @returns {Object<string, string>}
     */
    extractAllAttrs(raw) {
        const attrs = {};
        // Strip the tag name and angle brackets: skip past the first whitespace
        let i = 0;
        // Skip <tagname
        while (i < raw.length && raw[i] !== ' ' && raw[i] !== '\t' && raw[i] !== '>' && raw[i] !== '/') {
            i++;
        }
        while (i < raw.length) {
            // Skip whitespace and / and >
            while (i < raw.length && (raw[i] === ' ' || raw[i] === '\t' || raw[i] === '/' || raw[i] === '>')) {
                i++;
            }
            if (i >= raw.length) break;
            // Read attribute name
            let name = '';
            while (i < raw.length && raw[i] !== '=' && raw[i] !== ' ' && raw[i] !== '\t' && raw[i] !== '>' && raw[i] !== '/') {
                name += raw[i];
                i++;
            }
            if (!name) break;
            // Skip whitespace around =
            while (i < raw.length && (raw[i] === ' ' || raw[i] === '\t')) i++;
            if (i >= raw.length || raw[i] !== '=') continue;
            i++; // skip =
            while (i < raw.length && (raw[i] === ' ' || raw[i] === '\t')) i++;
            if (i >= raw.length) break;
            // Read value
            const quote = raw[i];
            if (quote !== '"' && quote !== "'") continue;
            i++; // skip opening quote
            let value = '';
            while (i < raw.length && raw[i] !== quote) {
                value += raw[i];
                i++;
            }
            if (i < raw.length) i++; // skip closing quote
            attrs[name.toLowerCase()] = value;
        }
        return attrs;
    }

    // ── HTML block ──────────────────────────────────────────────

    /**
     * Checks if current position starts an HTML block tag.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     * @returns {boolean}
     */
    isHtmlBlockStart(ctx) {
        const tagName = this.peekTextAfterLT(ctx);
        if (!tagName) return false;
        const lower = tagName.toLowerCase();
        return HTML_BLOCK_TAGS.has(lower) || this.isValidCustomElement(lower);
    }

    /**
     * Checks if current position has leading whitespace followed by
     * an HTML block tag.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     * @returns {boolean}
     */
    isIndentedHtmlBlockStart(ctx) {
        let i = ctx.pos;
        while (
            i < ctx.tokens.length &&
            (ctx.tokens[i].type === 'SPACE' || ctx.tokens[i].type === 'TAB')
        ) {
            i++;
        }
        if (i >= ctx.tokens.length || i === ctx.pos) return false;
        if (ctx.tokens[i].type !== 'LT') return false;
        const result = this.peekTagName(ctx.tokens, i + 1);
        if (!result) return false;
        const lower = result.name.toLowerCase();
        return HTML_BLOCK_TAGS.has(lower) || this.isValidCustomElement(lower);
    }

    /**
     * Skips whitespace tokens (SPACE, TAB) at current position.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     */
    skipWhitespace(ctx) {
        while (
            ctx.pos < ctx.tokens.length &&
            (ctx.tokens[ctx.pos].type === 'SPACE' || ctx.tokens[ctx.pos].type === 'TAB')
        ) {
            ctx.pos++;
        }
    }

    /**
     * Starting from a given index, reads consecutive TEXT and DASH tokens
     * to form a (possibly hyphenated) tag name. Returns the combined name
     * string and the number of tokens consumed, or null if the position
     * does not start with a TEXT token.
     * @param {import('./dfa-tokenizer.js').DFAToken[]} tokens
     * @param {number} startIndex
     * @returns {{name: string, count: number}|null}
     */
    peekTagName(tokens, startIndex) {
        if (startIndex >= tokens.length || tokens[startIndex].type !== 'TEXT') {
            return null;
        }
        let name = tokens[startIndex].value;
        let count = 1;
        let i = startIndex + 1;
        // Collect alternating DASH TEXT sequences
        while (
            i + 1 < tokens.length &&
            tokens[i].type === 'DASH' &&
            tokens[i + 1].type === 'TEXT'
        ) {
            name += `-${tokens[i + 1].value}`;
            count += 2;
            i += 2;
        }
        return { name, count };
    }

    /**
     * Validates that a tag name is a legal custom element name.
     * Rules: must start with a letter, contain at least one hyphen
     * followed by a letter, no consecutive hyphens, must not end
     * with a hyphen.
     * @param {string} name
     * @returns {boolean}
     */
    isValidCustomElement(name) {
        const parts = name.split('-');
        if (parts.length < 2) return false;
        for (const part of parts) {
            if (part.length === 0) return false;
        }
        return true;
    }

    /**
     * Peeks at the text token(s) immediately after a LT token to get
     * the tag name, including hyphenated custom element names.
     * Returns null if structure doesn't match.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     * @returns {string|null}
     */
    peekTextAfterLT(ctx) {
        if (ctx.tokens[ctx.pos].type !== 'LT') return null;
        const result = this.peekTagName(ctx.tokens, ctx.pos + 1);
        if (!result) return null;
        return result.name;
    }

    /**
     * Parses an HTML block element. Consumes everything from the opening
     * tag through the matching closing tag.
     *
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode}
     */
    parseHtmlBlock(ctx) {
        const startLine = ctx.line;

        // Consume the opening tag line (everything up to and including the first >)
        let openingTag = '';
        const tagName = this.peekTextAfterLT(ctx);
        const lowerTagName = tagName ? tagName.toLowerCase() : '';

        // Read the entire opening tag up to GT
        while (
            ctx.pos < ctx.tokens.length &&
            ctx.tokens[ctx.pos].type !== 'GT' &&
            ctx.tokens[ctx.pos].type !== 'NEWLINE' &&
            ctx.tokens[ctx.pos].type !== 'EOF'
        ) {
            openingTag += ctx.tokens[ctx.pos].value;
            ctx.pos++;
        }
        // Include the GT
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'GT') {
            openingTag += '>';
            ctx.pos++;
        }

        // Void elements (e.g. <img>, <br>, <hr>) have no closing tag
        if (HTML_VOID_TAGS.has(lowerTagName)) {
            // Skip newline after tag
            if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'NEWLINE') {
                ctx.line++;
                ctx.pos++;
            }
            const node = new SyntaxNode('html-block', '');
            node.tagName = lowerTagName;
            node.attributes = {};
            node.runtime.openingTag = openingTag;
            // Extract HTML attributes from the raw opening tag
            const htmlAttrs = this.extractAllAttrs(openingTag);
            for (const [key, value] of Object.entries(htmlAttrs)) {
                node.attributes[key] = value;
            }
            node.startLine = startLine;
            node.endLine = startLine;
            return node;
        }

        // Check if this is a self-closed tag on one line: <tag>content</tag>
        // Look ahead to see if there's content then a closing tag on same line
        const selfClosedResult = this.trySelfClosedHtmlBlock(
            ctx,
            lowerTagName,
            openingTag,
            startLine,
        );
        if (selfClosedResult) {
            return selfClosedResult;
        }

        // Skip newline after opening tag
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'NEWLINE') {
            ctx.line++;
            ctx.pos++;
        }

        // Collect body content until we find the closing tag </tagname>
        let bodyMarkdown = '';
        let closingTag = '';

        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type !== 'EOF') {
            // Check for closing tag: LT FSLASH TEXT(tagname) GT
            if (this.isClosingTag(ctx, lowerTagName)) {
                closingTag = this.consumeClosingTag(ctx);
                break;
            }

            if (ctx.tokens[ctx.pos].type === 'NEWLINE') {
                bodyMarkdown += '\n';
                ctx.line++;
            } else {
                bodyMarkdown += ctx.tokens[ctx.pos].value;
            }
            ctx.pos++;
        }

        // Remove leading/trailing whitespace-only lines from body
        const lines = bodyMarkdown.split('\n');
        while (lines.length && lines[0].trim() === '') lines.shift();
        while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
        bodyMarkdown = lines.join('\n');

        const endLine = ctx.line;

        // Skip newline after closing tag
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'NEWLINE') {
            ctx.line++;
            ctx.pos++;
        }

        // Create the container node
        const node = new SyntaxNode('html-block', '');
        node.tagName = lowerTagName;
        node.attributes = {};
        node.runtime.openingTag = openingTag;
        node.runtime.closingTag = closingTag;
        node.startLine = startLine;
        node.endLine = endLine;

        // Re-parse the body as markdown to create child nodes
        if (bodyMarkdown.length > 0) {
            const bodyParser = new DFAParser();
            const bodyTree = bodyParser.parse(bodyMarkdown);
            const bodyStartLine = startLine + 1;
            for (const child of bodyTree.children) {
                this.adjustLineNumbers(child, bodyStartLine);
                node.appendChild(child);
            }
        }

        return node;
    }

    /**
     * Tries to parse a self-closed HTML block on a single line.
     * E.g. <summary>Some text</summary>
     *
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @param {string} tagName
     * @param {string} openingTag
     * @param {number} startLine
     * @returns {SyntaxNode|null}
     */
    trySelfClosedHtmlBlock(ctx, tagName, openingTag, startLine) {
        // Save position in case this isn't self-closed
        const savedPos = ctx.pos;
        const savedLine = ctx.line;

        // Collect content until NEWLINE or EOF, looking for </tagname>
        let content = '';
        let closingFound = false;

        while (
            ctx.pos < ctx.tokens.length &&
            ctx.tokens[ctx.pos].type !== 'NEWLINE' &&
            ctx.tokens[ctx.pos].type !== 'EOF'
        ) {
            // Check for closing tag
            if (this.isClosingTag(ctx, tagName)) {
                closingFound = true;
                // Don't consume the closing tag yet
                break;
            }
            content += ctx.tokens[ctx.pos].value;
            ctx.pos++;
        }

        if (!closingFound) {
            // Not self-closed — restore position
            ctx.pos = savedPos;
            ctx.line = savedLine;
            return null;
        }

        // Skip the closing tag
        this.consumeClosingTag(ctx);

        // Skip newline
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'NEWLINE') {
            ctx.line++;
            ctx.pos++;
        }

        // Build the node structure matching the existing parser's output
        const node = new SyntaxNode('html-block', '');
        node.tagName = tagName;
        node.attributes = {};
        node.runtime.openingTag = openingTag;
        node.runtime.closingTag = `</${tagName}>`;
        node.startLine = startLine;
        node.endLine = startLine;

        const child = new SyntaxNode('paragraph', content.trim());
        child.attributes = { bareText: true };
        child.startLine = startLine;
        child.endLine = startLine;
        node.appendChild(child);

        return node;
    }

    /**
     * Checks if current position is a closing tag for the given name.
     * Pattern: LT FSLASH TEXT GT (where TEXT matches tagName).
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     * @param {string} tagName
     * @returns {boolean}
     */
    isClosingTag(ctx, tagName) {
        const i = ctx.pos;
        if (i >= ctx.tokens.length || ctx.tokens[i].type !== 'LT') return false;
        if (i + 1 >= ctx.tokens.length || ctx.tokens[i + 1].type !== 'FSLASH') return false;
        const result = this.peekTagName(ctx.tokens, i + 2);
        if (!result) return false;
        if (result.name.toLowerCase() !== tagName) return false;
        // Check for optional space then GT
        let j = i + 2 + result.count;
        while (j < ctx.tokens.length && ctx.tokens[j].type === 'SPACE') j++;
        if (j >= ctx.tokens.length || ctx.tokens[j].type !== 'GT') return false;
        return true;
    }

    /**
     * Consumes a closing tag and returns it as a string.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {string}
     */
    consumeClosingTag(ctx) {
        let tag = '';
        // LT
        tag += ctx.tokens[ctx.pos].value;
        ctx.pos++;
        // FSLASH
        tag += ctx.tokens[ctx.pos].value;
        ctx.pos++;
        // Tag name (TEXT and possibly DASH TEXT pairs)
        const result = this.peekTagName(ctx.tokens, ctx.pos);
        if (result) {
            for (let n = 0; n < result.count; n++) {
                tag += ctx.tokens[ctx.pos].value;
                ctx.pos++;
            }
        }
        // Optional spaces
        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'SPACE') {
            tag += ctx.tokens[ctx.pos].value;
            ctx.pos++;
        }
        // GT
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'GT') {
            tag += ctx.tokens[ctx.pos].value;
            ctx.pos++;
        }
        return tag;
    }

    /**
     * Recursively adjusts line numbers on a node and its children.
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

    // ── Table ───────────────────────────────────────────────────

    /**
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode}
     */
    parseTable(ctx) {
        const startLine = ctx.line;
        const lines = [];

        // Collect lines that start with PIPE or look like separator rows
        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type !== 'EOF') {
            // Check if this line starts with PIPE
            if (ctx.tokens[ctx.pos].type !== 'PIPE') break;

            // Collect entire line
            let line = '';
            while (
                ctx.pos < ctx.tokens.length &&
                ctx.tokens[ctx.pos].type !== 'NEWLINE' &&
                ctx.tokens[ctx.pos].type !== 'EOF'
            ) {
                line += ctx.tokens[ctx.pos].value;
                ctx.pos++;
            }
            lines.push(line);

            // Skip newline
            if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'NEWLINE') {
                ctx.line++;
                ctx.pos++;
            }
        }

        const node = new SyntaxNode('table', '');
        node.startLine = startLine;
        node.endLine = startLine + lines.length - 1;

        // Parse header (first line)
        if (lines.length > 0) {
            const headerCells = this.parseTableRow(lines[0]);
            const header = new SyntaxNode('header', '');
            for (const cellText of headerCells) {
                const cell = new SyntaxNode('cell', '');
                cell.appendChild(new SyntaxNode('text', cellText));
                header.appendChild(cell);
            }
            node.appendChild(header);
        }

        // Parse data rows (skip separator row)
        for (let r = 1; r < lines.length; r++) {
            if (/^\s*\|?\s*[-:]+[-|:\s]*$/.test(lines[r])) continue;
            const rowCells = this.parseTableRow(lines[r]);
            const row = new SyntaxNode('row', '');
            for (const cellText of rowCells) {
                const cell = new SyntaxNode('cell', '');
                cell.appendChild(new SyntaxNode('text', cellText));
                row.appendChild(cell);
            }
            node.appendChild(row);
        }

        return node;
    }

    /**
     * Parses a pipe-delimited table row into an array of trimmed cell strings.
     * @param {string} line
     * @returns {string[]}
     */
    parseTableRow(line) {
        return line
            .replace(/^\||\|$/g, '')
            .split('|')
            .map((c) => c.trim());
    }

    // ── Paragraph ───────────────────────────────────────────────

    /**
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode}
     */
    parseParagraph(ctx) {
        const startLine = ctx.line;
        let content = '';
        let consecutiveNewlines = 0;

        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type !== 'EOF') {
            if (ctx.tokens[ctx.pos].type === 'NEWLINE') {
                consecutiveNewlines++;
                ctx.line++;
                ctx.pos++;

                // Double newline ends paragraph
                if (consecutiveNewlines >= 2) {
                    break;
                }

                // Single newline — peek at next line to see if it starts a block
                if (this.isBlockStart(ctx)) {
                    break;
                }

                // Continuation line — add the newline to content
                content += '\n';
                continue;
            }

            consecutiveNewlines = 0;
            content += ctx.tokens[ctx.pos].value;
            ctx.pos++;
        }

        // Trim trailing newlines from content
        while (content.endsWith('\n')) {
            content = content.slice(0, -1);
        }

        const node = new SyntaxNode('paragraph', content);
        node.startLine = startLine;
        node.endLine = ctx.line > startLine ? ctx.line - 1 : startLine;
        return node;
    }

    // ── Lookahead helpers ───────────────────────────────────────

    /**
     * Returns the token type at pos + offset, or 'EOF'.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     * @param {number} offset
     * @returns {string}
     */
    lookType(ctx, offset) {
        const i = ctx.pos + offset;
        if (i >= ctx.tokens.length) return 'EOF';
        return ctx.tokens[i].type;
    }

    /**
     * Consumes tokens until NEWLINE or EOF and returns the collected text.
     * The NEWLINE itself is consumed and ctx.line is incremented.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {string}
     */
    consumeToEndOfLine(ctx) {
        let text = '';
        while (
            ctx.pos < ctx.tokens.length &&
            ctx.tokens[ctx.pos].type !== 'NEWLINE' &&
            ctx.tokens[ctx.pos].type !== 'EOF'
        ) {
            text += ctx.tokens[ctx.pos].value;
            ctx.pos++;
        }
        // Skip the newline
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'NEWLINE') {
            ctx.line++;
            ctx.pos++;
        }
        return text;
    }

    /**
     * Checks if the current position starts a block element.
     * Used for paragraph continuation checks.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     * @returns {boolean}
     */
    isBlockStart(ctx) {
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type === 'EOF') return true;
        if (ctx.tokens[ctx.pos].type === 'NEWLINE') return true;

        const t = ctx.tokens[ctx.pos].type;

        // Heading
        if (t === 'HASH') return true;

        // Code fence (three or more backticks)
        if (
            t === 'BACKTICK' &&
            this.lookType(ctx, 1) === 'BACKTICK' &&
            this.lookType(ctx, 2) === 'BACKTICK'
        )
            return true;

        // Blockquote
        if (t === 'GT') return true;

        // List items
        if (this.isUnorderedListStart(ctx)) return true;
        if (this.isOrderedListStart(ctx)) return true;

        // Horizontal rule
        if (this.isHorizontalRule(ctx)) return true;

        // HTML block
        if (t === 'LT' && this.isHtmlBlockStart(ctx)) return true;

        // Table
        if (t === 'PIPE') return true;

        // Image
        if (t === 'BANG' && this.lookType(ctx, 1) === 'LBRACKET') return true;

        // Linked image
        if (t === 'LBRACKET' && this.lookType(ctx, 1) === 'BANG') return true;

        return false;
    }
}
