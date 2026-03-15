import { parser } from './parser/dfa-parser.js';

/**
 * @param {string} markdown
 */
export async function parse(markdown) {
  return parser.parse(markdown);
}
