/**
 * @fileoverview Renders a SyntaxTree / SyntaxNode into DOM elements.
 *
 * Every created element gets an `__st_node` back-reference to the
 * originating SyntaxNode so that the editor can map DOM ↔ tree.
 */

import { SyntaxNode } from '../syntax-tree/syntax-node.js';
import { SyntaxTree } from '../syntax-tree/syntax-tree.js';
import { renderNodeToMarkdown } from './markdown.js';

/**
 * Appends inline SyntaxNode children as DOM nodes into a container.
 * @param {Document} doc
 * @param {SyntaxNode[]} children
 * @param {Element|DocumentFragment} container
 */
function appendInlineChildrenToDOM(doc, children, container) {
  for (const child of children) {
    container.appendChild(inlineChildToDOM(doc, child));
  }
}

/**
 * Converts a single inline SyntaxNode child to a DOM node.
 * @param {SyntaxNode} node
 * @param {Element} domNode
 * @returns {Element}
 */
function link(node, domNode) {
  node.domNode = domNode;
  // @ts-ignore
  domNode.__st_node = node;
  return domNode;
}

/**
 * @param {Document} doc
 * @param {SyntaxNode} child
 * @returns {Node}
 */
function inlineChildToDOM(doc, child) {
  switch (child.type) {
    case `text`:
      return doc.createTextNode(child.content);

    case `inline-code`: {
      const code = doc.createElement(`code`);
      link(child, code);
      code.textContent = child.content;
      return code;
    }

    case `inline-image`: {
      const img = doc.createElement(`img`);
      link(child, img);
      img.setAttribute(`src`, child.attributes.src ?? ``);
      img.setAttribute(`alt`, child.attributes.alt ?? ``);
      return img;
    }

    case `bold`: {
      const el = doc.createElement(`strong`);
      link(child, el);
      appendInlineChildrenToDOM(doc, child.children, el);
      return el;
    }

    case `italic`: {
      const el = doc.createElement(`em`);
      link(child, el);
      appendInlineChildrenToDOM(doc, child.children, el);
      return el;
    }

    case `bold-italic`: {
      const strong = doc.createElement(`strong`);
      link(child, strong);
      const em = doc.createElement(`em`);
      appendInlineChildrenToDOM(doc, child.children, em);
      strong.appendChild(em);
      return strong;
    }

    case `strikethrough`: {
      const el = doc.createElement(`del`);
      link(child, el);
      appendInlineChildrenToDOM(doc, child.children, el);
      return el;
    }

    case `link`: {
      const a = doc.createElement(`a`);
      link(child, a);
      a.setAttribute(`href`, child.attributes.href ?? ``);
      appendInlineChildrenToDOM(doc, child.children, a);
      return a;
    }

    case `html-element`: {
      const el = doc.createElement(child.tagName);
      link(child, el);
      for (const [attr, value] of Object.entries(child.attributes)) {
        el.setAttribute(attr, value);
      }
      appendInlineChildrenToDOM(doc, child.children, el);
      return el;
    }

    default: {
      const el = doc.createElement(child.type);
      link(child, el);
      appendInlineChildrenToDOM(doc, child.children, el);
      return el;
    }
  }
}

/**
 * Attaches a `toggleView()` method to a block-level DOM element.
 *
 * Calling `el.toggleView()` replaces the element in its parent with a
 * contenteditable div showing the node's markdown source. That div has
 * its own `toggleView()` that swaps back to the original element.
 *
 * @param {Document} doc
 * @param {Element} domElement
 * @param {SyntaxNode} syntaxNode - The SyntaxNode backing this element.
 */
function attachToggleView(doc, domElement, syntaxNode) {
  // @ts-ignore – dynamically attached
  domElement.toggleView = function () {
    const editDiv = doc.createElement(`div`);
    editDiv.setAttribute(`contenteditable`, `true`);
    editDiv.textContent = renderNodeToMarkdown(syntaxNode);
    // @ts-ignore – dynamically attached
    editDiv.toggleView = function () {
      /** @type {Node} */ (editDiv.parentNode).replaceChild(domElement, editDiv);
      link(syntaxNode, domElement);
    };
    /** @type {Node} */ (domElement.parentNode).replaceChild(editDiv, domElement);
    link(syntaxNode, editDiv);
  };
}

/**
 * Renders an array of block-level SyntaxNode children into a DOM
 * container.
 * @param {Document} doc
 * @param {SyntaxNode[]} children
 * @param {Element} container
 */
function renderBlockChildrenToDOM(doc, children, container) {
  for (const child of children) {
    container.appendChild(renderNodeToDOM(doc, child));
  }
}

/**
 * Converts a SyntaxNode to a DOM element.
 * Each element gets an `__st_node` property referencing the node.
 *
 * @param {Document} doc - The Document to create elements with.
 * @param {SyntaxNode} node - A SyntaxNode instance.
 * @returns {Element}
 */
