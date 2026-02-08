/**
 * @fileoverview Focused Renderer for WYSIWYG-style editing.
 * Hides markdown syntax unless the cursor is on a specific element.
 */

/**
 * @typedef {import('../../parser/syntax-tree.js').NodeAttributes} NodeAttributes
 */

/**
 * Renders the syntax tree in focused writing mode.
 */
export class FocusedRenderer {
    /**
     * @param {import('../editor.js').Editor} editor - The editor instance
     */
    constructor(editor) {
        /** @type {import('../editor.js').Editor} */
        this.editor = editor;
    }

    /**
     * Resolves a potentially-relative image `src` to an absolute file:// URL
     * based on the directory of the currently loaded markdown file.
     * @param {string} src - The raw src attribute from the markdown
     * @returns {string} An absolute file:// URL, or the original src if
     *     it is already absolute or no file is loaded.
     */
    resolveImageSrc(src) {
        // Already a full URL (http, https, data, file, etc.) — leave it alone.
        if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return src;

        const filePath = this.editor.currentFilePath;
        if (!filePath) return src;

        // Derive the directory that contains the markdown file, then
        // resolve the relative src against it.
        const fileDir = filePath.replace(/[\\/][^\\/]+$/, '');
        // Normalise to forward-slashes for the file:// URL.
        const resolved = `${fileDir}/${src}`.replace(/\\/g, '/');

        // On Windows paths start with a drive letter (C:/…), so we need
        // three slashes: file:///C:/…
        return resolved.startsWith('/') ? `file://${resolved}` : `file:///${resolved}`;
    }

    /**
     * Renders the syntax tree to the container.
     * @param {import('../../parser/syntax-tree.js').SyntaxTree} syntaxTree - The syntax tree to render
     * @param {HTMLElement} container - The container element
     */
    render(syntaxTree, container) {
        // Use the tree cursor (the canonical cursor position) to determine
        // which node is focused, rather than the selection manager which
        // may be stale when switching view modes.
        const currentNodeId = this.editor.treeCursor?.nodeId ?? null;

        // Clear and rebuild content
        container.innerHTML = '';
        container.classList.add('focused-view');
        container.classList.remove('source-view');

        const fragment = document.createDocumentFragment();

        for (const node of syntaxTree.children) {
            const isFocused = node.id === currentNodeId;
            const element = this.renderNode(node, isFocused);
            if (element) {
                fragment.appendChild(element);
            }
        }

        // If empty, add a placeholder paragraph
        if (syntaxTree.children.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'md-line md-paragraph focused-placeholder';
            placeholder.appendChild(document.createElement('br'));
            fragment.appendChild(placeholder);
        }

        container.appendChild(fragment);
    }

    /**
     * Renders a syntax tree node to an HTML element.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node - The node to render
     * @param {boolean} isFocused - Whether this node has focus
     * @returns {HTMLElement|null}
     */
    renderNode(node, isFocused) {
        const element = document.createElement('div');
        element.className = `md-line md-${node.type}`;
        element.dataset.nodeId = node.id;

        if (isFocused) {
            element.classList.add('md-focused');
        }

        switch (node.type) {
            case 'heading1':
            case 'heading2':
            case 'heading3':
            case 'heading4':
            case 'heading5':
            case 'heading6':
                return this.renderHeading(node, element, isFocused);

            case 'paragraph':
                return this.renderParagraph(node, element, isFocused);

            case 'blockquote':
                return this.renderBlockquote(node, element, isFocused);

            case 'code-block':
                return this.renderCodeBlock(node, element, isFocused);

            case 'list-item':
                return this.renderListItem(node, element, isFocused);

            case 'horizontal-rule':
                return this.renderHorizontalRule(node, element, isFocused);

            case 'image':
                return this.renderImage(node, element, isFocused);

            case 'table':
                return this.renderTable(node, element, isFocused);

            default:
                return this.renderParagraph(node, element, isFocused);
        }
    }

    /**
     * Renders a heading node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @param {boolean} isFocused
     * @returns {HTMLElement}
     */
    renderHeading(node, element, isFocused) {
        const level = Number.parseInt(node.type.replace('heading', ''), 10);

        if (isFocused) {
            // Show syntax when focused
            const prefix = `${'#'.repeat(level)} `;
            const prefixSpan = document.createElement('span');
            prefixSpan.className = 'md-syntax md-heading-marker';
            prefixSpan.textContent = prefix;
            element.appendChild(prefixSpan);
        }

        const contentSpan = document.createElement('span');
        contentSpan.className = 'md-content';
        this.renderInlineContent(node.content, contentSpan, isFocused);
        element.appendChild(contentSpan);

        // Apply heading styling
        element.style.fontSize = `${2.5 - level * 0.25}em`;
        element.style.fontWeight = 'bold';

        return element;
    }

