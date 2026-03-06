# Complex Documents

Tests for documents with mixed block-level elements.

# markdown

`````
# Title

This is a paragraph.

## Subtitle

> A quote

- List item 1
- List item 2

```js
code
```
`````

# syntax tree

```
heading1
  text "Title"
paragraph
  text "This is a paragraph."
heading2
  text "Subtitle"
blockquote
  text "A quote"
list {"ordered":false,"indent":0}
  list-item
    text "List item 1"
  list-item
    text "List item 2"
code-block {"language":"js","fenceCount":3}
  text "code"
```

# html

```
<h1>Title</h1>
<p>This is a paragraph.</p>
<h2>Subtitle</h2>
<blockquote>A quote</blockquote>
<ul>
  <li>List item 1</li>
  <li>List item 2</li>
</ul>
<pre><code class="language-js">code</code></pre>
```

---

# markdown

```
# Title

Some body text here.
```

# syntax tree

```
heading1
  text "Title"
paragraph
  text "Some body text here."
```

# html

```
<h1>Title</h1>
<p>Some body text here.</p>
```

---

# markdown

`````
```
code
```

text after
`````

# syntax tree

```
code-block {"language":"","fenceCount":3}
  text "code"
paragraph
  text "text after"
```

# html

```
<pre><code>code</code></pre>
<p>text after</p>
```

---

# markdown

```
- a
- b

A paragraph
```

# syntax tree

```
list {"ordered":false,"indent":0}
  list-item
    text "a"
  list-item
    text "b"
paragraph
  text "A paragraph"
```

# html

```
<ul>
  <li>a</li>
  <li>b</li>
</ul>
<p>A paragraph</p>
```
