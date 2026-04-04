/**
 * @fileoverview Main Editor class.
 * Manages the document, view modes, and user interactions.
 *
 * All edits flow through the parse tree: user input is intercepted at the
 * keydown level, applied to the tree, and then the DOM is re-rendered from
 * the tree. The DOM is never the source of truth for content.
 *
 * The heavy lifting is delegated to focused manager classes; this file
 * wires them together and exposes the public API consumed by the toolbar,
 * IPC handlers, and tests.
 */

/// <reference path="../../../types.d.ts" />

import { EditorData } from './types.js';
import { parser } from '../../../parsers/old/dfa-parser.js';
import { SyntaxNode } from '../../../parsers/old/syntax-node.js';
import { SyntaxTree } from '../../../parsers/old/syntax-tree.js';
import { ClipboardHandler } from './handlers/clipboard-handler.js';
import { InputHandler } from './handlers/input-handler.js';
import { EventHandler } from './handlers/event-handler.js';
import { CursorManager } from './managers/cursor-manager.js';
import { SelectionManager } from './managers/selection-manager.js';
import { UndoManager } from './managers/undo-manager.js';
import { EditOperations } from './edit-operations/index.js';
import { RangeOperations } from './range-operations.js';
import { TableManager } from './content-types/table/table-manager.js';
import { ImageHelper } from './content-types/image/image-helper.js';
import { LinkHelper } from './content-types/link/link-helper.js';
import { SourceRendererV2 } from './renderers/source/index.js';
import { WritingRenderer } from './renderers/writing/index.js';
import { TreeFormatter } from './formatters/tree-formatter.js';
import { Source2Formatter } from './formatters/source2-formatter.js';

const VIEW_MODES = [`writing`, `source2`];

/**
 * Main editor class that manages the markdown editing experience.
 */
export class Editor extends EditorData {
  /**
   * @param {HTMLElement} container - The editor container element
   */
  constructor(container) {
    super();
    this.container = container;
    this.container.dataset.viewMode = `writing`;
    this.writingRenderer = new WritingRenderer(this);
    this.sourceRendererV2 = new SourceRendererV2(this);
    this.renderer = /** @type {WritingRenderer|SourceRendererV2} */ (this.writingRenderer);
    this.treeFormatter = new TreeFormatter(this);
    this.source2Formatter = new Source2Formatter(this.sourceRendererV2);
    this.undoManager = new UndoManager();
    this.selectionManager = new SelectionManager(this);
    this.cursorManager = new CursorManager(this);
    this.tableManager = new TableManager(this);
    this.inputHandler = new InputHandler(this);
    this.editOperations = new EditOperations(this);
    this.rangeOperations = new RangeOperations(this);
    this.clipboardHandler = new ClipboardHandler(this);
    this.eventHandler = new EventHandler(this);
    this.imageHelper = new ImageHelper(this);
    this.linkHelper = new LinkHelper(this);
  }

  /**
   * Re-parses a single markdown line to detect type changes during
   * editing.
   * @param {string} text
   * @returns {Promise<SyntaxNode|null>}
   */
  async reparseLine(text) {
    return (await parser.parse(text)).children[0] ?? null;
  }

  /**
   * Parses a multi-line markdown string (e.g. from a paste) into an
   * array of nodes. Delegates to the appropriate parser API.
   * @param {string} combined - The full markdown string to parse.
   * @returns {Promise<SyntaxNode[]>}
   */
  async parseMultiLine(combined) {
    return [...(await parser.parse(combined)).children];
  }

  /**
   * Initializes the editor.
   */
  async initialize() {
    // Set up initial empty document with one empty paragraph
    this.syntaxTree = new SyntaxTree();
    const initialNode = new SyntaxNode(`paragraph`, ``);
    this.syntaxTree.appendChild(initialNode);
    this.syntaxTree.treeCursor = { nodeId: initialNode.id, offset: 0 };

    // Set up event listeners
    this.setupEventListeners();

    // Render initial state
    this.fullRender();
    this.placeCursor();
  }

