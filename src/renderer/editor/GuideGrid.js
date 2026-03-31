/**
 * editor/GuideGrid.js — Guide grid overlay
 *
 * Renders a non-destructive guide grid over the canvas area.
 * Lives in a separate <canvas> with pointer-events:none so it
 * never interferes with Konva drag/interaction.
 * It is never involved in captureStage/captureKitArea — export is clean.
 *
 * Public API (window.GuideGrid):
 *   init(containerEl)       — append canvas to containerEl, start observing resize
 *   setVisible(bool)        — toggle grid on/off
 *   setSpacing(px)          — set grid cell size in px
 */

'use strict';

window.GuideGrid = (() => {
  let _canvas  = null;
  let _ctx     = null;
  let _spacing = 50;
  let _visible = false;

  // ── Public ─────────────────────────────────────────────────────────────

  function init(containerEl) {
    _canvas = document.createElement('canvas');
    _canvas.id = 'guide-grid-canvas';
    containerEl.appendChild(_canvas);
    _ctx = _canvas.getContext('2d');

    // Refit canvas whenever the container resizes
    const ro = new ResizeObserver(() => _resize());
    ro.observe(containerEl);
    _resize();
  }

  function setVisible(v) {
    _visible = !!v;
    _canvas.style.display = _visible ? 'block' : 'none';
    if (_visible) _draw();
  }

  function setSpacing(px) {
    _spacing = Math.max(10, Math.round(px));
    if (_visible) _draw();
  }

  // ── Private ────────────────────────────────────────────────────────────

  function _resize() {
    if (!_canvas) return;
    const p = _canvas.parentElement;
    _canvas.width  = p.offsetWidth;
    _canvas.height = p.offsetHeight;
    if (_visible) _draw();
  }

  function _draw() {
    const w  = _canvas.width;
    const h  = _canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    _ctx.clearRect(0, 0, w, h);

    // ── Regular grid ───────────────────────────────────────────────────
    // Lines radiate from the canvas centre so the centre always falls on
    // a grid intersection.
    _ctx.save();
    _ctx.strokeStyle = 'rgba(160, 160, 160, 0.35)';
    _ctx.lineWidth   = 0.5;
    _ctx.beginPath();

    // Vertical lines — anchor to cx
    for (let x = cx % _spacing; x <= w; x += _spacing) {
      _ctx.moveTo(x, 0);
      _ctx.lineTo(x, h);
    }
    // Horizontal lines — anchor to cy
    for (let y = cy % _spacing; y <= h; y += _spacing) {
      _ctx.moveTo(0, y);
      _ctx.lineTo(w, y);
    }

    _ctx.stroke();
    _ctx.restore();

    // ── Centre crosshair ───────────────────────────────────────────────
    // A horizontal line spanning half the canvas width and a vertical line
    // spanning half the canvas height, both centred on the canvas midpoint.
    // Always drawn so the centre is clearly visible regardless of grid density.
    const halfSpanX = w / 4;   // half of half-width  → total span = w/2
    const halfSpanY = h / 4;   // half of half-height → total span = h/2

    _ctx.save();
    _ctx.strokeStyle = 'rgba(220, 60, 60, 0.80)';
    _ctx.lineWidth   = 1.5;
    _ctx.lineCap     = 'round';
    _ctx.beginPath();

    // Horizontal centre line
    _ctx.moveTo(cx - halfSpanX, cy);
    _ctx.lineTo(cx + halfSpanX, cy);
    // Vertical centre line
    _ctx.moveTo(cx, cy - halfSpanY);
    _ctx.lineTo(cx, cy + halfSpanY);

    _ctx.stroke();

    // Centre dot
    _ctx.fillStyle = 'rgba(220, 60, 60, 0.90)';
    _ctx.beginPath();
    _ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    _ctx.fill();

    _ctx.restore();
  }

  return { init, setVisible, setSpacing };
})();
