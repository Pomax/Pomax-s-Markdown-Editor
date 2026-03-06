# Images

Tests for markdown images, linked images, HTML img tags, and images among other elements.

# markdown

```
![alt text](image.png)
```

# syntax tree

```
image {"alt":"alt text","url":"image.png"}
```

# html

```
<figure>
  <figcaption>alt text</figcaption>
  <img src="image.png" alt="alt text">
</figure>
```

---

# markdown

```
![](photo.jpg)
```

# syntax tree

```
image {"alt":"","url":"photo.jpg"}
```

# html

```
<figure>
  <img src="photo.jpg" alt="">
</figure>
```

---

# markdown

```
[![logo](logo.png)](https://example.com)
```

# syntax tree

```
image {"alt":"logo","url":"logo.png","href":"https://example.com"}
```

# html

```
<figure>
  <figcaption>logo</figcaption>
  <a href="https://example.com">
    <img src="logo.png" alt="logo">
  </a>
</figure>
```

---

# markdown

```
![photo](https://example.com/img.jpg)
```

# syntax tree

```
image {"alt":"photo","url":"https://example.com/img.jpg"}
```

# html

```
<figure>
  <figcaption>photo</figcaption>
  <img src="https://example.com/img.jpg" alt="photo">
</figure>
```

---

# markdown

```
# Title

![photo](img.png)

Some text
```

# syntax tree

```
heading1
  text "Title"
image {"alt":"photo","url":"img.png"}
paragraph
  text "Some text"
```

# html

```
<h1>Title</h1>
<figure>
  <figcaption>photo</figcaption>
  <img src="img.png" alt="photo">
</figure>
<p>Some text</p>
```

---

# markdown

```
<img src="photo.png" alt="A photo" style="zoom: 80%;" />
```

# syntax tree

```
html-block "img" {"src":"photo.png","alt":"A photo","style":"zoom: 80%;"}
```

# html

```
<img src="photo.png" alt="A photo" style="zoom: 80%;">
```

---

# markdown

```
<img src="pic.jpg" alt="test" />
```

# syntax tree

```
html-block "img" {"src":"pic.jpg","alt":"test"}
```

# html

```
<img src="pic.jpg" alt="test">
```
