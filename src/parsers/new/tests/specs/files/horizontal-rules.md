# Horizontal Rules

Tests for horizontal rules with dashes, asterisks, and underscores.

# markdown

```
---
```

# syntax tree

```
horizontal-rule {"marker":"-","count":3}
```

# html

```
<hr>
```

---

# markdown

```
***
```

# syntax tree

```
horizontal-rule {"marker":"*","count":3}
```

# html

```
<hr>
```

---

# markdown

```
___
```

# syntax tree

```
horizontal-rule {"marker":"_","count":3}
```

# html

```
<hr>
```

---

# markdown

```
-----
```

# syntax tree

```
horizontal-rule {"marker":"-","count":5}
```

# html

```
<hr>
```

---

# markdown

```
--
```

# syntax tree

```
paragraph
  text "--"
```

# html

```
<p>--</p>
```

---

# markdown

```
---abc
```

# syntax tree

```
paragraph
  text "---abc"
```

# html

```
<p>---abc</p>
```
