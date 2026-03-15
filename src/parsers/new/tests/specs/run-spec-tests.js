/**
 * @fileoverview Spec-file test runner for the parser library.
 *
 * Reads every .md file in tests/spec-files/, parses each test case,
 * and verifies:
 *   1. parse(markdown) produces the expected syntax tree
 *   2. tree.toMarkdown() yields the original markdown
 *   3. tree.toHTML() yields the expected HTML
 *   4. toDOM() produces correct bidirectional SyntaxNode ↔ DOM links
 *   5. toggleView() on each block element produces correct markdown
 *
 * Uses the Node.js native test runner (node:test). The test runner
 * has no knowledge of markdown, syntax trees, or HTML — it simply
 * compares strings from the spec files against strings from the
 * parser API.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../../src/index.js';
import { renderNodeToMarkdown } from '../../src/renderers/markdown.js';
import { JSDOM } from 'jsdom';
import { SyntaxTree } from '../../index.js';

const here = dirname(fileURLToPath(import.meta.url));
const specDir = join(here, `files`);
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
        const tree = await parse(markdown);

        // Compare the rendered tree text to the expected syntax tree.
        assert.equal(tree.toString(), syntaxTree, `syntax tree mismatch`);

        // Verify that toMarkdown() round-trips back to the original markdown.
        const roundTrip = await tree.toMarkdown();
        assert.equal(roundTrip, markdown, `toMarkdown() round-trip mismatch`);

        // Verify that toHTML() matches the expected HTML (after normalization).
        const domTree = await tree.toDOM();
        assert.equal(
          domTree.outerHTML.trim(),
          `<div>${normalizeHTML(html)}</div>`,
          `toHTML() mismatch`,
        );

        // Verify that the bidirectional links between SyntaxNodes and DOM elements are correct.
        verifyBidirectionalLinks(tree, domTree);

        // Verify that toggleView() on each block element produces correct markdown content.
        verifyToggleView(tree, domTree);
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
      /** @type {Record<string, string>} */ (result)[key] = match[2];
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

/**
 * Normalizes an HTML string by parsing it through JSDOM, removing
 * insignificant whitespace-only text nodes between elements, and
 * re-serializing.
 * @param {string} html
 * @returns {string}
 */
function normalizeHTML(html) {
  // JSDOM's HTML parser eats the first newline inside <textarea> (per spec).
  // Double it so the expected content survives parsing.
  html = html.replace(/<textarea([^>]*)>\n/g, `<textarea$1>\n\n`);
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const body = dom.window.document.body;
  stripWhitespaceNodes(body);
  return body.innerHTML.trim();
}

/**
 * Recursively removes whitespace-only text nodes from a DOM tree
 * and collapses formatting whitespace (containing newlines) in
 * remaining text nodes. Skips raw content elements (script, style,
 * textarea) whose whitespace is significant.
 * @param {Node} node
 */
const RAW_CONTENT_ELEMENTS = new Set([`SCRIPT`, `STYLE`, `TEXTAREA`]);
/** @param {Node} node */
function stripWhitespaceNodes(node) {
  if (RAW_CONTENT_ELEMENTS.has(node.nodeName)) return;
  const toRemove = [];
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      if (/** @type {string} */ (child.textContent).trim() === ``) {
        toRemove.push(child);
      } else if (/** @type {string} */ (child.textContent).includes(`\n`)) {
        child.textContent = /** @type {string} */ (child.textContent)
          .replace(/^\s*\n\s*/, ``)
          .replace(/\s*\n\s*$/, ``);
      }
    } else if (child.nodeType === 1) {
      stripWhitespaceNodes(child);
    }
  }
  for (const n of toRemove) n.remove();
}

/**
 * Walks a SyntaxTree / SyntaxNode hierarchy and asserts that every
 * node whose `domNode` was set by the renderer points back correctly,
 * and vice-versa.
 *
 * @param {SyntaxTree} tree  - A SyntaxTree (has .children)
 * @param {Element} dom  - The root DOM element returned by toDOM()
 */
