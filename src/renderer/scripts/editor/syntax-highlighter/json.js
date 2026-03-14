/**
 * @fileoverview JSON language definition and custom tokeniser for the
 * syntax highlighter.
 */

import { DOUBLE_STRING, IDENT, NUMBER, PUNCTUATION, WHITESPACE, tryMatch } from './patterns.js';

/** @typedef {import('./patterns.js').TokenType} TokenType */
/** @typedef {import('./patterns.js').LangDef} LangDef */

const JSON_PROPERTY_KEY = /"(?:[^"\\]|\\.)*"(?=\s*:)/y;

/**
 * Tokenises JSON with property-key awareness, distinguishing keys
 * (before `:`) from string values.
 *
 * @param {string} code
 * @param {LangDef} lang
 * @returns {Array<{type: TokenType, text: string}>}
 */
function tokeniseJSON(code, lang) {
  /** @type {Array<{type: TokenType, text: string}>} */
  const tokens = [];
  let pos = 0;

  while (pos < code.length) {
    let text = tryMatch(WHITESPACE, code, pos);
    if (text) {
      tokens.push({ type: `text`, text });
      pos += text.length;
      continue;
    }

    text = tryMatch(JSON_PROPERTY_KEY, code, pos);
    if (text) {
      tokens.push({ type: `attribute`, text });
      pos += text.length;
      continue;
    }

    text = tryMatch(DOUBLE_STRING, code, pos);
    if (text) {
      tokens.push({ type: `string`, text });
      pos += text.length;
      continue;
    }

    text = tryMatch(NUMBER, code, pos);
    if (text) {
      tokens.push({ type: `number`, text });
      pos += text.length;
      continue;
    }

    text = tryMatch(IDENT, code, pos);
    if (text) {
      const type = lang.constants.has(text) ? `constant` : `text`;
      tokens.push({ type, text });
      pos += text.length;
      continue;
    }

    text = tryMatch(PUNCTUATION, code, pos);
    if (text) {
      tokens.push({ type: `punctuation`, text });
      pos += text.length;
      continue;
    }

    tokens.push({ type: `text`, text: code[pos] });
    pos++;
  }

  return tokens;
}

export const definition = /** @type {LangDef} */ ({
  comments: [],
  strings: [DOUBLE_STRING],
  keywords: new Set(),
  types: new Set(),
  constants: new Set([`true`, `false`, `null`]),
  tokenise: tokeniseJSON,
});

export const aliases = [`json`, `jsonc`];