function renderNodeToDOM(doc, node) {
  switch (node.type) {
    case `heading1`:
    case `heading2`:
    case `heading3`:
    case `heading4`:
    case `heading5`:
    case `heading6`: {
      const level = node.type.charAt(node.type.length - 1);
      const el = doc.createElement(`h${level}`);
      link(node, el);
      appendInlineChildrenToDOM(doc, node.children, el);
      attachToggleView(doc, el, node);
      return el;
    }

    case `paragraph`: {
      const el = doc.createElement(`p`);
      link(node, el);
      appendInlineChildrenToDOM(doc, node.children, el);
      attachToggleView(doc, el, node);
      return el;
    }

    case `blockquote`: {
      const el = doc.createElement(`blockquote`);
      link(node, el);
      appendInlineChildrenToDOM(doc, node.children, el);
      attachToggleView(doc, el, node);
      return el;
    }

    case `code-block`: {
      const pre = doc.createElement(`pre`);
      link(node, pre);
      const code = doc.createElement(`code`);
      if (node.attributes.language) {
        code.setAttribute(`class`, `language-${node.attributes.language}`);
      }
      code.textContent = node.children.length > 0 ? node.children[0].content : node.content;
      pre.appendChild(code);
      attachToggleView(doc, pre, node);
      return pre;
    }

    case `list`: {
      const isOrdered = node.attributes.ordered;
      const listEl = doc.createElement(isOrdered ? `ol` : `ul`);
      link(node, listEl);
      if (isOrdered && /** @type {number} */ (node.attributes.number) > 1) {
        listEl.setAttribute(`start`, String(node.attributes.number));
      }
      for (const child of node.children) {
        listEl.appendChild(renderNodeToDOM(doc, child));
      }
      attachToggleView(doc, listEl, node);
      return listEl;
    }

    case `list-item`: {
      const li = doc.createElement(`li`);
      link(node, li);
      if (typeof node.attributes.checked === `boolean`) {
        const checkbox = doc.createElement(`input`);
        checkbox.setAttribute(`type`, `checkbox`);
        if (node.attributes.checked) {
          checkbox.setAttribute(`checked`, ``);
        }
        li.appendChild(checkbox);
        li.appendChild(doc.createTextNode(` `));
      }
      // Append inline children (text, bold, etc.) but not nested lists
      const inlineChildren = node.children.filter(
        (/** @type {SyntaxNode} */ c) => c.type !== `list`,
      );
      appendInlineChildrenToDOM(doc, inlineChildren, li);
      // Append nested list children
      for (const child of node.children) {
        if (child.type === `list`) {
          li.appendChild(renderNodeToDOM(doc, child));
        }
      }
      attachToggleView(doc, li, node);
      return li;
    }

    case `horizontal-rule`: {
      const hr = doc.createElement(`hr`);
      link(node, hr);
      attachToggleView(doc, hr, node);
      return hr;
    }

    case `image`: {
      const alt = node.attributes.alt ?? node.content ?? ``;
      const src = node.attributes.url ?? ``;
      const style = node.attributes.style ?? ``;

      const figure = doc.createElement(`figure`);
      link(node, figure);

      if (alt) {
        const figcaption = doc.createElement(`figcaption`);
        figcaption.textContent = alt;
        figure.appendChild(figcaption);
      }

      const img = doc.createElement(`img`);
      img.setAttribute(`src`, src);
      img.setAttribute(`alt`, alt);
      if (style) img.setAttribute(`style`, style);

      if (node.attributes.href) {
        const a = doc.createElement(`a`);
        a.setAttribute(`href`, node.attributes.href);
        a.appendChild(img);
        figure.appendChild(a);
      } else {
        figure.appendChild(img);
      }

      attachToggleView(doc, figure, node);
      return figure;
    }

    case `table`: {
      const table = doc.createElement(`table`);
      link(node, table);

      const thead = doc.createElement(`thead`);
      const tbody = doc.createElement(`tbody`);

      for (const child of node.children) {
        const tr = doc.createElement(`tr`);
        link(child, tr);
        const isHeader = child.type === `header`;
        for (const cell of child.children) {
          const el = doc.createElement(isHeader ? `th` : `td`);
          link(cell, el);
          appendInlineChildrenToDOM(doc, cell.children, el);
          tr.appendChild(el);
        }
        if (isHeader) {
          thead.appendChild(tr);
        } else {
          tbody.appendChild(tr);
        }
      }

      if (thead.childNodes.length > 0) {
        table.appendChild(thead);
      }
      if (tbody.childNodes.length > 0) {
        table.appendChild(tbody);
      }

      attachToggleView(doc, table, node);
      return table;
    }

    case `html-element`: {
      const tagName = node.tagName || `div`;
      const el = doc.createElement(tagName);
      link(node, el);

      if (node.runtime.openingTag) {
        const temp = doc.createElement(`div`);
        temp.innerHTML = node.runtime.openingTag;
        const sourceEl = temp.firstElementChild;
        if (sourceEl) {
          for (const attr of sourceEl.attributes) {
            el.setAttribute(attr.name, attr.value);
          }
        }
      }

      if (node.raw) {
        el.textContent = node.content ? `\n${node.content}\n` : ``;
      } else if (
        node.children.length > 0 &&
        node.children.every(
          (/** @type {SyntaxNode} */ c) =>
            c.type === `text` || (c.type === `html-element` && !c.runtime.openingTag),
        )
      ) {
        appendInlineChildrenToDOM(doc, node.children, el);
      } else {
        // Mixed or block-only content
        for (const child of node.children) {
          const isInline =
            child.type === `text` || (child.type === `html-element` && !child.runtime.openingTag);
          if (isInline) {
            el.appendChild(inlineChildToDOM(doc, child));
          } else {
            el.appendChild(renderNodeToDOM(doc, child));
          }
        }
      }

      attachToggleView(doc, el, node);
      return el;
    }

    default: {
      const el = doc.createElement(`div`);
      link(node, el);
      el.textContent = node.content;
      attachToggleView(doc, el, node);
      return el;
    }
  }
}

/**
 * Renders a SyntaxTree into a DOM element.
 *
 * @param {Document} doc - The Document to create elements with.
 * @param {SyntaxTree | SyntaxNode} tree - A SyntaxTree instance.
 * @returns {Element}
 */
export function renderTreeToDOM(doc, tree) {
  const container = doc.createElement(`div`);
  renderBlockChildrenToDOM(doc, tree.children, container);
  return container;
}