  /**
   * Sets up event listeners for the editor.
   */
  setupEventListeners() {
    // Store bound handlers so they can be removed/reattached
    // when swapping to a different container element.
    this.boundHandlers = {
      keydown: /** @type {EventListener} */ (
        /** @type {unknown} */ (this.inputHandler.handleKeyDown.bind(this.inputHandler))
      ),
      beforeinput: /** @type {EventListener} */ (
        /** @type {unknown} */ (this.inputHandler.handleBeforeInput.bind(this.inputHandler))
      ),
      mousedown: /** @type {EventListener} */ (
        this.eventHandler.handleMouseDown.bind(this.eventHandler)
      ),
      click: /** @type {EventListener} */ (
        /** @type {unknown} */ (this.eventHandler.handleClick.bind(this.eventHandler))
      ),
      focus: /** @type {EventListener} */ (this.eventHandler.handleFocus.bind(this.eventHandler)),
      blur: /** @type {EventListener} */ (this.eventHandler.handleBlur.bind(this.eventHandler)),
      cut: /** @type {EventListener} */ (
        this.clipboardHandler.handleCut.bind(this.clipboardHandler)
      ),
      copy: /** @type {EventListener} */ (
        this.clipboardHandler.handleCopy.bind(this.clipboardHandler)
      ),
      dragover: /** @type {EventListener} */ (
        this.eventHandler.handleDragOver.bind(this.eventHandler)
      ),
      drop: /** @type {EventListener} */ (
        /** @type {unknown} */ (this.eventHandler.handleDrop.bind(this.eventHandler))
      ),
    };

    this.attachContainerListeners();

    document.addEventListener(
      `selectionchange`,
      this.eventHandler.handleSelectionChange.bind(this.eventHandler),
    );
  }

  /**
   * Attaches the stored event handlers to the current container.
   */
  attachContainerListeners() {
    for (const [event, handler] of Object.entries(this.boundHandlers)) {
      this.container.addEventListener(event, handler);
    }
  }

  /**
   * Detaches the stored event handlers from the current container.
   */
  detachContainerListeners() {
    for (const [event, handler] of Object.entries(this.boundHandlers)) {
      this.container.removeEventListener(event, handler);
    }
  }

  /**
   * Swaps the editor's active container to a different element.
   * Moves event listeners from the old container to the new one.
   * @param {HTMLElement} newContainer
   */
  swapContainer(newContainer) {
    this.detachContainerListeners();
    this.container = newContainer;
    this.attachContainerListeners();
  }

  /**
   * Returns the SyntaxNode that the tree cursor currently points at.
   * When the cursor is inside inline formatting, this returns the
   * inline child node.
   * @returns {SyntaxNode|null}
   */
  getCurrentNode() {
    if (!this.syntaxTree?.treeCursor) return null;
    return this.syntaxTree.findNodeById(this.syntaxTree.treeCursor.nodeId);
  }

  /**
   * Returns the block-level node ID from the tree cursor.
   * Uses `blockNodeId` when set (cursor is inside inline formatting),
   * otherwise falls back to `nodeId`.
   * @returns {string|null}
   */
  getBlockNodeId() {
    if (!this.syntaxTree?.treeCursor) return null;
    return this.syntaxTree.treeCursor.blockNodeId ?? this.syntaxTree.treeCursor.nodeId;
  }

  /**
   * Resolves an arbitrary node ID to its block-level parent ID.
   * If the node is already block-level, returns the same ID.
   * @param {string|null} nodeId
   * @returns {string|null}
   */
  resolveBlockId(nodeId) {
    if (!nodeId || !this.syntaxTree) return null;
    const node = this.syntaxTree.findNodeById(nodeId);
    if (!node) return nodeId;
    return node.getBlockParent().id;
  }

  /**
   * Returns the block-level SyntaxNode for the current cursor position.
   * When the cursor is inside inline formatting, this resolves through
   * `blockNodeId` to return the paragraph/heading/list-item that owns
   * the raw content string.
   * @returns {SyntaxNode|null}
   */
  getCurrentBlockNode() {
    const blockId = this.getBlockNodeId();
    if (!blockId || !this.syntaxTree) return null;
    return this.syntaxTree.findNodeById(blockId);
  }

  /**
   * Returns the sibling list that contains the given node.
   * For top-level nodes this is `syntaxTree.children`; for nodes
   * inside a container (e.g. html-block) it is `node.parent.children`.
   * @param {SyntaxNode} node
   * @returns {SyntaxNode[]}
   */
  getSiblings(node) {
    if (node.parent) return node.parent.children;
    return this.syntaxTree?.children ?? [];
  }

  /**
   * Returns the index of a node inside its sibling list.
   * Works for both top-level nodes and nodes nested inside containers.
   * @param {SyntaxNode} node
   * @returns {number}
   */
  getNodeIndex(node) {
    return this.getSiblings(node).indexOf(node);
  }

  /**
   * Syncs the tree cursor/range from the current DOM selection.
   * @param {{ preserveRange?: boolean }} [options]
   */
  syncCursorFromDOM({ preserveRange = false } = {}) {
    this.cursorManager.syncCursorFromDOM({ preserveRange });
  }

  /** Places the DOM cursor at the position described by `this.syntaxTree.treeCursor`. */
  placeCursor() {
    this.cursorManager.placeCursor();
  }

  /**
   * Rebuilds the DOM selection from the tree's treeRange (if set).
   * Called after operations (e.g. view-mode switch) that destroy and
   * re-create the DOM so the user's selection is visually restored.
   */
  placeSelection() {
    this.cursorManager.placeSelection();
  }

