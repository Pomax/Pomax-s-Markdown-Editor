/**
 * @fileoverview Search bar for finding text in the editor.
 *
 * Supports plain text and regex matching, case-sensitive and
 * case-insensitive modes.  Searches against `syntaxTree.toMarkdown()`
 * in source view and `syntaxTree.toBareText()` in writing view, then
 * maps match offsets back to individual syntax-tree nodes for DOM
 * highlighting.
 */

/**
 * @typedef {Object} SearchMatch
 * @property {number} docStart  - Start offset in the full document string
 * @property {number} docEnd    - End offset in the full document string
 */

/**
 * @typedef {Object} NodeSegment
 * @property {string} nodeId
 * @property {number} startOffset  - Start within the node's text
 * @property {number} endOffset    - End within the node's text
 */

/**
 * @typedef {Object} OffsetMapEntry
 * @property {string} nodeId
 * @property {number} docStart     - Where this node's text begins in the flat document
 * @property {number} docEnd       - Where this node's text ends in the flat document
 * @property {string} text         - The node's text (markdown or bare)
 */

export class SearchBar {
  /**
   * @param {import('../editor/editor.js').Editor} editor
   */
  constructor(editor) {
    /** @type {import('../editor/editor.js').Editor} */
    this.editor = editor;

    /** @type {HTMLElement|null} */
    this.container = null;

    /** @type {HTMLInputElement|null} */
    this.input = null;

    /** @type {HTMLElement|null} */
    this.matchCount = null;

    /** @type {boolean} */
    this.useRegex = false;

    /** @type {boolean} */
    this.caseSensitive = false;

    /** @type {boolean} */
    this.visible = false;

    /** @type {SearchMatch[]} */
    this.matches = [];

    /** @type {number} */
    this.currentIndex = -1;

    /** @type {OffsetMapEntry[]} */
    this.offsetMap = [];

    /** @type {string} */
    this.documentText = ``;

    /**
     * The view mode the current offset map was built for.
     * Used to detect view-mode switches so we can rebuild.
     * @type {string|null}
     */
    this.searchViewMode = null;

    /**
     * Bound handler for render-complete events so we can remove it.
     * @type {(() => void)|null}
     */
    this.renderCompleteHandler = null;
  }

  /**
   * Builds the DOM for the search bar and inserts it into the page.
   * Called once during app initialisation.
   */
  initialize() {
    this.container = document.createElement(`div`);
    this.container.className = `search-bar`;
    this.container.setAttribute(`role`, `search`);
    this.container.setAttribute(`aria-label`, `Find in document`);
    // Prevent the editor from losing focus metrics when clicking
    // inside the search bar — but we do want the input to be
    // focusable, so we only guard non-input clicks.
    // Also initiate drag when the mousedown is not on an interactive
    // element (input or button).
    this.container.addEventListener(`mousedown`, (e) => {
      const tag = /** @type {HTMLElement} */ (e.target).tagName;
      if (tag !== `INPUT` && tag !== `BUTTON`) {
        e.preventDefault();
        this.startDrag(e);
      } else if (tag === `BUTTON`) {
        e.preventDefault();
      }
    });

    this.container.innerHTML = `
            <div class="search-bar-inner">
                <input
                    type="text"
                    class="search-input"
                    placeholder="Find…"
                    aria-label="Search text"
                    spellcheck="false"
                    autocomplete="off"
                />
                <button class="search-toggle" data-action="regex" title="Use regular expression" aria-pressed="false">.*</button>
                <button class="search-toggle" data-action="case" title="Match case" aria-pressed="false">Aa</button>
                <span class="search-match-count" aria-live="polite"></span>
                <button class="search-nav-btn" data-action="prev" title="Previous match (Shift+Enter)" aria-label="Previous match">&#x25B2;</button>
                <button class="search-nav-btn" data-action="next" title="Next match (Enter)" aria-label="Next match">&#x25BC;</button>
                <button class="search-close-btn" title="Close (Escape)" aria-label="Close search">&times;</button>
            </div>
        `;

    this.input = /** @type {HTMLInputElement} */ (this.container.querySelector(`.search-input`));
    this.matchCount = /** @type {HTMLElement} */ (
      this.container.querySelector(`.search-match-count`)
    );

    // Wire up events
    this.input.addEventListener(`input`, () => this.onSearchChanged());
    this.input.addEventListener(`keydown`, (e) => this.onInputKeyDown(e));

    // Toggle buttons
    for (const btn of this.container.querySelectorAll(`.search-toggle`)) {
      btn.addEventListener(`click`, () => {
        const action = /** @type {HTMLElement} */ (btn).dataset.action;
        if (action === `regex`) {
          this.useRegex = !this.useRegex;
          btn.setAttribute(`aria-pressed`, String(this.useRegex));
          btn.classList.toggle(`active`, this.useRegex);
        } else if (action === `case`) {
          this.caseSensitive = !this.caseSensitive;
          btn.setAttribute(`aria-pressed`, String(this.caseSensitive));
          btn.classList.toggle(`active`, this.caseSensitive);
        }
        this.onSearchChanged();
      });
    }

    // Navigation buttons
    for (const btn of this.container.querySelectorAll(`.search-nav-btn`)) {
      btn.addEventListener(`click`, () => {
        const action = /** @type {HTMLElement} */ (btn).dataset.action;
        if (action === `prev`) this.previous();
        if (action === `next`) this.next();
      });
    }

    // Close button
    const closeBtn = /** @type {HTMLElement} */ (this.container.querySelector(`.search-close-btn`));
    closeBtn.addEventListener(`click`, () => this.close());

    // Insert into the DOM as a floating panel inside #app.
    const app = document.getElementById(`app`);
    if (app) {
      app.appendChild(this.container);
    }

    // Start hidden
    this.container.style.display = `none`;

    // Listen for renders so we can re-apply highlights.
    // If the view mode changed since we last searched, rebuild
    // the offset map and re-run the search so highlights stay
    // correct across source ↔ writing switches.
    this.renderCompleteHandler = () => {
      if (this.visible && this.editor.viewMode !== this.searchViewMode) {
        this.onSearchChanged();
      } else {
        this.applyHighlights();
      }
    };
    document.addEventListener(`editor:renderComplete`, this.renderCompleteHandler);
  }

