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
table
  header
    cell
      text "A"
    cell
      text "B"
  row
    cell
      text "1"
    cell
      text "2"
```

# html

```
<table>
  <thead>
    <tr>
      <th>A</th>
      <th>B</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>2</td>
    </tr>
  </tbody>
</table>
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
table
  header
    cell
      text "A"
    cell
      text "B"
    cell
      text "C"
  row
    cell
      text "1"
    cell
      text "2"
    cell
      text "3"
  row
    cell
      text "4"
    cell
      text "5"
    cell
      text "6"
```

# html

```
<table>
  <thead>
    <tr>
      <th>A</th>
      <th>B</th>
      <th>C</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>2</td>
      <td>3</td>
    </tr>
    <tr>
      <td>4</td>
      <td>5</td>
      <td>6</td>
    </tr>
  </tbody>
</table>
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
heading1
  text "Title"
table
  header
    cell
      text "A"
    cell
      text "B"
  row
    cell
      text "1"
    cell
      text "2"
paragraph
  text "Some text"
```

# html

```
<h1>Title</h1>
<table>
  <thead>
    <tr>
      <th>A</th>
      <th>B</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>2</td>
    </tr>
  </tbody>
</table>
<p>Some text</p>
```