  /**
   * Checks whether the DOM selection is inside the phantom paragraph
   * (a view-only element appended after a trailing code block).  If so,
   * promotes it to a real SyntaxNode in the tree, re-renders it as a
   * normal paragraph, and places the cursor inside it.
   *
   * @returns {boolean} `true` if a phantom was promoted.
   */
  promotePhantomParagraph() {
    const phantom = this.container.querySelector(`[data-is-phantom]`);
    if (!phantom) return false;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;

    // Is the selection anchor inside the phantom?
    let node = /** @type {Node|null} */ (selection.anchorNode);
    let inside = false;
    while (node) {
      if (node === phantom) {
        inside = true;
        break;
      }
      node = node.parentNode;
    }
    if (!inside) return false;

    // Create a real paragraph node and append it to the tree.
    const para = new SyntaxNode(`paragraph`, ``);
    this.syntaxTree?.appendChild(para);

    // Replace the phantom DOM element with a properly rendered node.
    const element = this.writingRenderer.renderNode(para, true);
    if (element) {
      phantom.replaceWith(element);
    }

    // Point the cursor at the new node.
    if (this.syntaxTree) {
      this.syntaxTree.treeCursor = { nodeId: para.id, offset: 0 };
    }
    this.placeCursor();

    return true;
  }

  /**
   * Full re-render: tears down the entire DOM and rebuilds it from
   * the syntax tree.  Use only for operations that affect the whole
   * document (initial load, file open, view-mode switch, undo/redo).
   */
  fullRender() {
    if (!this.syntaxTree) return;

    this.isRendering = true;
    try {
      const renderer = this.viewMode === `source2` ? this.sourceRendererV2 : this.writingRenderer;
      renderer.fullRender(this.syntaxTree, this.container);
    } finally {
      this.isRendering = false;
    }
    document.dispatchEvent(new CustomEvent(`editor:renderComplete`));
  }

  /**
   * Incremental render: updates only the DOM elements for the nodes
   * listed in `hints`.
   *
   * @param {{ updated?: string[], added?: string[], removed?: string[] }} hints
   */
  renderNodes(hints) {
    if (!this.syntaxTree) return;

    if (this.viewMode === `source2`) {
      this.fullRender();
      return;
    }

    const renderer = this.writingRenderer;
    this.isRendering = true;
    try {
      renderer.renderNodes(this.container, hints);
    } finally {
      this.isRendering = false;
    }
    document.dispatchEvent(new CustomEvent(`editor:renderComplete`));
  }

  /**
   * Full render followed by cursor placement.
   */
  fullRenderAndPlaceCursor() {
    this.fullRender();
    this.lastRenderedNodeId = this.syntaxTree?.treeCursor?.nodeId ?? null;
    this.isRendering = true;
    this.placeCursor();
    this.isRendering = false;
  }

  /**
   * Incremental render followed by cursor placement.
   * @param {{ updated?: string[], added?: string[], removed?: string[] }} hints
   */
  renderNodesAndPlaceCursor(hints) {
    this.renderNodes(hints);
    this.isRendering = true;
    this.placeCursor();
    this.isRendering = false;
  }

  /**
   * Builds the full markdown source line for a node, including its syntax
   * prefix (e.g. `# ` for heading1).  This is fed to `parseSingleLine` so
   * the parser can detect type transitions.
   *
   * @param {string} type
   * @param {string} content
   * @param {NodeAttributes} attributes
   * @returns {string}
   */
  buildMarkdownLine(type, content, attributes) {
    switch (type) {
      case `heading1`:
        return `# ${content}`;
      case `heading2`:
        return `## ${content}`;
      case `heading3`:
        return `### ${content}`;
      case `heading4`:
        return `#### ${content}`;
      case `heading5`:
        return `##### ${content}`;
      case `heading6`:
        return `###### ${content}`;
      case `blockquote`:
        return `> ${content}`;
      case `list-item`: {
        const indent = `  `.repeat(attributes?.indent || 0);
        const marker = attributes?.ordered ? `${attributes?.number || 1}. ` : `- `;
        const checkbox =
          typeof attributes?.checked === `boolean` ? (attributes.checked ? `[x] ` : `[ ] `) : ``;
        return `${indent}${marker}${checkbox}${content}`;
      }
      case `image`: {
        const imgAlt = attributes?.alt ?? content;
        const imgSrc = attributes?.url ?? ``;
        if (attributes?.href) {
          return `[![${imgAlt}](${imgSrc})](${attributes.href})`;
        }
        return `![${imgAlt}](${imgSrc})`;
      }
      default:
        return content;
    }
  }

