import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  enterSourceEditMode,
  exitSourceEditMode,
  getSourceEditText,
  setSourceEditText,
  isInSourceEditMode,
  getSourceEditLength,
} from '../../../src/renderer/scripts/editor/source-edit-map.js';

describe('enterSourceEditMode', () => {
  it('stores the full markdown text for a code-block node', () => {
    const map = new Map();
    const node = {
      id: 'n1',
      type: 'code-block',
      content: 'console.log("hi")',
      attributes: { language: 'js', fenceCount: 3 },
    };
    enterSourceEditMode(map, node);
    assert.equal(map.get('n1'), '```js\nconsole.log("hi")\n```');
  });

  it('no-ops for non-code-block nodes', () => {
    const map = new Map();
    const node = { id: 'n1', type: 'paragraph', content: 'hello', attributes: {} };
    enterSourceEditMode(map, node);
    assert.equal(map.size, 0);
  });

  it('no-ops if already in source edit mode', () => {
    const map = new Map();
    const node = {
      id: 'n1',
      type: 'code-block',
      content: 'a',
      attributes: { language: '', fenceCount: 3 },
    };
    enterSourceEditMode(map, node);
    const original = map.get('n1');
    // Mutate content — re-enter should not overwrite
    node.content = 'b';
    enterSourceEditMode(map, node);
    assert.equal(map.get('n1'), original);
  });

  it('uses the correct fence count', () => {
    const map = new Map();
    const node = {
      id: 'n1',
      type: 'code-block',
      content: 'code',
      attributes: { language: 'py', fenceCount: 4 },
    };
    enterSourceEditMode(map, node);
    assert.equal(map.get('n1'), '````py\ncode\n````');
  });

  it('defaults fenceCount to 3 when missing', () => {
    const map = new Map();
    const node = {
      id: 'n1',
      type: 'code-block',
      content: 'code',
      attributes: { language: '' },
    };
    enterSourceEditMode(map, node);
    assert.equal(map.get('n1'), '```\ncode\n```');
  });
});

describe('exitSourceEditMode', () => {
  it('returns the stored text and removes the entry', () => {
    const map = new Map();
    const node = {
      id: 'n1',
      type: 'code-block',
      content: 'x',
      attributes: { language: '', fenceCount: 3 },
    };
    enterSourceEditMode(map, node);
    const text = exitSourceEditMode(map, 'n1');
    assert.equal(text, '```\nx\n```');
    assert.equal(map.size, 0);
  });

  it('returns null if not in source edit mode', () => {
    const map = new Map();
    assert.equal(exitSourceEditMode(map, 'n1'), null);
  });
});

describe('getSourceEditText', () => {
  it('returns the stored text', () => {
    const map = new Map();
    map.set('n1', '```\nhi\n```');
    assert.equal(getSourceEditText(map, 'n1'), '```\nhi\n```');
  });

  it('returns null when not present', () => {
    const map = new Map();
    assert.equal(getSourceEditText(map, 'n1'), null);
  });
});

describe('setSourceEditText', () => {
  it('updates the stored text', () => {
    const map = new Map();
    map.set('n1', '```\nold\n```');
    setSourceEditText(map, 'n1', '```\nnew\n```');
    assert.equal(map.get('n1'), '```\nnew\n```');
  });
});

describe('isInSourceEditMode', () => {
  it('returns true when entry exists', () => {
    const map = new Map();
    map.set('n1', 'text');
    assert.equal(isInSourceEditMode(map, 'n1'), true);
  });

  it('returns false when entry does not exist', () => {
    const map = new Map();
    assert.equal(isInSourceEditMode(map, 'n1'), false);
  });
});

describe('getSourceEditLength', () => {
  it('returns the length of the stored text', () => {
    const map = new Map();
    map.set('n1', '```\nhi\n```');
    assert.equal(getSourceEditLength(map, 'n1'), 10);
  });

  it('returns 0 when not in source edit mode', () => {
    const map = new Map();
    assert.equal(getSourceEditLength(map, 'n1'), 0);
  });
});
