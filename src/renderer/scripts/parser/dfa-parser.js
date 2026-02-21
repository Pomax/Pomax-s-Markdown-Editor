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

// ── Helper: count newlines in a string ──────────────────────────────

/**
 * @param {string} s
 * @returns {number}
 */
function countNewlines(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '\n') n++;
    }
    return n;
}

// ── DFA Parser ──────────────────────────────────────────────────────

/**
 * Parses markdown text into a syntax tree using a token-driven DFA.
 */
export class DFAParser {
    /**
     * Parses a full markdown document.
     * @param {string} markdown
     * @returns {SyntaxTree}
     */
    parse(markdown) {
        const tokens = tokenize(markdown);
        const tree = new SyntaxTree();
        const ctx = { tokens, pos: 0, line: 0 };

        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type !== 'EOF') {
            // Skip blank lines between blocks
            if (ctx.tokens[ctx.pos].type === 'NEWLINE') {
                ctx.line++;
                ctx.pos++;
                continue;
            }

            const node = this._parseBlock(ctx);
            if (node) {
                tree.appendChild(node);
            }
        }

        return tree;
    }

    /**
     * Parses a single line of markdown (for live-editing re-parse).
     * @param {string} line
     * @returns {SyntaxNode|null}
     */
    parseSingleLine(line) {
        const tokens = tokenize(line);
        const ctx = { tokens, pos: 0, line: 0 };

        // Skip leading newlines
        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'NEWLINE') {
            ctx.pos++;
        }

        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type === 'EOF') {
            return null;
        }

        return this._parseBlock(ctx);
    }

    // ── Block dispatch ──────────────────────────────────────────

    /**
     * Determines what block element starts at the current position
     * and dispatches to the appropriate sub-parser.
     *
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode|null}
     */
    _parseBlock(ctx) {
        const tok = ctx.tokens[ctx.pos];

        // Heading: one or more HASH at start of line
        if (tok.type === 'HASH') {
            return this._parseHeading(ctx);
        }

        // Code fence: three BACKTICK tokens
        if (
            tok.type === 'BACKTICK' &&
            this._lookType(ctx, 1) === 'BACKTICK' &&
            this._lookType(ctx, 2) === 'BACKTICK'
        ) {
            return this._parseCodeBlock(ctx);
        }

        // Blockquote: GT at start
        if (tok.type === 'GT') {
            return this._parseBlockquote(ctx);
        }

        // Unordered list: DASH/STAR/PLUS followed by SPACE, or indented
        if (this._isUnorderedListStart(ctx)) {
            return this._parseUnorderedListItem(ctx);
        }

        // Ordered list: DIGIT(s) DOT SPACE
        if (this._isOrderedListStart(ctx)) {
            return this._parseOrderedListItem(ctx);
        }

        // Horizontal rule: three or more DASH/STAR/UNDERSCORE
        if (this._isHorizontalRule(ctx)) {
            return this._parseHorizontalRule(ctx);
        }

        // HTML img tag: <img ...> (possibly indented)
        if (tok.type === 'LT' && this._isHtmlImgTag(ctx)) {
            return this._parseHtmlImage(ctx);
        }
        if ((tok.type === 'SPACE' || tok.type === 'TAB') && this._isIndentedHtmlImgTag(ctx)) {
            this._skipWhitespace(ctx);
            return this._parseHtmlImage(ctx);
        }

        // HTML block: <tagname...> (possibly indented)
        if (tok.type === 'LT' && this._isHtmlBlockStart(ctx)) {
            return this._parseHtmlBlock(ctx);
        }
        if ((tok.type === 'SPACE' || tok.type === 'TAB') && this._isIndentedHtmlBlockStart(ctx)) {
            this._skipWhitespace(ctx);
            return this._parseHtmlBlock(ctx);
        }

        // Table: starts with PIPE
        if (tok.type === 'PIPE') {
            return this._parseTable(ctx);
        }

        // Linked image: [![alt](src)](href)
        if (tok.type === 'LBRACKET' && this._lookType(ctx, 1) === 'BANG') {
            const saved = ctx.pos;
            const node = this._tryParseLinkedImage(ctx);
            if (node) return node;
            ctx.pos = saved;
        }

        // Image: ![alt](src)
        if (tok.type === 'BANG' && this._lookType(ctx, 1) === 'LBRACKET') {
            const saved = ctx.pos;
            const node = this._tryParseImage(ctx);
            if (node) return node;
            ctx.pos = saved;
        }

        // Default: paragraph
        return this._parseParagraph(ctx);
    }

    // ── Heading ─────────────────────────────────────────────────

    /**
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode}
     */
    _parseHeading(ctx) {
        const startLine = ctx.line;
        let level = 0;

        // Count hashes
        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'HASH') {
            level++;
            ctx.pos++;
        }

        if (level > 6) level = 6;

        // Skip the space after hashes
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'SPACE') {
            ctx.pos++;
        }

        // Collect content until NEWLINE or EOF
        const content = this._consumeToEndOfLine(ctx);

        const node = new SyntaxNode(`heading${level}`, content);
        node.startLine = startLine;
        node.endLine = startLine;
        return node;
    }

    // ── Code block ──────────────────────────────────────────────

    /**
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode}
     */
    _parseCodeBlock(ctx) {
        const startLine = ctx.line;

        // Skip the three backticks
        ctx.pos += 3;

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

        // Skip the newline after opening fence
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'NEWLINE') {
            ctx.line++;
            ctx.pos++;
        }

        // Collect body until closing fence (three backticks at start of line)
        let content = '';
        while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type !== 'EOF') {
            // Check for closing fence: three backticks
            if (
                ctx.tokens[ctx.pos].type === 'BACKTICK' &&
                this._lookType(ctx, 1) === 'BACKTICK' &&
                this._lookType(ctx, 2) === 'BACKTICK'
            ) {
                // Closing fence found — skip the backticks
                ctx.pos += 3;
                // Skip optional trailing content on the fence line
                while (
                    ctx.pos < ctx.tokens.length &&
                    ctx.tokens[ctx.pos].type !== 'NEWLINE' &&
                    ctx.tokens[ctx.pos].type !== 'EOF'
                ) {
                    ctx.pos++;
                }
                // Skip the newline after closing fence
                if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'NEWLINE') {
                    ctx.line++;
                    ctx.pos++;
                }
                break;
            }

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

        const node = new SyntaxNode('code-block', content);
        node.attributes = { language };
        node.startLine = startLine;
        node.endLine = ctx.line > startLine ? ctx.line - 1 : startLine;
        return node;
    }

    // ── Blockquote ──────────────────────────────────────────────

    /**
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode}
     */
    _parseBlockquote(ctx) {
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
            contentLines.push(this._consumeToEndOfLine(ctx));
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
    _isUnorderedListStart(ctx) {
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
    _parseUnorderedListItem(ctx) {
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

        // Skip the marker (DASH/STAR/PLUS)
        ctx.pos++;
        // Skip the SPACE after marker
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'SPACE') {
            ctx.pos++;
        }

        const content = this._consumeToEndOfLine(ctx);

        const node = new SyntaxNode('list-item', content);
        node.attributes = { ordered: false, indent };
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
    _isOrderedListStart(ctx) {
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
    _parseOrderedListItem(ctx) {
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

        const content = this._consumeToEndOfLine(ctx);

        const node = new SyntaxNode('list-item', content);
        node.attributes = { ordered: true, number, indent };
        node.startLine = startLine;
        node.endLine = startLine;
        return node;
    }

    // ── Horizontal rule ─────────────────────────────────────────

    /**
     * Checks if current position is a horizontal rule.
     * Three or more of the same character (DASH, STAR, UNDERSCORE)
     * with only optional trailing spaces before newline/EOF.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     * @returns {boolean}
     */
    _isHorizontalRule(ctx) {
        const t = ctx.tokens[ctx.pos].type;
        if (t !== 'DASH' && t !== 'STAR' && t !== 'UNDERSCORE') return false;

        let i = ctx.pos;
        let count = 0;
        while (i < ctx.tokens.length && ctx.tokens[i].type === t) {
            count++;
            i++;
        }
        if (count < 3) return false;

        // Only spaces allowed after the run, then NEWLINE or EOF
        while (i < ctx.tokens.length && ctx.tokens[i].type === 'SPACE') {
            i++;
        }
        return (
            i >= ctx.tokens.length ||
            ctx.tokens[i].type === 'NEWLINE' ||
            ctx.tokens[i].type === 'EOF'
        );
    }

    /**
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode}
     */
    _parseHorizontalRule(ctx) {
        const startLine = ctx.line;

        // Consume all the markers and trailing spaces
        this._consumeToEndOfLine(ctx);

        const node = new SyntaxNode('horizontal-rule', '');
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
    _tryParseImage(ctx) {
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

        const node = new SyntaxNode('image', alt);
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
    _tryParseLinkedImage(ctx) {
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

        const node = new SyntaxNode('image', alt);
        node.attributes = { alt, url: src, href };
        node.startLine = startLine;
        node.endLine = startLine;
        return node;
    }

    // ── HTML image ──────────────────────────────────────────────

    /**
     * Checks if current position is an <img ...> tag.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     * @returns {boolean}
     */
    _isHtmlImgTag(ctx) {
        // LT then "img" (case-insensitive)
        const after = this._peekTextAfterLT(ctx);
        if (!after) return false;
        return after.toLowerCase() === 'img';
    }

    /**
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode}
     */
    _parseHtmlImage(ctx) {
        const startLine = ctx.line;

        // Consume everything until GT (the closing >)
        let raw = '';
        while (
            ctx.pos < ctx.tokens.length &&
            ctx.tokens[ctx.pos].type !== 'NEWLINE' &&
            ctx.tokens[ctx.pos].type !== 'EOF'
        ) {
            raw += ctx.tokens[ctx.pos].value;
            if (ctx.tokens[ctx.pos].type === 'GT' && raw.length > 1) {
                ctx.pos++;
                break;
            }
            ctx.pos++;
        }

        // Skip newline
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'NEWLINE') {
            ctx.line++;
            ctx.pos++;
        }

        // Extract attributes by scanning the raw string character by character
        const src = this._extractAttr(raw, 'src');
        const alt = this._extractAttr(raw, 'alt');
        const style = this._extractAttr(raw, 'style');

        const node = new SyntaxNode('image', alt);
        node.attributes = { alt, url: src };
        if (style) {
            node.attributes.style = style;
        }
        node.startLine = startLine;
        node.endLine = startLine;
        return node;
    }

    /**
     * Extracts an attribute value from an HTML tag string without regex.
     * Scans for `name="value"` or `name='value'` patterns.
     * @param {string} raw
     * @param {string} name
     * @returns {string}
     */
    _extractAttr(raw, name) {
        const lower = raw.toLowerCase();
        const search = name.toLowerCase();
        let i = 0;

        while (i < lower.length) {
            const idx = lower.indexOf(search, i);
            if (idx === -1) return '';

            // Check this is actually an attribute name boundary
            let j = idx + search.length;

            // Skip whitespace around =
            while (j < lower.length && (lower[j] === ' ' || lower[j] === '\t')) j++;
            if (j >= lower.length || lower[j] !== '=') {
                i = idx + 1;
                continue;
            }
            j++; // skip =
            while (j < lower.length && (lower[j] === ' ' || lower[j] === '\t')) j++;

            // Expect quote
            if (j >= lower.length) return '';
            const quote = raw[j];
            if (quote !== '"' && quote !== "'") {
                i = idx + 1;
                continue;
            }
            j++; // skip opening quote

            // Collect until closing quote
            let value = '';
            while (j < raw.length && raw[j] !== quote) {
                value += raw[j];
                j++;
            }
            return value;
        }
        return '';
    }

    // ── HTML block ──────────────────────────────────────────────

    /**
     * Checks if current position starts an HTML block tag.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     * @returns {boolean}
     */
    _isHtmlBlockStart(ctx) {
        const tagName = this._peekTextAfterLT(ctx);
        if (!tagName) return false;
        const lower = tagName.toLowerCase();
        return HTML_BLOCK_TAGS.has(lower) || this._isValidCustomElement(lower);
    }

    /**
     * Checks if current position has leading whitespace followed by
     * an HTML block tag.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     * @returns {boolean}
     */
    _isIndentedHtmlBlockStart(ctx) {
        let i = ctx.pos;
        while (
            i < ctx.tokens.length &&
            (ctx.tokens[i].type === 'SPACE' || ctx.tokens[i].type === 'TAB')
        ) {
            i++;
        }
        if (i >= ctx.tokens.length || i === ctx.pos) return false;
        if (ctx.tokens[i].type !== 'LT') return false;
        const result = this._peekTagName(ctx.tokens, i + 1);
        if (!result) return false;
        const lower = result.name.toLowerCase();
        return HTML_BLOCK_TAGS.has(lower) || this._isValidCustomElement(lower);
    }

    /**
     * Checks if current position has leading whitespace followed by
     * an HTML img tag.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     * @returns {boolean}
     */
    _isIndentedHtmlImgTag(ctx) {
        let i = ctx.pos;
        while (
            i < ctx.tokens.length &&
            (ctx.tokens[i].type === 'SPACE' || ctx.tokens[i].type === 'TAB')
        ) {
            i++;
        }
        if (i >= ctx.tokens.length || i === ctx.pos) return false;
        if (ctx.tokens[i].type !== 'LT') return false;
        const next = i + 1;
        if (next >= ctx.tokens.length || ctx.tokens[next].type !== 'TEXT') return false;
        return ctx.tokens[next].value.toLowerCase() === 'img';
    }

    /**
     * Skips whitespace tokens (SPACE, TAB) at current position.
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number}} ctx
     */
    _skipWhitespace(ctx) {
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
    _peekTagName(tokens, startIndex) {
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
    _isValidCustomElement(name) {
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
    _peekTextAfterLT(ctx) {
        if (ctx.tokens[ctx.pos].type !== 'LT') return null;
        const result = this._peekTagName(ctx.tokens, ctx.pos + 1);
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
    _parseHtmlBlock(ctx) {
        const startLine = ctx.line;

        // Consume the opening tag line (everything up to and including the first >)
        let openingTag = '';
        const tagName = this._peekTextAfterLT(ctx);
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

        // Check if this is a self-closed tag on one line: <tag>content</tag>
        // Look ahead to see if there's content then a closing tag on same line
        const selfClosedResult = this._trySelfClosedHtmlBlock(
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
            if (this._isClosingTag(ctx, lowerTagName)) {
                closingTag = this._consumeClosingTag(ctx);
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

        // Remove leading/trailing newlines from body
        while (bodyMarkdown.startsWith('\n')) bodyMarkdown = bodyMarkdown.slice(1);
        while (bodyMarkdown.endsWith('\n')) bodyMarkdown = bodyMarkdown.slice(0, -1);

        const endLine = ctx.line;

        // Skip newline after closing tag
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'NEWLINE') {
            ctx.line++;
            ctx.pos++;
        }

        // Create the container node
        const node = new SyntaxNode('html-block', '');
        node.attributes = {
            tagName: lowerTagName,
            openingTag,
            closingTag,
        };
        node.startLine = startLine;
        node.endLine = endLine;

        // Re-parse the body as markdown to create child nodes
        if (bodyMarkdown.length > 0) {
            const bodyParser = new DFAParser();
            const bodyTree = bodyParser.parse(bodyMarkdown);
            const bodyStartLine = startLine + 1;
            for (const child of bodyTree.children) {
                this._adjustLineNumbers(child, bodyStartLine);
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
    _trySelfClosedHtmlBlock(ctx, tagName, openingTag, startLine) {
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
            if (this._isClosingTag(ctx, tagName)) {
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
        this._consumeClosingTag(ctx);

        // Skip newline
        if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].type === 'NEWLINE') {
            ctx.line++;
            ctx.pos++;
        }

        // Build the node structure matching the existing parser's output
        const node = new SyntaxNode('html-block', '');
        node.attributes = {
            tagName,
            openingTag,
            closingTag: `</${tagName}>`,
        };
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
    _isClosingTag(ctx, tagName) {
        const i = ctx.pos;
        if (i >= ctx.tokens.length || ctx.tokens[i].type !== 'LT') return false;
        if (i + 1 >= ctx.tokens.length || ctx.tokens[i + 1].type !== 'FSLASH') return false;
        const result = this._peekTagName(ctx.tokens, i + 2);
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
    _consumeClosingTag(ctx) {
        let tag = '';
        // LT
        tag += ctx.tokens[ctx.pos].value;
        ctx.pos++;
        // FSLASH
        tag += ctx.tokens[ctx.pos].value;
        ctx.pos++;
        // Tag name (TEXT and possibly DASH TEXT pairs)
        const result = this._peekTagName(ctx.tokens, ctx.pos);
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
    _adjustLineNumbers(node, offset) {
        node.startLine += offset;
        node.endLine += offset;
        for (const child of node.children) {
            this._adjustLineNumbers(child, offset);
        }
    }

    // ── Table ───────────────────────────────────────────────────

    /**
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode}
     */
    _parseTable(ctx) {
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

        const content = lines.join('\n');
        const node = new SyntaxNode('table', content);
        node.startLine = startLine;
        node.endLine = startLine + lines.length - 1;
        return node;
    }

    // ── Paragraph ───────────────────────────────────────────────

    /**
     * @param {{tokens: import('./dfa-tokenizer.js').DFAToken[], pos: number, line: number}} ctx
     * @returns {SyntaxNode}
     */
    _parseParagraph(ctx) {
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
                if (this._isBlockStart(ctx)) {
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
    _lookType(ctx, offset) {
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
    _consumeToEndOfLine(ctx) {
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
    _isBlockStart(ctx) {
        if (ctx.pos >= ctx.tokens.length || ctx.tokens[ctx.pos].type === 'EOF') return true;
        if (ctx.tokens[ctx.pos].type === 'NEWLINE') return true;

        const t = ctx.tokens[ctx.pos].type;

        // Heading
        if (t === 'HASH') return true;

        // Code fence
        if (
            t === 'BACKTICK' &&
            this._lookType(ctx, 1) === 'BACKTICK' &&
            this._lookType(ctx, 2) === 'BACKTICK'
        )
            return true;

        // Blockquote
        if (t === 'GT') return true;

        // List items
        if (this._isUnorderedListStart(ctx)) return true;
        if (this._isOrderedListStart(ctx)) return true;

        // Horizontal rule
        if (this._isHorizontalRule(ctx)) return true;

        // HTML block
        if (t === 'LT' && (this._isHtmlBlockStart(ctx) || this._isHtmlImgTag(ctx))) return true;

        // Table
        if (t === 'PIPE') return true;

        // Image
        if (t === 'BANG' && this._lookType(ctx, 1) === 'LBRACKET') return true;

        // Linked image
        if (t === 'LBRACKET' && this._lookType(ctx, 1) === 'BANG') return true;

        return false;
    }
}