function verifyBidirectionalLinks(tree, dom) {
  // Walk every SyntaxNode: if domNode is set, the DOM element
  // must point back to the same node.
  const visitedNodes = new Set();
  /** @param {import('../../src/syntax-tree/syntax-node.js').SyntaxNode} node */
  function walkNode(node) {
    if (visitedNodes.has(node)) return;
    visitedNodes.add(node);
    if (node.domNode != null) {
      assert.strictEqual(
        // @ts-ignore – dynamically attached
        node.domNode.__st_node,
        node,
        `node (${node.type}) .domNode.__st_node doesn't point back to the node`,
      );
    }
    if (node.children) {
      for (const child of node.children) walkNode(child);
    }
  }
  for (const child of tree.children) walkNode(child);

  // Walk every DOM element: if __st_node is set, the SyntaxNode
  // must point back to the same DOM element.
  /** @param {Element} element */
  function walkDOM(element) {
    // @ts-ignore – dynamically attached
    if (element.__st_node != null) {
      assert.strictEqual(
        // @ts-ignore – dynamically attached
        element.__st_node.domNode,
        element,
        `DOM <${element.tagName?.toLowerCase()}> .__st_node.domNode doesn't point back to the element`,
      );
    }
    if (element.children) {
      for (const child of element.children) walkDOM(child);
    }
  }
  walkDOM(dom);
}

/**
 * Walks every block-level DOM element in the rendered tree and verifies
 * that calling toggleView() produces a contenteditable div whose text
 * content matches the node's markdown serialization, then toggles back
 * and checks the original element is restored with correct links.
 *
 * @param {SyntaxTree} tree  - A SyntaxTree (has .children)
 * @param {Element} dom  - The root DOM element returned by toDOM()
 */
function verifyToggleView(tree, dom) {
  // Collect every block-level element that has a toggleView function.
  /** @type {Element[]} */
  const elements = [];
  /** @param {Element} parent */
  function collect(parent) {
    for (const child of parent.children) {
      // @ts-ignore – dynamically attached
      if (typeof child.toggleView === `function`) {
        elements.push(child);
      }
      collect(child);
    }
  }
  collect(dom);

  for (const element of elements) {
    // @ts-ignore – dynamically attached
    const syntaxNode = element.__st_node;
    assert.ok(syntaxNode, `element <${element.tagName.toLowerCase()}> has no __st_node`);

    const expectedMarkdown = renderNodeToMarkdown(syntaxNode);
    const parentElement = /** @type {Node} */ (element.parentNode);

    // Toggle to edit view.
    // @ts-ignore – dynamically attached
    element.toggleView();

    // The element should have been replaced in its parent.
    const editDiv = syntaxNode.domNode;
    assert.ok(editDiv, `after toggleView(), syntaxNode.domNode should be the edit div`);
    assert.strictEqual(
      editDiv.getAttribute(`contenteditable`),
      `true`,
      `edit div should be contenteditable`,
    );
    assert.strictEqual(
      editDiv.textContent,
      expectedMarkdown,
      `edit div content should match renderNodeToMarkdown() for ${syntaxNode.type}`,
    );
    assert.strictEqual(
      // @ts-ignore – dynamically attached
      editDiv.__st_node,
      syntaxNode,
      `edit div __st_node should reference the syntax node`,
    );
    assert.ok(parentElement.contains(editDiv), `parent should contain the edit div after toggle`);
    assert.ok(
      !parentElement.contains(element),
      `parent should no longer contain the original element after toggle`,
    );

    // Toggle back to rendered view.
    // @ts-ignore – dynamically attached
    editDiv.toggleView();

    assert.strictEqual(
      syntaxNode.domNode,
      element,
      `after toggling back, syntaxNode.domNode should be the original element`,
    );
    assert.strictEqual(
      // @ts-ignore – dynamically attached
      element.__st_node,
      syntaxNode,
      `after toggling back, element.__st_node should reference the syntax node`,
    );
    assert.ok(
      parentElement.contains(element),
      `parent should contain the original element after toggling back`,
    );
  }
}
