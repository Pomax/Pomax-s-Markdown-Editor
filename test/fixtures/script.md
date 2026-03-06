It's me, [Pomax](https://mastodon.social/@TheRealPomax)

<!-- This document has interactive graphics, which requires JS -->
<script  type="module" src="./graphics/graphics-element/graphics-element.js" async></script>
<link rel="stylesheet" href="./graphics/graphics-element/graphics-element.css" async>

<!-- update the DOM a little so that the ToC can be a sidebar instead -->
<script src="create-side-nav.js" async defer></script>

<!-- And I have style requirements -->
<style>
  html body, html body {
    @media only screen and (min-width: 1000px) {
      div:has(#nav-menu #nav-toc-title) {
        width: 75% !important;
        max-width: unset;
        margin: unset !important;
          margin-left: unset;
        position: fixed;
        top: 0;
        bottom: 0;
        left: 62.5%;
        overflow-y: scroll;
        padding: 0 5% !important;
        margin-left: -37.5% !important;
      }

      #nav-menu {
        position: fixed;
        top: 0;
        left: 0;
        width: 25%;
        height: 100%;
        padding: 1em 0;
        overflow: scroll;
        #nav-toc-title {
          display: none;
        }
        ul, ol {
          padding-left: 1.25em;
        }
      }
    }
  }
  html body div.markdown-body h1:has(a) {
    display:none;
  }
  html body div.markdown-body h1:not(:has(a)) {
    font-size:2.5em;
  }
  img {
    max-width: 100%;
    margin: 0;
    border: 1px solid black;
  }
  figure {
    & img {
      margin-bottom: -1.5em;
    }
    & figcaption {
      margin: 0;
      padding: 0;
      size: 80%;
      font-style: italic;
      text-align: right;
    }
  }
  div.highlight pre.highlight span {
    &.c, &.c1, &.cd, &.cm {
      color: #137100!important;
    }
    &.err {
      color: inherit;
      background: inherit;
    }
  }
</style>


# Questions and comments

<div id="disqus_thread">
  Loading comments...
  <noscript>
    Note that comments are handled by Disqus, so if you didn't already have JS enabled, but you want to ask a question or leave a comment: you're going to have to enable JS =)
  </noscript>
</div>

<!-- load disqus comments -->
<script>
  function disqus_config() {
    const { page } = this;
    page.url = `https://pomax.github.io/are-we-flying`;
    page.identifier = `are-we-flying`;
  };	

  (() => {
    const s = document.createElement('script');
    s.src = `https://are-we-flying.disqus.com/embed.js`;
    s.dataset.timestamp = Date.now();
    document.head.appendChild(s);
  })();
</script>
