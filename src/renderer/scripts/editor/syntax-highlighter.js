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

// ────────────────────────────────────────────────
//  Token types (used as CSS class suffixes)
// ────────────────────────────────────────────────

/**
 * @typedef {'keyword' | 'string' | 'comment' | 'number' | 'operator'
 *           | 'punctuation' | 'function' | 'type' | 'constant'
 *           | 'attribute' | 'tag' | 'text'} TokenType
 */

/**
 * @typedef {Object} LangDef
 * @property {RegExp[]}    comments
 * @property {RegExp[]}    strings
 * @property {Set<string>} keywords
 * @property {Set<string>} types
 * @property {Set<string>} constants
 * @property {RegExp}      [extraBefore]
 * @property {TokenType}   [extraBeforeType]
 * @property {boolean}     [custom]
 */

// ────────────────────────────────────────────────
//  Shared patterns
// ────────────────────────────────────────────────

/** Double-quoted string (with backslash escapes). */
const DOUBLE_STRING = /"(?:[^"\\]|\\.)*"/y;
/** Single-quoted string (with backslash escapes). */
const SINGLE_STRING = /'(?:[^'\\]|\\.)*'/y;
/** Template literal / backtick string. */
const TEMPLATE_STRING = /`(?:[^`\\]|\\.)*`/y;
/** Multi-line C-style comment. */
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//y;
/** Single-line C-style comment. */
const LINE_COMMENT = /\/\/[^\n]*/y;
/** Hash comment (Python, Ruby, Shell, etc.). */
const HASH_COMMENT = /#[^\n]*/y;
/** Dash-dash comment (SQL, Lua, Haskell). */
const DASH_COMMENT = /--[^\n]*/y;
/** Numeric literal (integers, floats, hex, binary, octal, underscores). */
const NUMBER = /\b(?:0[xXoObB][\da-fA-F_]+|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d+)?)\b/y;
/** Common C-family operators / punctuation. */
const OPERATOR = /[+\-*/%=!<>&|^~?:]+/y;
/** Brackets and delimiters. */
const PUNCTUATION = /[{}()[\];,.]/y;
/** An identifier (word). Matched last; classified by keyword sets. */
const IDENT = /[A-Za-z_$][\w$]*/y;
/** Catch-all: a single non-whitespace char that nothing else matched. */
const CATCH_ALL = /\S/y;
/** Whitespace run — emitted as plain text to preserve formatting. */
const WHITESPACE = /\s+/y;

// ────────────────────────────────────────────────
//  Per-language rule sets
// ────────────────────────────────────────────────

/**
 * Builds the ordered token-rule list for a language.
 *
 * @param {Object} opts
 * @param {RegExp[]}  opts.comments   - Comment patterns
 * @param {RegExp[]}  opts.strings    - String literal patterns
 * @param {Set<string>} opts.keywords - Reserved words
 * @param {Set<string>} [opts.types]  - Type / built-in names
 * @param {Set<string>} [opts.constants] - Language constants
 * @param {RegExp}    [opts.extraBefore] - Extra pattern matched before ident
 * @param {TokenType} [opts.extraBeforeType]
 * @returns {LangDef} language definition
 */
function defineLang({
    comments,
    strings,
    keywords,
    types,
    constants,
    extraBefore,
    extraBeforeType,
}) {
    return {
        comments,
        strings,
        keywords,
        types: types ?? new Set(),
        constants: constants ?? new Set(),
        extraBefore,
        extraBeforeType,
    };
}

// ── JavaScript / TypeScript ──────────────────────

const JS_KEYWORDS = new Set([
    'abstract',
    'arguments',
    'async',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'finally',
    'for',
    'from',
    'function',
    'get',
    'if',
    'implements',
    'import',
    'in',
    'instanceof',
    'interface',
    'let',
    'new',
    'of',
    'package',
    'private',
    'protected',
    'public',
    'return',
    'set',
    'static',
    'super',
    'switch',
    'this',
    'throw',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',
]);

const JS_TYPES = new Set([
    'Array',
    'Boolean',
    'Date',
    'Error',
    'Function',
    'Map',
    'Number',
    'Object',
    'Promise',
    'Proxy',
    'RegExp',
    'Set',
    'String',
    'Symbol',
    'WeakMap',
    'WeakSet',
    'BigInt',
    'Int8Array',
    'Uint8Array',
]);

const JS_CONSTANTS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);

const LANG_JS = defineLang({
    comments: [BLOCK_COMMENT, LINE_COMMENT],
    strings: [TEMPLATE_STRING, DOUBLE_STRING, SINGLE_STRING],
    keywords: JS_KEYWORDS,
    types: JS_TYPES,
    constants: JS_CONSTANTS,
});

// ── Python ───────────────────────────────────────

const PY_TRIPLE_DQ = /"""[\s\S]*?"""/y;
const PY_TRIPLE_SQ = /'''[\s\S]*?'''/y;

const PY_KEYWORDS = new Set([
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

const PY_TYPES = new Set([
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

const PY_CONSTANTS = new Set(['True', 'False', 'None']);

const PY_DECORATOR = /@[\w.]+/y;

const LANG_PYTHON = defineLang({
    comments: [HASH_COMMENT],
    strings: [PY_TRIPLE_DQ, PY_TRIPLE_SQ, DOUBLE_STRING, SINGLE_STRING],
    keywords: PY_KEYWORDS,
    types: PY_TYPES,
    constants: PY_CONSTANTS,
    extraBefore: PY_DECORATOR,
    extraBeforeType: 'attribute',
});

// ── HTML / XML ───────────────────────────────────

const HTML_COMMENT = /<!--[\s\S]*?-->/y;
const HTML_TAG = /<\/?[\w-]+/y;
const HTML_ATTR_NAME = /[\w-]+(?=\s*=)/y;
const HTML_CLOSE_TAG = /\/?>/y;

const LANG_HTML = {
    custom: true,
    comments: [HTML_COMMENT],
    strings: [DOUBLE_STRING, SINGLE_STRING],
    keywords: new Set(),
    types: new Set(),
    constants: new Set(),
};

// ── CSS ──────────────────────────────────────────

const CSS_KEYWORDS = new Set([
    'important',
    'inherit',
    'initial',
    'unset',
    'revert',
    'auto',
    'none',
]);

const CSS_AT_RULE = /@[\w-]+/y;
const CSS_SELECTOR_CLASS = /\.[\w-]+/y;
const CSS_SELECTOR_ID = /#[\w-]+/y;
const CSS_PROPERTY = /[\w-]+(?=\s*:)/y;
const CSS_UNIT =
    /\b\d[\d.]*(?:px|em|rem|%|vh|vw|vmin|vmax|ch|ex|cm|mm|in|pt|pc|s|ms|deg|rad|turn|fr)\b/y;

const LANG_CSS = defineLang({
    comments: [BLOCK_COMMENT],
    strings: [DOUBLE_STRING, SINGLE_STRING],
    keywords: CSS_KEYWORDS,
    constants: new Set(),
    extraBefore: CSS_AT_RULE,
    extraBeforeType: 'keyword',
});

// ── JSON ─────────────────────────────────────────

const JSON_PROPERTY_KEY = /"(?:[^"\\]|\\.)*"(?=\s*:)/y;

const LANG_JSON = {
    custom: true,
    comments: [],
    strings: [DOUBLE_STRING],
    keywords: new Set(),
    types: new Set(),
    constants: new Set(['true', 'false', 'null']),
};

// ── C / C++ / C# / Java / Rust / Go ─────────────

const C_KEYWORDS = new Set([
    'auto',
    'break',
    'case',
    'char',
    'const',
    'continue',
    'default',
    'do',
    'double',
    'else',
    'enum',
    'extern',
    'float',
    'for',
    'goto',
    'if',
    'inline',
    'int',
    'long',
    'register',
    'restrict',
    'return',
    'short',
    'signed',
    'sizeof',
    'static',
    'struct',
    'switch',
    'typedef',
    'union',
    'unsigned',
    'void',
    'volatile',
    'while',
    // C++ additions
    'alignas',
    'alignof',
    'and',
    'and_eq',
    'asm',
    'bitand',
    'bitor',
    'bool',
    'catch',
    'class',
    'compl',
    'concept',
    'consteval',
    'constexpr',
    'constinit',
    'const_cast',
    'co_await',
    'co_return',
    'co_yield',
    'decltype',
    'delete',
    'dynamic_cast',
    'explicit',
    'export',
    'false',
    'friend',
    'module',
    'mutable',
    'namespace',
    'new',
    'noexcept',
    'not',
    'not_eq',
    'nullptr',
    'operator',
    'or',
    'or_eq',
    'override',
    'private',
    'protected',
    'public',
    'reinterpret_cast',
    'requires',
    'static_assert',
    'static_cast',
    'template',
    'this',
    'throw',
    'true',
    'try',
    'typeid',
    'typename',
    'using',
    'virtual',
    'xor',
    'xor_eq',
]);

const C_TYPES = new Set([
    'int8_t',
    'int16_t',
    'int32_t',
    'int64_t',
    'uint8_t',
    'uint16_t',
    'uint32_t',
    'uint64_t',
    'size_t',
    'ptrdiff_t',
    'intptr_t',
    'uintptr_t',
    'string',
    'vector',
    'map',
    'set',
    'pair',
    'tuple',
    'optional',
    'variant',
    'any',
    'shared_ptr',
    'unique_ptr',
    'weak_ptr',
]);

const LANG_C = defineLang({
    comments: [BLOCK_COMMENT, LINE_COMMENT],
    strings: [DOUBLE_STRING, SINGLE_STRING],
    keywords: C_KEYWORDS,
    types: C_TYPES,
    constants: new Set(['true', 'false', 'NULL', 'nullptr']),
});

// ── Java ─────────────────────────────────────────

const JAVA_KEYWORDS = new Set([
    'abstract',
    'assert',
    'boolean',
    'break',
    'byte',
    'case',
    'catch',
    'char',
    'class',
    'const',
    'continue',
    'default',
    'do',
    'double',
    'else',
    'enum',
    'extends',
    'final',
    'finally',
    'float',
    'for',
    'goto',
    'if',
    'implements',
    'import',
    'instanceof',
    'int',
    'interface',
    'long',
    'native',
    'new',
    'package',
    'private',
    'protected',
    'public',
    'return',
    'short',
    'static',
    'strictfp',
    'super',
    'switch',
    'synchronized',
    'this',
    'throw',
    'throws',
    'transient',
    'try',
    'void',
    'volatile',
    'while',
    'var',
    'yield',
    'record',
    'sealed',
    'permits',
    'non-sealed',
]);

const JAVA_TYPES = new Set([
    'String',
    'Integer',
    'Long',
    'Double',
    'Float',
    'Boolean',
    'Byte',
    'Short',
    'Character',
    'Object',
    'List',
    'Map',
    'Set',
    'Collection',
    'Optional',
    'Stream',
    'Iterable',
    'Iterator',
]);

const LANG_JAVA = defineLang({
    comments: [BLOCK_COMMENT, LINE_COMMENT],
    strings: [DOUBLE_STRING, SINGLE_STRING],
    keywords: JAVA_KEYWORDS,
    types: JAVA_TYPES,
    constants: new Set(['true', 'false', 'null']),
});

// ── Rust ─────────────────────────────────────────

const RUST_KEYWORDS = new Set([
    'as',
    'async',
    'await',
    'break',
    'const',
    'continue',
    'crate',
    'dyn',
    'else',
    'enum',
    'extern',
    'fn',
    'for',
    'if',
    'impl',
    'in',
    'let',
    'loop',
    'match',
    'mod',
    'move',
    'mut',
    'pub',
    'ref',
    'return',
    'self',
    'Self',
    'static',
    'struct',
    'super',
    'trait',
    'type',
    'unsafe',
    'use',
    'where',
    'while',
    'yield',
]);

const RUST_TYPES = new Set([
    'i8',
    'i16',
    'i32',
    'i64',
    'i128',
    'isize',
    'u8',
    'u16',
    'u32',
    'u64',
    'u128',
    'usize',
    'f32',
    'f64',
    'bool',
    'char',
    'str',
    'String',
    'Vec',
    'Box',
    'Rc',
    'Arc',
    'Option',
    'Result',
    'HashMap',
    'HashSet',
    'BTreeMap',
    'BTreeSet',
]);

const LANG_RUST = defineLang({
    comments: [BLOCK_COMMENT, LINE_COMMENT],
    strings: [DOUBLE_STRING, SINGLE_STRING],
    keywords: RUST_KEYWORDS,
    types: RUST_TYPES,
    constants: new Set(['true', 'false']),
});

// ── Go ───────────────────────────────────────────

const GO_KEYWORDS = new Set([
    'break',
    'case',
    'chan',
    'const',
    'continue',
    'default',
    'defer',
    'else',
    'fallthrough',
    'for',
    'func',
    'go',
    'goto',
    'if',
    'import',
    'interface',
    'map',
    'package',
    'range',
    'return',
    'select',
    'struct',
    'switch',
    'type',
    'var',
]);

const GO_TYPES = new Set([
    'bool',
    'byte',
    'complex64',
    'complex128',
    'error',
    'float32',
    'float64',
    'int',
    'int8',
    'int16',
    'int32',
    'int64',
    'rune',
    'string',
    'uint',
    'uint8',
    'uint16',
    'uint32',
    'uint64',
    'uintptr',
]);

const LANG_GO = defineLang({
    comments: [BLOCK_COMMENT, LINE_COMMENT],
    strings: [TEMPLATE_STRING, DOUBLE_STRING, SINGLE_STRING],
    keywords: GO_KEYWORDS,
    types: GO_TYPES,
    constants: new Set(['true', 'false', 'nil', 'iota']),
});

// ── Ruby ─────────────────────────────────────────

const RUBY_KEYWORDS = new Set([
    'alias',
    'and',
    'begin',
    'break',
    'case',
    'class',
    'def',
    'defined?',
    'do',
    'else',
    'elsif',
    'end',
    'ensure',
    'for',
    'if',
    'in',
    'module',
    'next',
    'not',
    'or',
    'redo',
    'rescue',
    'retry',
    'return',
    'self',
    'super',
    'then',
    'unless',
    'until',
    'when',
    'while',
    'yield',
    'raise',
    'require',
    'include',
    'extend',
    'attr_reader',
    'attr_writer',
    'attr_accessor',
    'puts',
    'print',
]);

const LANG_RUBY = defineLang({
    comments: [HASH_COMMENT],
    strings: [DOUBLE_STRING, SINGLE_STRING],
    keywords: RUBY_KEYWORDS,
    constants: new Set(['true', 'false', 'nil']),
});

// ── Shell / Bash ─────────────────────────────────

const SH_KEYWORDS = new Set([
    'if',
    'then',
    'else',
    'elif',
    'fi',
    'case',
    'esac',
    'for',
    'while',
    'until',
    'do',
    'done',
    'in',
    'function',
    'select',
    'return',
    'exit',
    'export',
    'local',
    'readonly',
    'declare',
    'typeset',
    'unset',
    'shift',
    'source',
    'echo',
    'printf',
    'read',
    'eval',
    'exec',
    'set',
    'trap',
    'cd',
    'test',
]);

const LANG_SHELL = defineLang({
    comments: [HASH_COMMENT],
    strings: [DOUBLE_STRING, SINGLE_STRING],
    keywords: SH_KEYWORDS,
    constants: new Set(),
});

// ── SQL ──────────────────────────────────────────

const SQL_KEYWORDS = new Set(
    [
        'select',
        'from',
        'where',
        'and',
        'or',
        'not',
        'in',
        'is',
        'null',
        'insert',
        'into',
        'values',
        'update',
        'set',
        'delete',
        'create',
        'alter',
        'drop',
        'table',
        'index',
        'view',
        'database',
        'schema',
        'grant',
        'revoke',
        'join',
        'inner',
        'outer',
        'left',
        'right',
        'cross',
        'on',
        'as',
        'order',
        'by',
        'group',
        'having',
        'limit',
        'offset',
        'union',
        'all',
        'distinct',
        'between',
        'like',
        'exists',
        'case',
        'when',
        'then',
        'else',
        'end',
        'begin',
        'commit',
        'rollback',
        'primary',
        'key',
        'foreign',
        'references',
        'constraint',
        'default',
        'check',
        'unique',
        'asc',
        'desc',
        'count',
        'sum',
        'avg',
        'min',
        'max',
        'if',
        'declare',
        'cursor',
        'fetch',
        'open',
        'close',
        'with',
        'recursive',
        'temporary',
        'trigger',
        'procedure',
        'function',
        'returns',
        'return',
    ].map((k) => k.toUpperCase()),
);

const SQL_TYPES = new Set([
    'INT',
    'INTEGER',
    'BIGINT',
    'SMALLINT',
    'TINYINT',
    'FLOAT',
    'DOUBLE',
    'DECIMAL',
    'NUMERIC',
    'REAL',
    'BOOLEAN',
    'BOOL',
    'CHAR',
    'VARCHAR',
    'TEXT',
    'BLOB',
    'DATE',
    'TIME',
    'DATETIME',
    'TIMESTAMP',
    'SERIAL',
]);

const LANG_SQL = defineLang({
    comments: [BLOCK_COMMENT, DASH_COMMENT],
    strings: [SINGLE_STRING],
    keywords: SQL_KEYWORDS,
    types: SQL_TYPES,
    constants: new Set(['TRUE', 'FALSE', 'NULL']),
});

// ── PHP ──────────────────────────────────────────

const PHP_KEYWORDS = new Set([
    'abstract',
    'and',
    'array',
    'as',
    'break',
    'callable',
    'case',
    'catch',
    'class',
    'clone',
    'const',
    'continue',
    'declare',
    'default',
    'die',
    'do',
    'echo',
    'else',
    'elseif',
    'empty',
    'enddeclare',
    'endfor',
    'endforeach',
    'endif',
    'endswitch',
    'endwhile',
    'eval',
    'exit',
    'extends',
    'final',
    'finally',
    'fn',
    'for',
    'foreach',
    'function',
    'global',
    'goto',
    'if',
    'implements',
    'include',
    'include_once',
    'instanceof',
    'insteadof',
    'interface',
    'isset',
    'list',
    'match',
    'namespace',
    'new',
    'or',
    'print',
    'private',
    'protected',
    'public',
    'readonly',
    'require',
    'require_once',
    'return',
    'static',
    'switch',
    'throw',
    'trait',
    'try',
    'unset',
    'use',
    'var',
    'while',
    'xor',
    'yield',
]);

const LANG_PHP = defineLang({
    comments: [BLOCK_COMMENT, LINE_COMMENT, HASH_COMMENT],
    strings: [DOUBLE_STRING, SINGLE_STRING],
    keywords: PHP_KEYWORDS,
    constants: new Set(['true', 'false', 'null', 'TRUE', 'FALSE', 'NULL']),
});

// ── Language map ─────────────────────────────────

/** @type {Map<string, LangDef>} */
const LANGUAGES = new Map();

/**
 * Registers a language definition under one or more aliases.
 * @param {LangDef} def
 * @param  {...string} names
 */
function register(def, ...names) {
    for (const name of names) {
        LANGUAGES.set(name.toLowerCase(), def);
    }
}

register(LANG_JS, 'javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx', 'mjs', 'cjs');
register(LANG_PYTHON, 'python', 'py');
register(LANG_HTML, 'html', 'xml', 'svg', 'htm');
register(LANG_CSS, 'css', 'scss', 'less');
register(LANG_JSON, 'json', 'jsonc');
register(LANG_C, 'c', 'cpp', 'c++', 'cc', 'cxx', 'h', 'hpp', 'cs', 'csharp');
register(LANG_JAVA, 'java');
register(LANG_RUST, 'rust', 'rs');
register(LANG_GO, 'go', 'golang');
register(LANG_RUBY, 'ruby', 'rb');
register(LANG_SHELL, 'bash', 'sh', 'shell', 'zsh', 'fish');
register(LANG_SQL, 'sql', 'mysql', 'postgresql', 'sqlite');
register(LANG_PHP, 'php');

// ────────────────────────────────────────────────
//  Tokeniser
// ────────────────────────────────────────────────

/**
 * Attempts to match a sticky regex at the given position.
 * @param {RegExp} pattern
 * @param {string} code
 * @param {number} pos
 * @returns {string|null}
 */
function tryMatch(pattern, code, pos) {
    pattern.lastIndex = pos;
    const m = pattern.exec(code);
    return m ? m[0] : null;
}

/**
 * Tokenises HTML/XML using a simple state machine.
 * @param {string} code
 * @param {LangDef} lang
 * @returns {Array<{type: TokenType, text: string}>}
 */
function tokeniseHTML(code, lang) {
    /** @type {Array<{type: TokenType, text: string}>} */
    const tokens = [];
    let pos = 0;

    while (pos < code.length) {
        // Whitespace
        let text = tryMatch(WHITESPACE, code, pos);
        if (text) {
            tokens.push({ type: 'text', text });
            pos += text.length;
            continue;
        }

        // Comments
        text = tryMatch(HTML_COMMENT, code, pos);
        if (text) {
            tokens.push({ type: 'comment', text });
            pos += text.length;
            continue;
        }

        // Opening/closing tags
        text = tryMatch(HTML_TAG, code, pos);
        if (text) {
            tokens.push({ type: 'tag', text });
            pos += text.length;

            // Inside the tag: match attributes until >
            while (pos < code.length) {
                // Whitespace
                const ws = tryMatch(WHITESPACE, code, pos);
                if (ws) {
                    tokens.push({ type: 'text', text: ws });
                    pos += ws.length;
                    continue;
                }

                // Self-close or close
                const close = tryMatch(HTML_CLOSE_TAG, code, pos);
                if (close) {
                    tokens.push({ type: 'tag', text: close });
                    pos += close.length;
                    break;
                }

                // Attribute name
                const attr = tryMatch(HTML_ATTR_NAME, code, pos);
                if (attr) {
                    tokens.push({ type: 'attribute', text: attr });
                    pos += attr.length;
                    continue;
                }

                // = sign
                if (code[pos] === '=') {
                    tokens.push({ type: 'operator', text: '=' });
                    pos++;
                    continue;
                }

                // Attribute value (string)
                const str =
                    tryMatch(DOUBLE_STRING, code, pos) ?? tryMatch(SINGLE_STRING, code, pos);
                if (str) {
                    tokens.push({ type: 'string', text: str });
                    pos += str.length;
                    continue;
                }

                // Anything else — single char
                tokens.push({ type: 'text', text: code[pos] });
                pos++;
            }
            continue;
        }

        // Strings outside tags
        text = tryMatch(DOUBLE_STRING, code, pos) ?? tryMatch(SINGLE_STRING, code, pos);
        if (text) {
            tokens.push({ type: 'string', text });
            pos += text.length;
            continue;
        }

        // Any other character
        tokens.push({ type: 'text', text: code[pos] });
        pos++;
    }

    return tokens;
}

/**
 * Tokenises JSON with property-key awareness.
 * @param {string} code
 * @param {LangDef} lang
 * @returns {Array<{type: TokenType, text: string}>}
 */
function tokeniseJSON(code, lang) {
    /** @type {Array<{type: TokenType, text: string}>} */
    const tokens = [];
    let pos = 0;

    while (pos < code.length) {
        // Whitespace
        let text = tryMatch(WHITESPACE, code, pos);
        if (text) {
            tokens.push({ type: 'text', text });
            pos += text.length;
            continue;
        }

        // Property key (string followed by colon)
        text = tryMatch(JSON_PROPERTY_KEY, code, pos);
        if (text) {
            tokens.push({ type: 'attribute', text });
            pos += text.length;
            continue;
        }

        // String value
        text = tryMatch(DOUBLE_STRING, code, pos);
        if (text) {
            tokens.push({ type: 'string', text });
            pos += text.length;
            continue;
        }

        // Numbers
        text = tryMatch(NUMBER, code, pos);
        if (text) {
            tokens.push({ type: 'number', text });
            pos += text.length;
            continue;
        }

        // Constants (true, false, null)
        text = tryMatch(IDENT, code, pos);
        if (text) {
            const type = lang.constants.has(text) ? 'constant' : 'text';
            tokens.push({ type, text });
            pos += text.length;
            continue;
        }

        // Punctuation
        text = tryMatch(PUNCTUATION, code, pos);
        if (text) {
            tokens.push({ type: 'punctuation', text });
            pos += text.length;
            continue;
        }

        // Anything else
        tokens.push({ type: 'text', text: code[pos] });
        pos++;
    }

    return tokens;
}

/**
 * Generic tokeniser for C-family and similar languages.
 * @param {string} code
 * @param {LangDef} lang
 * @returns {Array<{type: TokenType, text: string}>}
 */
function tokeniseGeneric(code, lang) {
    /** @type {Array<{type: TokenType, text: string}>} */
    const tokens = [];
    let pos = 0;

    /** Whether SQL-style case-insensitive keyword matching is needed. */
    const caseInsensitive = lang === LANG_SQL;

    while (pos < code.length) {
        let matched = false;

        // Whitespace
        let text = tryMatch(WHITESPACE, code, pos);
        if (text) {
            tokens.push({ type: 'text', text });
            pos += text.length;
            continue;
        }

        // Comments (try each comment pattern)
        for (const cp of lang.comments) {
            text = tryMatch(cp, code, pos);
            if (text) {
                tokens.push({ type: 'comment', text });
                pos += text.length;
                matched = true;
                break;
            }
        }
        if (matched) continue;

        // Extra pattern (decorators, at-rules, etc.)
        if (lang.extraBefore) {
            text = tryMatch(lang.extraBefore, code, pos);
            if (text) {
                tokens.push({ type: /** @type {TokenType} */ (lang.extraBeforeType), text });
                pos += text.length;
                continue;
            }
        }

        // Strings (try each string pattern)
        for (const sp of lang.strings) {
            text = tryMatch(sp, code, pos);
            if (text) {
                tokens.push({ type: 'string', text });
                pos += text.length;
                matched = true;
                break;
            }
        }
        if (matched) continue;

        // Numbers
        text = tryMatch(NUMBER, code, pos);
        if (text) {
            tokens.push({ type: 'number', text });
            pos += text.length;
            continue;
        }

        // Identifiers — classified as keyword, type, constant, or function
        text = tryMatch(IDENT, code, pos);
        if (text) {
            const lookup = caseInsensitive ? text.toUpperCase() : text;
            /** @type {TokenType} */
            let type = 'text';
            if (lang.keywords.has(lookup)) {
                type = 'keyword';
            } else if (lang.types.has(lookup)) {
                type = 'type';
            } else if (lang.constants.has(lookup)) {
                type = 'constant';
            } else {
                // Heuristic: identifier followed by '(' is a function call
                const next = code[pos + text.length];
                if (next === '(') {
                    type = 'function';
                }
            }
            tokens.push({ type, text });
            pos += text.length;
            continue;
        }

        // Operators
        text = tryMatch(OPERATOR, code, pos);
        if (text) {
            tokens.push({ type: 'operator', text });
            pos += text.length;
            continue;
        }

        // Punctuation
        text = tryMatch(PUNCTUATION, code, pos);
        if (text) {
            tokens.push({ type: 'punctuation', text });
            pos += text.length;
            continue;
        }

        // Catch-all
        text = tryMatch(CATCH_ALL, code, pos);
        if (text) {
            tokens.push({ type: 'text', text });
            pos += text.length;
            continue;
        }

        // Safety: advance at least one character
        pos++;
    }

    return tokens;
}

// ────────────────────────────────────────────────
//  Public API
// ────────────────────────────────────────────────

/**
 * Highlights source code and returns a DocumentFragment containing
 * `<span class="sh-{tokenType}">` elements and plain text nodes.
 *
 * If the language is not recognised the content is returned as a
 * single text node (no highlighting).
 *
 * @param {string} code     - The source code to highlight
 * @param {string} language - The language identifier (e.g. 'js', 'python')
 * @returns {DocumentFragment}
 */
export function highlight(code, language) {
    const fragment = document.createDocumentFragment();

    if (!code) {
        fragment.appendChild(document.createTextNode(''));
        return fragment;
    }

    const lang = LANGUAGES.get(language.toLowerCase());

    if (!lang) {
        // Unknown language — return plain text
        fragment.appendChild(document.createTextNode(code));
        return fragment;
    }

    /** @type {Array<{type: TokenType, text: string}>} */
    let tokens;

    if (lang === LANG_HTML) {
        tokens = tokeniseHTML(code, lang);
    } else if (lang === LANG_JSON) {
        tokens = tokeniseJSON(code, lang);
    } else {
        tokens = tokeniseGeneric(code, lang);
    }

    // Merge consecutive tokens of the same type to reduce DOM nodes
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === 'text') {
            fragment.appendChild(document.createTextNode(token.text));
        } else {
            const span = document.createElement('span');
            span.className = `sh-${token.type}`;
            span.textContent = token.text;
            fragment.appendChild(span);
        }
    }

    return fragment;
}

/**
 * Returns whether the given language identifier is supported.
 * @param {string} language
 * @returns {boolean}
 */
export function isLanguageSupported(language) {
    return LANGUAGES.has(language.toLowerCase());
}
