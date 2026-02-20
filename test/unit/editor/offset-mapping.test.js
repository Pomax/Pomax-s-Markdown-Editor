/**
 * @fileoverview Unit tests for offset-mapping between raw markdown and
 * rendered (visible) text.
 *
 * These tests verify that rawOffsetToRenderedOffset and
 * renderedOffsetToRawOffset correctly handle both matched (invisible)
 * and unmatched (visible) inline delimiters.
 */

// @ts-nocheck — test assertions access optional properties without guards

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    rawOffsetToRenderedOffset,
    renderedOffsetToRawOffset,
} from '../../../src/renderer/scripts/editor/offset-mapping.js';

// ── rawOffsetToRenderedOffset ───────────────────────────────────────

describe('rawOffsetToRenderedOffset', () => {
    it('returns 0 for empty content', () => {
        assert.equal(rawOffsetToRenderedOffset('', 5), 0);
    });

    it('returns identity for plain text', () => {
        assert.equal(rawOffsetToRenderedOffset('hello world', 5), 5);
        assert.equal(rawOffsetToRenderedOffset('hello world', 11), 11);
    });

    it('skips matched bold delimiters', () => {
        // "a **b** c" — rendered as "a b c"
        // raw:      a _ * * b * * _ c
        // indices:  0 1 2 3 4 5 6 7 8
        // rendered: a _ b _ c
        // indices:  0 1 2 3 4
        const content = 'a **b** c';
        assert.equal(rawOffsetToRenderedOffset(content, 0), 0); // before 'a'
        assert.equal(rawOffsetToRenderedOffset(content, 2), 2); // at '**' open
        assert.equal(rawOffsetToRenderedOffset(content, 4), 2); // at 'b'
        assert.equal(rawOffsetToRenderedOffset(content, 5), 3); // after 'b', at '**' close
        assert.equal(rawOffsetToRenderedOffset(content, 7), 3); // after '**' close
        assert.equal(rawOffsetToRenderedOffset(content, 9), 5); // end
    });

    it('skips matched italic delimiters', () => {
        // "a *b* c" — rendered as "a b c"
        const content = 'a *b* c';
        assert.equal(rawOffsetToRenderedOffset(content, 2), 2); // at '*' open
        assert.equal(rawOffsetToRenderedOffset(content, 3), 2); // at 'b'
        assert.equal(rawOffsetToRenderedOffset(content, 4), 3); // at '*' close
        assert.equal(rawOffsetToRenderedOffset(content, 5), 3); // after '*' close
    });

    it('treats unmatched * as visible text', () => {
        // "this is a *" — the lone * is unmatched → visible
        const content = 'this is a *';
        // raw offset 10 = the '*', raw offset 11 = end
        // rendered should be same as raw since '*' is visible
        assert.equal(rawOffsetToRenderedOffset(content, 10), 10);
        assert.equal(rawOffsetToRenderedOffset(content, 11), 11);
    });

    it('treats unmatched _ as visible text', () => {
        const content = 'this is a _';
        assert.equal(rawOffsetToRenderedOffset(content, 10), 10);
        assert.equal(rawOffsetToRenderedOffset(content, 11), 11);
    });

    it('treats unmatched ~~ as visible text', () => {
        const content = 'this is a ~~';
        assert.equal(rawOffsetToRenderedOffset(content, 10), 10);
        assert.equal(rawOffsetToRenderedOffset(content, 11), 11);
        assert.equal(rawOffsetToRenderedOffset(content, 12), 12);
    });

    it('treats unmatched <sub> as visible text', () => {
        const content = 'text <sub>';
        // <sub> is unmatched (no </sub>) → visible
        assert.equal(rawOffsetToRenderedOffset(content, 5), 5);
        assert.equal(rawOffsetToRenderedOffset(content, 10), 10);
    });

    it('skips matched HTML tags', () => {
        // "H<sub>2</sub>O" — rendered as "H2O"
        const content = 'H<sub>2</sub>O';
        assert.equal(rawOffsetToRenderedOffset(content, 0), 0); // 'H'
        assert.equal(rawOffsetToRenderedOffset(content, 1), 1); // at '<sub>'
        assert.equal(rawOffsetToRenderedOffset(content, 6), 1); // at '2'
        assert.equal(rawOffsetToRenderedOffset(content, 7), 2); // at '</sub>'
        assert.equal(rawOffsetToRenderedOffset(content, 13), 2); // at 'O'
        assert.equal(rawOffsetToRenderedOffset(content, 14), 3); // end
    });

    it('handles code spans correctly', () => {
        // "a `code` b" — backticks invisible, code content visible
        const content = 'a `code` b';
        assert.equal(rawOffsetToRenderedOffset(content, 2), 2); // at opening `
        assert.equal(rawOffsetToRenderedOffset(content, 3), 2); // at 'c' in code
        assert.equal(rawOffsetToRenderedOffset(content, 7), 6); // at closing `
        assert.equal(rawOffsetToRenderedOffset(content, 8), 6); // after closing `
    });

    it('handles mixed matched and unmatched delimiters', () => {
        // "**bold** and *" — ** matched, trailing * unmatched
        const content = '**bold** and *';
        // rendered: "bold and *"
        // raw:  ** b o l d ** _ a n d _ *
        //       01 2 3 4 5 67 8 9 ...    13
        // rend:    b o l d    _ a n d _ *
        //          0 1 2 3    4 5 6 7 8 9
        assert.equal(rawOffsetToRenderedOffset(content, 2), 0); // at 'b'
        assert.equal(rawOffsetToRenderedOffset(content, 6), 4); // after 'd'
        assert.equal(rawOffsetToRenderedOffset(content, 13), 9); // at unmatched '*'
        assert.equal(rawOffsetToRenderedOffset(content, 14), 10); // end
    });

    it('handles inline image — entire syntax maps to 1 rendered unit', () => {
        // "hello ![alt](url) world"
        // raw:    h e l l o   ! [ a l t ] ( u r l )   w o r l d
        //         0 1 2 3 4 5 6 7 8 9 ...            17 ...
        // rendered: "hello X world" (X = image, 1 unit)
        //            0 1 2 3 4 5 6 7 8 9 10 11 12
        const content = 'hello ![alt](url) world';
        assert.equal(rawOffsetToRenderedOffset(content, 5), 5); // after 'o', at space
        assert.equal(rawOffsetToRenderedOffset(content, 6), 6); // at '!' — maps to before image
        assert.equal(rawOffsetToRenderedOffset(content, 10), 6); // inside image syntax
        assert.equal(rawOffsetToRenderedOffset(content, 17), 7); // after ')' — after image
        assert.equal(rawOffsetToRenderedOffset(content, 23), 13); // end
    });
});

