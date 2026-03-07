# Raw Content HTML Elements

Tests for HTML elements whose body content is stored verbatim and not
parsed as markdown: script, style, and textarea.

# markdown

```
Some text before.

<script type="module" src="./app.js" async></script>

Some text after.
```

# syntax tree

```
paragraph
  text "Some text before."
html-element "script" {"type":"module","src":"./app.js","async":true}
  text ""
paragraph
  text "Some text after."
```

# html

```
<p>Some text before.</p>
<script type="module" src="./app.js" async></script>
<p>Some text after.</p>
```

---

# markdown

```
A paragraph.

<script>
  const x = 1;
  console.log(x);
</script>

Another paragraph.
```

# syntax tree

```
paragraph
  text "A paragraph."
html-element "script"
  text "
  const x = 1;
  console.log(x);
"
paragraph
  text "Another paragraph."
```

# html

```
<p>A paragraph.</p>
<script>
  const x = 1;
  console.log(x);
</script>
<p>Another paragraph.</p>
```

---

# markdown

```
Text above.

<style>
  #heading { color: red; }
  > .child { margin: 0; }
</style>

Text below.
```

# syntax tree

```
paragraph
  text "Text above."
html-element "style"
  text "
  #heading { color: red; }
  > .child { margin: 0; }
"
paragraph
  text "Text below."
```

# html

```
<p>Text above.</p>
<style>
  #heading { color: red; }
  > .child { margin: 0; }
</style>
<p>Text below.</p>
```

---

# markdown

```
Before textarea.

<textarea id="input">
  Some user input
  on multiple lines
</textarea>

After textarea.
```

# syntax tree

```
paragraph
  text "Before textarea."
html-element "textarea" {"id":"input"}
  text "
  Some user input
  on multiple lines
"
paragraph
  text "After textarea."
```

# html

```
<p>Before textarea.</p>
<textarea id="input">
  Some user input
  on multiple lines
</textarea>
<p>After textarea.</p>
```

---

# markdown

```
First paragraph.

<style>
  body { color: red; }
  h1 > span { font-size: 2em; }
</style>

# A Heading

Last paragraph.
```

# syntax tree

```
paragraph
  text "First paragraph."
html-element "style"
  text "
  body { color: red; }
  h1 > span { font-size: 2em; }
"
heading1
  text "A Heading"
paragraph
  text "Last paragraph."
```

# html

```
<p>First paragraph.</p>
<style>
  body { color: red; }
  h1 > span { font-size: 2em; }
</style>
<h1>A Heading</h1>
<p>Last paragraph.</p>
```
