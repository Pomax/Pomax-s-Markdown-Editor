/**
 * @fileoverview Writing Renderer for WYSIWYG-style editing.
 * Hides markdown syntax unless the cursor is on a specific element.
 */

/**
 * @typedef {import('../../parser/syntax-tree.js').NodeAttributes} NodeAttributes
 */

import { buildInlineTree, tokenizeInline } from '../../parser/inline-tokenizer.js';
import { highlight } from '../syntax-highlighter.js';

/**
 * Renders the syntax tree in writing mode.
 */
export class WritingRenderer {
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
    fullRender(syntaxTree, container) {
        // Use the tree cursor (the canonical cursor position) to determine
        // which node is focused, rather than the selection manager which
        // may be stale when switching view modes.
        const currentNodeId = this.editor.getBlockNodeId();

        // Clear and rebuild content
        container.innerHTML = '';
        container.classList.add('writing-view');
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
            placeholder.className = 'md-line md-paragraph writing-placeholder';
            placeholder.appendChild(document.createElement('br'));
            fragment.appendChild(placeholder);
        }

        container.appendChild(fragment);

        // Append a phantom paragraph after a trailing code block so the
        // user has somewhere to place the cursor.  This element is not
        // backed by a tree node — it is promoted on first interaction.
        this._ensurePhantomParagraph(container, syntaxTree);
    }

    /**
     * Incrementally updates the DOM by re-rendering, adding, or removing
     * specific nodes rather than rebuilding the entire document.
     *
     * @param {HTMLElement} container - The editor container
     * @param {{ updated?: string[], added?: string[], removed?: string[] }} hints
     *     - updated: node IDs whose content or focus state changed (re-render in place)
     *     - added:   node IDs that were just inserted into the tree (create & insert DOM element)
     *     - removed: node IDs that were just removed from the tree (delete DOM element)
     */
    renderNodes(container, { updated = [], added = [], removed = [] }) {
        const tree = this.editor.syntaxTree;
        if (!tree) return;

        const currentNodeId = this.editor.getBlockNodeId();

        // 1. Remove DOM elements for deleted nodes.
        for (const nodeId of removed) {
            const el = container.querySelector(`[data-node-id="${nodeId}"]`);
            if (el) el.remove();
        }

        // 2. Re-render existing nodes in-place.
        for (const nodeId of updated) {
            const isFocused = nodeId === currentNodeId;
            this._replaceNodeElement(container, tree, nodeId, isFocused);
        }

        // 3. Insert DOM elements for newly added nodes.
        for (const nodeId of added) {
            const node = tree.findNodeById(nodeId);
            if (!node) continue;

            const isFocused = nodeId === currentNodeId;
            const siblings = node.parent ? node.parent.children : tree.children;
            const idx = siblings.indexOf(node);
            const visualNumber = this._computeVisualNumber(tree, node);
            const element = this.renderNode(node, isFocused, visualNumber);
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
                const parentFocused = node.parent.id === currentNodeId;
                this._replaceNodeElement(container, tree, node.parent.id, parentFocused);
            } else {
                container.prepend(element);
            }
        }

        // Refresh the phantom paragraph after incremental updates.
        this._ensurePhantomParagraph(container, tree);
    }

    /**
     * Computes the 1-based visual position for an ordered list item within
     * its consecutive run of ordered items at the same indent level.
     *
     * @param {import('../../parser/syntax-tree.js').SyntaxTree} tree
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @returns {number|undefined}
     */
    _computeVisualNumber(tree, node) {
        if (node.type !== 'list-item' || !node.attributes.ordered) return undefined;
        const children = tree.children;
        const indent = node.attributes.indent || 0;
        let count = 0;
        for (const child of children) {
            if (child.type === 'list-item' && child.attributes.ordered) {
                const childIndent = child.attributes.indent || 0;
                if (childIndent === indent) {
                    count++;
                } else {
                    count = 1;
                }
            } else {
                count = 0;
            }
            if (child.id === node.id) return count;
        }
        return undefined;
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

        const visualNumber = this._computeVisualNumber(tree, node);
        const updated = this.renderNode(node, isFocused, visualNumber);
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
                return this.renderHorizontalRule(node, element);

            case 'image':
            case 'linked-image':
                return this.renderImage(node, element);

            case 'table':
                return this.renderTable(node, element);

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

        const contentSpan = document.createElement('span');
        contentSpan.className = 'md-content';
        this.renderInlineContent(node, contentSpan);
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
        this.renderInlineContent(node, element);
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
        const contentSpan = document.createElement('span');
        contentSpan.className = 'md-content';
        this.renderInlineContent(node, contentSpan);
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

        const codeContent = document.createElement('pre');
        codeContent.className = 'md-code-content md-content';

        const code = document.createElement('code');
        if (isFocused) {
            // Plain text when focused so cursor positions map 1:1.
            // Append a trailing newline so the last line always has
            // visual height (trailing newlines collapse even in <pre>).
            code.textContent = `${node.content}\n`;
        } else {
            code.appendChild(highlight(node.content, language));
        }
        codeContent.appendChild(code);
        element.appendChild(codeContent);

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
        const isChecklist = typeof attrs.checked === 'boolean';
        const number = attrs.number || 1;

        if (isChecklist) {
            // Checklist: no bullet/number, show a checkbox
            element.style.listStyleType = 'none';
            element.style.display = 'block';
            element.style.marginLeft = `${(indent + 1) * 1.5}em`;
            element.classList.add('md-checklist-item');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'md-checklist-checkbox';
            if (attrs.checked) {
                checkbox.setAttribute('checked', 'checked');
            }

            // mousedown guard: prevent caret movement and selectionchange re-render
            checkbox.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });

            checkbox.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const before = this.editor.getMarkdown();
                node.attributes.checked = !node.attributes.checked;
                this.editor.undoManager.recordChange({
                    type: 'checklistToggle',
                    before,
                    after: this.editor.getMarkdown(),
                });
                this.editor.renderNodesAndPlaceCursor({ updated: [node.id] });
                this.editor.setUnsavedChanges(true);
            });

            element.appendChild(checkbox);
        } else {
            // Regular bullet or numbered list
            element.style.listStyleType = isOrdered ? 'decimal' : 'disc';
            element.style.display = 'list-item';
            element.style.marginLeft = `${(indent + 1) * 1.5}em`;
            if (isOrdered && visualNumber != null) {
                element.style.counterSet = `list-item ${visualNumber}`;
            }
        }

        const contentSpan = document.createElement('span');
        contentSpan.className = 'md-content';
        this.renderInlineContent(node, contentSpan);
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

        // Always show rendered image (WYSIWYG)
        const img = document.createElement('img');
        img.className = 'md-image-preview';
        img.src = this.resolveImageSrc(src);
        img.alt = alt;
        img.title = alt;
        if (attrs.style) {
            img.setAttribute('style', attrs.style);
        }

        if (attrs.href) {
            const link = document.createElement('a');
            link.href = attrs.href;
            link.appendChild(img);
            element.appendChild(link);
        } else {
            element.appendChild(img);
        }

        return element;
    }

    /**
     * Renders a horizontal rule node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderHorizontalRule(node, element) {
        // Always show as a visual rule (WYSIWYG)
        const hr = document.createElement('hr');
        element.appendChild(hr);
        return element;
    }

    /**
     * Renders a table node.
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderTable(node, element) {
        // Always render as HTML table (WYSIWYG)
        const table = this.parseTableToHTML(node.content);
        element.appendChild(table);
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
                this.renderInlineString(cellContent.trim(), cell);
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
        const currentNodeId = this.editor.getBlockNodeId();

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

        const currentNodeId = this.editor.getBlockNodeId();

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
                this.editor.renderNodes({ updated: [node.id] });
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
     * Renders inline content from a SyntaxNode's inline children.
     * Each formatting element gets a `data-node-id` attribute so the
     * cursor manager can resolve the cursor to the correct inline node.
     *
     * @param {import('../../parser/syntax-tree.js').SyntaxNode} node - The block-level node
     * @param {HTMLElement} container - The container element
     */
    renderInlineContent(node, container) {
        if (!node.content) {
            container.appendChild(document.createElement('br'));
            return;
        }

        if (node.children && node.children.length > 0) {
            this.renderSyntaxNodeChildren(node.children, container);
        } else {
            // Fallback for nodes without inline children
            this.renderInlineParts(node.content, container);
        }
    }

    /**
     * Renders inline content from a raw string (no SyntaxNode children
     * available).  Used for table cells whose content is extracted from
     * the raw table markdown.
     *
     * @param {string} content - The raw inline text
     * @param {HTMLElement} container - The container element
     */
    renderInlineString(content, container) {
        if (!content) {
            container.appendChild(document.createElement('br'));
            return;
        }
        this.renderInlineParts(content, container);
    }

    /**
     * Tokenizes inline markdown + HTML and appends rendered DOM nodes.
     * @param {string} content - The raw inline markdown text
     * @param {HTMLElement} container - The element to append rendered nodes to
     */
    renderInlineParts(content, container) {
        const tokens = tokenizeInline(content);
        const tree = buildInlineTree(tokens);
        this.appendSegments(tree, container);
    }

    /**
     * Recursively renders inline SyntaxNode children into the DOM.
     * Formatting elements receive `data-node-id` so that cursor tracking
     * can resolve to the correct inline node.
     *
     * @param {import('../../parser/syntax-tree.js').SyntaxNode[]} children
     * @param {HTMLElement} container
     */
    renderSyntaxNodeChildren(children, container) {
        for (const child of children) {
            switch (child.type) {
                case 'text':
                    container.appendChild(document.createTextNode(child.content));
                    break;
                case 'inline-code': {
                    const code = document.createElement('code');
                    code.dataset.nodeId = child.id;
                    code.textContent = child.content;
                    container.appendChild(code);
                    container.appendChild(document.createTextNode(''));
                    break;
                }
                case 'inline-image': {
                    const img = document.createElement('img');
                    img.dataset.nodeId = child.id;
                    img.className = 'md-image-preview';
                    img.alt = child.attributes.alt ?? '';
                    img.src = this.resolveImageSrc(child.attributes.src ?? '');
                    container.appendChild(img);
                    container.appendChild(document.createTextNode(''));
                    break;
                }
                case 'bold': {
                    const strong = document.createElement('strong');
                    strong.dataset.nodeId = child.id;
                    this.renderSyntaxNodeChildren(child.children, strong);
                    container.appendChild(strong);
                    container.appendChild(document.createTextNode(''));
                    break;
                }
                case 'bold-italic': {
                    const strong = document.createElement('strong');
                    strong.dataset.nodeId = child.id;
                    const em = document.createElement('em');
                    this.renderSyntaxNodeChildren(child.children, em);
                    strong.appendChild(em);
                    container.appendChild(strong);
                    container.appendChild(document.createTextNode(''));
                    break;
                }
                case 'italic': {
                    const em = document.createElement('em');
                    em.dataset.nodeId = child.id;
                    this.renderSyntaxNodeChildren(child.children, em);
                    container.appendChild(em);
                    container.appendChild(document.createTextNode(''));
                    break;
                }
                case 'strikethrough': {
                    const del = document.createElement('del');
                    del.dataset.nodeId = child.id;
                    this.renderSyntaxNodeChildren(child.children, del);
                    container.appendChild(del);
                    container.appendChild(document.createTextNode(''));
                    break;
                }
                case 'link': {
                    const a = document.createElement('a');
                    a.dataset.nodeId = child.id;
                    a.href = child.attributes.href ?? '';
                    this.renderSyntaxNodeChildren(child.children, a);
                    container.appendChild(a);
                    container.appendChild(document.createTextNode(''));
                    break;
                }
                default: {
                    // HTML inline tags (sub, sup, mark, u, etc.)
                    if (child.attributes.tag) {
                        const el = document.createElement(child.attributes.tag);
                        el.dataset.nodeId = child.id;
                        this.renderSyntaxNodeChildren(child.children, el);
                        container.appendChild(el);
                        container.appendChild(document.createTextNode(''));
                    }
                    break;
                }
            }
        }
    }

    /**
     * Recursively walks an InlineSegment tree and appends DOM nodes.
     * Used as fallback when SyntaxNode children are not available.
     * @param {import('../../parser/inline-tokenizer.js').InlineSegment[]} segments
     * @param {HTMLElement} container
     */
    appendSegments(segments, container) {
        for (const seg of segments) {
            switch (seg.type) {
                case 'text':
                    container.appendChild(document.createTextNode(seg.text ?? ''));
                    break;
                case 'code': {
                    const code = document.createElement('code');
                    code.textContent = seg.content ?? '';
                    container.appendChild(code);
                    container.appendChild(document.createTextNode(''));
                    break;
                }
                case 'bold': {
                    const strong = document.createElement('strong');
                    this.appendSegments(seg.children ?? [], strong);
                    container.appendChild(strong);
                    container.appendChild(document.createTextNode(''));
                    break;
                }
                case 'bold-italic': {
                    const strong = document.createElement('strong');
                    const em = document.createElement('em');
                    this.appendSegments(seg.children ?? [], em);
                    strong.appendChild(em);
                    container.appendChild(strong);
                    container.appendChild(document.createTextNode(''));
                    break;
                }
                case 'italic': {
                    const em = document.createElement('em');
                    this.appendSegments(seg.children ?? [], em);
                    container.appendChild(em);
                    container.appendChild(document.createTextNode(''));
                    break;
                }
                case 'strikethrough': {
                    const del = document.createElement('del');
                    this.appendSegments(seg.children ?? [], del);
                    container.appendChild(del);
                    container.appendChild(document.createTextNode(''));
                    break;
                }
                case 'link': {
                    const a = document.createElement('a');
                    a.href = seg.href ?? '';
                    this.appendSegments(seg.children ?? [], a);
                    container.appendChild(a);
                    container.appendChild(document.createTextNode(''));
                    break;
                }
                case 'image': {
                    const img = document.createElement('img');
                    img.className = 'md-image-preview';
                    img.alt = seg.alt ?? '';
                    img.src = this.resolveImageSrc(seg.src ?? '');
                    container.appendChild(img);
                    container.appendChild(document.createTextNode(''));
                    break;
                }
                default: {
                    // HTML inline tags (sub, sup, mark, u, etc.)
                    if (seg.tag) {
                        const el = document.createElement(seg.tag);
                        this.appendSegments(seg.children ?? [], el);
                        container.appendChild(el);
                        container.appendChild(document.createTextNode(''));
                    }
                    break;
                }
            }
        }
    }
}
