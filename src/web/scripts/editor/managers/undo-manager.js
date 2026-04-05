import { UndoManagerData } from '../types.js';

/**
 * Manages undo/redo history with unlimited capacity.
 */
export class UndoManager extends UndoManagerData {
  constructor() {
    super();
  }

  /**
   * Records a change in the undo history.
   * @param {Omit<Change, 'timestamp'>} change - The change to record
   */
  recordChange(change) {
    const now = Date.now();
    const timeSinceLastChange = now - this.lastChangeTime;

    // If this change is within the batch timeout of the last change,
    // merge them together
    if (timeSinceLastChange < this.batchTimeout && this.undoStack.length > 0) {
      const lastChange = this.undoStack[this.undoStack.length - 1];
      lastChange.after = change.after;
      lastChange.timestamp = now;
    } else {
      // Otherwise, add as a new change
      this.undoStack.push({
        ...change,
        timestamp: now,
      });
    }

    // Clear redo stack when a new change is made
    this.redoStack = [];
    this.lastChangeTime = now;
  }

  /**
   * Undoes the last change.
   * @returns {Change | undefined} The undone change, or undefined if nothing to undo
   */
  undo() {
    if (this.undoStack.length === 0) {
      return undefined;
    }

    const change = this.undoStack.pop();
    if (change) {
      this.redoStack.push(change);
      return change;
    }
    return undefined;
  }

  /**
   * Redoes the last undone change.
   * @returns {Change | undefined} The redone change, or undefined if nothing to redo
   */
  redo() {
    if (this.redoStack.length === 0) {
      return undefined;
    }

    const change = this.redoStack.pop();
    if (change) {
      this.undoStack.push(change);
      return change;
    }
    return undefined;
  }

  /**
   * Checks if undo is available.
   * @returns {boolean}
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Checks if redo is available.
   * @returns {boolean}
   */
  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Clears all history.
   */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.lastChangeTime = 0;
  }

  /**
   * Gets the number of changes in the undo stack.
   * @returns {number}
   */
  getUndoCount() {
    return this.undoStack.length;
  }

  /**
   * Gets the number of changes in the redo stack.
   * @returns {number}
   */
  getRedoCount() {
    return this.redoStack.length;
  }
}
