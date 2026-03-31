/**
 * editor/WarpModal.js — Mesh warp editor modal
 *
 * Opens a full-screen modal over the jersey canvas.
 * The modal canvas shows:
 *   1. The jersey background (kit layer, no text).
 *   2. A live-warped preview of the name text.
 *   3. A 4×4 grid of draggable control points.
 *
 * Mesh offsets are stored in the name shape's LOCAL pixel space so they
 * are independent of the current zoom/scale.
 *
 * Public API (window.WarpModal):
 *   open({ bgDataUrl, textCanvas, shapeInfo, currentMesh, onApply })
 *   close()
 *
 * shapeInfo: { stageW, stageH, stageLeft, stageTop,
 *              stageW_txt, stageH_txt, localW, localH, scaleX, scaleY }
 * onApply(mesh, scope)  — scope: 'all' | 'player'
 */

window.WarpModal = (() => {
  const ROWS    = 4, COLS = 4, N = 16;
  const POINT_R = 8;
  const LINE_COLOR  = 'rgba(80, 200, 255, 0.85)';
  const POINT_COLOR = 'rgba(40, 180, 255, 1)';
  const ACTIVE_COLOR = '#ffffff';

  let _overlay    = null;
  let _canvas     = null;
  let _ctx        = null;
  let _bgImg      = null;
  let _textCanvas = null;   // name text rendered without warp
  let _shapeInfo  = null;
  let _mesh       = null;   // [{dx,dy}×16] in local pixels
  let _dragging   = -1;
  let _dragStart  = null;   // { mx, my, origDx, origDy }
  let _modalScale = 1;
  let _onApply    = null;
  let _rafPending = false;

  // ── Public ────────────────────────────────────────────────────────────

  function open({ bgDataUrl, textCanvas, shapeInfo, currentMesh, onApply }) {
    if (_overlay) close();

    _shapeInfo  = shapeInfo;
    _textCanvas = textCanvas;
    _onApply    = onApply;
    _mesh = currentMesh
      ? currentMesh.map(p => ({ dx: p.dx, dy: p.dy }))
      : window.MeshWarp.createIdentityMesh();

    _overlay = document.createElement('div');
    _overlay.className = 'wm-overlay';
    _overlay.innerHTML = `
      <div class="wm-modal">
        <div class="wm-header">
          <span class="wm-title">Mesh Warp — Name</span>
          <button class="wm-close" title="Cancel">×</button>
        </div>
        <div class="wm-body">
          <canvas class="wm-canvas" id="wm-canvas"></canvas>
          <p class="wm-hint">Drag the blue control points to warp the name text.</p>
        </div>
        <div class="wm-footer">
          <div class="wm-scope">
            <label class="wm-radio">
              <input type="radio" name="wm-scope" value="all" checked>
              <span>Apply to all players</span>
            </label>
            <label class="wm-radio">
              <input type="radio" name="wm-scope" value="player">
              <span>This player only</span>
            </label>
          </div>
          <div class="wm-actions">
            <button class="wm-btn" id="wm-reset">Reset</button>
            <button class="wm-btn" id="wm-cancel">Cancel</button>
            <button class="wm-btn wm-primary" id="wm-apply">Apply</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(_overlay);

    // Size canvas to fit 82vw × 70vh while preserving stage aspect ratio
    const maxW = Math.floor(window.innerWidth  * 0.82);
    const maxH = Math.floor(window.innerHeight * 0.68);
    _modalScale = Math.min(maxW / shapeInfo.stageW, maxH / shapeInfo.stageH);

    _canvas = document.getElementById('wm-canvas');
    _canvas.width  = Math.round(shapeInfo.stageW * _modalScale);
    _canvas.height = Math.round(shapeInfo.stageH * _modalScale);
    _ctx = _canvas.getContext('2d');

    // Load background
    _bgImg = new Image();
    _bgImg.onload = () => _scheduleRender();
    _bgImg.src = bgDataUrl;

    // Canvas events
    _canvas.addEventListener('mousedown',  _onDown);
    _canvas.addEventListener('mousemove',  _onMove);
    _canvas.addEventListener('mouseup',    _onUp);
    _canvas.addEventListener('mouseleave', _onUp);

    // Button events
    document.getElementById('wm-reset').addEventListener('click', () => {
      _mesh = window.MeshWarp.createIdentityMesh();
      _scheduleRender();
    });
    document.getElementById('wm-cancel').addEventListener('click', close);
    _overlay.querySelector('.wm-close').addEventListener('click', close);
    document.getElementById('wm-apply').addEventListener('click', _apply);

    // Close on overlay background click
    _overlay.addEventListener('click', e => { if (e.target === _overlay) close(); });
  }

  function close() {
    if (!_overlay) return;
    _canvas && _canvas.removeEventListener('mousedown',  _onDown);
    _canvas && _canvas.removeEventListener('mousemove',  _onMove);
    _canvas && _canvas.removeEventListener('mouseup',    _onUp);
    _canvas && _canvas.removeEventListener('mouseleave', _onUp);
    _overlay.remove();
    _overlay = _canvas = _ctx = _bgImg = _textCanvas = _shapeInfo = _mesh = null;
    _dragging = -1;
    _onApply  = null;
  }

  // ── Private ───────────────────────────────────────────────────────────

  function _apply() {
    const scope = _overlay.querySelector('input[name="wm-scope"]:checked').value;
    const mesh  = _mesh.map(p => ({ dx: p.dx, dy: p.dy }));
    const cb    = _onApply;
    close();
    if (cb) cb(mesh, scope);
  }

  // Map index → current position in modal pixels
  function _ptPos(i) {
    const r = Math.floor(i / COLS), c = i % COLS;
    const { stageLeft, stageTop, stageW_txt, stageH_txt, scaleX, scaleY } = _shapeInfo;

    const neutralStageX = stageLeft + (c / 3) * stageW_txt;
    const neutralStageY = stageTop  + (r / 3) * stageH_txt;

    return {
      x: neutralStageX * _modalScale + _mesh[i].dx * scaleX * _modalScale,
      y: neutralStageY * _modalScale + _mesh[i].dy * scaleY * _modalScale,
    };
  }

  // Canvas pixel coords (accounting for CSS scaling)
  function _canvasXY(e) {
    const rect = _canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (_canvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (_canvas.height / rect.height),
    };
  }

  function _onDown(e) {
    const { x: mx, y: my } = _canvasXY(e);
    for (let i = 0; i < N; i++) {
      const p = _ptPos(i);
      if (Math.hypot(mx - p.x, my - p.y) <= POINT_R + 6) {
        _dragging  = i;
        _dragStart = { mx, my, origDx: _mesh[i].dx, origDy: _mesh[i].dy };
        _canvas.style.cursor = 'grabbing';
        break;
      }
    }
  }

  function _onMove(e) {
    if (_dragging < 0) {
      // Update cursor
      const { x: mx, y: my } = _canvasXY(e);
      const hit = _mesh.some((_, i) => {
        const p = _ptPos(i);
        return Math.hypot(mx - p.x, my - p.y) <= POINT_R + 6;
      });
      _canvas.style.cursor = hit ? 'grab' : 'default';
      return;
    }

    const { x: mx, y: my } = _canvasXY(e);
    const { scaleX, scaleY } = _shapeInfo;

    _mesh[_dragging].dx = _dragStart.origDx + (mx - _dragStart.mx) / (scaleX * _modalScale);
    _mesh[_dragging].dy = _dragStart.origDy + (my - _dragStart.my) / (scaleY * _modalScale);

    _scheduleRender();
  }

  function _onUp() {
    _dragging = -1;
    _canvas.style.cursor = 'default';
  }

  function _scheduleRender() {
    if (_rafPending || !_ctx) return;
    _rafPending = true;
    requestAnimationFrame(() => { _rafPending = false; _render(); });
  }

  function _render() {
    if (!_ctx) return;
    const cW = _canvas.width, cH = _canvas.height;
    _ctx.clearRect(0, 0, cW, cH);

    // ── Background (kit layer) ──
    if (_bgImg && _bgImg.complete) _ctx.drawImage(_bgImg, 0, 0, cW, cH);

    // ── Warped name preview ──
    if (_textCanvas) {
      const { stageLeft, stageTop, stageW_txt, stageH_txt, localW, localH } = _shapeInfo;

      const dstX = stageLeft   * _modalScale;
      const dstY = stageTop    * _modalScale;
      const dstW = stageW_txt  * _modalScale;
      const dstH = stageH_txt  * _modalScale;

      let srcCanvas = _textCanvas;

      if (!window.MeshWarp.isIdentity(_mesh)) {
        const wc  = document.createElement('canvas');
        wc.width  = localW;
        wc.height = localH;
        window.MeshWarp.applyWarp(wc.getContext('2d'), _textCanvas, _mesh, localW, localH);
        srcCanvas = wc;
      }

      _ctx.drawImage(srcCanvas, dstX, dstY, dstW, dstH);
    }

    // ── Grid lines ──
    _ctx.save();
    _ctx.strokeStyle = LINE_COLOR;
    _ctx.lineWidth   = 1;
    _ctx.setLineDash([5, 4]);

    for (let r = 0; r < ROWS; r++) {
      _ctx.beginPath();
      for (let c = 0; c < COLS; c++) {
        const p = _ptPos(r * COLS + c);
        c === 0 ? _ctx.moveTo(p.x, p.y) : _ctx.lineTo(p.x, p.y);
      }
      _ctx.stroke();
    }
    for (let c = 0; c < COLS; c++) {
      _ctx.beginPath();
      for (let r = 0; r < ROWS; r++) {
        const p = _ptPos(r * COLS + c);
        r === 0 ? _ctx.moveTo(p.x, p.y) : _ctx.lineTo(p.x, p.y);
      }
      _ctx.stroke();
    }
    _ctx.setLineDash([]);
    _ctx.restore();

    // ── Control points ──
    _ctx.save();
    for (let i = 0; i < N; i++) {
      const p = _ptPos(i);
      _ctx.beginPath();
      _ctx.arc(p.x, p.y, POINT_R, 0, Math.PI * 2);
      _ctx.fillStyle   = i === _dragging ? ACTIVE_COLOR : POINT_COLOR;
      _ctx.strokeStyle = 'white';
      _ctx.lineWidth   = 1.5;
      _ctx.fill();
      _ctx.stroke();
    }
    _ctx.restore();
  }

  return { open, close };
})();
