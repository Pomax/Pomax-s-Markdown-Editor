/**
 * @fileoverview Python language definition for the syntax highlighter.
 */

import { DOUBLE_STRING, HASH_COMMENT, SINGLE_STRING, defineLang } from './patterns.js';

const PY_TRIPLE_DQ = /"""[\s\S]*?"""/y;
const PY_TRIPLE_SQ = /'''[\s\S]*?'''/y;
const PY_DECORATOR = /@[\w.]+/y;

const KEYWORDS = new Set([
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
]);

const TYPES = new Set([
  'int',
  'float',
  'str',
  'bool',
  'list',
  'dict',
  'set',
  'tuple',
  'bytes',
  'bytearray',
  'complex',
  'frozenset',
  'memoryview',
  'range',
  'type',
  'object',
]);

const CONSTANTS = new Set(['True', 'False', 'None']);

export const definition = defineLang({
  comments: [HASH_COMMENT],
  strings: [PY_TRIPLE_DQ, PY_TRIPLE_SQ, DOUBLE_STRING, SINGLE_STRING],
  keywords: KEYWORDS,
  types: TYPES,
  constants: CONSTANTS,
  extraBefore: PY_DECORATOR,
  extraBeforeType: 'attribute',
});

export const aliases = ['python', 'py'];
