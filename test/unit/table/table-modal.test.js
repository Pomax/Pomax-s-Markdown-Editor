/**
 * @fileoverview Unit tests for the TableModal static helpers.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { TableModal } from '../../../src/renderer/scripts/table/table-modal.js';

describe('TableModal', () => {
    describe('parseTableContent', () => {
        it('should parse a simple 2-column table', () => {
            const content = '| A | B |\n|---|---|\n| 1 | 2 |';
            const result = TableModal.parseTableContent(content);
            assert.strictEqual(result.columns, 2);
            assert.strictEqual(result.rows, 1);
            assert.deepStrictEqual(result.cells, [
                ['A', 'B'],
                ['1', '2'],
            ]);
        });

        it('should parse a table with multiple body rows', () => {
            const content = '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |';
            const result = TableModal.parseTableContent(content);
            assert.strictEqual(result.columns, 3);
            assert.strictEqual(result.rows, 2);
            assert.deepStrictEqual(result.cells, [
                ['A', 'B', 'C'],
                ['1', '2', '3'],
                ['4', '5', '6'],
            ]);
        });

        it('should handle cells with whitespace padding', () => {
            const content = '| Header 1 | Header 2 |\n| --- | --- |\n|  data  |  more  |';
            const result = TableModal.parseTableContent(content);
            assert.strictEqual(result.columns, 2);
            assert.deepStrictEqual(result.cells[0], ['Header 1', 'Header 2']);
            assert.deepStrictEqual(result.cells[1], ['data', 'more']);
        });

        it('should skip the separator line', () => {
            const content = '| H |\n|---|\n| D |';
            const result = TableModal.parseTableContent(content);
            assert.strictEqual(result.cells.length, 2); // header + 1 body row
        });
    });

    describe('tableDateToMarkdown', () => {
        it('should generate markdown for a simple table', () => {
            /** @type {import('../../../src/renderer/scripts/table/table-modal.js').TableData} */
            const data = {
                rows: 1,
                columns: 2,
                cells: [
                    ['A', 'B'],
                    ['1', '2'],
                ],
            };
            const md = TableModal.tableDateToMarkdown(data);
            assert.ok(md.includes('| A | B |'));
            assert.ok(md.includes('| --- | --- |'));
            assert.ok(md.includes('| 1 | 2 |'));
        });

        it('should include separator after header', () => {
            /** @type {import('../../../src/renderer/scripts/table/table-modal.js').TableData} */
            const data = {
                rows: 1,
                columns: 2,
                cells: [
                    ['X', 'Y'],
                    ['a', 'b'],
                ],
            };
            const md = TableModal.tableDateToMarkdown(data);
            const lines = md.split('\n');
            assert.strictEqual(lines.length, 3); // header, separator, one body row
            assert.ok(lines[1].includes('---'));
        });

        it('should round-trip parse → generate', () => {
            const original = '| H1 | H2 | H3 |\n| --- | --- | --- |\n| a | b | c |\n| d | e | f |';
            const parsed = TableModal.parseTableContent(original);
            const generated = TableModal.tableDateToMarkdown(parsed);
            // Re-parse the generated markdown
            const reparsed = TableModal.parseTableContent(generated);
            assert.deepStrictEqual(reparsed.cells, parsed.cells);
            assert.strictEqual(reparsed.rows, parsed.rows);
            assert.strictEqual(reparsed.columns, parsed.columns);
        });
    });
});
