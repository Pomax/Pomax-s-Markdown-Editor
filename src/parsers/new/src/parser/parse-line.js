/**
 * @fileoverview Synchronous single-line parse entry point.
 *
 * The editor calls `parseLine(text)` on every keystroke to detect
 * implicit type changes (e.g. paragraph → heading when `# ` is typed).
 * The full `DFAParser.parse()` is async (JSDOM), so this provides a
 * synchronous alternative that covers every block type except HTML
 * blocks (which require async body re-parsing).
 *
 * Code fences (```) naturally fall through to paragraph because
 * `parseCodeBlock` requires a NEWLINE after the fence line.
 */

import { tokenize } from './dfa-tokenizer.js';
import { DFAParser } from './dfa-parser.js';

/**
 * Parses a single line of markdown synchronously.
 *
 * @param {string} text — the full markdown line (may include a trailing newline)
 * @returns {import('../syntax-tree/syntax-node.js').SyntaxNode | null}
 *   A single SyntaxNode with the detected type, content, and attributes,
 *   or null if the input is empty.
 */
export function parseLine(text) {
  if (text === '') return null;

  const tokens = tokenize(text);
  const ctx = { tokens, pos: 0, line: 0 };
  const parser = new DFAParser();

  // Skip leading blank lines (shouldn't happen for single-line input,
  // but be defensive).
  while (ctx.pos < tokens.length && tokens[ctx.pos].type === 'NEWLINE') {
    ctx.line++;
    ctx.pos++;
  }

  if (ctx.pos >= tokens.length || tokens[ctx.pos].type === 'EOF') {
    return null;
  }

  const tok = tokens[ctx.pos];

  // ── Heading ─────────────────────────────────────────────────
  if (tok.type === 'HASH') {
    const saved = ctx.pos;
    const node = parser.parseHeading(ctx);
    if (node) return node;
    ctx.pos = saved;
  }

  // ── Code fence (3+ backticks) ──────────────────────────────
  // parseCodeBlock returns null when no NEWLINE follows the fence,
  // so bare ``` falls through to paragraph naturally.
  if (
    tok.type === 'BACKTICK' &&
    parser.lookType(ctx, 1) === 'BACKTICK' &&
    parser.lookType(ctx, 2) === 'BACKTICK'
  ) {
    const saved = ctx.pos;
    const node = parser.parseCodeBlock(ctx);
    if (node) return node;
    ctx.pos = saved;
  }

  // ── Blockquote ──────────────────────────────────────────────
  if (tok.type === 'GT') {
    return parser.parseBlockquote(ctx);
  }

  // ── Unordered list item ─────────────────────────────────────
  if (parser.isUnorderedListStart(ctx)) {
    return parser.parseUnorderedListItem(ctx);
  }

  // ── Ordered list item ───────────────────────────────────────
  if (parser.isOrderedListStart(ctx)) {
    return parser.parseOrderedListItem(ctx);
  }

  // ── Horizontal rule ─────────────────────────────────────────
  if (parser.isHorizontalRule(ctx)) {
    return parser.parseHorizontalRule(ctx);
  }

  // ── Table (starts with PIPE) ────────────────────────────────
  if (tok.type === 'PIPE') {
    return parser.parseTable(ctx);
  }

  // ── Linked image: [![alt](src)](href) ───────────────────────
  if (tok.type === 'LBRACKET' && parser.lookType(ctx, 1) === 'BANG') {
    const saved = ctx.pos;
    const node = parser.tryParseLinkedImage(ctx);
    if (node) return node;
    ctx.pos = saved;
  }

  // ── Image: ![alt](src) ─────────────────────────────────────
  if (tok.type === 'BANG' && parser.lookType(ctx, 1) === 'LBRACKET') {
    const saved = ctx.pos;
    const node = parser.tryParseImage(ctx);
    if (node) return node;
    ctx.pos = saved;
  }

  // ── Default: paragraph ──────────────────────────────────────
  return parser.parseParagraph(ctx);
}