  /**
   * Returns the character length of the syntax prefix for a given node type.
   * E.g. heading1 → 2 (`# `), heading2 → 3 (`## `), paragraph → 0.
   *
   * @param {string} type
   * @param {NodeAttributes} [attributes]
   * @returns {number}
   */
  getPrefixLength(type, attributes) {
    switch (type) {
      case `heading1`:
        return 2;
      case `heading2`:
        return 3;
      case `heading3`:
        return 4;
      case `heading4`:
        return 5;
      case `heading5`:
        return 6;
      case `heading6`:
        return 7;
      case `blockquote`:
        return 2;
      case `list-item`: {
        const indent = `  `.repeat(attributes?.indent || 0);
        const marker = attributes?.ordered ? `${attributes?.number || 1}. ` : `- `;
        const checkbox = typeof attributes?.checked === `boolean` ? `[ ] ` : ``;
        return indent.length + marker.length + checkbox.length;
      }
      case `image`:
        return 0;
      case `code-block`: {
        const ticks = `\``.repeat(attributes?.fenceCount || 3);
        const lang = attributes?.language || ``;
        // Opening fence line: ```lang\n
        return ticks.length + lang.length + 1;
      }
      default:
        return 0;
    }
  }

  /**
   * Records an undo entry, marks the document dirty, renders, and places
   * the cursor.
   * @param {string} before - The markdown content before the edit
   * @param {{ updated?: string[], added?: string[], removed?: string[] }} [hints]
   */
  recordAndRender(before, hints) {
    if (!this.syntaxTree) return;

    const addedPara = this.ensureTrailingParagraph();
    if (addedPara && hints) {
      if (!hints.added) hints.added = [];
      hints.added.push(addedPara.id);
    }

    const after = this.syntaxTree.toMarkdown();
    if (before !== after) {
      this.undoManager.recordChange({ type: `input`, before, after });
      this.setUnsavedChanges(true);
    }

    if (hints) {
      this.renderNodesAndPlaceCursor(hints);
    } else {
      this.fullRenderAndPlaceCursor();
    }
  }

  /**
   * Ensures that the document does not end with an html-block container.
   * In writing view there is no way to place the cursor after a trailing
   * `</details>` block, so we append an empty paragraph whenever the last
   * top-level node is a container html-block.
   */
  ensureTrailingParagraph() {
    if (!this.syntaxTree) return null;
    const children = this.syntaxTree.children;
    if (children.length === 0) return null;
    const last = children[children.length - 1];
    if (last.type === `html-block` && last.children.length > 0) {
      const para = new SyntaxNode(`paragraph`, ``);
      this.syntaxTree.appendChild(para);
      return para;
    }
    return null;
  }

  /**
   * Loads markdown content into the editor.
   * @param {string} markdown - The markdown content to load
   */
  async loadMarkdown(markdown) {
    // Normalise excessive blank lines so that toMarkdown() / toBareText()
    // always produce exactly one blank line between blocks.
    const normalised = markdown.replace(/\n{3,}/g, `\n\n`);
    this.syntaxTree = await parser.parse(normalised);

    // Ensure there is at least one node so the editor is never empty
    if (this.syntaxTree.children.length === 0) {
      const node = new SyntaxNode(`paragraph`, ``);
      this.syntaxTree.appendChild(node);
    }

    // Ensure the document doesn't end with a container html-block
    // (the user would have no way to place the cursor after it in
    // writing view).
    this.ensureTrailingParagraph();

    const first = this.syntaxTree.children[0];
    this.syntaxTree.treeCursor = { nodeId: first.id, offset: 0 };

    this.undoManager.clear();
    this.setUnsavedChanges(false);

    // Rewrite absolute image paths to relative when the setting is enabled,
    // then render.  Because the rewrite is async (IPC round-trip) we render
    // once immediately and incrementally update only the image nodes whose
    // paths changed after the rewrite completes.
    this.fullRenderAndPlaceCursor();
    this.container.focus();
    this.imageHelper.rewriteImagePaths().then((changedIds) => {
      if (changedIds.length > 0) {
        this.renderNodesAndPlaceCursor({ updated: changedIds });
      }
    });
  }

  /**
   * Gets the current document as markdown.
   * @returns {string}
   */
  getMarkdown() {
    return this.syntaxTree?.toMarkdown() ?? ``;
  }

  /**
   * Resets the editor to an empty document.
   */
  reset() {
    this.syntaxTree = new SyntaxTree();
    const node = new SyntaxNode(`paragraph`, ``);
    this.syntaxTree.appendChild(node);
    this.syntaxTree.treeCursor = { nodeId: node.id, offset: 0 };
    this.undoManager.clear();
    this.currentFilePath = null;
    this.setUnsavedChanges(false);
    this.fullRenderAndPlaceCursor();
  }

