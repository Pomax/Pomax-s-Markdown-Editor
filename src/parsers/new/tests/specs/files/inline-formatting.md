# Inline Formatting

Tests for bold, italic, bold-italic, strikethrough, inline code, links, subscript, and superscript.

# markdown

```
This is **bold text** here.
```

# syntax tree

```
paragraph
  text "This is "
  bold
    text "bold text"
  text " here."
```

# html

```
<p>This is <strong>bold text</strong> here.</p>
```

---

# markdown

```
This is *italic text* here.
```

# syntax tree

```
paragraph
  text "This is "
  italic
    text "italic text"
  text " here."
```

# html

```
<p>This is <em>italic text</em> here.</p>
```

---

# markdown

```
This is ***bold italic*** here.
```

# syntax tree

```
paragraph
  text "This is "
  bold-italic
    text "bold italic"
  text " here."
```

# html

```
<p>This is <strong><em>bold italic</em></strong> here.</p>
```

---

# markdown

```
This is ~~struck~~ here.
```

# syntax tree

```
paragraph
  text "This is "
  strikethrough
    text "struck"
  text " here."
```

# html

```
<p>This is <del>struck</del> here.</p>
```

---

# markdown

```
This is `code` here.
```

# syntax tree

```
paragraph
  text "This is "
  inline-code "code"
  text " here."
```

# html

```
<p>This is <code>code</code> here.</p>
```

---

# markdown

```
click [here](https://x.com) now
```

# syntax tree

```
paragraph
  text "click "
  link {"href":"https://x.com"}
    text "here"
  text " now"
```

# html

```
<p>click <a href="https://x.com">here</a> now</p>
```

---

# markdown

```
H<sub>2</sub>O
```

# syntax tree

```
paragraph
  text "H"
  html-element "sub"
    text "2"
  text "O"
```

# html

```
<p>H<sub>2</sub>O</p>
```

---

# markdown

```
x<sup>2</sup> + y<sup>3</sup>
```

# syntax tree

```
paragraph
  text "x"
  html-element "sup"
    text "2"
  text " + y"
  html-element "sup"
    text "3"
```

# html

```
<p>x<sup>2</sup> + y<sup>3</sup></p>
```

---

# markdown

```
This is <strong>strong text</strong> here.
```

# syntax tree

```
paragraph
  text "This is "
  html-element "strong"
    text "strong text"
  text " here."
```

# html

```
<p>This is <strong>strong text</strong> here.</p>
```

---

# markdown

```
This is <em>emphasis text</em> here.
```

# syntax tree

```
paragraph
  text "This is "
  html-element "em"
    text "emphasis text"
  text " here."
```

# html

```
<p>This is <em>emphasis text</em> here.</p>
```

---

# markdown

```
[click **here**](https://x.com)
```

# syntax tree

```
paragraph
  link {"href":"https://x.com"}
    text "click "
    bold
      text "here"
```

# html

```
<p><a href="https://x.com">click <strong>here</strong></a></p>
```
