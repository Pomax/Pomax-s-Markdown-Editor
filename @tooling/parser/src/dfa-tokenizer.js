/**
 * @fileoverview Character-level tokenizer for markdown source text.
 *
 * Scans the input one character at a time and produces a flat token
 * stream.  Consecutive plain-text characters are coalesced into a
 * single TEXT token.  No regex is used anywhere.
 */

// ── Token types ─────────────────────────────────────────────────────

/**
 * @typedef {'TEXT'|'NEWLINE'|'HASH'|'SPACE'|'TAB'|'GT'|'DASH'|'STAR'
 *   |'UNDERSCORE'|'TILDE'|'BACKTICK'|'PIPE'|'BANG'|'LBRACKET'
 *   |'RBRACKET'|'LPAREN'|'RPAREN'|'LT'|'FSLASH'|'DIGIT'|'DOT'
 *   |'PLUS'|'COLON'|'EOF'} DFATokenType
 */

/**
 * @typedef {object} DFAToken
 * @property {DFATokenType} type
 * @property {string} value  - The raw character(s).
 */

// ── Character classification ────────────────────────────────────────

/**
 * Maps a single character to its token type.  Characters that don't
 * have a dedicated type become part of a TEXT token.
 *
 * @param {string} ch
 * @returns {DFATokenType|null}  null means "plain text"
 */
function charType(ch) {
    switch (ch) {
        case '\n':
            return 'NEWLINE';
        case '#':
            return 'HASH';
        case ' ':
            return 'SPACE';
        case '\t':
            return 'TAB';
        case '>':
            return 'GT';
        case '-':
            return 'DASH';
        case '*':
            return 'STAR';
        case '_':
            return 'UNDERSCORE';
        case '~':
            return 'TILDE';
        case '`':
            return 'BACKTICK';
        case '|':
            return 'PIPE';
        case '!':
            return 'BANG';
        case '[':
            return 'LBRACKET';
        case ']':
            return 'RBRACKET';
        case '(':
            return 'LPAREN';
        case ')':
            return 'RPAREN';
        case '<':
            return 'LT';
        case '/':
            return 'FSLASH';
        case '.':
            return 'DOT';
        case '+':
            return 'PLUS';
        case ':':
            return 'COLON';
        default:
            if (ch >= '0' && ch <= '9') return 'DIGIT';
            return null;
    }
}

// ── Tokenizer ───────────────────────────────────────────────────────

/**
 * Tokenizes a markdown string character-by-character.
 *
 * @param {string} input
 * @returns {DFAToken[]}
 */
export function tokenize(input) {
    /** @type {DFAToken[]} */
    const tokens = [];
    let i = 0;
    let textBuf = '';

    function flushText() {
        if (textBuf.length > 0) {
            tokens.push({ type: 'TEXT', value: textBuf });
            textBuf = '';
        }
    }

    while (i < input.length) {
        const ch = input[i];
        const type = charType(ch);

        if (type === null) {
            // Plain text — accumulate.
            textBuf += ch;
        } else {
            flushText();
            tokens.push({ type, value: ch });
        }

        i++;
    }

    flushText();
    tokens.push({ type: 'EOF', value: '' });

    return tokens;
}