  /**
   * Returns the renderer for a given view mode.
   * @param {ViewMode} mode
   * @returns {SourceRendererV2|WritingRenderer}
   */
  getRendererForMode(mode) {
    return mode === `source2` ? this.sourceRendererV2 : this.writingRenderer;
  }

  /**
   * Sets the view mode.
   * @param {ViewMode} mode
   */
  async setViewMode(mode) {
    if (!VIEW_MODES.includes(mode)) {
      console.warn(`Invalid view mode: ${mode}`);
      return;
    }

    // Nothing to do if already in the requested mode.
    if (mode === this.viewMode) return;

    // Perform all steps related to leaving the current view.
    const switchData = await this.renderer.leaveView();

    // At this point, the old view is "dead"; perform any tasks
    // that should happen after "switching away from" the current
    // view, but before "switching to" the requested view.
    this.transitionView(mode, switchData);

    // At this point we have everything ready to switch over.
    this.renderer = this.getRendererForMode(mode);
    this.renderer.enterView(switchData);
  }

  /**
   * Hook for transition-specific work between leaving one view and
   * entering another.  Currently a no-op; exists so that future
   * cross-view transitions can be handled without touching renderers.
   * @param {ViewMode} _mode - the target view mode
   * @param {ViewSwitchData} _switchData
   */
  transitionView(_mode, _switchData) {
    // Nothing to do for the current set of view modes.
  }

  /**
   * Returns the formatter appropriate for the current view mode.
   * @returns {Formatter}
   */
  getFormatter() {
    if (this.viewMode === `source2`) return this.source2Formatter;
    return this.treeFormatter;
  }

  /** Undoes the last action. */
  async undo() {
    const change = this.undoManager.undo();
    if (change) {
      this.syntaxTree = await parser.parse(change.before);
      if (this.syntaxTree.children.length === 0) {
        const node = new SyntaxNode(`paragraph`, ``);
        this.syntaxTree.appendChild(node);
      }
      const first = this.syntaxTree.children[0];
      this.syntaxTree.treeCursor = { nodeId: first.id, offset: 0 };
      this.fullRenderAndPlaceCursor();
      this.setUnsavedChanges(true);
    }
  }

  /** Redoes the last undone action. */
  async redo() {
    const change = this.undoManager.redo();
    if (change) {
      this.syntaxTree = await parser.parse(change.after);
      if (this.syntaxTree.children.length === 0) {
        const node = new SyntaxNode(`paragraph`, ``);
        this.syntaxTree.appendChild(node);
      }
      const last = this.syntaxTree.children[this.syntaxTree.children.length - 1];
      this.syntaxTree.treeCursor = {
        nodeId: last.id,
        offset: last.content.length,
      };
      this.fullRenderAndPlaceCursor();
      this.setUnsavedChanges(true);
    }
  }

  /**
   * Inserts text at the current cursor position (public API).
   * @param {string} text
   */
  async insertText(text) {
    await this.editOperations.insertTextAtCursor(text);
  }

  /**
   * Returns the shared ImageModal instance, creating it lazily.
   * Both the toolbar and editor use this to avoid duplicate dialogs.
   * @returns {ImageModal}
   */
  getImageModal() {
    return this.imageHelper.getImageModal();
  }

  /**
   * Inserts a new image node or updates the existing image node at the cursor.
   * @param {string} alt - Alt text
   * @param {string} src - Image source path or URL
   * @param {string} href - Optional link URL (empty string for no link)
   * @param {string} [style] - Optional inline style
   */
  insertOrUpdateImage(alt, src, href, style = ``) {
    this.imageHelper.insertOrUpdateImage(alt, src, href, style);
  }

  /**
   * Converts an absolute image path to a relative path.
   * @param {string} imagePath
   * @returns {Promise<string>}
   */
  async toRelativeImagePath(imagePath) {
    return this.imageHelper.toRelativeImagePath(imagePath);
  }

  /**
   * Rewrites absolute image paths to relative paths.
   * @returns {Promise<string[]>} IDs of nodes whose paths were rewritten.
   */
  async rewriteImagePaths() {
    return this.imageHelper.rewriteImagePaths();
  }

