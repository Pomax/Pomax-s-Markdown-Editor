/**
 * @fileoverview Unit tests for the CRC32 hash helper.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crc32 } from '../../../src/renderer/scripts/editor/crc32.js';

describe('crc32', () => {
    it('returns a number', () => {
        assert.equal(typeof crc32('hello'), 'number');
    });

    it('returns 0 for an empty string', () => {
        assert.equal(crc32(''), 0);
    });

    it('produces consistent results for the same input', () => {
        const hash1 = crc32('The quick brown fox');
        const hash2 = crc32('The quick brown fox');
        assert.equal(hash1, hash2);
    });

    it('produces different results for different inputs', () => {
        const hashA = crc32('hello');
        const hashB = crc32('world');
        assert.notEqual(hashA, hashB);
    });

    it('returns an unsigned 32-bit integer', () => {
        const hash = crc32('test');
        assert.ok(hash >= 0, 'hash should be non-negative');
        assert.ok(hash <= 0xffffffff, 'hash should fit in 32 bits');
    });

    it('detects single-character changes', () => {
        const hashA = crc32('# Hello World');
        const hashB = crc32('# Hello world');
        assert.notEqual(hashA, hashB);
    });
});
