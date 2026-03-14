/**
 * @fileoverview Validates that spec files follow the required format.
 *
 * Usage:
 *   node verify-spec-files.js ./tests/spec-files
 *
 * Exits with code 0 if all files pass, code 1 if any fail.
 * Outputs nothing on success; logs each failing file with a reason.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = process.argv[2];
if (!dir) {
    console.log(`Usage: node verify-spec-files.js <spec-files-directory>`);
    process.exit(1);
}

const specDir = resolve(dir);
const files = readdirSync(specDir).filter((f) => f.endsWith(`.md`));

if (files.length === 0) {
    console.log(`No .md files found in ${specDir}`);
    process.exit(1);
}

let failures = 0;

for (const file of files) {
    const filePath = join(specDir, file);
    const content = readFileSync(filePath, `utf-8`);
    const errors = validateSpecFile(content);
    if (errors.length > 0) {
        failures++;
        for (const error of errors) {
            console.log(`${file}: ${error}`);
        }
    }
}

if (failures > 0) {
    console.log(`\n${failures} file(s) failed validation.`);
    process.exit(1);
}

/**
 * Validates a spec file's content.
 *
 * @param {string} content
 * @returns {string[]} Array of error messages (empty if valid).
 */
function validateSpecFile(content) {
    let input = content.replace(/\r\n/g, `\n`);

    // Must start with a title heading.
    if (!input.startsWith(`# `)) {
        return [`File must start with a "# title" heading.`];
    }

    // Find the first "# markdown" heading and discard everything before the #.
    const pos = input.indexOf(`\n# markdown`);
    if (pos === -1) {
        return [`No "# markdown" heading found.`];
    }
    input = input.substring(pos + 1);

    // Consume test cases: each is three heading+codeblock sections,
    // then optionally a --- separator before the next case.
    const blockPattern = /^(# [^\n]+)\n\n(`{3,})\n([\s\S]*?)\n\2[ \t]*(?:\n|$)/;
    const errors = [];
    let caseNum = 1;

    while (input.length > 0) {
        input = input.trim();
        if (input.length === 0) break;

        const headings = [];
        for (let i = 0; i < 3; i++) {
            input = input.trim();
            const match = input.match(blockPattern);
            if (!match) break;
            headings.push(match[1]);
            input = input.substring(match[0].length);
        }

        if (headings.length !== 3) {
            errors.push(`Test case ${caseNum}: expected 3 sections but found ${headings.length}.`);
            return errors;
        }

        const expected = [`# markdown`, `# syntax tree`, `# html`];
        for (let i = 0; i < 3; i++) {
            if (headings[i] !== expected[i]) {
                errors.push(`Test case ${caseNum}: section ${i + 1} heading is "${headings[i]}", expected "${expected[i]}".`);
            }
        }

        // Look for --- separator for next test case.
        input = input.trim();
        if (input.startsWith(`---`)) {
            const nlPos = input.indexOf(`\n`);
            input = nlPos === -1 ? `` : input.substring(nlPos + 1);
        }

        caseNum++;
    }

    return errors;
}

/**
 * Validates a single test case. Expects exactly three sections,
 * each: a heading, blank line, and fenced code block closed by the
 * same number of backticks. Headings must be "# markdown",
 * "# syntax tree", and "# html" in that order.
 *
 * @param {string} testCase
 * @param {number} caseNum
 * @returns {string[]}
 */

