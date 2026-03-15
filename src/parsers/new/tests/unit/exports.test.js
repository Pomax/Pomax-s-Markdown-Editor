/**
 * @fileoverview Verify that all expected symbols are importable from
 * the @tooling/syntax-tree and @tooling/parser packages.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SyntaxNode, SyntaxTree } from '../../index.js';

import {
  findNodeById,
  findNodeAtPosition,
  getBlockParent,
  isInlineNode,
  toBareText,
  getPathToNode,
  getNodeAtPath,
} from '../../src/syntax-tree/tree-utils.js';

import {
  rebuildInlineChildren,
  mergeHints,
  splitNode,
  insertNodesAfter,
  changeNodeType,
  toggleListType,
  renumberOrderedList,
  getTableCell,
  setTableCellText,
  addTableRow,
  addTableColumn,
  removeTableRow,
  removeTableColumn,
  applyFormat,
  reparseLine,
} from '../../src/syntax-tree/tree-mutations.js';

import {
  createPosition,
  createCollapsed,
  createSelection,
  isCollapsed,
  selectionSpans,
  containsPosition,
  getPathToCursor,
  setCursorFromPath,
} from '../../src/syntax-tree/tree-selection.js';

describe(`@tooling/syntax-tree exports`, () => {
  it(`exports SyntaxNode as a constructor`, () => {
    assert.strictEqual(typeof SyntaxNode, `function`);
  });

  it(`exports SyntaxTree as a constructor`, () => {
    assert.strictEqual(typeof SyntaxTree, `function`);
  });

  // Tree utils
  it(`exports findNodeById`, () => {
    assert.strictEqual(typeof findNodeById, `function`);
  });
  it(`exports findNodeAtPosition`, () => {
    assert.strictEqual(typeof findNodeAtPosition, `function`);
  });
  it(`exports getBlockParent`, () => {
    assert.strictEqual(typeof getBlockParent, `function`);
  });
  it(`exports isInlineNode`, () => {
    assert.strictEqual(typeof isInlineNode, `function`);
  });
  it(`exports toBareText`, () => {
    assert.strictEqual(typeof toBareText, `function`);
  });
  it(`exports getPathToNode`, () => {
    assert.strictEqual(typeof getPathToNode, `function`);
  });
  it(`exports getNodeAtPath`, () => {
    assert.strictEqual(typeof getNodeAtPath, `function`);
  });

  // Tree mutations
  it(`exports rebuildInlineChildren`, () => {
    assert.strictEqual(typeof rebuildInlineChildren, `function`);
  });
  it(`exports mergeHints`, () => {
    assert.strictEqual(typeof mergeHints, `function`);
  });
  it(`exports splitNode`, () => {
    assert.strictEqual(typeof splitNode, `function`);
  });
  it(`exports insertNodesAfter`, () => {
    assert.strictEqual(typeof insertNodesAfter, `function`);
  });
  it(`exports changeNodeType`, () => {
    assert.strictEqual(typeof changeNodeType, `function`);
  });
  it(`exports toggleListType`, () => {
    assert.strictEqual(typeof toggleListType, `function`);
  });
  it(`exports renumberOrderedList`, () => {
    assert.strictEqual(typeof renumberOrderedList, `function`);
  });
  it(`exports getTableCell`, () => {
    assert.strictEqual(typeof getTableCell, `function`);
  });
  it(`exports setTableCellText`, () => {
    assert.strictEqual(typeof setTableCellText, `function`);
  });
  it(`exports addTableRow`, () => {
    assert.strictEqual(typeof addTableRow, `function`);
  });
  it(`exports addTableColumn`, () => {
    assert.strictEqual(typeof addTableColumn, `function`);
  });
  it(`exports removeTableRow`, () => {
    assert.strictEqual(typeof removeTableRow, `function`);
  });
  it(`exports removeTableColumn`, () => {
    assert.strictEqual(typeof removeTableColumn, `function`);
  });
  it(`exports applyFormat`, () => {
    assert.strictEqual(typeof applyFormat, `function`);
  });
  it(`exports reparseLine`, () => {
    assert.strictEqual(typeof reparseLine, `function`);
  });

  // Tree selection
  it(`exports createPosition`, () => {
    assert.strictEqual(typeof createPosition, `function`);
  });
  it(`exports createCollapsed`, () => {
    assert.strictEqual(typeof createCollapsed, `function`);
  });
  it(`exports createSelection`, () => {
    assert.strictEqual(typeof createSelection, `function`);
  });
  it(`exports isCollapsed`, () => {
    assert.strictEqual(typeof isCollapsed, `function`);
  });
  it(`exports selectionSpans`, () => {
    assert.strictEqual(typeof selectionSpans, `function`);
  });
  it(`exports containsPosition`, () => {
    assert.strictEqual(typeof containsPosition, `function`);
  });
  it(`exports getPathToCursor`, () => {
    assert.strictEqual(typeof getPathToCursor, `function`);
  });
  it(`exports setCursorFromPath`, () => {
    assert.strictEqual(typeof setCursorFromPath, `function`);
  });
});
