# Lists

Tests for unordered lists, ordered lists, checklist items, indentation, and mixed markers.

# markdown

```
- Item 1
```

# syntax tree

```
list {"ordered":false,"indent":0}
  list-item
    text "Item 1"
```

# html

```
<ul><li>Item 1</li></ul>
```

---

# markdown

```
* Item 1
```

# syntax tree

```
list {"ordered":false,"indent":0}
  list-item
    text "Item 1"
```

# html

```
<ul><li>Item 1</li></ul>
```

---

# markdown

```
+ Item 1
```

# syntax tree

```
list {"ordered":false,"indent":0}
  list-item
    text "Item 1"
```

# html

```
<ul><li>Item 1</li></ul>
```

---

# markdown

```
1. Item 1
```

# syntax tree

```
list {"ordered":true,"number":1,"indent":0}
  list-item
    text "Item 1"
```

# html

```
<ol><li>Item 1</li></ol>
```

---

# markdown

```
3. Third item
```

# syntax tree

```
list {"ordered":true,"number":3,"indent":0}
  list-item
    text "Third item"
```

# html

```
<ol start="3"><li>Third item</li></ol>
```

---

# markdown

```
1. First item
  1. First subitem
  1. Second subitem
1. Second item
1. Third item
```

# syntax tree

```
list {"ordered":true,"number":1,"indent":0}
  list-item
    text "First item"
    list {"ordered":true,"number":1,"indent":1}
      list-item
        text "First subitem"
      list-item
        text "Second subitem"
  list-item
    text "Second item"
  list-item
    text "Third item"
```

# html

```
<ol><li>First item<ol><li>First subitem</li><li>Second subitem</li></ol></li><li>Second item</li><li>Third item</li></ol>
```

---

# markdown

```
- One
- Two
- Three
```

# syntax tree

```
list {"ordered":false,"indent":0}
  list-item
    text "One"
  list-item
    text "Two"
  list-item
    text "Three"
```

# html

```
<ul><li>One</li><li>Two</li><li>Three</li></ul>
```

---

# markdown

```
- Item 1
  - Nested item
```

# syntax tree

```
list {"ordered":false,"indent":0}
  list-item
    text "Item 1"
    list {"ordered":false,"indent":1}
      list-item
        text "Nested item"
```

# html

```
<ul><li>Item 1<ul><li>Nested item</li></ul></li></ul>
```

---

# markdown

```
- [ ] Task
```

# syntax tree

```
list {"ordered":false,"indent":0,"checked":true}
  list-item {"checked":false}
    text "Task"
```

# html

```
<ul><li><input type="checkbox"> Task</li></ul>
```

---

# markdown

```
- [x] Done
```

# syntax tree

```
list {"ordered":false,"indent":0,"checked":true}
  list-item {"checked":true}
    text "Done"
```

# html

```
<ul><li><input type="checkbox" checked> Done</li></ul>
```

---

# markdown

```
- [ ] Unchecked
- [x] Checked
```

# syntax tree

```
list {"ordered":false,"indent":0,"checked":true}
  list-item {"checked":false}
    text "Unchecked"
  list-item {"checked":true}
    text "Checked"
```

# html

```
<ul><li><input type="checkbox"> Unchecked</li><li><input type="checkbox" checked> Checked</li></ul>
```