// ── renderedOffsetToRawOffset ───────────────────────────────────────

describe('renderedOffsetToRawOffset', () => {
    it('returns 0 for empty content', () => {
        assert.equal(renderedOffsetToRawOffset('', 5), 0);
    });

    it('returns identity for plain text', () => {
        assert.equal(renderedOffsetToRawOffset('hello world', 5), 5);
    });

    it('accounts for matched bold delimiters', () => {
        // "a **b** c" — rendered as "a b c"
        // At rendered boundaries the function returns the earliest raw
        // position, which sits just before the invisible delimiter.
        const content = 'a **b** c';
        assert.equal(renderedOffsetToRawOffset(content, 0), 0); // 'a'
        assert.equal(renderedOffsetToRawOffset(content, 2), 2); // end of "a ", before **
        assert.equal(renderedOffsetToRawOffset(content, 3), 5); // after 'b', before closing **
    });

    it('treats unmatched * as visible text', () => {
        // "this is a *" — the lone * is unmatched → visible
        const content = 'this is a *';
        assert.equal(renderedOffsetToRawOffset(content, 10), 10);
        assert.equal(renderedOffsetToRawOffset(content, 11), 11);
    });

    it('treats unmatched ~~ as visible text', () => {
        const content = 'this is a ~~';
        assert.equal(renderedOffsetToRawOffset(content, 10), 10);
        assert.equal(renderedOffsetToRawOffset(content, 12), 12);
    });

    it('treats unmatched <sub> as visible text', () => {
        const content = 'text <sub>';
        assert.equal(renderedOffsetToRawOffset(content, 5), 5);
        assert.equal(renderedOffsetToRawOffset(content, 10), 10);
    });

    it('accounts for matched HTML tags', () => {
        // "H<sub>2</sub>O" — rendered as "H2O"
        const content = 'H<sub>2</sub>O';
        assert.equal(renderedOffsetToRawOffset(content, 0), 0); // 'H'
        assert.equal(renderedOffsetToRawOffset(content, 1), 1); // end of 'H', before <sub>
        assert.equal(renderedOffsetToRawOffset(content, 2), 7); // after '2', before </sub>
    });

    it('handles mixed matched and unmatched delimiters', () => {
        // "**bold** and *" — ** matched, trailing * unmatched
        const content = '**bold** and *';
        // rendered: "bold and *"
        assert.equal(renderedOffsetToRawOffset(content, 0), 0); // before ** (early return)
        assert.equal(renderedOffsetToRawOffset(content, 4), 6); // after 'd', before closing **
        assert.equal(renderedOffsetToRawOffset(content, 9), 13); // at unmatched '*'
        assert.equal(renderedOffsetToRawOffset(content, 10), 14); // end
    });

    it('handles inline image — 1 rendered unit maps to entire syntax', () => {
        // "hello ![alt](url) world"
        // rendered: "hello X world" (X = image, 1 unit)
        const content = 'hello ![alt](url) world';
        assert.equal(renderedOffsetToRawOffset(content, 5), 5); // at space before image
        assert.equal(renderedOffsetToRawOffset(content, 6), 6); // at image → raw start of '!'
        assert.equal(renderedOffsetToRawOffset(content, 7), 17); // after image → raw after ')'
        assert.equal(renderedOffsetToRawOffset(content, 13), 23); // end
    });
});
