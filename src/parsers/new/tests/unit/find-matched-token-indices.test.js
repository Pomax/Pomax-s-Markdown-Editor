/**
 * @fileoverview Unit tests for findMatchedTokenIndices.
 */

// @ts-nocheck — test assertions access optional properties without guards

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  tokenizeInline,
  findMatchedTokenIndices,
} from "../../src/inline-tokenizer.js";

// ── findMatchedTokenIndices ─────────────────────────────────────────

describe("findMatchedTokenIndices", () => {
  it("returns empty set for plain text", () => {
    const tokens = tokenizeInline("hello world");
    const matched = findMatchedTokenIndices(tokens);
    assert.equal(matched.size, 0);
  });

  it("marks matched ** open/close as matched", () => {
    const tokens = tokenizeInline("a **b** c");
    const matched = findMatchedTokenIndices(tokens);
    // tokens: [text, bold-open, text, bold-close, text]
    assert.ok(matched.has(1)); // bold-open
    assert.ok(matched.has(3)); // bold-close
    assert.equal(matched.size, 2);
  });

  it("marks matched * open/close as matched", () => {
    const tokens = tokenizeInline("a *b* c");
    const matched = findMatchedTokenIndices(tokens);
    assert.ok(matched.has(1)); // italic-open
    assert.ok(matched.has(3)); // italic-close
    assert.equal(matched.size, 2);
  });

  it("marks matched *** open/close as matched", () => {
    const tokens = tokenizeInline("a ***b*** c");
    const matched = findMatchedTokenIndices(tokens);
    assert.ok(matched.has(1)); // bold-italic-open
    assert.ok(matched.has(3)); // bold-italic-close
    assert.equal(matched.size, 2);
  });

  it("marks matched ~~ open/close as matched", () => {
    const tokens = tokenizeInline("a ~~b~~ c");
    const matched = findMatchedTokenIndices(tokens);
    assert.ok(matched.has(1)); // strikethrough-open
    assert.ok(matched.has(3)); // strikethrough-close
    assert.equal(matched.size, 2);
  });

  it("marks matched HTML tags as matched", () => {
    const tokens = tokenizeInline("H<sub>2</sub>O");
    const matched = findMatchedTokenIndices(tokens);
    // tokens: [text, html-open, text, html-close, text]
    assert.ok(matched.has(1)); // html-open
    assert.ok(matched.has(3)); // html-close
    assert.equal(matched.size, 2);
  });

  it("marks matched link open/close as matched", () => {
    const tokens = tokenizeInline("[click](https://x.com)");
    const matched = findMatchedTokenIndices(tokens);
    // tokens: [link-open, text, link-close]
    assert.ok(matched.has(0)); // link-open
    assert.ok(matched.has(2)); // link-close
    assert.equal(matched.size, 2);
  });

  it("marks image tokens as matched", () => {
    const tokens = tokenizeInline("see ![photo](./img.png) here");
    const matched = findMatchedTokenIndices(tokens);
    // tokens: [text, image, text]
    assert.ok(matched.has(1)); // image
    assert.equal(matched.size, 1);
  });

  it("returns empty set for unmatched *", () => {
    const tokens = tokenizeInline("this is a *");
    const matched = findMatchedTokenIndices(tokens);
    assert.equal(matched.size, 0);
  });

  it("returns empty set for unmatched ~~", () => {
    const tokens = tokenizeInline("this is a ~~");
    const matched = findMatchedTokenIndices(tokens);
    assert.equal(matched.size, 0);
  });

  it("returns empty set for unmatched <sub>", () => {
    const tokens = tokenizeInline("text <sub>");
    const matched = findMatchedTokenIndices(tokens);
    assert.equal(matched.size, 0);
  });

  it("handles mix of matched and unmatched", () => {
    // **bold** and * — ** pair is matched, lone * is not
    const tokens = tokenizeInline("**bold** and *");
    const matched = findMatchedTokenIndices(tokens);
    // tokens: [bold-open, text, bold-close, text, italic-open]
    assert.ok(matched.has(0)); // bold-open
    assert.ok(matched.has(2)); // bold-close
    assert.ok(!matched.has(4)); // italic-open (unmatched)
    assert.equal(matched.size, 2);
  });

  it("handles nested formatting", () => {
    const tokens = tokenizeInline("**bold *and italic* text**");
    const matched = findMatchedTokenIndices(tokens);
    // All four delimiters should be matched
    const types = tokens.map((t) => t.type);
    const boldOpenIdx = types.indexOf("bold-open");
    const italicOpenIdx = types.indexOf("italic-open");
    const italicCloseIdx = types.indexOf("italic-close");
    const boldCloseIdx = types.indexOf("bold-close");
    assert.ok(matched.has(boldOpenIdx));
    assert.ok(matched.has(italicOpenIdx));
    assert.ok(matched.has(italicCloseIdx));
    assert.ok(matched.has(boldCloseIdx));
    assert.equal(matched.size, 4);
  });

  it("skips code tokens", () => {
    const tokens = tokenizeInline("use `code` here");
    const matched = findMatchedTokenIndices(tokens);
    // code tokens are self-contained, not open/close pairs — skipped
    assert.equal(matched.size, 0);
  });

  it("handles multiple HTML tag pairs", () => {
    const tokens = tokenizeInline("H<sub>2</sub>O and CO<sub>2</sub>");
    const matched = findMatchedTokenIndices(tokens);
    // Two pairs of html-open/html-close
    assert.equal(matched.size, 4);
  });

  it("returns a Set", () => {
    const tokens = tokenizeInline("**bold**");
    const matched = findMatchedTokenIndices(tokens);
    assert.ok(matched instanceof Set);
  });
});
