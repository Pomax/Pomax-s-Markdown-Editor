/**
 * @fileoverview HTML / XML language definition and custom tokeniser
 * for the syntax highlighter.
 */

import { DOUBLE_STRING, SINGLE_STRING, WHITESPACE, tryMatch } from './patterns.js';

/** @typedef {import('./patterns.js').TokenType} TokenType */
/** @typedef {import('./patterns.js').LangDef} LangDef */

const HTML_COMMENT = /<!--[\s\S]*?-->/y;
const HTML_TAG = /<\/?[\w-]+/y;
const HTML_ATTR_NAME = /[\w-]+(?=\s*=)/y;
const HTML_CLOSE_TAG = /\/?>/y;

/**
 * Tokenises HTML/XML using a simple state machine that recognises
 * tags, attribute names, attribute values, and comments.
 *
 * @param {string} code
 * @param {LangDef} lang
 * @returns {Array<{type: TokenType, text: string}>}
 */
function tokeniseHTML(code, lang) {
  /** @type {Array<{type: TokenType, text: string}>} */
  const tokens = [];
  let pos = 0;

  while (pos < code.length) {
    let text = tryMatch(WHITESPACE, code, pos);
    if (text) {
      tokens.push({ type: 'text', text });
      pos += text.length;
      continue;
    }

    text = tryMatch(HTML_COMMENT, code, pos);
    if (text) {
      tokens.push({ type: 'comment', text });
      pos += text.length;
      continue;
    }

    text = tryMatch(HTML_TAG, code, pos);
    if (text) {
      tokens.push({ type: 'tag', text });
      pos += text.length;

      while (pos < code.length) {
        const ws = tryMatch(WHITESPACE, code, pos);
        if (ws) {
          tokens.push({ type: 'text', text: ws });
          pos += ws.length;
          continue;
        }

        const close = tryMatch(HTML_CLOSE_TAG, code, pos);
        if (close) {
          tokens.push({ type: 'tag', text: close });
          pos += close.length;
          break;
        }

        const attr = tryMatch(HTML_ATTR_NAME, code, pos);
        if (attr) {
          tokens.push({ type: 'attribute', text: attr });
          pos += attr.length;
          continue;
        }

        if (code[pos] === '=') {
          tokens.push({ type: 'operator', text: '=' });
          pos++;
          continue;
        }

        const str = tryMatch(DOUBLE_STRING, code, pos) ?? tryMatch(SINGLE_STRING, code, pos);
        if (str) {
          tokens.push({ type: 'string', text: str });
          pos += str.length;
          continue;
        }

        tokens.push({ type: 'text', text: code[pos] });
        pos++;
      }
      continue;
    }

    text = tryMatch(DOUBLE_STRING, code, pos) ?? tryMatch(SINGLE_STRING, code, pos);
    if (text) {
      tokens.push({ type: 'string', text });
      pos += text.length;
      continue;
    }

    tokens.push({ type: 'text', text: code[pos] });
    pos++;
  }

  return tokens;
}

export const definition = /** @type {LangDef} */ ({
  comments: [HTML_COMMENT],
  strings: [DOUBLE_STRING, SINGLE_STRING],
  keywords: new Set(),
  types: new Set(),
  constants: new Set(),
  tokenise: tokeniseHTML,
});

export const aliases = ['html', 'xml', 'svg', 'htm'];
