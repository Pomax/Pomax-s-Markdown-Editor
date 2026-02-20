/**
 * @fileoverview CRC32 digest for content-change detection.
 *
 * Used to verify that a document has not changed between sessions so that
 * a persisted cursor position can be safely restored.  This is a digest
 * hash, not a cryptographic hash — collisions are acceptable.
 */

/** @type {Uint32Array|null} */
let TABLE = null;

/**
 * Lazily initialises the CRC32 lookup table (256 entries).
 * @returns {Uint32Array}
 */
function getTable() {
    if (TABLE) return TABLE;
    TABLE = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        TABLE[i] = c;
    }
    return TABLE;
}

/**
 * Computes a CRC32 hash of a UTF-8 string.
 *
 * @param {string} str - The input string
 * @returns {number} Unsigned 32-bit CRC value
 */
export function crc32(str) {
    const table = getTable();
    let crc = 0xffffffff;
    for (let i = 0; i < str.length; i++) {
        crc = table[(crc ^ str.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
