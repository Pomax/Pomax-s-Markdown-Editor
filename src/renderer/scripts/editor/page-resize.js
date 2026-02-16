/**
 * @fileoverview Page resize handles for the focused-mode editor.
 *
 * Adds invisible drag handles to the left and right edges of the "paper"
 * element.  Dragging either handle resizes the page width symmetrically
 * and persists the new width to settings.
 *
 * The handles use `position: fixed` so they are never clipped by the
 * editor-container's scrollbar or overflow.  A ResizeObserver and scroll
 * listener keep them aligned with the paper's visual edges.
 *
 * The drag uses delta math: on mousedown the initial mouse-X and initial
 * page width are captured.  During mousemove, the new width is computed
 * from the initial width plus the delta, so there is never a visual jump
 * when the drag starts.
 */

/// <reference path="../../../types.d.ts" />

import { applyPageWidth } from '../preferences/preferences-modal.js';

/** Minimum page width in pixels. */
export const MIN_WIDTH_PX = 300;

/**
 * Computes the clamped new page width after a drag delta.
 *
 * Pure function — no DOM access — so it can be unit-tested.
 *
 * @param {object}          opts
 * @param {number}          opts.startWidth      - Editor width (px) at mousedown
 * @param {number}          opts.startX          - Mouse X at mousedown
 * @param {number}          opts.currentX        - Current mouse X
 * @param {'left'|'right'}  opts.side            - Which handle is being dragged
 * @param {number}          opts.maxContainerWidth - Available container width (px)
 * @returns {number} New page width in pixels, clamped to [MIN_WIDTH_PX, maxContainerWidth - 40]
 */
export function computeNewWidth({ startWidth, startX, currentX, side, maxContainerWidth }) {
    const dx = currentX - startX;
    const widthDelta = side === 'right' ? dx * 2 : -dx * 2;
    const maxWidth = maxContainerWidth - 40;
    return Math.round(Math.max(MIN_WIDTH_PX, Math.min(maxWidth, startWidth + widthDelta)));
}

/**
 * Initialises left and right resize handles for the editor page.
 *
 * @param {HTMLElement} editor - The `.editor` paper element (`#editor`).
 */
export function initPageResizeHandles(editor) {
    const container = editor.parentElement;
    if (!container) return;

    const leftHandle = _createHandle('left');
    const rightHandle = _createHandle('right');

    document.body.appendChild(leftHandle);
    document.body.appendChild(rightHandle);

    const update = () => _positionHandles(editor, leftHandle, rightHandle);

    update();

    // Re-position whenever the editor or container resizes.
    const ro = new ResizeObserver(update);
    ro.observe(editor);
    ro.observe(container);

    // Re-position on scroll (the editor container is the scroll parent).
    container.addEventListener('scroll', update, { passive: true });

    _attachDrag(editor, leftHandle, 'left', rightHandle);
    _attachDrag(editor, rightHandle, 'right', leftHandle);
}

// ── Private helpers ──────────────────────────────────────────────────

/**
 * Creates a resize handle element.
 * @param {'left' | 'right'} side
 * @returns {HTMLDivElement}
 */
function _createHandle(side) {
    const handle = document.createElement('div');
    handle.className = `editor-resize-handle editor-resize-handle--${side}`;
    handle.dataset.side = side;
    return handle;
}

/**
 * Positions both handles at the current left/right edges of the paper
 * using fixed positioning (viewport coordinates).  Also hides the
 * handles when the editor is in source mode.
 *
 * @param {HTMLElement} editor
 * @param {HTMLDivElement} leftHandle
 * @param {HTMLDivElement} rightHandle
 */