  /**
   * Inserts a new table node or updates the existing table node at the cursor.
   * @param {{rows: number, columns: number, cells: string[][]}} tableData
   */
  insertOrUpdateTable(tableData) {
    if (!this.syntaxTree) return;

    // Build markdown from the cells
    const markdown = this.tableManager.buildTableMarkdown(tableData);

    const before = this.syntaxTree.toMarkdown();
    const currentNode = this.getCurrentBlockNode();
    let renderHints;

    if (currentNode?.type === `table`) {
      // Update existing table
      currentNode.content = markdown;
      this.syntaxTree.treeCursor = { nodeId: currentNode.id, offset: 0 };
      renderHints = { updated: [currentNode.id] };
    } else {
      // Insert a new table node
      const tableNode = new SyntaxNode(`table`, markdown);

      if (currentNode) {
        const siblings = this.getSiblings(currentNode);
        const idx = siblings.indexOf(currentNode);
        if (currentNode.type === `paragraph` && currentNode.content === ``) {
          siblings.splice(idx, 1, tableNode);
          tableNode.parent = currentNode.parent;
          currentNode.parent = null;
          renderHints = { added: [tableNode.id], removed: [currentNode.id] };
        } else {
          siblings.splice(idx + 1, 0, tableNode);
          tableNode.parent = currentNode.parent;
          renderHints = { added: [tableNode.id] };
        }
      } else {
        this.syntaxTree.appendChild(tableNode);
        renderHints = { added: [tableNode.id] };
      }

      this.syntaxTree.treeCursor = { nodeId: tableNode.id, offset: 0 };
    }

    this.recordAndRender(before, renderHints);
  }

  /**
   * Changes the type of the current element.
   * @param {string} elementType
   */
  changeElementType(elementType) {
    const currentNode = this.getCurrentBlockNode();
    if (!currentNode || !this.syntaxTree) return;

    // html-block containers are structural nodes, not type-changeable.
    if (currentNode.type === `html-block` && currentNode.children.length > 0) return;

    const wasListItem = currentNode.type === `list-item`;
    const siblings = this.getSiblings(currentNode);
    const idx = siblings.indexOf(currentNode);

    const beforeContent = this.getMarkdown();
    this.syntaxTree.changeNodeType(currentNode, elementType);

    // If a list item was removed from a run, renumber the remaining items.
    /** @type {string[]} */
    let renumbered = [];
    if (wasListItem && currentNode.type !== `list-item`) {
      renumbered = this.renumberAdjacentList(siblings, idx);
    }

    this.undoManager.recordChange({
      type: `changeType`,
      before: beforeContent,
      after: this.getMarkdown(),
    });

    const updatedIds = [currentNode.id, ...renumbered];
    this.renderNodesAndPlaceCursor({ updated: updatedIds });
    this.setUnsavedChanges(true);
  }

