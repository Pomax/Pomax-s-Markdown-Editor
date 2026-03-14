/**
 * @fileoverview Rewrites single- and double-quoted strings in .js
 * files to use backtick (template literal) syntax instead.
 *
 * Handles:
 *   - Escaped quotes inside strings
 *   - Backticks inside the original string (escapes them as \`)
 *   - Preserves strings that are already template literals
 *   - Skips comments (single-line and block)
 *   - Skips regex literals
 *   - Skips `import … from '…'` specifiers
 *   - Skips `require('…')` specifiers
 *
 * Usage:
 *   node scripts/force-backtick-strings.js [file ...]
 *
 * With no arguments, processes all .js files under SCAN_DIRS.
 * Pass --write to rewrite files in place (default is check-only).
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_DIRS = ["src", "scripts", "new-parser/src", "new-parser/tests", "test"];

const write = process.argv.includes("--write");

/**
 * Converts all single- and double-quoted strings in a source string
 * to backtick-delimited template literals.
 *
 * Leaves template literals, comments, regex literals, and module
 * specifiers (import/require paths) untouched.
 *
 * @param {string} source - The full source text of a JS file.
 * @returns {string} The transformed source text.
 */
function convertStrings(source) {
  const len = source.length;
  let out = "";
  let i = 0;

  while (i < len) {
    const ch = source[i];

    if (ch === "/" && i + 1 < len) {
      const next = source[i + 1];

      if (next === "/") {
        const end = source.indexOf("\n", i);
        if (end === -1) {
          out += source.slice(i);
          break;
        }
        out += source.slice(i, end);
        i = end;
        continue;
      }

      if (next === "*") {
        const end = source.indexOf("*/", i + 2);
        if (end === -1) {
          out += source.slice(i);
          break;
        }
        out += source.slice(i, end + 2);
        i = end + 2;
        continue;
      }

      if (looksLikeRegex(source, i, out)) {
        const result = skipRegex(source, i);
        out += result.text;
        i = result.end;
        continue;
      }
    }

    if (ch === "`") {
      const result = skipTemplateLiteral(source, i);
      out += result.text;
      i = result.end;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const isModuleSpecifier = checkModuleSpecifier(out);
      const result = readQuotedString(source, i, ch);

      if (isModuleSpecifier) {
        out += result.raw;
      } else {
        out += toBacktick(result.body, ch);
      }

      i = result.end;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Reads a single- or double-quoted string starting at position `start`,
 * returning the raw text (including quotes), the inner body, and the
 * position after the closing quote.
 *
 * @param {string} src - Source text.
 * @param {number} start - Index of the opening quote character.
 * @param {string} quote - The quote character (' or ").
 * @returns {{ raw: string, body: string, end: number }}
 */
function readQuotedString(src, start, quote) {
  let i = start + 1;
  let body = "";

  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      body += src[i] + src[i + 1];
      i += 2;
      continue;
    }
    if (ch === quote) {
      return { raw: src.slice(start, i + 1), body, end: i + 1 };
    }
    body += ch;
    i++;
  }

  return { raw: src.slice(start), body, end: src.length };
}

/**
 * Converts an extracted string body to a backtick-delimited template
 * literal. Escapes literal backticks and `${` sequences in the body,
 * and unescapes quote escapes that are no longer needed.
 *
 * @param {string} body - The inner content of the original string (without quotes).
 * @param {string} originalQuote - The original quote character (' or ").
 * @returns {string} The backtick-delimited replacement string.
 */
function toBacktick(body, originalQuote) {
  let converted = "";

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    if (ch === "\\") {
      const next = body[i + 1];

      if (next === originalQuote) {
        converted += next;
        i++;
        continue;
      }

      converted += ch + (next || "");
      i++;
      continue;
    }

    if (ch === "`") {
      converted += "\\`";
      continue;
    }

    if (ch === "$" && body[i + 1] === "{") {
      converted += "\\${";
      i++;
      continue;
    }

    converted += ch;
  }

  return "`" + converted + "`";
}

/**
 * Checks whether the output so far ends with a pattern indicating the
 * next string is a module specifier (import path or require argument).
 *
 * @param {string} preceding - The already-emitted output text.
 * @returns {boolean} True if the next string is a module specifier.
 */
function checkModuleSpecifier(preceding) {
  const trimmed = preceding.trimEnd();
  if (/\bfrom\s*$/.test(trimmed)) return true;
  if (/\brequire\s*\(\s*$/.test(trimmed)) return true;
  if (/\bimport\s*\(\s*$/.test(trimmed)) return true;
  return false;
}

/**
 * Heuristic for whether a `/` at position `i` starts a regex literal
 * rather than a division operator.
 *
 * @param {string} src - Source text.
 * @param {number} i - Index of the `/` character.
 * @param {string} preceding - The already-emitted output text.
 * @returns {boolean} True if this looks like a regex literal.
 */
function looksLikeRegex(src, i, preceding) {
  const before = preceding.trimEnd();
  if (before.length === 0) return true;
  const last = before[before.length - 1];
  return "=(:!&|^~[{,;?+->%*/\n".includes(last);
}

/**
 * Skips over a regex literal starting at position `i`, returning the
 * raw text and the position after the closing delimiter and flags.
 *
 * @param {string} src - Source text.
 * @param {number} start - Index of the opening `/`.
 * @returns {{ text: string, end: number }}
 */
function skipRegex(src, start) {
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "[") {
      while (i < src.length && src[i] !== "]") {
        if (src[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (ch === "/") {
      i++;
      while (i < src.length && /[gimsuy]/.test(src[i])) i++;
      return { text: src.slice(start, i), end: i };
    }
    i++;
  }
  return { text: src.slice(start), end: src.length };
}

/**
 * Skips over a template literal (backtick string) starting at position
 * `i`, including any nested `${…}` expressions that may themselves
 * contain strings or nested template literals.
 *
 * @param {string} src - Source text.
 * @param {number} start - Index of the opening backtick.
 * @returns {{ text: string, end: number }}
 */
function skipTemplateLiteral(src, start) {
  let i = start + 1;
  let depth = 1;

  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") {
      depth--;
      i++;
      continue;
    }
    if (ch === "$" && src[i + 1] === "{") {
      depth++;
      i += 2;
      continue;
    }
    i++;
  }

  return { text: src.slice(start, i), end: i };
}

/**
 * Recursively finds all .js files in a directory, skipping node_modules.
 *
 * @param {string} dir - Absolute path to the directory to scan.
 * @returns {string[]} Absolute paths of all .js files found.
 */
function collectFiles(dir) {
  /** @type {string[]} */
  const files = [];

  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectFiles(full));
    } else if (entry.endsWith(".js")) {
      files.push(full);
    }
  }

  return files;
}

/** @type {string[]} */
let targets = [];

const positionalArgs = process.argv.slice(2).filter((a) => !a.startsWith("--"));

if (positionalArgs.length > 0) {
  targets = positionalArgs;
} else {
  for (const dir of SCAN_DIRS) {
    const full = join(root, dir);
    try {
      statSync(full);
    } catch {
      continue;
    }
    targets.push(...collectFiles(full));
  }
}

let changed = 0;

for (const file of targets) {
  const original = readFileSync(file, "utf-8");
  const converted = convertStrings(original);

  if (converted !== original) {
    changed++;
    const rel = relative(root, file);
    if (write) {
      writeFileSync(file, converted, "utf-8");
      console.log(`  updated: ${rel}`);
    } else {
      console.log(`  needs update: ${rel}`);
    }
  }
}

if (changed === 0) {
  console.log("No strings to convert.");
} else if (write) {
  console.log(`\n${changed} file(s) updated.`);
} else {
  console.log(`\n${changed} file(s) need updating. Run with --write to apply.`);
  process.exit(1);
}
