# Code Blocks

Tests for fenced code blocks with various fence lengths, languages, and nesting.

# markdown

````
```
code here
```
````

# syntax tree

```
code-block {"language":"","fenceCount":3}
  text "code here"
```

# html

```
<pre><code>code here</code></pre>
```

---

# markdown

````
```javascript
const x = 1;
```
````

# syntax tree

```
code-block {"language":"javascript","fenceCount":3}
  text "const x = 1;"
```

# html

```
<pre><code class="language-javascript">const x = 1;</code></pre>
```

---

# markdown

````
```
line 1
line 2
line 3
```
````

# syntax tree

```
code-block {"language":"","fenceCount":3}
  text "line 1
line 2
line 3"
```

# html

```
<pre><code>line 1
line 2
line 3</code></pre>
```

---

# markdown

````
```
# not a heading
> not a quote
```
````

# syntax tree

```
code-block {"language":"","fenceCount":3}
  text "# not a heading
> not a quote"
```

# html

```
<pre><code># not a heading
&gt; not a quote</code></pre>
```

---

# markdown

`````
````
code
````
`````

# syntax tree

```
code-block {"language":"","fenceCount":4}
  text "code"
```

# html

```
<pre><code>code</code></pre>
```

---

# markdown

`````
````js
code
````
`````

# syntax tree

```
code-block {"language":"js","fenceCount":4}
  text "code"
```

# html

```
<pre><code class="language-js">code</code></pre>
```

---

# markdown

``````
`````
```
still code
```
`````
``````

# syntax tree

````
code-block {"language":"","fenceCount":5}
  text "```
still code
```"
````

# html

````
<pre><code>```
still code
```</code></pre>
````

---

# markdown

`````
````
code with ``` inside
````
`````

# syntax tree

````
code-block {"language":"","fenceCount":4}
  text "code with ``` inside"
````

# html

````
<pre><code>code with ``` inside</code></pre>
````

---

# markdown

`````
````
code
````

text after
`````

# syntax tree

```
code-block {"language":"","fenceCount":4}
  text "code"
paragraph
  text "text after"
```

# html

```
<pre><code>code</code></pre>
<p>text after</p>
```
