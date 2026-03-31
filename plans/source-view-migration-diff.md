# Step 8: `SyntaxTree.updateUsing(newTree)` — Structural Tree Diffing

## Overview

Add an `updateUsing(newTree)` method to `SyntaxTree` that performs structural diffing between the original tree and a newly parsed tree. The goal is to update the original tree's content to match the new tree while preserving node identity (IDs) for nodes that can be matched.

All new functions are declared at the top level of `syntax-tree.js` (never nested inside other functions, per SKILL.md). All use `toMarkdown()` for content comparison — not the `content` field — because `html-block` always has `content === ''`, `image` content is just alt text missing URL/style/href, and `toMarkdown()` is the only uniform representation of a node's full state.

## Progress

- [x] Step 8a: Install a Levenshtein distance package
- [x] Step 8b: Implement `contentSimilarity(a, b)`
- [ ] Step 8c: Implement `matchChildren(oldChildren, newChildren)`
- [ ] Step 8d: Implement `updateMatchedNode(oldNode, newNode)`
- [ ] Step 8e: Implement `SyntaxTree.updateUsing(newTree)` class method

---

## Work Plan

### 8a. Install a Levenshtein distance package

Install a well-maintained Levenshtein distance package (e.g. `fastest-levenshtein` or `js-levenshtein`) as a production dependency. No custom implementation needed — this is a solved problem.

```
npm install fastest-levenshtein
```

Import it in `syntax-tree.js` as needed in step 8b.

**No tests needed for this step** — the package has its own test suite. Just verify `npm test` still passes after install.

**Run `npm test`, confirm all pass before continuing.**

---

### 8b. Implement `contentSimilarity(a, b)`

Add a top-level function to `syntax-tree.js`:

```
function contentSimilarity(a, b)
```

Import the `distance` function from the installed package. Returns a 0–1 float: `1 - (distance(a, b) / Math.max(a.length, b.length))`. Returns `1` when both are empty strings.

Fast-path: if both strings exceed 10 000 chars, fall back to a cheaper line-level comparison instead of char-level Levenshtein. Split both by `\n`, compute Levenshtein on the resulting line arrays (treating each line as an atomic unit — use `===` for element comparison in a small local DP loop over the line arrays), and return `1 - (lineDistance / Math.max(aLines.length, bLines.length))`. This line-level DP is trivial (few dozen lines at most) and does not warrant a package.

**Tests** (in `syntax-tree.test.js` under a new `describe('contentSimilarity')`):

- `contentSimilarity('', '')` → `1`
- `contentSimilarity('abc', 'abc')` → `1`
- `contentSimilarity('abc', 'def')` → `0`
- `contentSimilarity('abc', 'abd')` → approximately `0.667`
- `contentSimilarity('abc', '')` → `0`
- A test with two strings both > 10 000 chars that exercises the line-level fast-path (construct two long multi-line strings that differ by a few lines, verify result is between 0 and 1)

**Run `npm test`, confirm all pass before continuing.**

---

### 8c. Implement `matchChildren(oldChildren, newChildren)`

Add a top-level function to `syntax-tree.js`:

```
function matchChildren(oldChildren, newChildren)
```

Returns a `Map` mapping each matched new child to its corresponding original child.

**Pass 1 — exact matches:** For each new child (in order), scan all unclaimed originals for one with the same `type` AND identical `toMarkdown()` output. Claim the first match found. Use a `Set<number>` of claimed original indices.

**Pass 2 — fuzzy matches:** For each still-unmatched new child, scan remaining unclaimed originals for same-`type` candidates. Among candidates, pick the one with the highest `contentSimilarity(old.toMarkdown(), new.toMarkdown())`. Tiebreakers:

- For `html-block` nodes: prefer candidates with the same `attributes.tagName`
- For `list-item` nodes: prefer candidates with the same `attributes.indent`

No minimum similarity threshold — the best same-type match wins.

**Tests** (in `syntax-tree.test.js` under a new `describe('matchChildren')`):

- Two identical lists → every new child maps to its original counterpart
- One node edited → edited node still matched (fuzzy), unedited nodes matched exactly
- Node inserted at start → existing nodes still matched, new node has no match in the map
- Node deleted → surviving nodes matched, deleted node absent from map values
- Nodes reordered → all matched despite different positions
- Type changed → unmatched (different type, no candidate)
- Duplicate identical nodes → each matched to a distinct original (no double claims)
- `html-block` tagName tiebreaker → prefers matching `<details>` to `<details>` over `<div>` to `<details>`
- `list-item` indent tiebreaker → prefers matching indent-0 to indent-0 over indent-1 to indent-0

**Run `npm test`, confirm all pass before continuing.**

---

### 8d. Implement `updateMatchedNode(oldNode, newNode)`

