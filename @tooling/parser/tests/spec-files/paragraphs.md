# Paragraphs

Tests for simple paragraphs, multiple paragraphs, and paragraphs with inline formatting.

# markdown

```
Hello, world!
```

# syntax tree

```
paragraph "Hello, world!"
```

# html

```
<p>Hello, world!</p>
```

---

# markdown

```
First paragraph

Second paragraph
```

# syntax tree

```
paragraph
  text "First paragraph"
paragraph
  text "Second paragraph"
```

# html

```
<p>First paragraph</p><p>Second paragraph</p>
```

---

# markdown

```
This has **bold** and *italic* text
```

# syntax tree

```
paragraph
  text "This has "
  bold
    text "bold"
  text " and "
  italic
    text "italic"
  text " text"
```

# html

```
<p>This has <strong>bold</strong> and <em>italic</em> text</p>
```
