/**
 * @fileoverview Lightweight syntax highlighter for fenced code blocks.
 *
 * Tokenises source code for common languages and returns a
 * DocumentFragment with `<span class="sh-{token}">` wrappers that can
 * be styled via CSS.  When the language is unknown or empty the content
 * is returned as a plain text node so behaviour is unchanged.
 *
 * The highlighter is intentionally simple — it is *not* a full parser.
 * It handles the most visually impactful tokens (comments, strings,
 * keywords, numbers, etc.) and leaves everything else as plain text.
 */

import {
  CATCH_ALL,
  IDENT,
  NUMBER,
  OPERATOR,
  PUNCTUATION,
  WHITESPACE,
  tryMatch,
} from './patterns.js';

import * as javascript from './javascript.js';
import * as python from './python.js';
import * as html from './html.js';
import * as css from './css.js';
import * as json from './json.js';
import * as c from './c.js';
import * as java from './java.js';
import * as rust from './rust.js';
import * as go from './go.js';
import * as ruby from './ruby.js';
import * as shell from './shell.js';
import * as sql from './sql.js';
import * as php from './php.js';

/** @type {Map<string, LangDef>} */
const LANGUAGES = new Map();

const ALL_LANGUAGES = [
  javascript,
  python,
  html,
  css,
  json,
  c,
  java,
  rust,
  go,
  ruby,
  shell,
  sql,
  php,
];

for (const lang of ALL_LANGUAGES) {
  for (const name of lang.aliases) {
    LANGUAGES.set(name.toLowerCase(), lang.definition);
  }
}

/**
 * Generic tokeniser for C-family and similar languages.
 *
 * @param {string} code
 * @param {LangDef} lang
 * @returns {Array<{type: TokenType, text: string}>}
 */
function tokeniseGeneric(code, lang) {
  /** @type {Array<{type: TokenType, text: string}>} */
  const tokens = [];
  let pos = 0;

  const caseInsensitive = lang.caseInsensitive ?? false;

  while (pos < code.length) {
    let matched = false;

    let text = tryMatch(WHITESPACE, code, pos);
    if (text) {
      tokens.push({ type: `text`, text });
      pos += text.length;
      continue;
    }

    for (const cp of lang.comments) {
      text = tryMatch(cp, code, pos);
      if (text) {
        tokens.push({ type: `comment`, text });
        pos += text.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    if (lang.extraBefore) {
      text = tryMatch(lang.extraBefore, code, pos);
      if (text) {
        tokens.push({ type: /** @type {TokenType} */ (lang.extraBeforeType), text });
        pos += text.length;
        continue;
      }
    }

    for (const sp of lang.strings) {
      text = tryMatch(sp, code, pos);
      if (text) {
        tokens.push({ type: `string`, text });
        pos += text.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    text = tryMatch(NUMBER, code, pos);
    if (text) {
      tokens.push({ type: `number`, text });
      pos += text.length;
      continue;
    }

    text = tryMatch(IDENT, code, pos);
    if (text) {
      const lookup = caseInsensitive ? text.toUpperCase() : text;
      /** @type {TokenType} */
      let type = `text`;
      if (lang.keywords.has(lookup)) {
        type = `keyword`;
      } else if (lang.types.has(lookup)) {
        type = `type`;
      } else if (lang.constants.has(lookup)) {
        type = `constant`;
      } else {
        const next = code[pos + text.length];
        if (next === `(`) {
          type = `function`;
        }
      }
      tokens.push({ type, text });
      pos += text.length;
      continue;
    }

    text = tryMatch(OPERATOR, code, pos);
    if (text) {
      tokens.push({ type: `operator`, text });
      pos += text.length;
      continue;
    }

    text = tryMatch(PUNCTUATION, code, pos);
    if (text) {
      tokens.push({ type: `punctuation`, text });
      pos += text.length;
      continue;
    }

    text = tryMatch(CATCH_ALL, code, pos);
    if (text) {
      tokens.push({ type: `text`, text });
      pos += text.length;
      continue;
    }

    pos++;
  }

  return tokens;
}

/**
 * Highlights source code and returns a DocumentFragment containing
 * `<span class="sh-{tokenType}">` elements and plain text nodes.
 *
 * If the language is not recognised the content is returned as a
 * single text node (no highlighting).
 *
 * @param {string} code     - The source code to highlight.
 * @param {string} language - The language identifier (e.g. 'js', 'python').
 * @returns {DocumentFragment}
 */
export function highlight(code, language) {
  const fragment = document.createDocumentFragment();

  if (!code) {
    fragment.appendChild(document.createTextNode(``));
    return fragment;
  }

  const lang = LANGUAGES.get(language.toLowerCase());

  if (!lang) {
    fragment.appendChild(document.createTextNode(code));
    return fragment;
  }

  const tokens = lang.tokenise ? lang.tokenise(code, lang) : tokeniseGeneric(code, lang);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === `text`) {
      fragment.appendChild(document.createTextNode(token.text));
    } else {
      const span = document.createElement(`span`);
      span.className = `sh-${token.type}`;
      span.textContent = token.text;
      fragment.appendChild(span);
    }
  }

  return fragment;
}

/**
 * Returns whether the given language identifier is supported.
 *
 * @param {string} language
 * @returns {boolean}
 */
export function isLanguageSupported(language) {
  return LANGUAGES.has(language.toLowerCase());
}
