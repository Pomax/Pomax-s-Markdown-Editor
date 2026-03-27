# Remaining `md-` classes

## Classes that stand in for HTML elements

These are used as `className` on a `<div>` where the div should eventually become the corresponding semantic element:

- `md-paragraph` → `<p>`
- `md-heading1`–`md-heading6` → `<h1>`–`<h6>`
- `md-blockquote` → `<blockquote>`
- `md-code-block` → `<pre>`
- `md-list-item` → `<li>`
- `md-horizontal-rule` → `<hr>`
- `md-table` → `<table>`
- ~~`md-html-block`~~ → replaced by `html-element`
- `md-html-tag` → source-view line for an HTML opening/closing tag
- `md-html-raw` → source-view line for raw HTML content (e.g. `<script>` body)
- `md-image` → `<figure>` or `<img>`
- `md-table-row` → source-view line for a table row
- ~~`md-details`~~ → replaced by `html-details`
- ~~`md-details-summary`~~ → replaced by `html-summary`
- ~~`md-details-body`~~ → removed (use `.html-details > div:not(.html-summary)`)

## Classes that are NOT standing in for HTML elements

These are structural, state, or styling classes that will remain as classes regardless of semantic element changes.

### State/modifiers

- ~~`md-focused`~~ — replaced by `data-has-focus` attribute
- ~~`md-phantom-paragraph`~~ — replaced by `data-is-phantom` attribute
- ~~`md-checklist-item`~~ — removed (moved `position: relative` to `.md-list-item`)
- ~~`md-details--open`~~ — replaced by `data-open` attribute
- ~~`md-image-preview--inert`~~ — removed (dead CSS, never applied)

### Syntax/content structure (spans inside a block)

- `md-syntax` — delimiter text (hidden in unfocused writing view)
- `md-content` — editable content region within a block element
- `md-heading-marker` — the `# ` prefix span
- `md-blockquote-marker` — the `> ` prefix span
- `md-list-marker` — the `- ` / `1. ` prefix span
- `md-inline` — wrapper for inline formatting spans
- `md-bold`, `md-italic`, `md-strikethrough`, `md-link`, `md-code` — inline formatting types (used with `md-inline`)

### Code block internals

- `md-code-content` — the code text area
- ~~`md-code-fence`~~ — removed (dead CSS, never applied)
- ~~`md-code-language-tag`~~ — replaced by `[data-lang]` attribute
- ~~`md-code-language-tag--top`~~ — replaced by `[data-lang].top`
- ~~`md-code-language-tag--bottom`~~ — replaced by `[data-lang].bottom`
- ~~`md-code-language-tag--empty`~~ — replaced by `[data-lang].empty`

### Widget/wrapper elements

- ~~`md-checklist-checkbox`~~ — removed (use `.md-list-item input[type="checkbox"]`)
- ~~`md-checklist-checkbox-wrapper`~~ — removed (use `.md-list-item span[contenteditable="false"]`)
- ~~`md-image-preview`~~ — removed (use `#editor img` in CSS, `event.target.tagName === 'IMG'` in JS)
- ~~`md-html-container`~~ — removed (container div eliminated; attributes now applied directly to outer `.html-element`)
- ~~`md-details-triangle`~~ — replaced by `dropdown`
- ~~`md-details-summary-content`~~ — removed (use `.html-summary > div`)
- `writing-placeholder` — empty editor placeholder (no `md-` prefix)
