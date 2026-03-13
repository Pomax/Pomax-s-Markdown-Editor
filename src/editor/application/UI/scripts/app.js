import { parse } from '../../../../markdown/index.js';

const editor = document.getElementById('editor');

window.electronAPI.onFileOpened(async (markdown, fileDir) => {
  let base = document.querySelector('base');
  if (!base) {
    base = document.createElement('base');
    document.head.appendChild(base);
  }
  base.href = `${fileDir.replaceAll('\\', '/')}/`;

  const tree = await parse(markdown);
  const dom = await tree.toDOM();
  editor.replaceChildren(dom);
});
