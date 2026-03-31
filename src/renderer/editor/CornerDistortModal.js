/**
 * editor/CornerDistortModal.js — 4-corner distort editor modal
 *
 * Opens a full-screen modal for corner-distort editing of the name or
 * number element. Shows the kit background + element preview + 4
 * draggable corner handles connected by a dashed quad outline.
 *
 * Public API (window.CornerDistortModal):
 *   open({ bgDataUrl, textCanvas, shapeInfo, currentCorners, target, onApply })
 *   close()
 *
 * target     — 'name' | 'number'
 * shapeInfo  — { stageW, stageH, stageLeft, stageTop,
 *                stageW_txt, stageH_txt, localW, localH, scaleX, scaleY }
 * onApply(corners, scope)  — scope: 'all' | 'player'
 */

window.CornerDistortModal = (() => {
  const CORNER_KEYS  = ['tl', 'tr', 'bl', 'br'];
  const POINT_R      = 9;
  const LINE_COLOR   = 'rgba(80, 200, 255, 0.85)';
  const POINT_COLOR  = 'rgba(40, 180, 255, 1)';
  const ACTIVE_COLOR = '#ffffff';

  let _overlay    = null;
  let _canvas     = null;
  let _ctx        = null;
  let _bgImg      = null;
  let _textCanvas = null;
  let _shapeInfo  = null;
  let _corners    = null;   // { tl, tr, bl, br } each { dx, dy } in local px
  let _target     = null;   // 'name' | 'number'
  let _dragging   = null;   // key: 'tl'|'tr'|'bl'|'br' | null
  let _dragStart  = null;   // { mx, my, origDx, origDy }
  let _modalScale = 1;
  let _onApply    = null;
  let _rafPending = false;

  // ── Public ────────────────────────────────────────────────────────────

  function open({ bgDataUrl, textCanvas, shapeInfo, currentCorners, target, onApply }) {
    if (_overlay) close();

    _shapeInfo  = shapeInfo;
    _textCanvas = textCanvas;
    _target     = target;
    _onApply    = onApply;
    _corners = currentCorners
      ? { tl: { ...currentCorners.tl }, tr: { ...currentCorners.tr },
          bl: { ...currentCorners.bl }, br: { ...currentCorners.br } }
      : window.CornerWarp.createIdentity();

    _overlay = document.createElement('div');
    _overlay.className = 'wm-overlay';
    const label = target === 'name' ? 'Name' : 'Number';
    _overlay.innerHTML = `
      <div class="wm-modal">
        <div class="wm-header">
          <span class="wm-title">Corner Distort — ${label}</span>
          <button class="wm-close" title="Cancel">×</button>
        </div>
        <div class="wm-body">
          <canvas class="wm-canvas" id="wm-canvas"></canvas>
          <p class="wm-hint">Drag the blue corner handles to distort the ${label.toLowerCase()}.</p>
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

    // Size canvas to fit 82vw × 68vh while preserving stage aspect ratio
    const maxW = Math.floor(window.innerWidth  * 0.82);
    const maxH = Math.floor(window.innerHeight * 0.68);
    _modalScale = Math.min(maxW / shapeInfo.stageW, maxH / shapeInfo.stageH);

    _canvas = document.getElementById('wm-canvas');
    _canvas.width  = Math.round(shapeInfo.stageW * _modalScale);
    _canvas.height = Math.round(shapeInfo.stageH * _modalScale);
    _ctx = _canvas.getContext('2d');

    _bgImg = new Image();
    _bgImg.onload = () => _scheduleRender();
    _bgImg.src = bgDataUrl;

    _canvas.addEventListener('mousedown',  _onDown);
    _canvas.addEventListener('mousemove',  _onMove);
    _canvas.addEventListener('mouseup',    _onUp);
    _canvas.addEventListener('mouseleave', _onUp);

    document.getElementById('wm-reset').addEventListener('click', () => {
      _corners = window.CornerWarp.createIdentity();
      _scheduleRender();
    });
    document.getElementById('wm-cancel').addEventListener('click', close);
    _overlay.querySelector('.wm-close').addEventListener('click', close);
    document.getElementById('wm-apply').addEventListener('click', _apply);
    _overlay.addEventListener('click', e => { if (e.target === _overlay) close(); });
  }

  function close() {
    if (!_overlay) return;
    if (_canvas) {
      _canvas.removeEventListener('mousedown',  _onDown);
      _canvas.removeEventListener('mousemove',  _onMove);
      _canvas.removeEventListener('mouseup',    _onUp);
      _canvas.removeEventListener('mouseleave', _onUp);
    }
    _overlay.remove();
    _overlay = _canvas = _ctx = _bgImg = _textCanvas = _shapeInfo = _corners = null;
    _dragging = _dragStart = _onApply = _target = null;
  }

  // ── Private ───────────────────────────────────────────────────────────

  function _apply() {
    const scope   = _overlay.querySelector('input[name="wm-scope"]:checked').value;
    const corners = {
      tl: { ..._corners.tl }, tr: { ..._corners.tr },
      bl: { ..._corners.bl }, br: { ..._corners.br },
    };
    const cb = _onApply;
    close();
    if (cb) cb(corners, scope);
  }

  // Modal-pixel position of a corner handle
  function _ptPos(key) {
    const { stageLeft, stageTop, stageW_txt, stageH_txt, scaleX, scaleY } = _shapeInfo;
    const neutralX = (key === 'tr' || key === 'br') ? stageW_txt : 0;
    const neutralY = (key === 'bl' || key === 'br') ? stageH_txt : 0;
    return {
      x: (stageLeft + neutralX + _corners[key].dx * scaleX) * _modalScale,
      y: (stageTop  + neutralY + _corners[key].dy * scaleY) * _modalScale,
    };
  }

  function _canvasXY(e) {
    const rect = _canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (_canvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (_canvas.height / rect.height),
    };
  }

  function _onDown(e) {
    const { x: mx, y: my } = _canvasXY(e);
    for (const key of CORNER_KEYS) {
      const p = _ptPos(key);
      if (Math.hypot(mx - p.x, my - p.y) <= POINT_R + 6) {
        _dragging  = key;
        _dragStart = { mx, my, origDx: _corners[key].dx, origDy: _corners[key].dy };
        _canvas.style.cursor = 'grabbing';
        break;
      }
    }
  }

  function _onMove(e) {
    const { x: mx, y: my } = _canvasXY(e);
    if (_dragging === null) {
      const hit = CORNER_KEYS.some(key => {
        const p = _ptPos(key);
        return Math.hypot(mx - p.x, my - p.y) <= POINT_R + 6;
      });
      _canvas.style.cursor = hit ? 'grab' : 'default';
      return;
    }
    const { scaleX, scaleY } = _shapeInfo;
    _corners[_dragging].dx = _dragStart.origDx + (mx - _dragStart.mx) / (scaleX * _modalScale);
    _corners[_dragging].dy = _dragStart.origDy + (my - _dragStart.my) / (scaleY * _modalScale);
    _scheduleRender();
  }

  function _onUp() {
    _dragging = null;
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

    // ── Background (kit layer, no text) ──
    if (_bgImg && _bgImg.complete) _ctx.drawImage(_bgImg, 0, 0, cW, cH);

    // ── Distorted element preview ──
    if (_textCanvas) {
      const { stageLeft, stageTop, stageW_txt, stageH_txt, localW, localH } = _shapeInfo;
      const dstX = stageLeft  * _modalScale;
      const dstY = stageTop   * _modalScale;
      const dstW = stageW_txt * _modalScale;
      const dstH = stageH_txt * _modalScale;

      let srcCanvas = _textCanvas;
      if (!window.CornerWarp.isIdentity(_corners)) {
        const wc = document.createElement('canvas');
        wc.width  = localW;
        wc.height = localH;
        window.CornerWarp.applyWarp(wc.getContext('2d'), _textCanvas, _corners, localW, localH);
        srcCanvas = wc;
      }
      _ctx.drawImage(srcCanvas, dstX, dstY, dstW, dstH);
    }

    // ── Quad outline ──
    const tl = _ptPos('tl'), tr = _ptPos('tr');
    const bl = _ptPos('bl'), br = _ptPos('br');

    _ctx.save();
    _ctx.strokeStyle = LINE_COLOR;
    _ctx.lineWidth   = 1.5;
    _ctx.setLineDash([5, 4]);
    _ctx.beginPath();
    _ctx.moveTo(tl.x, tl.y);
    _ctx.lineTo(tr.x, tr.y);
    _ctx.lineTo(br.x, br.y);
    _ctx.lineTo(bl.x, bl.y);
    _ctx.closePath();
    _ctx.stroke();
    _ctx.setLineDash([]);
    _ctx.restore();

    // ── Corner handles ──
    _ctx.save();
    for (const key of CORNER_KEYS) {
      const p = _ptPos(key);
      _ctx.beginPath();
      _ctx.arc(p.x, p.y, POINT_R, 0, Math.PI * 2);
      _ctx.fillStyle   = key === _dragging ? ACTIVE_COLOR : POINT_COLOR;
      _ctx.strokeStyle = 'white';
      _ctx.lineWidth   = 1.5;
      _ctx.fill();
      _ctx.stroke();
    }
    _ctx.restore();
  }

  return { open, close };
})();