  /**
   * Toggles list formatting on the current node.
   *
   * - Non-list → list-item (of the requested kind)
   * - List-item of same kind → paragraph (toggle off)
   * - List-item of different kind → switch to new kind
   *
   * The three list kinds are:
   * - `'unordered'` — bullet list (`- text`)
   * - `'ordered'`   — numbered list (`1. text`)
   * - `'checklist'` — checklist (`- [ ] text` / `- [x] text`)
   *
   * @param {'unordered' | 'ordered' | 'checklist'} kind
   */
  async toggleList(kind) {
    const currentNode = this.getCurrentBlockNode();
    if (!currentNode || !this.syntaxTree) return;

    // html-block containers are structural nodes, not convertible.
    if (currentNode.type === `html-block` && currentNode.children.length > 0) return;

    const before = this.getMarkdown();

    /**
     * Returns the list kind for a list-item node.
     * @param {SyntaxNode} n
     * @returns {'unordered' | 'ordered' | 'checklist'}
     */
    const getListKind = (n) => {
      if (typeof n.attributes.checked === `boolean`) return `checklist`;
      return n.attributes.ordered ? `ordered` : `unordered`;
    };

    /**
     * Applies list-item attributes for a given kind.
     * @param {SyntaxNode} n
     * @param {'unordered' | 'ordered' | 'checklist'} k
     * @param {number} [num]
     */
    const applyKind = (n, k, num) => {
      n.type = `list-item`;
      switch (k) {
        case `ordered`:
          n.attributes = {
            ordered: true,
            indent: n.attributes.indent || 0,
            number: num || 1,
          };
          break;
        case `checklist`:
          n.attributes = {
            ordered: false,
            indent: n.attributes.indent || 0,
            checked: false,
          };
          break;
        default:
          n.attributes = { ordered: false, indent: n.attributes.indent || 0 };
          break;
      }
    };

    // Multi-node selection: convert each node in the range to a list item.
    if (this.treeRange && this.treeRange.startNodeId !== this.treeRange.endNodeId) {
      const nodes = this.getNodesInRange(this.treeRange.startNodeId, this.treeRange.endNodeId);

      // Detect nodes that live inside html-block containers.
      // Converting them requires dissolving their parent wrapper.
      const htmlBlockParents = new Set();
      for (const n of nodes) {
        if (n.parent && n.parent.type === `html-block`) {
          htmlBlockParents.add(n.parent);
        }
      }

      if (htmlBlockParents.size > 0) {
        const tagNames = [...htmlBlockParents]
          .map((p) => `<${/** @type {SyntaxNode} */ (p).attributes.tagName ?? `html`}>`)
          .join(`, `);
        const result = await /** @type {any} */ (globalThis).electronAPI?.confirmDialog({
          type: `warning`,
          title: `Destructive Conversion`,
          message: `This selection includes content inside HTML block elements (${tagNames}) that will be removed by this conversion.`,
          detail: `The HTML wrapper tags will be permanently lost. Do you want to proceed?`,
          buttons: [`Convert`, `Cancel`],
          defaultId: 0,
          cancelId: 1,
        });
        if (!result || result.response !== 0) return;

        for (const htmlBlock of htmlBlockParents) {
          const parent = /** @type {SyntaxNode} */ (htmlBlock);
          const treeChildren = this.syntaxTree.children;
          const idx = treeChildren.indexOf(parent);
          if (idx === -1) continue;
          const lifted = parent.children.slice();
          // Splice the children into the tree at the html-block's position
          treeChildren.splice(idx, 1, ...lifted);
          for (const child of lifted) {
            child.parent = null;
          }
        }
      }

      const updatedIds = [];
      let num = 1;
      for (const n of nodes) {
        if (n.type === `html-block` && n.children.length > 0) continue;
        if (n.type === `table` || n.type === `image` || n.type === `linked-image`) continue;
        applyKind(n, kind, num);
        if (kind === `ordered`) num++;
        updatedIds.push(n.id);
      }
      if (updatedIds.length === 0) return;

      this.treeRange = null;
      this.syntaxTree.treeCursor = {
        nodeId: updatedIds[0],
        blockNodeId: updatedIds[0],
        offset: 0,
      };
      this.undoManager.recordChange({
        type: `changeType`,
        before,
        after: this.getMarkdown(),
      });
      this.container.focus();
      this.renderNodesAndPlaceCursor({ updated: updatedIds });

      // Scroll the first converted node into view so the top of
      // the list is visible after a large multi-node conversion.
      const firstEl = this.container.querySelector(`[data-node-id="${updatedIds[0]}"]`);
      if (firstEl) {
        firstEl.scrollIntoView({ block: `nearest`, behavior: `instant` });
      }

      this.setUnsavedChanges(true);
      return;
    }

    // Single node toggle — when on a list item, affect the entire
    // contiguous run of list items (the "list").
    if (currentNode.type === `list-item`) {
      const siblings = this.getSiblings(currentNode);
      const run = this.getContiguousListRun(siblings, currentNode);
      const currentKind = getListKind(currentNode);

      if (currentKind === kind) {
        // Same list kind → convert entire run back to paragraphs
        for (const n of run) {
          n.type = `paragraph`;
          n.attributes = {};
        }
      } else {
        // Different list kind → switch entire run
        let num = 1;
        for (const n of run) {
          applyKind(n, kind, num);
          if (kind === `ordered`) num++;
        }
      }

      this.syntaxTree.treeCursor = {
        nodeId: currentNode.id,
        blockNodeId: currentNode.id,
        offset: this.syntaxTree.treeCursor?.offset ?? 0,
      };
      this.undoManager.recordChange({
        type: `changeType`,
        before,
        after: this.getMarkdown(),
      });
      this.container.focus();
      this.renderNodesAndPlaceCursor({ updated: run.map((n) => n.id) });
      this.setUnsavedChanges(true);
      return;
    }
    applyKind(currentNode, kind, 1);

    this.syntaxTree.treeCursor = {
      nodeId: currentNode.id,
      blockNodeId: currentNode.id,
      offset: this.syntaxTree.treeCursor?.offset ?? 0,
    };
    this.undoManager.recordChange({
      type: `changeType`,
      before,
      after: this.getMarkdown(),
    });
    this.container.focus();
    this.renderNodesAndPlaceCursor({ updated: [currentNode.id] });
    this.setUnsavedChanges(true);
  }

  /**
   * Returns the contiguous run of `list-item` nodes surrounding `node`
   * within the given sibling list.
   *
   * @param {SyntaxNode[]} siblings
   * @param {SyntaxNode} node
   * @returns {SyntaxNode[]}
   */
  getContiguousListRun(siblings, node) {
    const idx = siblings.indexOf(node);
    let start = idx;
    let end = idx;
    while (start > 0 && siblings[start - 1].type === `list-item`) start--;
    while (end < siblings.length - 1 && siblings[end + 1].type === `list-item`) end++;
    return siblings.slice(start, end + 1);
  }

