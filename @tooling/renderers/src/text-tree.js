/**
 * @fileoverview Serializes a SyntaxTree into the plain-text tree
 * description format used by spec files.
 *
 * Format: indented `type "content" {attrs}` (no line numbers),
 * matching the output of parse-markdown.js.
 */

/**
 * Serializes a SyntaxTree into the spec-file tree format.
 *
 * @param {object} tree
 * @returns {string}
 */
export function renderTreeToText(tree) {
    const lines = [];
    for (const child of tree.children) {
        renderNodeToText(child, '', lines);
    }
    return lines.join('\n') + '\n';
}

/**
 * Serializes a single SyntaxNode into the tree description format.
 *
 * @param {object} node
 * @param {string} indent
 * @param {string[]} lines
 */
function renderNodeToText(node, indent, lines) {
    const attrs = serializeAttributes(node.attributes);
    const hasChildren = node.children.length > 0;
    // Use tagName as the quoted value for html-element nodes
    const quotedValue = node.tagName
        ? ` "${node.tagName}"`
        : node.content && !hasChildren
            ? ` "${node.content.length > 60 ? `${node.content.slice(0, 60)}...` : node.content}"`
            : '';
    lines.push(`${indent}${node.type}${quotedValue}${attrs}`);
    for (const child of node.children) {
        renderNodeToText(child, `${indent}  `, lines);
    }
}

/**
 * Serializes node attributes to a string.
 *
 * @param {Object} attributes
 * @returns {string}
 */
function serializeAttributes(attributes) {
    if (Object.keys(attributes).length === 0) return '';
    return ` ${JSON.stringify(attributes)}`;
}
