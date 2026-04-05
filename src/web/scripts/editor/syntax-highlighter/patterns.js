/// <reference path="../../../../types.d.ts" />

/** Double-quoted string (with backslash escapes). */
export const DOUBLE_STRING = /"(?:[^"\\]|\\.)*"/y;

/** Single-quoted string (with backslash escapes). */
export const SINGLE_STRING = /'(?:[^'\\]|\\.)*'/y;

/** Template literal / backtick string. */
export const TEMPLATE_STRING = /`(?:[^`\\]|\\.)*`/y;

/** Multi-line C-style comment. */
export const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//y;

/** Single-line C-style comment. */
export const LINE_COMMENT = /\/\/[^\n]*/y;

/** Hash comment (Python, Ruby, Shell, etc.). */
export const HASH_COMMENT = /#[^\n]*/y;

/** Dash-dash comment (SQL, Lua, Haskell). */
export const DASH_COMMENT = /--[^\n]*/y;

/** Numeric literal (integers, floats, hex, binary, octal, underscores). */
export const NUMBER = /\b(?:0[xXoObB][\da-fA-F_]+|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d+)?)\b/y;

/** Common C-family operators / punctuation. */
export const OPERATOR = /[+\-*/%=!<>&|^~?:]+/y;

/** Brackets and delimiters. */
export const PUNCTUATION = /[{}()[\];,.]/y;

/** An identifier (word). Matched last; classified by keyword sets. */
export const IDENT = /[A-Za-z_$][\w$]*/y;

/** Catch-all: a single non-whitespace char that nothing else matched. */
export const CATCH_ALL = /\S/y;

/** Whitespace run — emitted as plain text to preserve formatting. */
export const WHITESPACE = /\s+/y;

/**
 * Builds the ordered token-rule list for a language.
 *
 * @param {Object} opts
 * @param {RegExp[]}    opts.comments          - Comment patterns.
 * @param {RegExp[]}    opts.strings           - String literal patterns.
 * @param {Set<string>} opts.keywords          - Reserved words.
 * @param {Set<string>} [opts.types]           - Type / built-in names.
 * @param {Set<string>} [opts.constants]       - Language constants.
 * @param {RegExp}      [opts.extraBefore]     - Extra pattern matched before ident.
 * @param {TokenType}   [opts.extraBeforeType] - Token type for extraBefore matches.
 * @param {boolean}     [opts.caseInsensitive] - Match keywords case-insensitively.
 * @returns {LangDef}
 */
export function defineLang({
  comments,
  strings,
  keywords,
  types,
  constants,
  extraBefore,
  extraBeforeType,
  caseInsensitive,
}) {
  return {
    comments,
    strings,
    keywords,
    types: types ?? new Set(),
    constants: constants ?? new Set(),
    extraBefore,
    extraBeforeType,
    caseInsensitive: caseInsensitive ?? false,
  };
}

/**
 * Attempts to match a sticky regex at the given position.
 *
 * @param {RegExp} pattern
 * @param {string} code
 * @param {number} pos
 * @returns {string | undefined}
 */
export function tryMatch(pattern, code, pos) {
  pattern.lastIndex = pos;
  const m = pattern.exec(code);
  return m ? m[0] : undefined;
}