  /**
   * Renumbers all ordered list items in the contiguous run surrounding
   * `nearIndex` so they are sequential starting from 1.  Returns the
   * IDs of every node whose number was changed (for render hints).
   *
   * @param {SyntaxNode[]} siblings
   * @param {number} nearIndex - Index of a node in or adjacent to the run
   * @returns {string[]} IDs of nodes that were renumbered
   */
  renumberAdjacentList(siblings, nearIndex) {
    // Find the start of the contiguous list-item run
    let start = nearIndex;
    while (start > 0 && siblings[start - 1]?.type === `list-item`) start--;
    // Find the end
    let end = nearIndex;
    while (end < siblings.length - 1 && siblings[end + 1]?.type === `list-item`) end++;

    const changed = [];
    let num = 1;
    for (let i = start; i <= end; i++) {
      const sib = siblings[i];
      if (sib.type !== `list-item` || !sib.attributes.ordered) continue;
      if (sib.attributes.number !== num) {
        sib.attributes.number = num;
        changed.push(sib.id);
      }
      num++;
    }
    return changed;
  }

  /**
   * Gets all nodes between two node IDs (inclusive), walking the flat
   * top-level children of the syntax tree.
   *
   * @param {string} startId
   * @param {string} endId
   * @returns {SyntaxNode[]}
   */
  getNodesInRange(startId, endId) {
    if (!this.syntaxTree) return [];

    /**
     * Walks children (recursing into html-block containers) and
     * collects all leaf block nodes between startId and endId.
     * @param {SyntaxNode[]} children
     * @param {{collecting: boolean, done: boolean}} state
     * @param {SyntaxNode[]} result
     */
    const walk = (children, state, result) => {
      for (const child of children) {
        if (state.done) break;
        // Recurse into html-block containers
        if (child.type === `html-block` && child.children.length > 0) {
          walk(child.children, state, result);
          continue;
        }
        if (child.id === startId) state.collecting = true;
        if (state.collecting) result.push(child);
        if (child.id === endId) {
          state.done = true;
          break;
        }
      }
    };

    const state = { collecting: false, done: false };
    /** @type {SyntaxNode[]} */
    const result = [];
    walk(this.syntaxTree.children, state, result);
    return result;
  }

  /**
   * Applies formatting to the current selection.
   * @param {string} format
   */
  applyFormat(format) {
    if (!this.syntaxTree) return;

    // Use tree-coordinate selection (treeCursor / treeRange) — never
    // DOM-derived line/column data.
    const nodeId = this.getBlockNodeId();
    const node = this.getCurrentBlockNode();
    if (!nodeId || !node || !this.syntaxTree?.treeCursor) return;
    let startOffset;
    let endOffset;

    if (this.treeRange) {
      // Non-collapsed selection — use the range offsets.
      // For now we only support single-node selections.
      if (this.treeRange.startNodeId !== nodeId || this.treeRange.endNodeId !== nodeId) return;
      startOffset = this.treeRange.startOffset;
      endOffset = this.treeRange.endOffset;
    } else {
      // Collapsed cursor — pass the cursor position; applyFormat will
      // detect the word boundaries or existing format span.
      startOffset = this.syntaxTree.treeCursor.offset;
      endOffset = this.syntaxTree.treeCursor.offset;
    }

    const beforeContent = this.getMarkdown();
    const newCursorOffset = this.syntaxTree.applyFormat(node, startOffset, endOffset, format);

    this.undoManager.recordChange({
      type: `format`,
      before: beforeContent,
      after: this.getMarkdown(),
    });

    // Place cursor at the end of the formatted/unformatted text and
    // collapse the selection — the old range is no longer valid.
    if (this.syntaxTree?.treeCursor) this.syntaxTree.treeCursor.offset = newCursorOffset;
    this.treeRange = null;

    this.renderNodesAndPlaceCursor({ updated: [nodeId] });
    this.setUnsavedChanges(true);
  }

  /**
   * Sets the cursor position.
   * @param {number} line
   * @param {number} column
   */
  setCursorPosition(line, column) {
    this.selectionManager.setCursorPosition(line, column);
  }

  /**
   * Sets the selection range.
   * @param {{startLine: number, startColumn: number, endLine: number, endColumn: number}} range
   */
  setSelection(range) {
    this.selectionManager.setSelection(range);
  }

  /**
   * Sets whether there are unsaved changes.
   * @param {boolean} hasChanges
   */
  setUnsavedChanges(hasChanges) {
    this.hasUnsavedChanges = hasChanges;
    if (window.electronAPI) {
      window.electronAPI.setUnsavedChanges(hasChanges);
    }
    this.updateWindowTitle();
  }

  /**
   * Updates the window title to reflect the current state.
   * Dispatches a 'editor:fileStateChanged' event for other components.
   */
  updateWindowTitle() {
    const fileName = this.currentFilePath ? this.currentFilePath.split(/[\\/]/).pop() : `Untitled`;
    const modified = this.hasUnsavedChanges ? ` •` : ``;
    document.title = `${fileName}${modified} - Markdown Editor`;

    document.dispatchEvent(
      new CustomEvent(`editor:fileStateChanged`, {
        detail: {
          filePath: this.currentFilePath,
          modified: this.hasUnsavedChanges,
        },
      }),
    );
  }
}
