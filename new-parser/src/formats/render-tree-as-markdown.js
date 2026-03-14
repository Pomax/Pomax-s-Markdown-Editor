/**
 * @fileoverview Serializes a SyntaxTree back into markdown text.
 *
 * This is the inverse of the parser: it walks the tree and produces
 * the markdown source that would round-trip back to the same tree.
 */

/**
 * Serializes inline SyntaxNode children back to markdown text.
 *
 * @param {object[]} children - Array of inline SyntaxNode instances.
 * @returns {string}
 */
function serializeInlineChildren(children) {
    return children.map(serializeInlineNode).join(``);
}

/**
 * Serializes a single inline SyntaxNode to markdown text.
 *
 * @param {object} node
 * @returns {string}
 */
function serializeInlineNode(node) {
    switch (node.type) {
        case `text`:
            return node.content;
        case `inline-code`:
            return `\`${node.content}\``;
        case `bold`:
            return `**${serializeInlineChildren(node.children)}**`;
        case `italic`:
            return `*${serializeInlineChildren(node.children)}*`;
        case `bold-italic`:
            return `***${serializeInlineChildren(node.children)}***`;
        case `strikethrough`:
            return `~~${serializeInlineChildren(node.children)}~~`;
        case `link`:
            return `[${serializeInlineChildren(node.children)}](${node.attributes.href || ``})`;
        case `inline-image`:
            return `![${node.attributes.alt || ``}](${node.attributes.src || ``})`;
        case `html-element`: {
            const tag = node.tagName;
            const attrs = Object.entries(node.attributes)
                .map(([k, v]) => ` ${k}="${v}"`)
                .join(``);
            if (node.children.length === 0) {
                return `<${tag}${attrs}>`;
            }
            return `<${tag}${attrs}>${serializeInlineChildren(node.children)}</${tag}>`;
        }
        default:
            return node.content || ``;
    }
}

/**
 * Serializes a SyntaxTree into markdown.
 *
 * @param {object} tree - A SyntaxTree instance.
 * @returns {string}
 */
export function renderTreeToMarkdown(tree) {
    const lines = [];
    for (const child of tree.children) {
        lines.push(renderNodeToMarkdown(child));
    }
    return lines.join(`\n\n`) + `\n`;
}

/**
 * Serializes a single SyntaxNode into markdown.
 *
 * @param {object} node - A SyntaxNode instance.
 * @param {number} [depth=0] - HTML nesting depth for indentation.
 * @returns {string}
 */
export function renderNodeToMarkdown(node, depth = 0) {
    switch (node.type) {
        case `heading1`:
            return `# ${node.content}`;
        case `heading2`:
            return `## ${node.content}`;
        case `heading3`:
            return `### ${node.content}`;
        case `heading4`:
            return `#### ${node.content}`;
        case `heading5`:
            return `##### ${node.content}`;
        case `heading6`:
            return `###### ${node.content}`;
        case `paragraph`:
            return node.content;
        case `blockquote`:
            return node.content
                .split(`\n`)
                .map((line) => `> ${line}`)
                .join(`\n`);
        case `code-block`: {
            const lang = node.attributes.language || ``;
            const fence = `\``.repeat(node.attributes.fenceCount || 3);
            const code = node.children.length > 0 ? node.children[0].content : node.content;
            return `${fence}${lang}\n${code}\n${fence}`;
        }
        case `list`: {
            return node.children.map((child) => renderNodeToMarkdown(child, depth)).join(`\n`);
        }
        case `list-item`: {
            const listParent = node.parent;
            const indent = listParent ? `  `.repeat(listParent.attributes.indent || 0) : ``;
            const marker = listParent?.attributes.ordered
                ? `${listParent.attributes.number || 1}. `
                : `${listParent?.runtime.marker || `-`} `;
            const checkbox =
                typeof node.attributes.checked === `boolean`
                    ? node.attributes.checked
                        ? `[x] `
                        : `[ ] `
                    : ``;
            const lines = [`${indent}${marker}${checkbox}${node.content}`];
            for (const child of node.children) {
                if (child.type === `list`) {
                    lines.push(renderNodeToMarkdown(child, depth));
                }
            }
            return lines.join(`\n`);
        }
        case `horizontal-rule`: {
            const hrMarker = node.attributes.marker || `-`;
            const hrCount = node.attributes.count || 3;
            return hrMarker.repeat(hrCount);
        }
        case `image`: {
            const imgAlt = node.attributes.alt ?? node.content;
            const imgSrc = node.attributes.url ?? ``;
            const imgStyle = node.attributes.style ?? ``;
            if (imgStyle) {
                const altAttr = imgAlt ? ` alt="${imgAlt}"` : ``;
                return `<img src="${imgSrc}"${altAttr} style="${imgStyle}" />`;
            }
            if (node.attributes.href) {
                return `[![${imgAlt}](${imgSrc})](${node.attributes.href})`;
            }
            return `![${imgAlt}](${imgSrc})`;
        }
        case `table`: {
            const rows = [];
            for (const child of node.children) {
                const cells = child.children.map((cell) => {
                    return ` ${serializeInlineChildren(cell.children)} `;
                });
                rows.push(`|${cells.join(`|`)}|`);
                // Insert separator after header
                if (child.type === `header`) {
                    const sep = child.children.map(() => `---`);
                    rows.push(`|${sep.join(`|`)}|`);
                }
            }
            return rows.join(`\n`);
        }
        case `html-element`: {
            const indent = `  `.repeat(depth);
            // If the container has exactly one bare-text child, collapse
            // to a single line: <tag>content</tag>
            if (
                node.children.length === 1 &&
                node.children[0].attributes.bareText &&
                node.children[0].type === `paragraph`
            ) {
                const tag = node.tagName || `div`;
                return `${indent}<${tag}>${node.children[0].content}</${tag}>`;
            }

            const lines = [`${indent}${node.runtime.openingTag || ``}`];
            for (const child of node.children) {
                if (child.type === `html-element`) {
                    lines.push(renderNodeToMarkdown(child, depth + 1));
                } else {
                    lines.push(``);
                    lines.push(renderNodeToMarkdown(child));
                    lines.push(``);
                }
            }
            if (node.runtime.closingTag) {
                lines.push(`${indent}${node.runtime.closingTag}`);
            }
            // Collapse multiple consecutive blank lines
            const result = lines.join(`\n`).replace(/\n{3,}/g, `\n\n`);
            return result;
        }
        case `text`:
        case `inline-code`:
        case `bold`:
        case `italic`:
        case `bold-italic`:
        case `strikethrough`:
        case `link`:
        case `inline-image`:
            return serializeInlineNode(node);
        default:
            return node.content;
    }
}