  /**
   * Opens the search bar, focusing the input.  If already open,
   * selects the current search text for quick replacement.
   */
  open() {
    if (!this.container || !this.input) return;
    this.visible = true;
    this.container.style.display = ``;
    // Reset position to default top-right corner.
    this.container.style.top = ``;
    this.container.style.right = ``;
    this.container.style.left = ``;
    this.input.focus();
    this.input.select();
    // Re-run the search in case the view mode changed since
    // the bar was last open.
    this.onSearchChanged();
  }

  /**
   * Closes the search bar and clears all highlights.
   */
  close() {
    if (!this.container) return;
    this.visible = false;
    this.container.style.display = `none`;
    this.clearHighlights();
    this.matches = [];
    this.currentIndex = -1;
    this.updateMatchCount();
    // Return focus to the editor
    this.editor.container.focus();
  }

  /** @returns {boolean} Whether the search bar is currently visible. */
  get isOpen() {
    return this.visible;
  }

  /** Navigates to the next match. */
  next() {
    if (this.matches.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.matches.length;
    this.updateMatchCount();
    this.applyHighlights();
    this.scrollToCurrentMatch();
  }

  /** Navigates to the previous match. */
  previous() {
    if (this.matches.length === 0) return;
    this.currentIndex = (this.currentIndex - 1 + this.matches.length) % this.matches.length;
    this.updateMatchCount();
    this.applyHighlights();
    this.scrollToCurrentMatch();
  }

  /** Cleans up event listeners. */
  destroy() {
    if (this.renderCompleteHandler) {
      document.removeEventListener(`editor:renderComplete`, this.renderCompleteHandler);
      this.renderCompleteHandler = null;
    }
    this.container?.remove();
  }

  // ─── Drag handling ──────────────────────────────────────────

  /**
   * Begins dragging the search panel.
   * @param {MouseEvent} e
   */
  startDrag(e) {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    /** @param {MouseEvent} moveEvent */
    const onMove = (moveEvent) => {
      if (!this.container) return;
      const x = moveEvent.clientX - offsetX;
      const y = moveEvent.clientY - offsetY;
      this.container.style.left = `${x}px`;
      this.container.style.top = `${y}px`;
      this.container.style.right = `auto`;
    };

    const onUp = () => {
      document.removeEventListener(`mousemove`, onMove);
      document.removeEventListener(`mouseup`, onUp);
    };

    document.addEventListener(`mousemove`, onMove);
    document.addEventListener(`mouseup`, onUp);
  }

  // ─── Private ────────────────────────────────────────────

  /**
   * Called whenever the search input or toggles change.
   * Rebuilds the offset map, runs the search, highlights results.
   */
  onSearchChanged() {
    const query = this.input?.value ?? ``;
    this.buildOffsetMap();
    this.runSearch(query);
    this.currentIndex = this.findClosestMatchIndex();
    this.updateMatchCount();
    this.applyHighlights();
    if (this.matches.length > 0) {
      this.scrollToCurrentMatch();
    }
  }

  /**
   * Returns the index of the first match at or after the current
   * cursor position, so the user sees the closest hit rather than
   * always jumping to the top of the document.  Falls back to 0 if
   * the cursor is past all matches.
   *
   * @returns {number} Index into `this.matches`, or -1 if empty.
   */
  findClosestMatchIndex() {
    if (this.matches.length === 0) return -1;

    const cursor = this.editor.syntaxTree?.treeCursor;
    if (!cursor) return 0;

    // Convert the cursor's (nodeId, offset) to a document-level
    // offset using the offset map we already built.
    let cursorDocOffset = 0;
    for (const entry of this.offsetMap) {
      if (entry.nodeId === cursor.nodeId) {
        cursorDocOffset = entry.docStart + cursor.offset;
        break;
      }
    }

    // Find the first match whose start is >= the cursor position.
    for (let i = 0; i < this.matches.length; i++) {
      if (this.matches[i].docStart >= cursorDocOffset) return i;
    }

    // Cursor is past all matches — wrap to the first one.
    return 0;
  }

  /**
   * Handles keydown inside the search input.
   * @param {KeyboardEvent} e
   */
  onInputKeyDown(e) {
    if (e.key === `Escape`) {
      e.preventDefault();
      this.close();
    } else if (e.key === `Enter` && e.shiftKey) {
      e.preventDefault();
      this.previous();
    } else if (e.key === `Enter`) {
      e.preventDefault();
      this.next();
    }
  }

  /**
   * Builds the flat document text and an offset map that lets us
   * translate document-level offsets to per-node offsets.
   */
  buildOffsetMap() {
    const tree = this.editor.syntaxTree;
    if (!tree) {
      this.documentText = ``;
      this.offsetMap = [];
      return;
    }

    const isSource = this.editor.viewMode === `source`;
    this.searchViewMode = this.editor.viewMode;
    /** @type {OffsetMapEntry[]} */
    const map = [];
    let pos = 0;

    /**
     * Recursively walks nodes and appends their text to the map.
     * @param {import('../../../../old-parser/parser/syntax-tree.js').SyntaxNode[]} nodes
     * @param {boolean} isFirst - Whether we need to prepend a separator
     */
    const walk = (nodes, isFirst) => {
      let first = isFirst;
      for (const node of nodes) {
        // html-block containers are virtual — their text is produced
        // by their children.  In source mode the opening/closing tag
        // lines are part of toMarkdown(), so we handle them as a unit.
        if (node.type === `html-block` && node.children.length > 0) {
          if (isSource) {
            // Source mode: the whole block is one markdown chunk.
            const text = node.toMarkdown();
            if (!first) {
              pos += 2; // \n\n separator
            }
            map.push({
              nodeId: node.id,
              docStart: pos,
              docEnd: pos + text.length,
              text,
            });
            pos += text.length;
            first = false;
          } else {
            // Writing mode: only bare-text single-child containers
            // collapse into one entry; multi-child containers
            // flatten their children.
            if (
              node.children.length === 1 &&
              node.children[0].attributes.bareText &&
              node.children[0].type === `paragraph`
            ) {
              const text = node.toBareText();
              if (!first) pos += 2;
              map.push({
                nodeId: node.children[0].id,
                docStart: pos,
                docEnd: pos + text.length,
                text,
              });
              pos += text.length;
              first = false;
            } else {
              walk(node.children, first);
              first = false;
            }
          }
          continue;
        }

        const text = isSource ? node.toMarkdown() : node.toBareText();
        // Skip nodes that produce no text (images, hr in writing)
        if (text === ``) continue;

        if (!first) {
          pos += 2; // \n\n separator
        }
        map.push({ nodeId: node.id, docStart: pos, docEnd: pos + text.length, text });
        pos += text.length;
        first = false;
      }
    };

    walk(tree.children, true);

    // Reconstruct the flat document string from the map so it is
    // guaranteed to align with the offsets.
    let doc = ``;
    for (let i = 0; i < map.length; i++) {
      if (i > 0) {
        // Fill the gap between previous entry end and this entry start
        const gap = map[i].docStart - map[i - 1].docEnd;
        doc += `\n\n`.substring(0, gap);
      }
      doc += map[i].text;
    }
    this.documentText = doc;
    this.offsetMap = map;
  }

  /**
   * Runs the search query against the flat document text and
   * populates `this.matches`.
   *
   * @param {string} query
   */
  runSearch(query) {
    this.matches = [];
    if (!query || !this.documentText) return;

    // Require at least 2 characters for plain-text searches to
    // avoid an overwhelming number of single-letter hits.
    if (!this.useRegex && query.length < 2) return;

    // In writing view, plain-text (non-regex) searches are confined
    // to individual elements so matches don't span across block
    // boundaries — this feels more natural in WYSIWYG mode.
    const perNode = !this.useRegex && this.editor.viewMode === `writing`;

    if (perNode) {
      const flags = this.caseSensitive ? `g` : `gi`;
      const re = new RegExp(SearchBar.escapeRegex(query), flags);
      for (const entry of this.offsetMap) {
        let m;
        // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
        while ((m = re.exec(entry.text)) !== null) {
          this.matches.push({
            docStart: entry.docStart + m.index,
            docEnd: entry.docStart + m.index + m[0].length,
          });
        }
        re.lastIndex = 0;
      }
      return;
    }

    try {
      const flags = this.caseSensitive ? `g` : `gi`;
      const pattern = this.useRegex ? query : SearchBar.escapeRegex(query);
      const re = new RegExp(pattern, flags);

      let m;
      // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
      while ((m = re.exec(this.documentText)) !== null) {
        // Guard against zero-length matches causing an infinite loop.
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        this.matches.push({ docStart: m.index, docEnd: m.index + m[0].length });
      }
    } catch {
      // Invalid regex — treat as no matches.
    }
  }

  /**
   * Maps a single document-level match to one or more per-node
   * segments for highlighting.
   *
   * @param {SearchMatch} match
   * @returns {NodeSegment[]}
   */
  matchToSegments(match) {
    /** @type {NodeSegment[]} */
    const segments = [];

    for (const entry of this.offsetMap) {
      // Does this match overlap with this entry?
      if (match.docEnd <= entry.docStart || match.docStart >= entry.docEnd) {
        continue;
      }
      const startInNode = Math.max(0, match.docStart - entry.docStart);
      const endInNode = Math.min(entry.text.length, match.docEnd - entry.docStart);
      segments.push({ nodeId: entry.nodeId, startOffset: startInNode, endOffset: endInNode });
    }

    return segments;
  }

  /**
   * Clears all `<mark>` highlight elements from the editor DOM.
   */
  clearHighlights() {
    const marks = this.editor.container.querySelectorAll(`mark.search-highlight`);
    for (const mark of marks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      // Replace the <mark> with its text content.
      const text = document.createTextNode(mark.textContent ?? ``);
      parent.replaceChild(text, mark);
      // Merge adjacent text nodes.
      parent.normalize();
    }
  }

  /**
   * Applies `<mark>` highlights for all current matches into the
   * editor DOM.  Called after every search change and after renders.
   */
  applyHighlights() {
    this.clearHighlights();
    if (!this.visible || this.matches.length === 0) return;

    for (let i = 0; i < this.matches.length; i++) {
      const segments = this.matchToSegments(this.matches[i]);
      const isActive = i === this.currentIndex;

      for (const seg of segments) {
        this.highlightSegment(seg, isActive);
      }
    }
  }

  /**
   * Highlights a single per-node segment by wrapping the matching
   * text range in a `<mark>` element.
   *
   * We walk the text nodes inside the `[data-node-id]` element,
   * accumulate offsets, and split/wrap the target range.
   *
   * In **source mode** the searchable text is the full markdown line
   * including the prefix (e.g. `## Heading`).  However the DOM
   * separates the prefix into `span.md-syntax` and the content into
   * `span.md-content` (or a bare text node for paragraphs).  We walk
   * *all* text nodes inside the `[data-node-id]` element in document
   * order, which naturally visits prefix text first and content text
   * second — the accumulated offset therefore aligns with the
   * `toMarkdown()` output.
   *
   * In **writing mode** the searchable text comes from `toBareText()`
   * which strips formatting delimiters.  The DOM contains text nodes
   * interleaved with inline formatting elements (`<strong>`, `<em>`,
   * etc.) and empty cursor-landing-pad text nodes.  We walk all text
   * nodes, skipping empty ones, so the accumulated visible text
   * aligns with the `toBareText()` output.
   *
   * **Code blocks** are a special case: in source mode the
   * `toMarkdown()` output includes the fence lines
   * (` ```lang ` / ` ``` `) and the code content, separated by `\n`.
   * The DOM renders these as separate child `<div>` elements
   * (`div.md-code-fence` + `div.md-code-content` + `div.md-code-fence`)
   * whose text nodes we walk in order.
   *
   * @param {NodeSegment} seg
   * @param {boolean} isActive
   */
  highlightSegment(seg, isActive) {
    const el = this.editor.container.querySelector(`[data-node-id="${seg.nodeId}"]`);
    if (!el) return;

    const isFocused = this.editor.viewMode === `writing`;

    // Collect text nodes in document order via TreeWalker.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    /** @type {{ node: Text, start: number, end: number }[]} */
    const textRuns = [];
    let offset = 0;
    /** @type {Text|null} */
    let textNode;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard TreeWalker loop
    while ((textNode = /** @type {Text|null} */ (walker.nextNode()))) {
      const len = textNode.textContent?.length ?? 0;
      // In writing mode, skip empty landing-pad text nodes.
      if (isFocused && len === 0) continue;
      textRuns.push({ node: textNode, start: offset, end: offset + len });
      offset += len;
    }

    // Now wrap the portion [seg.startOffset, seg.endOffset) in <mark>.
    for (const run of textRuns) {
      // Does this text run overlap with the segment?
      if (seg.endOffset <= run.start || seg.startOffset >= run.end) continue;

      const wrapStart = Math.max(0, seg.startOffset - run.start);
      const wrapEnd = Math.min(run.node.textContent?.length ?? 0, seg.endOffset - run.start);

      const mark = document.createElement(`mark`);
      mark.className = isActive ? `search-highlight search-highlight--active` : `search-highlight`;

      // Split the text node and wrap the middle part.
      const before = run.node.textContent?.substring(0, wrapStart) ?? ``;
      const matched = run.node.textContent?.substring(wrapStart, wrapEnd) ?? ``;
      const after = run.node.textContent?.substring(wrapEnd) ?? ``;

      const parent = run.node.parentNode;
      if (!parent) continue;

      mark.textContent = matched;

      // Build replacement nodes.
      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      frag.appendChild(mark);
      if (after) frag.appendChild(document.createTextNode(after));

      parent.replaceChild(frag, run.node);

      // The remaining runs in this node may have shifted — but
      // since we process each match independently and clear
      // highlights before each pass, this is safe.
      break; // Each run is processed once per segment.
    }
  }

  /**
   * Scrolls the current active match into view.
   */
  scrollToCurrentMatch() {
    const active = this.editor.container.querySelector(`mark.search-highlight--active`);
    if (active) {
      active.scrollIntoView({ block: `center`, behavior: `instant` });
    }
  }

  /** Updates the "N of M" match count display. */
  updateMatchCount() {
    if (!this.matchCount) return;
    if (this.matches.length === 0) {
      const query = this.input?.value ?? ``;
      // Don't show "No results" when the query is too short to
      // trigger a search (< 2 chars in plain-text mode).
      const tooShort = !this.useRegex && query.length < 2;
      this.matchCount.textContent = query && !tooShort ? `No results` : ``;
    } else {
      this.matchCount.textContent = `${this.currentIndex + 1} of ${this.matches.length}`;
    }
  }

  /**
   * Escapes a string for use in a RegExp.
   * @param {string} str
   * @returns {string}
   */
  static escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, `\\$&`);
  }
}
