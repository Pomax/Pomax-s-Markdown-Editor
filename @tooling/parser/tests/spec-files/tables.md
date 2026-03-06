# Tables

Tests for simple tables, multi-row tables, and tables among other elements.

# markdown

```
| A | B |
|---|---|
| 1 | 2 |
```

# syntax tree

```
table "| A | B |\n|---|---|\n| 1 | 2 |"
```

# html

```
<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
```

---

# markdown

```
| A | B | C |
|---|---|---|
| 1 | 2 | 3 |
| 4 | 5 | 6 |
```

# syntax tree

```
table "| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |"
```

# html

```
<table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td>1</td><td>2</td><td>3</td></tr><tr><td>4</td><td>5</td><td>6</td></tr></tbody></table>
```

---

# markdown

```
# Title

| A | B |
|---|---|
| 1 | 2 |

Some text
```

# syntax tree

```
heading1 "Title"
table "| A | B |\n|---|---|\n| 1 | 2 |"
paragraph "Some text"
```

# html

```
<h1>Title</h1><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table><p>Some text</p>
```
