import {
  BLOCK_COMMENT,
  DOUBLE_STRING,
  LINE_COMMENT,
  SINGLE_STRING,
  TEMPLATE_STRING,
  defineLang,
} from './patterns.js';

const KEYWORDS = new Set([
  `break`,
  `case`,
  `chan`,
  `const`,
  `continue`,
  `default`,
  `defer`,
  `else`,
  `fallthrough`,
  `for`,
  `func`,
  `go`,
  `goto`,
  `if`,
  `import`,
  `interface`,
  `map`,
  `package`,
  `range`,
  `return`,
  `select`,
  `struct`,
  `switch`,
  `type`,
  `var`,
]);

const TYPES = new Set([
  `bool`,
  `byte`,
  `complex64`,
  `complex128`,
  `error`,
  `float32`,
  `float64`,
  `int`,
  `int8`,
  `int16`,
  `int32`,
  `int64`,
  `rune`,
  `string`,
  `uint`,
  `uint8`,
  `uint16`,
  `uint32`,
  `uint64`,
  `uintptr`,
]);

export const definition = defineLang({
  comments: [BLOCK_COMMENT, LINE_COMMENT],
  strings: [TEMPLATE_STRING, DOUBLE_STRING, SINGLE_STRING],
  keywords: KEYWORDS,
  types: TYPES,
  constants: new Set([`true`, `false`, `nil`, `iota`]),
});

export const aliases = [`go`, `golang`];