function _positionHandles(editor, leftHandle, rightHandle) {
    // Hide in source mode (no fixed-width paper to resize)
    if (editor.dataset.viewMode === 'source') {
        leftHandle.style.display = 'none';
        rightHandle.style.display = 'none';
        return;
    }
    leftHandle.style.display = '';
    rightHandle.style.display = '';

    const container = editor.parentElement;
    if (!container) return;

    const editorRect = editor.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const handleWidth = 6; // matches CSS width
    // Vertical extent: clip to the visible portion of the container
    const top = containerRect.top;
    const height = containerRect.height;

    leftHandle.style.top = `${top}px`;
    leftHandle.style.height = `${height}px`;
    leftHandle.style.left = `${editorRect.left - handleWidth / 2}px`;

    rightHandle.style.top = `${top}px`;
    rightHandle.style.height = `${height}px`;
    rightHandle.style.left = `${editorRect.right - handleWidth / 2}px`;
}

/**
 * Attaches mousedown → mousemove → mouseup drag behaviour to a handle.
 *
 * Uses delta-after-click math: captures the initial mouse-X and initial
 * page width on mousedown, then computes `initialWidth + delta` during
 * mousemove so there is zero visual jump at the start of the drag.
 *
 * @param {HTMLElement} editor       - The paper element
 * @param {HTMLDivElement} handle    - The handle being dragged
 * @param {'left' | 'right'} side   - Which side this handle sits on
 * @param {HTMLDivElement} otherHandle - The opposite handle (for re-positioning)
 */
function _attachDrag(editor, handle, side, otherHandle) {
    /** @type {number} Mouse X at the moment of mousedown */
    let startX = 0;
    /** @type {number} Editor width (px) at the moment of mousedown */
    let startWidth = 0;
    /** @type {number} Left-handle starting X (viewport) at mousedown */
    let startLeftX = 0;
    /** @type {number} Right-handle starting X (viewport) at mousedown */
    let startRightX = 0;
    /** @type {number|null} Pending rAF id */
    let rafId = null;
    /** @type {number} Last mouse X seen during this drag */
    let lastMouseX = 0;

    /** Calls the exported computeNewWidth with current drag state. */
    const getNewWidth = () => {
        const container = editor.parentElement;
        const maxContainerWidth = container ? container.clientWidth : 2040;
        return computeNewWidth({
            startWidth,
            startX,
            currentX: lastMouseX,
            side,
            maxContainerWidth,
        });
    };

    /** @param {MouseEvent} e */
    const onMouseMove = (e) => {
        e.preventDefault();
        lastMouseX = e.clientX;
        if (rafId !== null) return; // coalesce into one frame

        rafId = requestAnimationFrame(() => {
            rafId = null;

            const newWidth = getNewWidth();

            // Set inline style directly — avoids CSS variable cascade reflow.
            editor.style.maxWidth = `${newWidth}px`;

            // Position handles directly from the delta — no layout thrash.
            const halfGrowth = (newWidth - startWidth) / 2;
            const handleWidth = 6;
            const newLeftX = startLeftX - halfGrowth - handleWidth / 2;
            const newRightX = startRightX + halfGrowth - handleWidth / 2;

            handle.style.left = `${side === 'left' ? newLeftX : newRightX}px`;
            otherHandle.style.left = `${side === 'left' ? newRightX : newLeftX}px`;
        });
    };

    const onMouseUp = () => {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        handle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Compute final width from the delta (don't rely on rAF having run).
        const finalWidth = getNewWidth();
        editor.style.maxWidth = '';
        applyPageWidth({ useFixed: false, width: finalWidth, unit: 'px' });

        // Snap handles to actual editor rect now that the CSS variable is set.
        _positionHandles(
            editor,
            side === 'left' ? handle : otherHandle,
            side === 'right' ? handle : otherHandle,
        );

        _persistPageWidth(finalWidth);
    };

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startWidth = editor.getBoundingClientRect().width;

        // Capture both handles' current viewport X positions.
        const editorRect = editor.getBoundingClientRect();
        startLeftX = editorRect.left;
        startRightX = editorRect.right;

        handle.classList.add('dragging');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

/**
 * Persists the page width to the settings database.
 * @param {number} widthPx - Width in pixels
 */
async function _persistPageWidth(widthPx) {
    if (!window.electronAPI) return;
    const pageWidth = { useFixed: false, width: widthPx, unit: 'px' };
    try {
        await window.electronAPI.setSetting('pageWidth', pageWidth);
    } catch {
        // Non-critical — ignore
    }
}
