/**
 * @fileoverview Source Renderer for displaying raw markdown.
 * Shows the literal markdown text with minimal styling to distinguish element types.
 */

/**
 * @typedef {import('../../parser/syntax-tree.js').NodeAttributes} NodeAttributes
 */

/**
 * Renders the syntax tree in source view mode.
 */
export class SourceRenderer {
    /**
     * @param {import('../editor.js').Editor} editor - The editor instance
     */
    constructor(editor) {
        /** @type {import('../editor.js').Editor} */
        this.editor = editor;
    }

    /**
     * Renders the syntax tree to the container.
     * @param {import('../../parser/syntax-tree.js').SyntaxTree} syntaxTree - The syntax tree to render
     * @param {HTMLElement} container - The container element
     */
    render(syntaxTree, container) {
        // Save current selection
        const selection = window.getSelection();
        let savedRange = null;
        if (selection && selection.rangeCount > 0) {
            savedRange = selection.getRangeAt(0).cloneRange();
        }

        // Clear and rebuild content
        container.innerHTML = '';
        container.classList.add('source-view');
        container.classList.remove('focused-view');

        const fragment = document.createDocumentFragment();

        for (const node of syntaxTree.children) {
            const element = this.renderNode(node);
            if (element) {
                fragment.appendChild(element);
            }
        }

        // If empty, add a placeholder paragraph
        if (syntaxTree.children.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'md-line md-paragraph';
            placeholder.appendChild(document.createElement('br'));
            fragment.appendChild(placeholder);
        }

        container.appendChild(fragment);

        // Attempt to restore selection (simplified)
        if (savedRange) {
            try {
                // Note: Full selection restoration would require mapping
                // between old and new DOM positions
            } catch (e) {
                // Selection restoration failed, that's okay
            }
        }
    }

    /**
     * Renders a syntax tree node to an HTML element.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node - The node to render
     * @returns {HTMLElement|null}
     */
    renderNode(node) {
        const element = document.createElement('div');
        element.className = `md-line md-${node.type}`;
        element.dataset.nodeId = node.id;

        switch (node.type) {
            case 'heading1':
            case 'heading2':
            case 'heading3':
            case 'heading4':
            case 'heading5':
            case 'heading6':
                return this.renderHeading(node, element);

            case 'paragraph':
                return this.renderParagraph(node, element);

            case 'blockquote':
                return this.renderBlockquote(node, element);

            case 'code-block':
                return this.renderCodeBlock(node, element);

            case 'list-item':
                return this.renderListItem(node, element);

            case 'horizontal-rule':
                return this.renderHorizontalRule(node, element);

            case 'image':
                return this.renderImage(node, element);

            case 'table':
                return this.renderTable(node, element);

            case 'html-block':
                return this.renderHtmlBlock(node, element);

            default:
                return this.renderParagraph(node, element);
        }
    }

    /**
     * Renders a heading node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderHeading(node, element) {
        const level = Number.parseInt(node.type.replace('heading', ''), 10);
        const prefix = `${'#'.repeat(level)} `;

        const prefixSpan = document.createElement('span');
        prefixSpan.className = 'md-syntax md-heading-marker';
        prefixSpan.textContent = prefix;

        const contentSpan = document.createElement('span');
        contentSpan.className = 'md-content';
        this.renderInlineContent(node.content, contentSpan);

        element.appendChild(prefixSpan);
        element.appendChild(contentSpan);

        return element;
    }

    /**
     * Renders a paragraph node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderParagraph(node, element) {
        this.renderInlineContent(node.content, element);
        return element;
    }

    /**
     * Renders a blockquote node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderBlockquote(node, element) {
        const prefixSpan = document.createElement('span');
        prefixSpan.className = 'md-syntax md-blockquote-marker';
        prefixSpan.textContent = '> ';

        const contentSpan = document.createElement('span');
        contentSpan.className = 'md-content';
        this.renderInlineContent(node.content, contentSpan);

        element.appendChild(prefixSpan);
        element.appendChild(contentSpan);

        return element;
    }

    /**
     * Renders a code block node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderCodeBlock(node, element) {
        const attrs = /** @type {NodeAttributes} */ (node.attributes);
        const language = attrs.language || '';

        // Opening fence
        const openFence = document.createElement('div');
        openFence.className = 'md-code-fence';
        openFence.textContent = `\`\`\`${language}`;
        element.appendChild(openFence);

        // Code content
        const codeContent = document.createElement('div');
        codeContent.className = 'md-code-content';
        codeContent.textContent = node.content;
        element.appendChild(codeContent);

