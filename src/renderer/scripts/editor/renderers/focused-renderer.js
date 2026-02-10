/**
 * @fileoverview Focused Renderer for WYSIWYG-style editing.
 * Hides markdown syntax unless the cursor is on a specific element.
 */

/**
 * @typedef {import('../../parser/syntax-tree.js').NodeAttributes} NodeAttributes
 */

import { highlight } from '../syntax-highlighter.js';

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

        // Pre-compute 1-based visual positions for ordered list items so
        // that each consecutive run of ordered items at the same indent
        // level always numbers from 1.
        const children = syntaxTree.children;
        /** @type {Map<string, number>} nodeId → visual number */
        const listNumbers = new Map();
        let runCount = 0;
        let runIndent = -1;
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            const attrs = node.attributes;
            if (node.type === 'list-item' && attrs.ordered) {
                const indent = attrs.indent || 0;
                if (indent === runIndent) {
                    runCount++;
                } else {
                    runCount = 1;
                    runIndent = indent;
                }
                listNumbers.set(node.id, runCount);
            } else {
                runCount = 0;
                runIndent = -1;
            }
        }

        for (const node of children) {
            const isFocused = node.id === currentNodeId;
            const element = this.renderNode(node, isFocused, listNumbers.get(node.id));
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
     * Re-renders only the previously focused node and the newly focused
     * node, swapping them in-place in the DOM.  This avoids a full
     * teardown/rebuild of the entire document when the user simply
     * clicks on a different element.
     *
     * @param {HTMLElement} container - The editor container
     * @param {string|null} previousNodeId - The node that was focused before
     * @param {string} newNodeId - The node that is now focused
     */
    updateFocus(container, previousNodeId, newNodeId) {
        const tree = this.editor.syntaxTree;
        if (!tree) return;

        // Defocus the previously-focused node (re-render without focus).
        if (previousNodeId) {
            this._replaceNodeElement(container, tree, previousNodeId, false);
        }

        // Focus the newly-focused node (re-render with focus).
        this._replaceNodeElement(container, tree, newNodeId, true);
    }

    /**
     * Finds a node by id in the syntax tree, renders it, and replaces
     * the corresponding DOM element in the container.
     *
     * @param {HTMLElement} container
     * @param {import('../../parser/syntax-tree.js').SyntaxTree} tree
     * @param {string} nodeId
     * @param {boolean} isFocused
     */
    _replaceNodeElement(container, tree, nodeId, isFocused) {
        const node = tree.findNodeById(nodeId);
        if (!node) return;

        const existing = container.querySelector(`[data-node-id="${nodeId}"]`);
        if (!existing) return;

        const updated = this.renderNode(node, isFocused);
        if (updated) {
            existing.replaceWith(updated);
        }
    }

    /**
     * Renders a syntax tree node to an HTML element.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node - The node to render
     * @param {boolean} isFocused - Whether this node has focus
     * @param {number} [visualNumber] - 1-based position for ordered list items
     * @returns {HTMLElement|null}
     */
    renderNode(node, isFocused, visualNumber) {
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
                return this.renderListItem(node, element, isFocused, visualNumber);

            case 'horizontal-rule':
                return this.renderHorizontalRule(node, element, isFocused);

            case 'image':
                return this.renderImage(node, element, isFocused);

            case 'table':
                return this.renderTable(node, element, isFocused);

            case 'html-block':
                return this.renderHtmlBlock(node, element, isFocused);

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
        if (isFocused) {
            code.textContent = node.content;
        } else {
            code.appendChild(highlight(node.content, language));
        }
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
     * @param {number} [visualNumber] - 1-based position within the list run
     * @returns {HTMLElement}
     */
    renderListItem(node, element, isFocused, visualNumber) {
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
            element.style.listStyleType = isOrdered ? 'decimal' : 'disc';
            element.style.display = 'list-item';
            element.style.marginLeft = `${(indent + 1) * 1.5}em`;
            if (isOrdered && visualNumber != null) {
                element.style.counterSet = `list-item ${visualNumber}`;
            }
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

            // Show a non-interactive preview below the syntax
            const preview = document.createElement('img');
            preview.className = 'md-image-preview md-image-preview--inert';
            preview.src = this.resolveImageSrc(src);
            preview.alt = alt;
            preview.draggable = false;
            element.appendChild(preview);
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
            // Skip separator line (must contain at least one dash)
            if (/^[\s|:-]+$/.test(lines[i]) && lines[i].includes('-')) continue;

            const row = document.createElement('tr');
            const cells = lines[i]
                .split('|')
                .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

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
     * Renders an HTML block container node.
     *
     * The container's tag (e.g. `<div>`, `<details>`) is rendered as an
     * actual HTML element and the child nodes are rendered inside it as
     * normal markdown nodes.
     *
     * For `<details>` blocks the element is rendered open by default so
     * the user can see and edit the content.  A self-closed `<summary>`
     * child is rendered as a native `<summary>` element with editable
     * inline content.
     *
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element - The wrapper div with data-node-id
     * @param {boolean} isFocused
     * @returns {HTMLElement}
     */
    renderHtmlBlock(node, element, isFocused) {
        const attrs = /** @type {NodeAttributes} */ (node.attributes);
        const tagName = attrs.tagName || 'div';

        // For <details> blocks we use a fake disclosure widget built from
        // plain <div>s so we have full control over collapsing without any
        // of the quirky browser behaviour of the native <details> element.
        if (tagName === 'details') {
            return this.renderFakeDetails(node, element, isFocused);
        }

        // Create the actual HTML container element
        const container = document.createElement(tagName);
        container.className = 'md-html-container';

        // Copy attributes from the opening tag onto the container element
        this.applyHtmlAttributes(container, attrs.openingTag || '');

        // Determine which child (if any) is focused
        const currentNodeId = this.editor.treeCursor?.nodeId ?? null;

        for (const child of node.children) {
            const childFocused = child.id === currentNodeId;
            const childElement = this.renderNode(child, childFocused);
            if (childElement) {
                container.appendChild(childElement);
            }
        }

        // If no children, add a placeholder so the element is visible
        if (node.children.length === 0) {
            container.appendChild(document.createElement('br'));
        }

        element.appendChild(container);
        return element;
    }

    /**
     * Renders a fake &lt;details&gt; disclosure widget using plain divs.
     * The first child that is itself an html-block with tagName "summary"
     * is rendered as the summary row (with a clickable disclosure triangle).
     * All remaining children form the collapsible body.
     *
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @param {boolean} isFocused
     * @returns {HTMLElement}
     */
    renderFakeDetails(node, element, isFocused) {
        const attrs = /** @type {NodeAttributes} */ (node.attributes);
        const defaultOpen = !this.editor.detailsClosed;

        // Check runtime toggle state stored on the node; fall back to the
        // user preference on first render.
        if (node.attributes._detailsOpen === undefined) {
            node.attributes._detailsOpen = defaultOpen;
        }
        const isOpen = !!node.attributes._detailsOpen;

        const container = document.createElement('div');
        container.className = 'md-html-container md-details';
        if (isOpen) {
            container.classList.add('md-details--open');
        }

        // Copy any extra attributes from the original opening tag
        this.applyHtmlAttributes(container, attrs.openingTag || '');

        const currentNodeId = this.editor.treeCursor?.nodeId ?? null;

        // Split children into summary child and body children
        /** @type {import('../../parser/syntax-tree.js').SyntaxNode|null} */
        let summaryNode = null;
        /** @type {import('../../parser/syntax-tree.js').SyntaxNode[]} */
        const bodyChildren = [];

        for (const child of node.children) {
            if (
                !summaryNode &&
                child.type === 'html-block' &&
                child.attributes.tagName === 'summary'
            ) {
                summaryNode = child;
            } else {
                bodyChildren.push(child);
            }
        }

        // ── Summary row ──
        if (summaryNode) {
            const summaryRow = document.createElement('div');
            summaryRow.className = 'md-details-summary';

            // Disclosure triangle
            const triangle = document.createElement('span');
            triangle.className = 'md-details-triangle';
            triangle.textContent = isOpen ? '▼' : '▶';
            triangle.setAttribute('role', 'button');
            triangle.setAttribute('aria-label', isOpen ? 'Collapse' : 'Expand');
            // Intercept mousedown to prevent the browser from moving the
            // caret into the details body.  Without this, mousedown fires
            // before click, the caret moves, selectionchange triggers a
            // full re-render (destroying this element), and the click
            // handler never runs on the live DOM.
            triangle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            triangle.addEventListener('click', (e) => {
                e.stopPropagation();
                node.attributes._detailsOpen = !node.attributes._detailsOpen;
                this.editor.render();
                this.editor.placeCursor();
            });
            summaryRow.appendChild(triangle);

            // Render summary content
            const summaryContent = document.createElement('div');
            summaryContent.className = 'md-details-summary-content';
            const summaryFocused = summaryNode.id === currentNodeId;
            // Render summary's own children (the bareText paragraph)
            for (const sc of summaryNode.children) {
                const scFocused = sc.id === currentNodeId;
                const scEl = this.renderNode(sc, scFocused);
                if (scEl) summaryContent.appendChild(scEl);
            }
            summaryRow.appendChild(summaryContent);
            container.appendChild(summaryRow);
        }

        // ── Collapsible body ──
        const body = document.createElement('div');
        body.className = 'md-details-body';

        for (const child of bodyChildren) {
            const childFocused = child.id === currentNodeId;
            const childElement = this.renderNode(child, childFocused);
            if (childElement) {
                body.appendChild(childElement);
            }
        }

        if (bodyChildren.length === 0) {
            body.appendChild(document.createElement('br'));
        }

        container.appendChild(body);
        element.appendChild(container);
        return element;
    }

    /**
     * Parses HTML attributes from an opening tag string and applies them
     * to a DOM element (excluding the tag name itself).
     *
     * @param {HTMLElement} el - The element to apply attributes to
     * @param {string} openingTag - e.g. `<div class="note">`
     */
    applyHtmlAttributes(el, openingTag) {
        // Strip `<tagName` from the front and `>` from the end
        const withoutBrackets = openingTag
            .replace(/^<[a-zA-Z][a-zA-Z0-9-]*/, '')
            .replace(/>$/, '')
            .trim();
        if (!withoutBrackets) return;

        // Use a temporary element to parse attributes safely
        const tmp = document.createElement('div');
        tmp.innerHTML = `<span ${withoutBrackets}></span>`;
        const parsed = tmp.firstElementChild;
        if (!parsed) return;

        for (const attr of parsed.attributes) {
            el.setAttribute(attr.name, attr.value);
        }
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

        // Parse and recursively render formatted inline elements.
        this.renderInlineParts(content, container);
    }

    /**
     * Recursively parses inline markdown and appends rendered DOM nodes.
     * @param {string} content - The raw inline markdown text
     * @param {HTMLElement} container - The element to append rendered nodes to
     */
    renderInlineParts(content, container) {
        // Combined pattern — order matters:
        //   1. Links first so brackets aren't consumed by other patterns.
        //   2. ** bold before * italic so ** isn't split into two *.
        //   3. __ emphasis before _ emphasis for the same reason.
        //   4. Code, strikethrough last.
        // Note: _ and __ are BOTH emphasis (<em>), only ** is bold (<strong>).
        const combined =
            /\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*([^*]+)\*(?!\*)|(?<!\w)_([^_]+)_(?!\w)|~~(.+?)~~|`([^`]+)`/g;

        let lastIndex = 0;

        for (const match of content.matchAll(combined)) {
            // Append any plain text before this match.
            if (match.index > lastIndex) {
                container.appendChild(
                    document.createTextNode(content.slice(lastIndex, match.index)),
                );
            }

            if (match[1] !== undefined) {
                // Link: [text](href)
                const a = document.createElement('a');
                a.href = match[2];
                this.renderInlineParts(match[1], a);
                container.appendChild(a);
            } else if (match[3] !== undefined) {
                // Bold: **text**
                const strong = document.createElement('strong');
                this.renderInlineParts(match[3], strong);
                container.appendChild(strong);
            } else if (match[4] !== undefined) {
                // Emphasis: __text__
                const em = document.createElement('em');
                this.renderInlineParts(match[4], em);
                container.appendChild(em);
            } else if (match[5] !== undefined) {
                // Emphasis: *text*
                const em = document.createElement('em');
                this.renderInlineParts(match[5], em);
                container.appendChild(em);
            } else if (match[6] !== undefined) {
                // Emphasis: _text_
                const em = document.createElement('em');
                this.renderInlineParts(match[6], em);
                container.appendChild(em);
            } else if (match[7] !== undefined) {
                // Strikethrough: ~~text~~
                const del = document.createElement('del');
                this.renderInlineParts(match[7], del);
                container.appendChild(del);
            } else if (match[8] !== undefined) {
                // Inline code: `text` — no recursion (code is literal).
                const code = document.createElement('code');
                code.textContent = match[8];
                container.appendChild(code);
            }

            lastIndex = match.index + match[0].length;
        }

        // Append any trailing plain text.
        if (lastIndex < content.length) {
            container.appendChild(document.createTextNode(content.slice(lastIndex)));
        }
    }
}
