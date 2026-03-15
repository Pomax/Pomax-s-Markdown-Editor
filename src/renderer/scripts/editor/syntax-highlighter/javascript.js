/**
 * @fileoverview JavaScript / TypeScript language definition for the
 * syntax highlighter.
 */

import {
  BLOCK_COMMENT,
  DOUBLE_STRING,
  LINE_COMMENT,
  SINGLE_STRING,
  TEMPLATE_STRING,
  defineLang,
} from './patterns.js';

const KEYWORDS = new Set([
  `abstract`,
  `arguments`,
  `async`,
  `await`,
  `break`,
  `case`,
  `catch`,
  `class`,
  `const`,
  `continue`,
  `debugger`,
  `default`,
  `delete`,
  `do`,
  `else`,
  `enum`,
  `export`,
  `extends`,
  `finally`,
  `for`,
  `from`,
  `function`,
  `get`,
  `if`,
  `implements`,
  `import`,
  `in`,
  `instanceof`,
  `interface`,
  `let`,
  `new`,
  `of`,
  `package`,
  `private`,
  `protected`,
  `public`,
  `return`,
  `set`,
  `static`,
  `super`,
  `switch`,
  `this`,
  `throw`,
  `try`,
  `typeof`,
  `var`,
  `void`,
  `while`,
  `with`,
  `yield`,
]);

const TYPES = new Set([
  `Array`,
  `Boolean`,
  `Date`,
  `Error`,
  `Function`,
  `Map`,
  `Number`,
  `Object`,
  `Promise`,
  `Proxy`,
  `RegExp`,
  `Set`,
  `String`,
  `Symbol`,
  `WeakMap`,
  `WeakSet`,
  `BigInt`,
  `Int8Array`,
  `Uint8Array`,
]);

const CONSTANTS = new Set([`true`, `false`, `null`, `undefined`, `NaN`, `Infinity`]);

export const definition = defineLang({
  comments: [BLOCK_COMMENT, LINE_COMMENT],
  strings: [TEMPLATE_STRING, DOUBLE_STRING, SINGLE_STRING],
  keywords: KEYWORDS,
  types: TYPES,
  constants: CONSTANTS,
});

export const aliases = [`javascript`, `js`, `jsx`, `typescript`, `ts`, `tsx`, `mjs`, `cjs`];
