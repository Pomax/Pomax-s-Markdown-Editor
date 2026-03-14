/**
 * @fileoverview Spec-file test runner for the parser library.
 *
 * Reads every .md file in tests/spec-files/, parses each test case,
 * and verifies:
 *   1. parse(markdown) produces the expected syntax tree
 *   2. tree.toMarkdown() yields the original markdown
 *   3. tree.toHTML() yields the expected HTML
 *   4. toDOM() produces correct bidirectional SyntaxNode ↔ DOM links
 *
 * Uses the Node.js native test runner (node:test). The test runner
 * has no knowledge of markdown, syntax trees, or HTML — it simply
 * compares strings from the spec files against strings from the
 * parser API.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { JSDOM } from "jsdom";

import { Parser } from "../../index.js";
import { renderTreeToText } from "../../src/formats/index.js";


/**
 * Normalizes an HTML string by parsing it through JSDOM, removing
 * insignificant whitespace-only text nodes between elements, and
 * re-serializing.
 * @param {string} html
 * @returns {string}
 */
function normalizeHTML(html) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const body = dom.window.document.body;
  stripWhitespaceNodes(body);
  return body.innerHTML.trim();
}

/**
 * Recursively removes whitespace-only text nodes from a DOM tree
 * and collapses formatting whitespace (containing newlines) in
 * remaining text nodes.
 * @param {Node} node
 */
function stripWhitespaceNodes(node) {
  const toRemove = [];
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      if (child.textContent.trim() === ``) {
        toRemove.push(child);
      } else if (child.textContent.includes(`\n`)) {
        child.textContent = child.textContent.replace(/^\s*\n\s*/, ``).replace(/\s*\n\s*$/, ``);
      }
    } else if (child.nodeType === 1) {
      stripWhitespaceNodes(child);
    }
  }
  for (const n of toRemove) n.remove();
}

const here = dirname(fileURLToPath(import.meta.url));
const specDir = join(here, `spec-files`);

// ── Bidirectional-link verification ─────────────────────────────────

/**
 * Walks a SyntaxTree / SyntaxNode hierarchy and asserts that every
 * node whose `domNode` was set by the renderer points back correctly,
 * and vice-versa.
 *
 * @param {object} tree  - A SyntaxTree (has .children)
 * @param {Element} dom  - The root DOM element returned by toDOM()
 */
function verifyBidirectionalLinks(tree, dom) {
  // 1. Walk every SyntaxNode: if domNode is set, the DOM element
  //    must point back to the same node.
  const visitedNodes = new Set();
  function walkNode(node) {
    if (visitedNodes.has(node)) return;
    visitedNodes.add(node);
    if (node.domNode != null) {
      assert.strictEqual(
        node.domNode.__st_node,
        node,
        `node (${node.type}) .domNode.__st_node doesn't point back to the node`
      );
    }
    if (node.children) {
      for (const child of node.children) walkNode(child);
    }
  }
  for (const child of tree.children) walkNode(child);

  // 2. Walk every DOM element: if __st_node is set, the SyntaxNode
  //    must point back to the same DOM element.
  function walkDOM(el) {
    if (el.__st_node != null) {
      assert.strictEqual(
        el.__st_node.domNode,
        el,
        `DOM <${el.tagName?.toLowerCase()}> .__st_node.domNode doesn't point back to the element`
      );
    }
    if (el.children) {
      for (const child of el.children) walkDOM(child);
    }
  }
  walkDOM(dom);
}

const filterFile = process.argv[2] || null;
const filterCase = process.argv[3] ? Number(process.argv[3]) : null;

let specFiles = readdirSync(specDir).filter((f) => f.endsWith(`.md`));
if (filterFile) {
  const target = filterFile.endsWith(`.md`) ? filterFile : `${filterFile}.md`;
  specFiles = specFiles.filter((f) => f === target);
  if (specFiles.length === 0) {
    console.log(`No spec file found matching "${filterFile}".`);
    process.exit(1);
  }
}

for (const file of specFiles) {
  const filePath = join(specDir, file);
  const content = readFileSync(filePath, `utf-8`);
  const title = extractTitle(content);
  const testCases = extractTestCases(content);

  describe(`${basename(file, `.md`)}: ${title}`, () => {
    testCases.forEach((testCase, i) => {
      if (filterCase !== null && i + 1 !== filterCase) return;
      const { markdown, syntaxTree, html } = testCase;
      it(`case ${i + 1}`, async () => {
        const tree = await Parser.parse(markdown);
        assert.equal(renderTreeToText(tree), syntaxTree, `syntax tree mismatch`);

        const roundTrip = tree.toMarkdown();
        assert.equal(roundTrip, markdown, `toMarkdown() round-trip mismatch`);

        const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
        const domDoc = dom.window.document;
        const domTree = tree.toDOM(domDoc);
        assert.equal(domTree.outerHTML.trim(), `<div>${normalizeHTML(html)}</div>`, `toHTML() mismatch`);
        verifyBidirectionalLinks(tree, domTree);
      });
    });
  });
}

/**
 * Extracts the title from the first heading in a spec file.
 * @param {string} content
 * @returns {string}
 */
function extractTitle(content) {
  const match = content.match(/^# (.+)$/m);
  return match ? match[1].trim() : `(untitled)`;
}

/**
 * Extracts all test cases from a spec file.
 * Works on the raw string, splitting on --- separators.
 *
 * @param {string} content
 * @returns {{ markdown: string, syntaxTree: string, html: string }[]}
 */
function extractTestCases(content) {
  let input = content.replace(/\r\n/g, `\n`);

  // Find the first "# markdown" and discard everything before the #.
  const pos = input.indexOf(`\n# markdown`);
  if (pos === -1) return [];
  input = input.substring(pos + 1);

  // Consume test cases: each is three heading+codeblock sections,
  // then optionally a --- separator before the next case.
  const blockPattern = /^# [^\n]+\n\n(`{3,})\n([\s\S]*?)\1[ \t]*(?:\n|$)/;
  const cases = [];
  const keys = [`markdown`, `syntaxTree`, `html`];

  while (input.length > 0) {
    input = input.trim();
    if (input.length === 0) break;

    const result = { markdown: ``, syntaxTree: ``, html: `` };
    for (const key of keys) {
      input = input.trim();
      const match = input.match(blockPattern);
      if (!match) break;
      result[key] = match[2];
      input = input.substring(match[0].length);
    }
    cases.push(result);

    // Skip --- separator if present.
    input = input.trim();
    if (input.startsWith(`---`)) {
      const nlPos = input.indexOf(`\n`);
      input = nlPos === -1 ? `` : input.substring(nlPos + 1);
    }
  }

  return cases;
}
