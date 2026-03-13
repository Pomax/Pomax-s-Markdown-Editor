# Headings

Tests for heading levels 1–6, multiple headings, and headings with inline formatting.

# markdown

```
# Heading 1
```

# syntax tree

```
heading1
  text "Heading 1"
```

# html

```
<h1>Heading 1</h1>
```

---

# markdown

```
## Heading 2
```

# syntax tree

```
heading2
  text "Heading 2"
```

# html

```
<h2>Heading 2</h2>
```

---

# markdown

```
### Heading 3
```

# syntax tree

```
heading3
  text "Heading 3"
```

# html

```
<h3>Heading 3</h3>
```

---

# markdown

```
#### Heading 4
```

# syntax tree

```
heading4
  text "Heading 4"
```

# html

```
<h4>Heading 4</h4>
```

---

# markdown

```
##### Heading 5
```

# syntax tree

```
heading5
  text "Heading 5"
```

# html

```
<h5>Heading 5</h5>
```

---

# markdown

```
###### Heading 6
```

# syntax tree

```
heading6
  text "Heading 6"
```

# html

```
<h6>Heading 6</h6>
```

---

# markdown

```
# First

## Second

### Third
```

# syntax tree

```
heading1
  text "First"
heading2
  text "Second"
heading3
  text "Third"
```

# html

```
<h1>First</h1><h2>Second</h2><h3>Third</h3>
```

---

# markdown

```
## Hello **world**
```

# syntax tree

```
heading2
  text "Hello "
  bold
    text "world"
```

# html

```
<h2>Hello <strong>world</strong></h2>
```
