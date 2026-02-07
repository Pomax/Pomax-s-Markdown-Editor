/**
 * @fileoverview Unit tests for the UndoManager class.
 */

import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { UndoManager } from '../../../src/renderer/scripts/editor/undo-manager.js';

describe('UndoManager', () => {
    /** @type {UndoManager} */
    let undoManager;

    beforeEach(() => {
        undoManager = new UndoManager();
    });

    describe('initial state', () => {
        it('should start with empty stacks', () => {
            assert.strictEqual(undoManager.getUndoCount(), 0);
            assert.strictEqual(undoManager.getRedoCount(), 0);
        });

        it('should not be able to undo or redo', () => {
            assert.strictEqual(undoManager.canUndo(), false);
            assert.strictEqual(undoManager.canRedo(), false);
        });
    });

    describe('recordChange', () => {
        it('should add a change to the undo stack', () => {
            undoManager.recordChange({
                type: 'input',
                before: '',
                after: 'Hello',
            });
            assert.strictEqual(undoManager.getUndoCount(), 1);
        });

        it('should clear the redo stack', () => {
            undoManager.recordChange({ type: 'input', before: '', after: 'A' });
            undoManager.undo();
            assert.strictEqual(undoManager.getRedoCount(), 1);

            undoManager.recordChange({ type: 'input', before: '', after: 'B' });
            assert.strictEqual(undoManager.getRedoCount(), 0);
        });
    });

    describe('undo', () => {
        it('should return the last change', () => {
            undoManager.recordChange({
                type: 'input',
                before: 'A',
                after: 'B',
            });

            const change = undoManager.undo();
            assert.ok(change !== null);
            assert.strictEqual(change.before, 'A');
            assert.strictEqual(change.after, 'B');
        });

        it('should return null when stack is empty', () => {
            const change = undoManager.undo();
            assert.strictEqual(change, null);
        });

        it('should move change to redo stack', () => {
            undoManager.recordChange({ type: 'input', before: '', after: 'A' });
            undoManager.undo();

            assert.strictEqual(undoManager.getUndoCount(), 0);
            assert.strictEqual(undoManager.getRedoCount(), 1);
        });
    });

    describe('redo', () => {
        it('should return the last undone change', () => {
            undoManager.recordChange({
                type: 'input',
                before: 'A',
                after: 'B',
            });
            undoManager.undo();

            const change = undoManager.redo();
            assert.ok(change !== null);
            assert.strictEqual(change.before, 'A');
            assert.strictEqual(change.after, 'B');
        });

        it('should return null when stack is empty', () => {
            const change = undoManager.redo();
            assert.strictEqual(change, null);
        });

        it('should move change back to undo stack', () => {
            undoManager.recordChange({ type: 'input', before: '', after: 'A' });
            undoManager.undo();
            undoManager.redo();

            assert.strictEqual(undoManager.getUndoCount(), 1);
            assert.strictEqual(undoManager.getRedoCount(), 0);
        });
    });

    describe('canUndo and canRedo', () => {
        it('should return true when operations are available', () => {
            undoManager.recordChange({ type: 'input', before: '', after: 'A' });
            assert.strictEqual(undoManager.canUndo(), true);
            assert.strictEqual(undoManager.canRedo(), false);

            undoManager.undo();
            assert.strictEqual(undoManager.canUndo(), false);
            assert.strictEqual(undoManager.canRedo(), true);
        });
    });

    describe('clear', () => {
        it('should clear all history', () => {
            undoManager.recordChange({ type: 'input', before: '', after: 'A' });
            undoManager.recordChange({ type: 'input', before: 'A', after: 'AB' });
            undoManager.undo();

            undoManager.clear();

            assert.strictEqual(undoManager.getUndoCount(), 0);
            assert.strictEqual(undoManager.getRedoCount(), 0);
        });
    });

    describe('multiple operations', () => {
        it('should handle multiple undo/redo cycles', () => {
            undoManager.recordChange({ type: 'input', before: '', after: 'A' });
            undoManager.recordChange({ type: 'input', before: 'A', after: 'AB' });
            undoManager.recordChange({ type: 'input', before: 'AB', after: 'ABC' });

            assert.strictEqual(undoManager.getUndoCount(), 3);

            undoManager.undo();
            undoManager.undo();

            assert.strictEqual(undoManager.getUndoCount(), 1);
            assert.strictEqual(undoManager.getRedoCount(), 2);

            undoManager.redo();

            assert.strictEqual(undoManager.getUndoCount(), 2);
            assert.strictEqual(undoManager.getRedoCount(), 1);
        });
    });
});