    /**
     * Renders a paragraph node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @param {boolean} isFocused
     * @returns {HTMLElement}
     */
    renderParagraph(node, element, isFocused) {
        this.renderInlineContent(node.content, element, isFocused);
        return element;
    }

    /**
     * Renders a blockquote node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @param {boolean} isFocused
     * @returns {HTMLElement}
     */
    renderBlockquote(node, element, isFocused) {
        if (isFocused) {
            const prefixSpan = document.createElement('span');
            prefixSpan.className = 'md-syntax md-blockquote-marker';
            prefixSpan.textContent = '> ';
            element.appendChild(prefixSpan);
        }

        const contentSpan = document.createElement('span');
        contentSpan.className = 'md-content';
        this.renderInlineContent(node.content, contentSpan, isFocused);
        element.appendChild(contentSpan);

        // Apply blockquote styling
        element.style.borderLeft = '3px solid #ccc';
        element.style.paddingLeft = '1em';
        element.style.fontStyle = 'italic';

        return element;
    }

    /**
     * Renders a code block node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @param {boolean} isFocused
     * @returns {HTMLElement}
     */
    renderCodeBlock(node, element, isFocused) {
        const attrs = /** @type {NodeAttributes} */ (node.attributes);
        const language = attrs.language || '';

        if (isFocused) {
            // Show fences when focused
            const openFence = document.createElement('div');
            openFence.className = 'md-code-fence md-syntax';
            openFence.textContent = `\`\`\`${language}`;
            element.appendChild(openFence);
        }

        const codeContent = document.createElement('pre');
        codeContent.className = 'md-code-content';

        const code = document.createElement('code');
        code.textContent = node.content;
        codeContent.appendChild(code);
        element.appendChild(codeContent);

        if (isFocused) {
            const closeFence = document.createElement('div');
            closeFence.className = 'md-code-fence md-syntax';
            closeFence.textContent = '```';
            element.appendChild(closeFence);
        }

        return element;
    }

    /**
     * Renders a list item node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @param {boolean} isFocused
     * @returns {HTMLElement}
     */
    renderListItem(node, element, isFocused) {
        const attrs = /** @type {NodeAttributes} */ (node.attributes);
        const indent = attrs.indent || 0;
        const isOrdered = attrs.ordered;
        const number = attrs.number || 1;

        if (isFocused) {
            const indentStr = '  '.repeat(indent);
            const marker = isOrdered ? `${number}. ` : '- ';
            const prefixSpan = document.createElement('span');
            prefixSpan.className = 'md-syntax md-list-marker';
            prefixSpan.textContent = indentStr + marker;
            element.appendChild(prefixSpan);
        } else {
            // Show bullet/number in formatted view
            element.style.marginLeft = `${indent * 1.5}em`;
            element.style.listStyleType = isOrdered ? 'decimal' : 'disc';
            element.style.display = 'list-item';
            element.style.marginLeft = `${(indent + 1) * 1.5}em`;
        }

        const contentSpan = document.createElement('span');
        contentSpan.className = 'md-content';
        this.renderInlineContent(node.content, contentSpan, isFocused);
        element.appendChild(contentSpan);

        return element;
    }

    /**
     * Renders an image node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @param {boolean} isFocused
     * @returns {HTMLElement}
     */
    renderImage(node, element, isFocused) {
        const attrs = /** @type {NodeAttributes} */ (node.attributes);
        const alt = attrs.alt ?? node.content;
        const src = attrs.url ?? '';

        if (isFocused) {
            // Show raw syntax when focused
            const contentSpan = document.createElement('span');
            contentSpan.className = 'md-content';
            if (attrs.href) {
                contentSpan.textContent = `[![${alt}](${src})](${attrs.href})`;
            } else {
                contentSpan.textContent = `![${alt}](${src})`;
            }
            element.appendChild(contentSpan);
        } else {
            // Show rendered image
            const img = document.createElement('img');
            img.className = 'md-image-preview';
            img.src = this.resolveImageSrc(src);
            img.alt = alt;
            img.title = alt;

            if (attrs.href) {
                const link = document.createElement('a');
                link.href = attrs.href;
                link.appendChild(img);
                element.appendChild(link);
            } else {
                element.appendChild(img);
            }
        }

        return element;
    }

