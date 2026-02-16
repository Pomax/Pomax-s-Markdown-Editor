/**
 * @fileoverview Unit tests for the page-resize computeNewWidth helper.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { MIN_WIDTH_PX, computeNewWidth } from '../../../src/renderer/scripts/editor/page-resize.js';

describe('computeNewWidth', () => {
    const defaults = {
        startWidth: 600,
        startX: 400,
        currentX: 400,
        side: /** @type {const} */ ('right'),
        maxContainerWidth: 1200,
    };

    it('returns startWidth when there is no mouse movement', () => {
        const result = computeNewWidth(defaults);
        assert.strictEqual(result, 600);
    });

    describe('right handle', () => {
        it('dragging right increases width symmetrically (×2)', () => {
            const result = computeNewWidth({ ...defaults, currentX: 450 });
            // dx = 50, widthDelta = 100, new = 700
            assert.strictEqual(result, 700);
        });

        it('dragging left decreases width symmetrically (×2)', () => {
            const result = computeNewWidth({ ...defaults, currentX: 350 });
            // dx = -50, widthDelta = -100, new = 500
            assert.strictEqual(result, 500);
        });
    });

    describe('left handle', () => {
        it('dragging left increases width symmetrically (×2)', () => {
            const result = computeNewWidth({
                ...defaults,
                side: 'left',
                currentX: 350,
            });
            // dx = -50, widthDelta = -(-100) = 100, new = 700
            assert.strictEqual(result, 700);
        });

        it('dragging right decreases width symmetrically (×2)', () => {
            const result = computeNewWidth({
                ...defaults,
                side: 'left',
                currentX: 450,
            });
            // dx = 50, widthDelta = -(100) = -100, new = 500
            assert.strictEqual(result, 500);
        });
    });

    describe('clamping', () => {
        it('clamps to MIN_WIDTH_PX when dragged too far inward', () => {
            const result = computeNewWidth({ ...defaults, currentX: 100 });
            // dx = -300, widthDelta = -600, new = 0 → clamped to MIN_WIDTH_PX
            assert.strictEqual(result, MIN_WIDTH_PX);
        });

        it('clamps to maxContainerWidth - 40 when dragged too far outward', () => {
            const result = computeNewWidth({ ...defaults, currentX: 1000 });
            // dx = 600, widthDelta = 1200, new = 1800 → clamped to 1200 - 40 = 1160
            assert.strictEqual(result, 1160);
        });

        it('MIN_WIDTH_PX is 300', () => {
            assert.strictEqual(MIN_WIDTH_PX, 300);
        });
    });
});
