# Headings

Tests for heading levels 1–6, alone and in context with surrounding content.

# markdown

```
# Hello World
```

# syntax tree

```
heading1
  text "Hello World"
```

# html

```
<h1>Hello World</h1>
```

---

# markdown

```
## Second level
```

# syntax tree

```
heading2
  text "Second level"
```

# html

```
<h2>Second level</h2>
```

---

# markdown

```
Some text before.

# A heading

Some text after.
```

# syntax tree

```
paragraph
  text "Some text before."
heading1
  text "A heading"
paragraph
  text "Some text after."
```

# html

```
<p>Some text before.</p><h1>A heading</h1><p>Some text after.</p>
```
