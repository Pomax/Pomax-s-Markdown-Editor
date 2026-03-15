/**
 * @fileoverview Shell / Bash language definition for the syntax
 * highlighter.
 */

import { DOUBLE_STRING, HASH_COMMENT, SINGLE_STRING, defineLang } from './patterns.js';

const KEYWORDS = new Set([
  `if`,
  `then`,
  `else`,
  `elif`,
  `fi`,
  `case`,
  `esac`,
  `for`,
  `while`,
  `until`,
  `do`,
  `done`,
  `in`,
  `function`,
  `select`,
  `return`,
  `exit`,
  `export`,
  `local`,
  `readonly`,
  `declare`,
  `typeset`,
  `unset`,
  `shift`,
  `source`,
  `echo`,
  `printf`,
  `read`,
  `eval`,
  `exec`,
  `set`,
  `trap`,
  `cd`,
  `test`,
]);

export const definition = defineLang({
  comments: [HASH_COMMENT],
  strings: [DOUBLE_STRING, SINGLE_STRING],
  keywords: KEYWORDS,
  constants: new Set(),
});

export const aliases = [`bash`, `sh`, `shell`, `zsh`, `fish`];
