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
    fullRender(syntaxTree, container) {
        // Save current selection
        const selection = window.getSelection();
        let savedRange = null;
        if (selection && selection.rangeCount > 0) {
            savedRange = selection.getRangeAt(0).cloneRange();
        }

        // Clear and rebuild content
        container.innerHTML = '';
        container.classList.add('source-view');
        container.classList.remove('writing-view');

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

        // Append a phantom paragraph after a trailing code block so the
        // user has somewhere to place the cursor.  This element is not
        // backed by a tree node — it is promoted on first interaction.
        this._ensurePhantomParagraph(container, syntaxTree);

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
     * Appends (or removes) a phantom paragraph at the end of the container
     * when the last tree node is a code block.  The phantom is a
     * presentation-only DOM element — it is not backed by a tree node.
     * When the user interacts with it (clicks, types), it is promoted to
     * a real SyntaxNode by {@link Editor#_promotePhantomParagraph}.
     *
     * @param {HTMLElement} container
     * @param {import('../../parser/syntax-tree.js').SyntaxTree} tree
     */
    _ensurePhantomParagraph(container, tree) {
        const existing = container.querySelector('.md-phantom-paragraph');
        const children = tree.children;
        const last = children.length > 0 ? children[children.length - 1] : null;
        const needsPhantom = last?.type === 'code-block';

        if (needsPhantom && !existing) {
            const phantom = document.createElement('div');
            phantom.className = 'md-line md-paragraph md-phantom-paragraph';
            phantom.setAttribute('contenteditable', 'true');
            phantom.appendChild(document.createElement('br'));
            container.appendChild(phantom);
        } else if (!needsPhantom && existing) {
            existing.remove();
        }
    }

    /**
     * Incremental render: updates only the DOM elements for the nodes
     * listed in `hints` instead of rebuilding the entire document.
     *
     * @param {HTMLElement} container - The editor container
     * @param {{ updated?: string[], added?: string[], removed?: string[] }} hints
     *     - updated: node IDs whose content changed (re-render in place)
     *     - added:   node IDs that were just inserted into the tree (create & insert DOM element)
     *     - removed: node IDs that were just removed from the tree (delete DOM element)
     */
    renderNodes(container, { updated = [], added = [], removed = [] }) {
        const tree = this.editor.syntaxTree;
        if (!tree) return;

        // 1. Remove DOM elements for deleted nodes.
        for (const nodeId of removed) {
            const el = container.querySelector(`[data-node-id="${nodeId}"]`);
            if (el) el.remove();
        }

        // 2. Re-render existing nodes in-place.
        for (const nodeId of updated) {
            this._replaceNodeElement(container, tree, nodeId);
        }

        // 3. Insert DOM elements for newly added nodes.
        for (const nodeId of added) {
            const node = tree.findNodeById(nodeId);
            if (!node) continue;

            const siblings = node.parent ? node.parent.children : tree.children;
            const idx = siblings.indexOf(node);
            const element = this.renderNode(node);
            if (!element) continue;

            // Insert after the previous sibling's DOM element.
            if (idx > 0) {
                const prevSibling = siblings[idx - 1];
                const prevEl = container.querySelector(`[data-node-id="${prevSibling.id}"]`);
                if (prevEl) {
                    prevEl.after(element);
                    continue;
                }
            }

            // No previous sibling — if inside an html-block, re-render
            // the parent instead; otherwise prepend to the container.
            if (node.parent && node.parent.type === 'html-block') {
                this._replaceNodeElement(container, tree, node.parent.id);
            } else {
                container.prepend(element);
            }
        }

        // Refresh the phantom paragraph after incremental updates.
        this._ensurePhantomParagraph(container, tree);
    }

    /**
     * Finds a node by id in the syntax tree, renders it, and replaces
     * the corresponding DOM element in the container.
     *
     * For children of bare-text html-blocks (e.g. `<summary>text</summary>`)
     * the parent html-block owns the DOM element, so the parent is
     * re-rendered instead.
     *
     * @param {HTMLElement} container
     * @param {import('../../parser/syntax-tree.js').SyntaxTree} tree
     * @param {string} nodeId
     */
    _replaceNodeElement(container, tree, nodeId) {
        const node = tree.findNodeById(nodeId);
        if (!node) return;

        // Bare-text html-block children are rendered as part of the
        // parent html-block element — re-render the parent instead.
        const parent = node.parent;
        if (
            parent?.type === 'html-block' &&
            parent.children.length === 1 &&
            node.attributes.bareText
        ) {
            const parentEl = container.querySelector(`[data-node-id="${nodeId}"]`);
            if (!parentEl) return;
            const updated = this.renderNode(parent);
            if (updated) {
                // renderHtmlBlock for bare-text returns a wrapper whose
                // data-node-id is the child's id, so replaceWith works.
                parentEl.replaceWith(updated);
            }
            return;
        }

        const existing = container.querySelector(`[data-node-id="${nodeId}"]`);
        if (!existing) return;

        const updated = this.renderNode(node);
        if (updated) {
            existing.replaceWith(updated);
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
     *
     * In source view the entire markdown representation — opening fence,
     * language tag, inner code lines, and closing fence — is rendered as
     * a single editable region so the user can freely edit every part,
     * including the fences and language indicator.
     *
     * The node enters "source edit mode" (see
     * {@link SyntaxNode#enterSourceEditMode}) which stores the full
     * markdown text in `_sourceEditText`.  All subsequent keystrokes
     * operate on that string.  When the cursor leaves the node (or the
     * view mode switches), the text is reparsed back into tree properties.
     *
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderCodeBlock(node, element) {
        // Enter source-edit mode so the full markdown is available as a
        // single editable string.
        node.enterSourceEditMode();

        const codeContent = document.createElement('div');
        codeContent.className = 'md-code-content md-content';
        // Append an extra newline so trailing empty lines have visual
        // height (same reason as the old per-section render).
        codeContent.textContent = `${node._sourceEditText}\n`;
        element.appendChild(codeContent);

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
        const checkbox =
            typeof attrs.checked === 'boolean' ? (attrs.checked ? '[x] ' : '[ ] ') : '';

        const prefixSpan = document.createElement('span');
        prefixSpan.className = 'md-syntax md-list-marker';
        prefixSpan.textContent = indent + marker + checkbox;

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

        const style = attrs.style ?? '';
        if (style) {
            const altAttr = alt ? ` alt="${alt}"` : '';
            contentSpan.textContent = `<img src="${src}"${altAttr} style="${style}" />`;
        } else if (attrs.href) {
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

        // Bare-text container (e.g. <summary>text</summary>): render as a
        // single line matching the original markdown source.
        if (
            node.children.length === 1 &&
            node.children[0].attributes.bareText &&
            node.children[0].type === 'paragraph'
        ) {
            const child = node.children[0];
            // Render as a single line whose data-node-id points to the
            // child paragraph so that editing targets the right node.
            element.dataset.nodeId = child.id;
            element.className = 'md-line md-paragraph';

            const openSyntax = document.createElement('span');
            openSyntax.className = 'md-syntax md-html-tag';
            openSyntax.textContent = attrs.openingTag || '';
            element.appendChild(openSyntax);

            const contentSpan = document.createElement('span');
            contentSpan.className = 'md-content';
            this.renderInlineContent(child.content, contentSpan);
            element.appendChild(contentSpan);

            const closeSyntax = document.createElement('span');
            closeSyntax.className = 'md-syntax md-html-tag';
            closeSyntax.textContent = attrs.closingTag || '';
            element.appendChild(closeSyntax);

            return element;
        }

        // Opening tag line — editable via data-tag-part="opening"
        const openLine = document.createElement('div');
        openLine.className = 'md-line md-html-tag';
        openLine.dataset.nodeId = node.id;
        openLine.dataset.tagPart = 'opening';
        const openContent = document.createElement('span');
        openContent.className = 'md-content';
        openContent.textContent = attrs.openingTag || '';
        openLine.appendChild(openContent);
        element.appendChild(openLine);

        // Raw content tags: render body lines verbatim (not as markdown)
        if (attrs.rawContent !== undefined) {
            if (attrs.rawContent) {
                for (const line of attrs.rawContent.split('\n')) {
                    const rawLine = document.createElement('div');
                    rawLine.className = 'md-line md-html-raw';
                    rawLine.dataset.nodeId = node.id;
                    const rawContent = document.createElement('span');
                    rawContent.className = 'md-content';
                    rawContent.textContent = line;
                    rawLine.appendChild(rawContent);
                    element.appendChild(rawLine);
                }
            }
        } else {
            // Render children as normal nodes
            for (const child of node.children) {
                const childElement = this.renderNode(child);
                if (childElement) {
                    element.appendChild(childElement);
                }
            }
        }

        // Closing tag line — editable via data-tag-part="closing"
        if (attrs.closingTag) {
            const closeLine = document.createElement('div');
            closeLine.className = 'md-line md-html-tag';
            closeLine.dataset.nodeId = node.id;
            closeLine.dataset.tagPart = 'closing';
            const closeContent = document.createElement('span');
            closeContent.className = 'md-content';
            closeContent.textContent = attrs.closingTag;
            closeLine.appendChild(closeContent);
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
