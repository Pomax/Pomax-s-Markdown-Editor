# HTML Blocks

Tests for HTML blocks including details/summary, div, and custom elements.

# markdown

```
<summary>Some text</summary>
```

# syntax tree

```
html-element "summary"
  paragraph {"bareText":true}
    text "Some text"
```

# html

```
<summary>Some text</summary>
```

---

# markdown

```
<details>
  <summary>This is a paragraph</summary>

## and this an h2

better

</details>
```

# syntax tree

```
html-element "details"
  html-element "summary"
    paragraph {"bareText":true}
      text "This is a paragraph"
  heading2
    text "and this an h2"
  paragraph
    text "better"
```

# html

```
<details>
  <summary>This is a paragraph</summary>
  <h2>and this an h2</h2>
  <p>better</p>
</details>
```

---

# markdown

```
<div>

# Title

Paragraph

</div>
```

# syntax tree

```
html-element "div"
  heading1
    text "Title"
  paragraph
    text "Paragraph"
```

# html

```
<div>
  <h1>Title</h1>
  <p>Paragraph</p>
</div>
```

---

# markdown

```
<my-component>

Hello

</my-component>
```

# syntax tree

```
html-element "my-component"
  paragraph
    text "Hello"
```

# html

```
<my-component>
  <p>Hello</p>
</my-component>
```

---

# markdown

```
<app-header>Title text</app-header>
```

# syntax tree

```
html-element "app-header"
  paragraph {"bareText":true}
    text "Title text"
```

# html

```
<app-header>Title text</app-header>
```

---

# markdown

```
<my-element class="test">

Body

</my-element>
```

# syntax tree

```
html-element "my-element"
  paragraph
    text "Body"
```

# html

```
<my-element class="test">
  <p>Body</p>
</my-element>
```

---

# markdown

```
Test text

<section>
  <div>
    <p>some <i>italic</i> and <b>bold</b> text</p>
  </div>
</section>

Test text
```

# syntax tree

```
paragraph
  text "Test text"
html-element "section"
  html-element "div"
    html-element "p"
      paragraph {"bareText":true}
        text "some "
        html-element "i"
          text "italic"
        text " and "
        html-element "b"
          text "bold"
        text " text"
paragraph
  text "Test text"
```

# html

```
<p>Test text</p>
<section>
  <div>
    <p>some <i>italic</i> and <b>bold</b> text</p>
  </div>
</section>
<p>Test text</p>
```

---

# markdown

```
Test text

<section>
  <div>

    # this is not a heading text

# but this is

  </div>
</section>

Test text
```

# syntax tree

```
paragraph
  text "Test text"
html-element "section"
  html-element "div"
    paragraph
      text "    # this is not a heading text"
    heading1
      text "but this is"
paragraph
  text "Test text"
```

# html

```
<p>Test text</p>
<section>
  <div>
    <p>    # this is not a heading text</p>
    <h1>but this is</h1>
  </div>
</section>
<p>Test text</p>
```