Add a top-level function to `syntax-tree.js`:

```
function updateMatchedNode(oldNode, newNode)
```

Copies state from `newNode` to `oldNode` while preserving `oldNode.id`:

1. `oldNode.content = newNode.content` (via setter — triggers `buildInlineChildren()` for inline-containing types, no-op for others)
2. Save `oldNode.attributes.detailsOpen`, then `oldNode.attributes = { ...newNode.attributes }`, then restore `detailsOpen` if it was defined
3. `oldNode.startLine = newNode.startLine`
4. `oldNode.endLine = newNode.endLine`
5. `oldNode.sourceEditText = null`
6. For `html-block` nodes that have block-level children on the new side: recursively call `matchChildren` on `oldNode.children` / `newNode.children`, then build the result array (matched → updated original with `parent = oldNode`, unmatched new → as-is with `parent = oldNode`), assign to `oldNode.children`. For html-block nodes with no new children (void, rawContent): set `oldNode.children = []`.

**Tests** (in `syntax-tree.test.js` under a new `describe('updateMatchedNode')`):

- Content updated, id preserved
- Attributes copied, `detailsOpen` preserved when present on old node
- `startLine`/`endLine` copied
- `sourceEditText` cleared to null when it was non-null on old node
- Inline children rebuilt after content update on a paragraph
- `html-block` children recursively matched and updated
- `html-block` void element: children cleared

**Run `npm test`, confirm all pass before continuing.**

---

### 8e. Implement `SyntaxTree.updateUsing(newTree)` class method

Add the method to the `SyntaxTree` class:

```
updateUsing(newTree)
```

1. Call `matchChildren(this.children, newTree.children)` to get the match map
2. Build the result array by iterating `newTree.children` in order:
   - If the new child is in the match map → call `updateMatchedNode(matchedOld, newChild)`, set `matchedOld.parent = null`, push `matchedOld`
   - If the new child is not in the match map → set `newChild.parent = null`, push `newChild`
3. Assign `this.children = result`

Does **not** touch `this.treeCursor` — the caller handles cursor restoration.

**Tests** (in `syntax-tree.test.js` under a new `describe('updateUsing')`):

- Identical trees: all original IDs preserved, children length unchanged, `toMarkdown()` output unchanged
- Single node content edit: matched node keeps its ID, content updated, `toMarkdown()` reflects edit
- Node insertion: result has one more child, new child has a fresh ID, other children keep original IDs
- Node deletion: result has one fewer child, surviving children keep original IDs
- Node reordering: all IDs preserved, order matches new tree
- Type change: changed node has a fresh ID (not matched), other nodes keep original IDs
- `html-block` recursive diffing: container's child IDs preserved when container matched
- Duplicate identical nodes: both matched to distinct originals, no ID collision
- Mixed scenario: simultaneous edit + insert + delete + reorder
- Empty old tree → result is new tree's children (all fresh IDs)
- Empty new tree → result is empty
- Both empty → no-op
- List item indent: two items with same content but different indent matched to correct originals
- Parent references: all top-level result nodes have `parent === null`

**Run `npm test`, confirm all pass before continuing.**

---

## Design Reference

The following sections document the design decisions behind the work plan. They are not separate implementation steps — they are context for the steps above.

### Why `toMarkdown()` not `content`

- `html-block` nodes always have `content === ''` — all their meaningful state lives in `attributes` + `children`, reconstructed by `toMarkdown()`
- `image` nodes store only alt text in `content`, but their identity includes URL, href, and style — all captured by `toMarkdown()`
- `table` nodes do store everything in `content` (and `toMarkdown()` returns it verbatim), but using `toMarkdown()` uniformly is simpler and correct

### `html-block` container subtypes

- **Containers with block children** (e.g. `<details>` wrapping paragraphs): recursively apply matching on their children
- **Containers with `rawContent`** (script, style, textarea): no children — `rawContent` is in attributes
- **Void elements** (`closingTag === ''`, no children): fully handled by attribute copy
- **Single bare-text child** (`bareText: true`): recurse normally

### Content setter behaviour

The `content` setter triggers `buildInlineChildren()` only for `INLINE_CONTENT_TYPES` (paragraph, heading1–6, blockquote, list-item). For all other types it simply stores the value. Always use the setter, never `__content`.

### Scope boundaries

- **treeCursor**: untouched — caller handles it (Step 9). After `updateUsing`, `treeCursor.nodeId` may reference a deleted node.
- **Inline children**: rebuilt by the content setter, not manually diffed
- **`SelectionManager.currentNode`**: may go stale, but the full re-render after `updateUsing` re-resolves it
- **Runtime-only attributes**: `detailsOpen` is the only known one; explicitly preserved
- **Types**: no new type definitions needed
- **sourceEditText**: explicitly cleared on matched nodes
