/**
 * @fileoverview Cursor position ↔ absolute source offset conversion.
 *
 * These helpers convert between the editor's tree-based cursor
 * (`{ nodeId, offset }`) and an absolute character offset into the
 * raw markdown source string.  The absolute offset is stable across
 * parse cycles (provided the source hasn't changed) and can be
 * persisted to restore the cursor on next launch.
 */

/**
 * Computes the absolute character offset into the raw markdown source
 * for the current tree cursor position.
 *
 * Walks `syntaxTree.children` in order, accumulating the markdown
 * length of each node (separated by `\n\n`).  When the node matching
 * `cursor.nodeId` is found, the final offset is the accumulated
 * position plus the node's prefix length plus the cursor offset.
 *
 * @param {import('../parser/syntax-tree.js').SyntaxTree} tree
 * @param {import('./editor.js').TreeCursor} cursor
 * @param {(type: string, content: string, attrs: import('../parser/syntax-tree.js').NodeAttributes) => string} buildMarkdownLine
 * @param {(type: string, attrs?: import('../parser/syntax-tree.js').NodeAttributes) => number} getPrefixLength
 * @returns {number} Absolute offset, or -1 if the node was not found.
 */
export function cursorToAbsoluteOffset(tree, cursor, buildMarkdownLine, getPrefixLength) {
    let pos = 0;

    /**
     * Recursively walks nodes following the same structure as
     * `SyntaxNode.toMarkdown()` / `SyntaxTree.toMarkdown()`.
     *
     * @param {import('../parser/syntax-tree.js').SyntaxNode[]} nodes
     * @param {string} separator
     * @returns {number} The absolute offset, or -1 if not found in this subtree.
     */
    function walk(nodes, separator) {
        for (let i = 0; i < nodes.length; i++) {
            if (i > 0) pos += separator.length;

            const node = nodes[i];

            // If this is the cursor node, compute final offset.
            if (node.id === cursor.nodeId) {
                // For html-block containers, the cursor may be on the
                // opening/closing tag line (source view tagPart).
                if (node.type === 'html-block' && node.children.length > 0 && !cursor.tagPart) {
                    // Cursor is on a child — not this node itself.
                    // Fall through to walk children below.
                } else if (cursor.tagPart === 'closing') {
                    // Cursor is on the closing tag line of an html-block.
                    const md = node.toMarkdown();
                    const closingTag = node.attributes.closingTag ?? '';
                    return pos + md.length - closingTag.length + cursor.offset;
                } else {
                    const prefix = getPrefixLength(node.type, node.attributes);
                    return pos + prefix + cursor.offset;
                }
            }

            // For html-block containers, walk children to find the cursor.
            if (node.type === 'html-block' && node.children.length > 0) {
                const openingTag = node.attributes.openingTag ?? '';

                // Check if this is a single bare-text child (collapsed form).
                if (
                    node.children.length === 1 &&
                    node.children[0].attributes.bareText &&
                    node.children[0].type === 'paragraph'
                ) {
                    const child = node.children[0];
                    if (child.id === cursor.nodeId) {
                        // <tag>content</tag> — cursor is inside the content
                        const tag = node.attributes.tagName || 'div';
                        return pos + `<${tag}>`.length + cursor.offset;
                    }
                    // Not found here; advance past this node's markdown
                    pos += node.toMarkdown().length;
                    continue;
                }

                // Multi-child html-block: opening tag \n\n child1 \n\n child2 ... \n\n closing tag
                pos += openingTag.length;
                // Separator between opening tag and first child
                pos += '\n\n'.length;

                const result = walk(node.children, '\n\n');
                if (result !== -1) return result;

                // Closing tag
                if (node.attributes.closingTag) {
                    pos += '\n\n'.length;
                    pos += node.attributes.closingTag.length;
                }
            } else {
                // Leaf node — advance past its markdown
                pos += node.toMarkdown().length;
            }
        }
        return -1;
    }

    return walk(tree.children, '\n\n');
}

/**
 * Resolves an absolute character offset in the raw markdown source
 * back to a tree cursor `{ nodeId, offset }`.
 *
 * Walks the tree in the same order as `cursorToAbsoluteOffset`,
 * subtracting each node's markdown length until the target offset
 * falls within the current node.
 *
 * @param {import('../parser/syntax-tree.js').SyntaxTree} tree
 * @param {number} absoluteOffset
 * @param {(type: string, attrs?: import('../parser/syntax-tree.js').NodeAttributes) => number} getPrefixLength
 * @returns {import('./editor.js').TreeCursor|null} The cursor, or null if offset is out of range.
 */
export function absoluteOffsetToCursor(tree, absoluteOffset, getPrefixLength) {
    let pos = 0;

    /**
     * @param {import('../parser/syntax-tree.js').SyntaxNode[]} nodes
     * @param {string} separator
     * @returns {import('./editor.js').TreeCursor|null}
     */
    function walk(nodes, separator) {
        for (let i = 0; i < nodes.length; i++) {
            if (i > 0) pos += separator.length;

            const node = nodes[i];
            const md = node.toMarkdown();
            const nodeEnd = pos + md.length;

            if (absoluteOffset <= nodeEnd) {
                // Target is within this node (or at its end boundary).

                // For html-block containers with children, recurse.
                if (node.type === 'html-block' && node.children.length > 0) {
                    // Single bare-text child (collapsed):  <tag>content</tag>
                    if (
                        node.children.length === 1 &&
                        node.children[0].attributes.bareText &&
                        node.children[0].type === 'paragraph'
                    ) {
                        const child = node.children[0];
                        const tag = node.attributes.tagName || 'div';
                        const openLen = `<${tag}>`.length;
                        const contentOffset = absoluteOffset - pos - openLen;
                        return {
                            nodeId: child.id,
                            offset: Math.max(0, Math.min(contentOffset, child.content.length)),
                        };
                    }

                    // Multi-child: opening tag \n\n children \n\n closing tag
                    const openingTag = node.attributes.openingTag ?? '';
                    const afterOpen = pos + openingTag.length + '\n\n'.length;

                    if (absoluteOffset < afterOpen) {
                        // Cursor is on the opening tag line
                        return {
                            nodeId: node.id,
                            offset: Math.min(absoluteOffset - pos, openingTag.length),
                            tagPart: 'opening',
                        };
                    }

                    pos += openingTag.length + '\n\n'.length;
                    const result = walk(node.children, '\n\n');
                    if (result) return result;

                    // If we get here, offset is in the closing tag area
                    if (node.attributes.closingTag) {
                        pos += '\n\n'.length;
                        const closingOffset = absoluteOffset - pos;
                        return {
                            nodeId: node.id,
                            offset: Math.max(
                                0,
                                Math.min(closingOffset, node.attributes.closingTag.length),
                            ),
                            tagPart: 'closing',
                        };
                    }

                    // Fallback
                    return { nodeId: node.id, offset: 0 };
                }

                // Leaf node — the offset falls within this node's content.
                const prefix = getPrefixLength(node.type, node.attributes);
                const contentOffset = absoluteOffset - pos - prefix;
                return {
                    nodeId: node.id,
                    offset: Math.max(0, Math.min(contentOffset, node.content.length)),
                };
            }

            pos += md.length;
        }
        return null;
    }

    const cursor = walk(tree.children, '\n\n');
    if (cursor) return cursor;

    // Offset past the end — place cursor at end of last node.
    const last = tree.children[tree.children.length - 1];
    if (last) {
        return { nodeId: last.id, offset: last.content.length };
    }
    return null;
}
