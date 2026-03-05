/**
 * @fileoverview Spec-file test runner for the parser library.
 *
 * Reads every .md file in tests/spec-files/, parses each test case,
 * and verifies:
 *   1. parse(markdown) produces the expected syntax tree
 *   2. tree.toMarkdown() yields the original markdown
 *   3. tree.toHTML() yields the expected HTML
 *
 * Uses the Node.js native test runner (node:test). The test runner
 * has no knowledge of markdown, syntax trees, or HTML — it simply
 * compares strings from the spec files against strings from the
 * parser API.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { Parser } from '../index.js';
import { serializeTree } from '../src/serialize-tree.js';

const here = dirname(fileURLToPath(import.meta.url));
const specDir = join(here, 'spec-files');
const specFiles = readdirSync(specDir).filter((f) => f.endsWith('.md'));

for (const file of specFiles) {
    const filePath = join(specDir, file);
    const content = readFileSync(filePath, 'utf-8');
    const title = extractTitle(content);
    const testCases = extractTestCases(content);

    describe(`${basename(file, '.md')}: ${title}`, () => {
        testCases.forEach((tc, i) => {
            it(`case ${i + 1}`, async () => {
                const tree = await Parser.parse(tc.markdown);
                assert.equal(serializeTree(tree), tc.syntaxTree, 'syntax tree mismatch');
                assert.equal(tree.toMarkdown(), tc.markdown, 'toMarkdown() round-trip mismatch');
                const html = tree.toHTML();
                const inner = html.replace(/^<div>/, '').replace(/<\/div>$/, '');
                assert.equal(inner, tc.html, 'toHTML() mismatch');
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
    return match ? match[1].trim() : '(untitled)';
}

/**
 * Extracts all test cases from a spec file.
 * Works on the raw string, splitting on --- separators.
 *
 * @param {string} content
 * @returns {{ markdown: string, syntaxTree: string, html: string }[]}
 */
function extractTestCases(content) {
    let input = content.replace(/\r\n/g, '\n');

    // Find the first "# markdown" and discard everything before the #.
    const pos = input.indexOf('\n# markdown');
    if (pos === -1) return [];
    input = input.substring(pos + 1);

    // Split on --- separators to get individual test case strings.
    const cases = [];
    while (input.length > 0) {
        let testCase;
        const sepPos = input.indexOf('\n---\n');
        if (sepPos === -1) {
            testCase = input.trim();
            input = '';
        } else {
            testCase = input.substring(0, sepPos).trim();
            input = input.substring(sepPos + 5);
        }

        if (testCase.length > 0) {
            cases.push(parseTestCase(testCase));
        }
    }

    return cases;
}

/**
 * Parses a single test case string into structured data by extracting
 * the fenced code block content after each heading using regex.
 *
 * @param {string} testCase
 * @returns {{ markdown: string, syntaxTree: string, html: string }}
 */
function parseTestCase(testCase) {
    const blockPattern = /^# [^\n]+\n\n(`{3,})\n([\s\S]*?)\n\1[ \t]*(?:\n|$)/;
    const result = { markdown: '', syntaxTree: '', html: '' };
    const keys = ['markdown', 'syntaxTree', 'html'];
    let remaining = testCase;

    for (const key of keys) {
        remaining = remaining.trim();
        const match = remaining.match(blockPattern);
        if (!match) break;
        result[key] = match[2];
        remaining = remaining.substring(match[0].length);
    }

    return result;
}
