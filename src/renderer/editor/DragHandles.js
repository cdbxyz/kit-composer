/**
 * editor/DragHandles.js — Draggable anchor handles on the Konva canvas
 *
 * Creates interactive Konva.Circle handles for:
 *   - Name anchor position (nameAnchor)
 *   - Number anchor position (numberAnchor)
 *
 * Each handle:
 *   - Is draggable within the stage bounds
 *   - Emits 'dragend' events that propagate to KitCanvas.getProfile()
 *   - Shows XY coordinate tooltip on hover
 *   - Snaps to grid if shift is held (optional, later)
 *
 * Consumed by KitCanvas.js which passes the handle layer.
 *
 * Public API (window.DragHandles):
 *   createHandles(layer, stage, initialPositions)
 *   updatePositions(nameAnchor, numberAnchor)
 *   getPositions() → { nameAnchor: {x,y}, numberAnchor: {x,y} }
 */

/* global Konva */

window.DragHandles = (() => {
  let nameHandle, numberHandle;

  function createHandles(layer, stage, initialPositions) {
    // TODO: create two Konva.Group (circle + label) per anchor
    // TODO: attach dragend listeners that fire 'kit-canvas:profile-changed'
  }

  function updatePositions(nameAnchor, numberAnchor) {
    // TODO: move handle groups to new positions without triggering events
  }

  function getPositions() {
    // TODO: return current {x, y} of each handle
    return { nameAnchor: { x: 0, y: 0 }, numberAnchor: { x: 0, y: 0 } };
  }

  return { createHandles, updatePositions, getPositions };
})();
