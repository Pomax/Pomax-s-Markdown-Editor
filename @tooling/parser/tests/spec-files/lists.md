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
- One
- Two
- Three
```

# syntax tree

```
list-item "One" {"ordered":false,"indent":0}
list-item "Two" {"ordered":false,"indent":0}
list-item "Three" {"ordered":false,"indent":0}
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
list-item "Item 1" {"ordered":false,"indent":0}
list-item "Nested item" {"ordered":false,"indent":1}
```

# html

```
<ul><li>Item 1</li><li>Nested item</li></ul>
```

---

# markdown

```
- [ ] Task
```

# syntax tree

```
list-item "Task" {"ordered":false,"indent":0,"checked":false}
```

# html

```
<ul><li><input type="checkbox">Task</li></ul>
```

---

# markdown

```
- [x] Done
```

# syntax tree

```
list-item "Done" {"ordered":false,"indent":0,"checked":true}
```

# html

```
<ul><li><input type="checkbox" checked="">Done</li></ul>
```

---

# markdown

```
- [ ] Unchecked
- [x] Checked
```

# syntax tree

```
list-item "Unchecked" {"ordered":false,"indent":0,"checked":false}
list-item "Checked" {"ordered":false,"indent":0,"checked":true}
```

# html

```
<ul><li><input type="checkbox">Unchecked</li><li><input type="checkbox" checked="">Checked</li></ul>
```
