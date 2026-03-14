/**
 * @fileoverview CSS / SCSS / Less language definition for the syntax
 * highlighter.
 */

import { BLOCK_COMMENT, DOUBLE_STRING, SINGLE_STRING, defineLang } from './patterns.js';

const CSS_AT_RULE = /@[\w-]+/y;
const CSS_SELECTOR_CLASS = /\.[\w-]+/y;
const CSS_SELECTOR_ID = /#[\w-]+/y;
const CSS_PROPERTY = /[\w-]+(?=\s*:)/y;
const CSS_UNIT =
  /\b\d[\d.]*(?:px|em|rem|%|vh|vw|vmin|vmax|ch|ex|cm|mm|in|pt|pc|s|ms|deg|rad|turn|fr)\b/y;

const KEYWORDS = new Set([`important`, `inherit`, `initial`, `unset`, `revert`, `auto`, `none`]);

export const definition = defineLang({
  comments: [BLOCK_COMMENT],
  strings: [DOUBLE_STRING, SINGLE_STRING],
  keywords: KEYWORDS,
  constants: new Set(),
  extraBefore: CSS_AT_RULE,
  extraBeforeType: `keyword`,
});

export const aliases = [`css`, `scss`, `less`];
