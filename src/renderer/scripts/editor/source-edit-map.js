/**
 * Source-edit helpers for code-block nodes.
 *
 * In source view, the user edits the full fenced markdown
 * representation of a code-block (opening fence, language tag,
 * body, closing fence) as a single editable string.  This module
 * manages that temporary text in an external Map rather than on
 * the SyntaxNode itself, keeping the data structure clean.
 *
 * @module source-edit-map
 */

/**
 * Enters source edit mode for a code-block node.  The full markdown
 * text (fences + language + content) is stored in the map under the
 * node's ID.
 *
 * No-ops for non-code-block nodes or if the node is already in
 * source edit mode.
 *
 * @param {Map<string, string>} map
 * @param {{ id: string, type: string, content: string, attributes: Record<string, any> }} node
 */
export function enterSourceEditMode(map, node) {
  if (node.type !== 'code-block') return;
  if (map.has(node.id)) return;

  const lang = node.attributes.language || '';
  const fence = '`'.repeat(node.attributes.fenceCount || 3);
  map.set(node.id, `${fence}${lang}\n${node.content}\n${fence}`);
}

/**
 * Exits source edit mode.  Removes the entry from the map and
 * returns the stored text.  The caller is responsible for reparsing
 * the text and updating the node.
 *
 * @param {Map<string, string>} map
 * @param {string} nodeId
 * @returns {string|null} The source edit text, or null if the node
 *   was not in source edit mode.
 */
export function exitSourceEditMode(map, nodeId) {
  const text = map.get(nodeId) ?? null;
  map.delete(nodeId);
  return text;
}

/**
 * Returns the source edit text for a node, or null if the node is
 * not in source edit mode.
 *
 * @param {Map<string, string>} map
 * @param {string} nodeId
 * @returns {string|null}
 */
export function getSourceEditText(map, nodeId) {
  return map.get(nodeId) ?? null;
}

/**
 * Updates the source edit text for a node that is already in source
 * edit mode.
 *
 * @param {Map<string, string>} map
 * @param {string} nodeId
 * @param {string} text
 */
export function setSourceEditText(map, nodeId, text) {
  map.set(nodeId, text);
}

/**
 * Returns whether a node is currently in source edit mode.
 *
 * @param {Map<string, string>} map
 * @param {string} nodeId
 * @returns {boolean}
 */
export function isInSourceEditMode(map, nodeId) {
  return map.has(nodeId);
}

/**
 * Returns the length of the source edit text, or 0 if the node is
 * not in source edit mode.
 *
 * @param {Map<string, string>} map
 * @param {string} nodeId
 * @returns {number}
 */
export function getSourceEditLength(map, nodeId) {
  return map.get(nodeId)?.length ?? 0;
}
