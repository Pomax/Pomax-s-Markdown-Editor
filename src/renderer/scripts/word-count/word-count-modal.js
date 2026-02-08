/**
 * @fileoverview Word Count modal dialog.
 * Displays total word count and word count excluding code blocks / inline code.
 */

/**
 * Counts words in a string.
 * Splits on whitespace and filters out empty tokens.
 * @param {string} text
 * @returns {number}
 */
function countWords(text) {
    const trimmed = text.trim();
    if (trimmed.length === 0) return 0;
    return trimmed.split(/\s+/).length;
}

/**
 * Strips markdown formatting from text content, leaving only the readable words.
 * Removes bold/italic markers, link/image syntax, strikethrough, etc.
 * @param {string} text
 * @returns {string}
 */
function stripMarkdownSyntax(text) {
    let s = text;

    // Linked images: [![alt](src)](href) → alt
    s = s.replace(/\[!\[([^\]]*)\]\([^)]*\)\]\([^)]*\)/g, '$1');

    // Images: ![alt](src) → alt
    s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');

    // Links: [text](url) → text
    s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

    // Bold/italic markers
    s = s.replace(/(\*{1,3}|_{1,3})/g, '');

    // Strikethrough
    s = s.replace(/~~/g, '');

    return s;
}

/**
 * Strips inline code spans from text content.
 * @param {string} text
 * @returns {string}
 */
function stripInlineCode(text) {
    return text.replace(/`[^`]*`/g, '');
}

/**
 * @typedef {Object} WordCountResult
 * @property {number} total - Total word count
 * @property {number} excludingCode - Word count excluding code blocks and inline code
 */

/**
 * Counts words in a syntax tree.
 * @param {import('../parser/syntax-tree.js').SyntaxTree | null} syntaxTree
 * @returns {WordCountResult}
 */
export function getWordCounts(syntaxTree) {
    if (!syntaxTree) return { total: 0, excludingCode: 0 };

    let total = 0;
    let excludingCode = 0;

    for (const node of syntaxTree.children) {
        const raw = node.content;
        const stripped = stripMarkdownSyntax(raw);
        total += countWords(stripped);

        if (node.type === 'code-block') {
            // Code block counts toward total but not excludingCode
            continue;
        }

        // For non-code-block nodes, also strip inline code for the excluding count
        const withoutInline = stripInlineCode(stripped);
        excludingCode += countWords(withoutInline);
    }

    return { total, excludingCode };
}

/**
 * A modal dialog that displays the word count of the current document.
 */
export class WordCountModal {
    constructor() {
        /** @type {HTMLDialogElement|null} */
        this.dialog = null;

        /** @type {boolean} */
        this._built = false;
    }

    /**
     * Lazily builds the dialog DOM the first time it is needed.
     */
    _build() {
        if (this._built) return;
        this._built = true;

        const dialog = document.createElement('dialog');
        dialog.className = 'word-count-dialog';
        dialog.setAttribute('aria-label', 'Word Count');

        dialog.innerHTML = `
            <div class="word-count-content">
                <header class="word-count-header">
                    <h2>Word Count</h2>
                    <button type="button" class="word-count-close" aria-label="Close">&times;</button>
                </header>
                <div class="word-count-body">
                    <table class="word-count-table">
                        <tbody>
                            <tr>
                                <td class="word-count-label">Total words</td>
                                <td class="word-count-value" id="wc-total">0</td>
                            </tr>
                            <tr>
                                <td class="word-count-label">Excluding code</td>
                                <td class="word-count-value" id="wc-excluding-code">0</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <footer class="word-count-footer">
                    <button type="button" class="word-count-ok">OK</button>
                </footer>
            </div>
        `;

        // Close handlers
        dialog.querySelector('.word-count-close')?.addEventListener('click', () => this.close());
        dialog.querySelector('.word-count-ok')?.addEventListener('click', () => this.close());
        dialog.addEventListener('cancel', () => this.close());

        document.body.appendChild(dialog);
        this.dialog = dialog;
    }

    /**
     * Opens the modal, displaying counts from the given syntax tree.
     * @param {import('../parser/syntax-tree.js').SyntaxTree | null} syntaxTree
     */
    open(syntaxTree) {
        this._build();
        if (!this.dialog) return;

        const { total, excludingCode } = getWordCounts(syntaxTree);

        const totalEl = this.dialog.querySelector('#wc-total');
        const exclEl = this.dialog.querySelector('#wc-excluding-code');
        if (totalEl) totalEl.textContent = total.toLocaleString();
        if (exclEl) exclEl.textContent = excludingCode.toLocaleString();

        this.dialog.showModal();
    }

    /**
     * Closes the modal.
     */
    close() {
        this.dialog?.close();
    }
}