        // Closing fence
        const closeFence = document.createElement('div');
        closeFence.className = 'md-code-fence';
        closeFence.textContent = '```';
        element.appendChild(closeFence);

        return element;
    }

    /**
     * Renders a list item node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderListItem(node, element) {
        const attrs = /** @type {NodeAttributes} */ (node.attributes);
        const indent = '  '.repeat(attrs.indent || 0);
        const marker = attrs.ordered ? `${attrs.number}. ` : '- ';

        const prefixSpan = document.createElement('span');
        prefixSpan.className = 'md-syntax md-list-marker';
        prefixSpan.textContent = indent + marker;

        const contentSpan = document.createElement('span');
        contentSpan.className = 'md-content';
        this.renderInlineContent(node.content, contentSpan);

        element.appendChild(prefixSpan);
        element.appendChild(contentSpan);

        return element;
    }

    /**
     * Renders an image node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderImage(node, element) {
        const attrs = /** @type {NodeAttributes} */ (node.attributes);
        const alt = attrs.alt ?? node.content;
        const src = attrs.url ?? '';

        const contentSpan = document.createElement('span');
        contentSpan.className = 'md-content';

        if (attrs.href) {
            contentSpan.textContent = `[![${alt}](${src})](${attrs.href})`;
        } else {
            contentSpan.textContent = `![${alt}](${src})`;
        }

        element.appendChild(contentSpan);

        return element;
    }

    /**
     * Renders a horizontal rule node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderHorizontalRule(node, element) {
        element.textContent = '---';
        element.className += ' md-horizontal-rule';
        return element;
    }

    /**
     * Renders a table node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderTable(node, element) {
        // Render table as plain text in source mode
        const lines = node.content.split('\n');
        for (const line of lines) {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'md-table-row';
            lineDiv.textContent = line;
            element.appendChild(lineDiv);
        }
        return element;
    }

    /**
     * Renders an HTML block container node in source view.
     * Shows the opening/closing tags and child nodes as raw markdown.
     *
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderHtmlBlock(node, element) {
        const attrs = /** @type {NodeAttributes} */ (node.attributes);

        // Self-closed tag on a single line: render the full line as-is.
        if (attrs.selfClosed) {
            element.textContent = attrs.openingTag || '';
            return element;
        }

        // Opening tag line
        const openLine = document.createElement('div');
        openLine.className = 'md-html-tag';
        openLine.textContent = attrs.openingTag || '';
        element.appendChild(openLine);

        // Render children as normal nodes
        for (const child of node.children) {
            const childElement = this.renderNode(child);
            if (childElement) {
                element.appendChild(childElement);
            }
        }

        // Closing tag line
        if (attrs.closingTag) {
            const closeLine = document.createElement('div');
            closeLine.className = 'md-html-tag';
            closeLine.textContent = attrs.closingTag;
            element.appendChild(closeLine);
        }

        return element;
    }

    /**
     * Renders inline content with formatting.
     * @param {string} content - The content to render
     * @param {HTMLElement} container - The container element
     */
    renderInlineContent(content, container) {
        if (!content) {
            container.appendChild(document.createElement('br'));
            return;
        }

        // Parse and render inline elements (bold, italic, code, links, etc.)
        const parts = this.parseInlineContent(content);

        for (const part of parts) {
            if (part.type === 'text') {
                container.appendChild(document.createTextNode(part.content));
            } else {
                const span = document.createElement('span');
                span.className = `md-inline md-${part.type}`;
                span.textContent = part.raw;
                container.appendChild(span);
            }
        }
    }

    /**
     * Parses inline content into parts.
     * @param {string} content - The content to parse
     * @returns {Array<{type: string, content: string, raw: string}>}
     */
    parseInlineContent(content) {
        const parts = [];
        const remaining = content;
        const lastIndex = 0;

        // Regular expressions for inline elements
        const patterns = [
            { type: 'bold', regex: /\*\*(.+?)\*\*/g },
            { type: 'italic', regex: /__(.+?)__/g },
            { type: 'italic', regex: /\*(.+?)\*/g },
            { type: 'italic', regex: /(?<!\w)_([^_]+)_(?!\w)/g },
            { type: 'code', regex: /`([^`]+)`/g },
            { type: 'link', regex: /\[([^\]]+)\]\(([^)]+)\)/g },
            { type: 'strikethrough', regex: /~~(.+?)~~/g },
        ];

        // For simplicity in source view, we just return the raw text
        // with markers for styling purposes
        parts.push({
            type: 'text',
            content: content,
            raw: content,
        });

        return parts;
    }
}