    /**
     * Renders a horizontal rule node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @param {boolean} isFocused
     * @returns {HTMLElement}
     */
    renderHorizontalRule(node, element, isFocused) {
        if (isFocused) {
            element.textContent = '---';
        } else {
            const hr = document.createElement('hr');
            element.appendChild(hr);
        }
        return element;
    }

    /**
     * Renders a table node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @param {boolean} isFocused
     * @returns {HTMLElement}
     */
    renderTable(node, element, isFocused) {
        if (isFocused) {
            // Show raw markdown when focused
            const lines = node.content.split('\n');
            for (const line of lines) {
                const lineDiv = document.createElement('div');
                lineDiv.className = 'md-table-row';
                lineDiv.textContent = line;
                element.appendChild(lineDiv);
            }
        } else {
            // Render as HTML table
            const table = this.parseTableToHTML(node.content);
            element.appendChild(table);
        }
        return element;
    }

    /**
     * Parses markdown table content into an HTML table.
     * @param {string} content - The table content
     * @returns {HTMLTableElement}
     */
    parseTableToHTML(content) {
        const table = document.createElement('table');
        table.className = 'md-table';

        const lines = content.split('\n').filter((line) => line.trim());

        for (let i = 0; i < lines.length; i++) {
            // Skip separator line
            if (lines[i].match(/^[\s|:-]+$/)) continue;

            const row = document.createElement('tr');
            const cells = lines[i].split('|').filter((cell) => cell.trim());

            for (const cellContent of cells) {
                const cell = document.createElement(i === 0 ? 'th' : 'td');
                cell.textContent = cellContent.trim();
                row.appendChild(cell);
            }

            if (i === 0) {
                const thead = document.createElement('thead');
                thead.appendChild(row);
                table.appendChild(thead);
            } else {
                let tbody = table.querySelector('tbody');
                if (!tbody) {
                    tbody = document.createElement('tbody');
                    table.appendChild(tbody);
                }
                tbody.appendChild(row);
            }
        }

        return table;
    }

    /**
     * Renders inline content with formatting.
     * @param {string} content - The content to render
     * @param {HTMLElement} container - The container element
     * @param {boolean} isFocused - Whether the parent is focused
     */
    renderInlineContent(content, container, isFocused) {
        if (!content) {
            container.appendChild(document.createElement('br'));
            return;
        }

        if (isFocused) {
            // Show raw syntax when focused
            container.appendChild(document.createTextNode(content));
            return;
        }

        // Parse and render formatted inline elements
        const parts = this.parseInlineContent(content);

        for (const part of parts) {
            if (part.type === 'text') {
                container.appendChild(document.createTextNode(part.content));
            } else {
                const element = this.createInlineElement(part);
                container.appendChild(element);
            }
        }
    }

    /**
     * Parses inline content into parts.
     * @param {string} content - The content to parse
     * @returns {Array<{type: string, content: string, raw: string, href?: string}>}
     */
    parseInlineContent(content) {
        const parts = [];
        const remaining = content;

        // Simplified inline parsing - would be more complex in production
        const patterns = [
            { type: 'bold', regex: /\*\*(.+?)\*\*/g },
            { type: 'italic', regex: /(?<!\*)\*([^*]+)\*(?!\*)/g },
            { type: 'code', regex: /`([^`]+)`/g },
            { type: 'strikethrough', regex: /~~(.+?)~~/g },
            { type: 'link', regex: /\[([^\]]+)\]\(([^)]+)\)/g },
        ];

        // For simplicity, just return plain text for now
        // Full implementation would parse each pattern
        parts.push({
            type: 'text',
            content: this.stripMarkdownSyntax(content),
            raw: content,
        });

        return parts;
    }

    /**
     * Strips markdown syntax from content for display.
     * @param {string} content - The content to strip
     * @returns {string}
     */
    stripMarkdownSyntax(content) {
        return content
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/~~(.+?)~~/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    }

    /**
     * Creates an inline element for a parsed part.
     * @param {{type: string, content: string, raw: string, href?: string}} part
     * @returns {HTMLElement}
     */
    createInlineElement(part) {
        let element;

        switch (part.type) {
            case 'bold':
                element = document.createElement('strong');
                element.textContent = part.content;
                break;
            case 'italic':
                element = document.createElement('em');
                element.textContent = part.content;
                break;
            case 'code':
                element = document.createElement('code');
                element.textContent = part.content;
                break;
            case 'strikethrough':
                element = document.createElement('del');
                element.textContent = part.content;
                break;
            case 'link':
                element = document.createElement('a');
                element.href = part.href || '#';
                element.textContent = part.content;
                break;
            default:
                element = document.createElement('span');
                element.textContent = part.content;
        }

        return element;
    }
}
