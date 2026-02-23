The current `SyntaxTree` only models block-level structure. A paragraph containing `**bold**` text is stored as a flat `SyntaxNode('paragraph', 'Some **bold** text')` — inline formatting is not represented as child nodes.

The inline tokenizer already produces a nested tree structure via `buildInlineTree()`, but this is computed on-the-fly for rendering and discarded — never stored in the syntax tree itself.

This means there's no way to ask "what node is the cursor in?" and get back a bold/italic/link/etc. node. Features that need to know what inline formatting is active at the cursor position (e.g. #48 — toolbar active states) have no tree structure to walk.

## What needs to change

All nodes that allow for marked up content should model that content as real syntax tree nodes. For example, `Some **bold** text` should produce:

```
paragraph
  ├── text("Some ")
  ├── bold
  │     └── text("bold")
  └── text(" text")
```

And `Some **bold *and* italic** text` should produce:

```
paragraph
  ├── text("Some ")
  ├── bold
  │     ├── text("bold ")
  │     ├── italic
  │     │      └── text("and")
  │     └── text(" italic")
  └── text(" text")
```

The `treeCursor` should then point to the leaf node (e.g. the `text("bold")` inside `bold`), and walking up via `.parent` reveals enclosing formats.
