# Mixed Mode HTML Elements

Tests for the transition between HTML parsing mode and markdown parsing mode
within HTML elements. Content before the first blank line is treated as inline
HTML content; content after the first blank line is parsed as markdown.

# markdown

```
<div>
# not a heading
</div>
```

# syntax tree

```
html-element "div"
  text "# not a heading"
```

# html

```
<div># not a heading</div>
```

---

# markdown

```
<div>
# words

# 93

</div>
```

# syntax tree

```
html-element "div"
  text "# words"
  heading1
    text "93"
```

# html

```
<div>
  # words
  <h1>93</h1>
</div>
```

---

# markdown

```
<div>
this is plain text
still plain text

# this IS a heading

</div>
```

# syntax tree

```
html-element "div"
  text "this is plain text"
  text "still plain text"
  heading1
    text "this IS a heading"
```

# html

```
<div>
  this is plain textstill plain text
  <h1>this IS a heading</h1>
</div>
```
