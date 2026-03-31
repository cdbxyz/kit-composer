/**
 * editor/CompositeCanvas.js — Composite view canvas
 *
 * Renders back and front shirts together on a square output canvas.
 * Each shirt is independently draggable; Konva.Transformer provides
 * selection handles (dashed blue border, corner scale handles, rotation handle).
 *
 * Public API (window.CompositeCanvas):
 *   init()
 *   refresh(backDataUrl, frontDataUrl)   — update shirt images
 *   selectShirt(which)                  — 'back' | 'front' | null
 *   setTransform(which, x, y, scale)
 *   setRotation(which, deg)
 *   setZOrder(which, zOrder)            — 'behind' | 'front'
 *   resetLayout()
 *   getSettings()                       → { back, front }
 *   applySettings(s)
 *   onViewActivate()
 *   captureArea(pixelRatio)             → dataURL | null
 *
 * Fires 'composite-canvas:shirt-selected'   { shirt }
 * Fires 'composite-canvas:transform-changed' { shirt, x, y, scale, rotation, outputSize }
 * Fires 'composite-canvas:zorder-changed'   { back, front }
 */

/* global Konva */

window.CompositeCanvas = (() => {
  const CONTAINER_ID = 'composite-canvas-container';

  let stage      = null;
  let bgLayer    = null;   // background: grey fill + white output rect
  let shirtLayer = null;   // shirts + transformer

  let backNode   = null;
  let frontNode  = null;
  let transformer = null;

  // Output square geometry (updated on stage resize)
  let outX = 0, outY = 0, outSize = 0;

  // Per-shirt natural image dims for base-scale computation
  let backNatW = 0, backNatH = 0;
  let frontNatW = 0, frontNatH = 0;

  // Current active selection
  let selectedShirt = null;

  // Layout: x/y are absolute stage coords (centre of shirt)
  // scale is user scale (slider value); base scale applied internally
  let backLayout  = _freshBack();
  let frontLayout = _freshFront();

  function _freshBack()  { return { x: null, y: null, scale: 1.0, rotation: 0, zOrder: 'behind' }; }
  function _freshFront() { return { x: null, y: null, scale: 1.0, rotation: 0, zOrder: 'front'  }; }

  // ── Default absolute positions (called after outSize is known) ────────
  function _defaultPos(which) {
    if (which === 'back')  return { x: outX + outSize * 0.35, y: outY + outSize * 0.37 };
    return                        { x: outX + outSize * 0.63, y: outY + outSize * 0.60 };
  }

  // ── Base scale: "scale=1" ↔ shirt's long side fills 80% of output sq ─
  function _baseScale(natW, natH) {
    return (outSize * 0.80) / Math.max(natW, natH, 1);
  }

  // ── Stage setup ────────────────────────────────────────────────────────
  function init() {}

  function _ensureStage() {
    const container = document.getElementById(CONTAINER_ID);
    const w = container.offsetWidth  || 600;
    const h = container.offsetHeight || 500;
    if (!stage) {
      stage      = new Konva.Stage({ container: CONTAINER_ID, width: w, height: h });
      bgLayer    = new Konva.Layer({ listening: false });
      shirtLayer = new Konva.Layer();
      stage.add(bgLayer);
      stage.add(shirtLayer);

      // Click on empty stage → deselect
      stage.on('click tap', (e) => {
        if (e.target === stage || bgLayer.children.includes(e.target)) {
          selectShirt(null);
        }
      });

      window.addEventListener('resize', _onResize);
    } else {
      stage.width(w);
      stage.height(h);
    }
    _recalcOutput();
    _drawBackground();
  }

  function _recalcOutput() {
    const pad = 44;
    outSize = Math.max(60, Math.min(stage.width(), stage.height()) - pad * 2);
    outX    = (stage.width()  - outSize) / 2;
    outY    = (stage.height() - outSize) / 2;
  }

  function _drawBackground() {
    bgLayer.destroyChildren();
    bgLayer.add(new Konva.Rect({
      x: 0, y: 0,
      width: stage.width(), height: stage.height(),
      fill: 'var(--color-bg, #f0f0f2)',
      listening: false,
    }));
    bgLayer.add(new Konva.Rect({
      x: outX, y: outY,
      width: outSize, height: outSize,
      fill: 'white',
      stroke: '#d1d5db',
      strokeWidth: 1.5,
      dash: [8, 4],
      listening: false,
    }));
    bgLayer.add(new Konva.Text({
      x: outX, y: outY - 22,
      width: outSize,
      text: '1:1 output canvas',
      fontSize: 11,
      fill: '#9ca3af',
      align: 'center',
      listening: false,
    }));
    bgLayer.batchDraw();
  }

  // ── Image loading ──────────────────────────────────────────────────────
  function refresh(backDataUrl, frontDataUrl) {
    _ensureStage();
    let pending = (backDataUrl ? 1 : 0) + (frontDataUrl ? 1 : 0);

    if (!backDataUrl && backNode) { backNode.destroy(); backNode = null; }
    if (!frontDataUrl && frontNode) { frontNode.destroy(); frontNode = null; }

    function done() {
      _applyZOrder();
      shirtLayer.batchDraw();
    }

    if (backDataUrl) {
      const img = new Image();
      img.onload = () => {
        _loadShirtNode('back', img);
        if (--pending === 0) done();
      };
      img.src = backDataUrl;
    }
    if (frontDataUrl) {
      const img = new Image();
      img.onload = () => {
        _loadShirtNode('front', img);
        if (--pending === 0) done();
      };
      img.src = frontDataUrl;
    }
    if (pending === 0) done();
  }

  function _loadShirtNode(which, img) {
    const natW = img.naturalWidth  || img.width  || 1;
    const natH = img.naturalHeight || img.height || 1;
    const bs   = _baseScale(natW, natH);
    const layout = which === 'back' ? backLayout : frontLayout;

    if (which === 'back')  { backNatW = natW;  backNatH = natH;  }
    else                   { frontNatW = natW; frontNatH = natH; }

    if (!layout.x || !layout.y) {
      const def = _defaultPos(which);
      layout.x = def.x;
      layout.y = def.y;
    }

    const existing = which === 'back' ? backNode : frontNode;
    if (existing) {
      // Update image; keep position/rotation
      existing.image(img);
      existing.width(natW);
      existing.height(natH);
      existing.offsetX(natW / 2);
      existing.offsetY(natH / 2);
      existing.scaleX(bs * layout.scale);
      existing.scaleY(bs * layout.scale);
      if (transformer && selectedShirt === which) transformer.forceUpdate();
    } else {
      const node = new Konva.Image({
        image:    img,
        x:        layout.x,
        y:        layout.y,
        width:    natW,
        height:   natH,
        offsetX:  natW / 2,
        offsetY:  natH / 2,
        scaleX:   bs * layout.scale,
        scaleY:   bs * layout.scale,
        rotation: layout.rotation,
        draggable: true,
      });
      _attachNodeEvents(node, which);
      shirtLayer.add(node);
      if (which === 'back') backNode  = node;
      else                  frontNode = node;
    }
  }

  // ── Node interaction ───────────────────────────────────────────────────
  function _attachNodeEvents(node, which) {
    node.on('click tap', (e) => { e.cancelBubble = true; selectShirt(which); });
    node.on('mouseenter', () => { if (stage) stage.container().style.cursor = 'grab'; });
    node.on('mousedown',  () => { if (stage) stage.container().style.cursor = 'grabbing'; });
    node.on('mouseleave dragend', () => { if (stage) stage.container().style.cursor = 'default'; });

    node.on('dragmove', () => {
      const layout = which === 'back' ? backLayout : frontLayout;
      layout.x = node.x();
      layout.y = node.y();
      _fireTransformChanged(which);
    });

    // Transformer scale/rotate gestures
    node.on('transform', () => {
      const layout = which === 'back' ? backLayout : frontLayout;
      const natW   = which === 'back' ? backNatW  : frontNatW;
      const natH   = which === 'back' ? backNatH  : frontNatH;
      const bs     = _baseScale(natW, natH);
      layout.x        = node.x();
      layout.y        = node.y();
      layout.scale    = node.scaleX() / Math.max(bs, 1e-6);
      layout.rotation = node.rotation();
      _fireTransformChanged(which);
    });
  }

  // ── Selection ──────────────────────────────────────────────────────────
  function selectShirt(which) {
    selectedShirt = which;
    const node = which === 'back' ? backNode : (which === 'front' ? frontNode : null);

    if (!transformer) {
      transformer = new Konva.Transformer({
        rotateEnabled:     true,
        keepRatio:         true,
        enabledAnchors:    ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        borderStroke:      '#2563eb',
        borderDash:        [6, 4],
        borderStrokeWidth: 1.5,
        anchorStroke:      '#2563eb',
        anchorFill:        '#2563eb',
        anchorSize:        8,
        anchorCornerRadius: 4,
        rotateAnchorOffset: 30,
      });
      // Style rotation anchor yellow if Konva supports it
      try { transformer.rotateAnchorFill('#f59e0b'); transformer.rotateAnchorStroke('#f59e0b'); } catch {}
      shirtLayer.add(transformer);
    }

    if (node) {
      transformer.nodes([node]);
      transformer.visible(true);
    } else {
      transformer.nodes([]);
      transformer.visible(false);
    }
    shirtLayer.batchDraw();

    document.dispatchEvent(new CustomEvent('composite-canvas:shirt-selected', {
      detail: { shirt: which },
    }));
  }

  // ── Z-order ────────────────────────────────────────────────────────────
  function _applyZOrder() {
    if (!backNode || !frontNode) return;
    if (backLayout.zOrder === 'front') backNode.moveToTop();
    else                               frontNode.moveToTop();
    if (transformer) transformer.moveToTop();
  }

  // ── Public transform setters ───────────────────────────────────────────
  function setTransform(which, x, y, scale) {
    const layout = which === 'back' ? backLayout : frontLayout;
    const node   = which === 'back' ? backNode  : frontNode;
    const natW   = which === 'back' ? backNatW  : frontNatW;
    const natH   = which === 'back' ? backNatH  : frontNatH;
    const bs     = _baseScale(natW, natH);
    layout.x = x; layout.y = y; layout.scale = scale;
    if (!node) return;
    node.x(x); node.y(y);
    node.scaleX(bs * scale);
    node.scaleY(bs * scale);
    shirtLayer.batchDraw();
  }

  function setRotation(which, deg) {
    const layout = which === 'back' ? backLayout : frontLayout;
    const node   = which === 'back' ? backNode  : frontNode;
    layout.rotation = deg;
    if (!node) return;
    node.rotation(deg);
    shirtLayer.batchDraw();
  }

  function setZOrder(which, zOrder) {
    // Mutually exclusive: setting one 'front' puts the other 'behind'
    if (which === 'back') {
      backLayout.zOrder  = zOrder;
      frontLayout.zOrder = zOrder === 'front' ? 'behind' : 'front';
    } else {
      frontLayout.zOrder = zOrder;
      backLayout.zOrder  = zOrder === 'front' ? 'behind' : 'front';
    }
    _applyZOrder();
    shirtLayer.batchDraw();
    document.dispatchEvent(new CustomEvent('composite-canvas:zorder-changed', {
      detail: { back: backLayout.zOrder, front: frontLayout.zOrder },
    }));
  }

  function resetLayout() {
    backLayout  = _freshBack();
    frontLayout = _freshFront();
    const defB = _defaultPos('back');
    const defF = _defaultPos('front');
    backLayout.x  = defB.x; backLayout.y  = defB.y;
    frontLayout.x = defF.x; frontLayout.y = defF.y;

    if (backNode) {
      const bs = _baseScale(backNatW, backNatH);
      backNode.x(backLayout.x); backNode.y(backLayout.y);
      backNode.scaleX(bs * backLayout.scale); backNode.scaleY(bs * backLayout.scale);
      backNode.rotation(backLayout.rotation);
    }
    if (frontNode) {
      const bs = _baseScale(frontNatW, frontNatH);
      frontNode.x(frontLayout.x); frontNode.y(frontLayout.y);
      frontNode.scaleX(bs * frontLayout.scale); frontNode.scaleY(bs * frontLayout.scale);
      frontNode.rotation(frontLayout.rotation);
    }
    _applyZOrder();
    shirtLayer.batchDraw();
    _fireTransformChanged('back');
    _fireTransformChanged('front');
    document.dispatchEvent(new CustomEvent('composite-canvas:zorder-changed', {
      detail: { back: backLayout.zOrder, front: frontLayout.zOrder },
    }));
  }

  // ── Settings ───────────────────────────────────────────────────────────
  function getSettings() {
    return {
      back:  { ...backLayout  },
      front: { ...frontLayout },
    };
  }

  function applySettings(s) {
    if (!s) return;
    if (s.back) {
      Object.assign(backLayout, s.back);
      if (backNode) {
        const bs = _baseScale(backNatW, backNatH);
        if (backLayout.x) backNode.x(backLayout.x);
        if (backLayout.y) backNode.y(backLayout.y);
        backNode.scaleX(bs * backLayout.scale);
        backNode.scaleY(bs * backLayout.scale);
        backNode.rotation(backLayout.rotation);
      }
    }
    if (s.front) {
      Object.assign(frontLayout, s.front);
      if (frontNode) {
        const bs = _baseScale(frontNatW, frontNatH);
        if (frontLayout.x) frontNode.x(frontLayout.x);
        if (frontLayout.y) frontNode.y(frontLayout.y);
        frontNode.scaleX(bs * frontLayout.scale);
        frontNode.scaleY(bs * frontLayout.scale);
        frontNode.rotation(frontLayout.rotation);
      }
    }
    _applyZOrder();
    if (shirtLayer) shirtLayer.batchDraw();
  }

  function onViewActivate() {
    if (!stage) return;
    const container = document.getElementById(CONTAINER_ID);
    if (!container || container.offsetWidth === 0) return;
    const oldSize = outSize, oldX = outX, oldY = outY;
    stage.width(container.offsetWidth);
    stage.height(container.offsetHeight);
    _recalcOutput();
    _drawBackground();
    if (oldSize > 0) _repositionShirts(oldSize, oldX, oldY);
    shirtLayer.batchDraw();
  }

  function captureArea(pixelRatio) {
    if (!stage) return null;
    bgLayer.draw(); shirtLayer.draw();
    return stage.toDataURL({
      x: outX, y: outY, width: outSize, height: outSize,
      pixelRatio: pixelRatio || 1,
    });
  }

  // Returns layout as fractions of the output square for use in export rendering.
  // xFrac/yFrac = 0 is the left/top edge of the output rect, 1 is right/bottom.
  function getLayoutForExport() {
    const sz = Math.max(outSize, 1);
    return {
      back: {
        xFrac:    backLayout.x  !== null ? (backLayout.x  - outX) / sz : 0.32,
        yFrac:    backLayout.y  !== null ? (backLayout.y  - outY) / sz : 0.32,
        scale:    backLayout.scale,
        rotation: backLayout.rotation,
        zOrder:   backLayout.zOrder,
      },
      front: {
        xFrac:    frontLayout.x !== null ? (frontLayout.x - outX) / sz : 0.65,
        yFrac:    frontLayout.y !== null ? (frontLayout.y - outY) / sz : 0.65,
        scale:    frontLayout.scale,
        rotation: frontLayout.rotation,
        zOrder:   frontLayout.zOrder,
      },
    };
  }

  // ── Resize ─────────────────────────────────────────────────────────────
  function _onResize() {
    if (!stage) return;
    const container = document.getElementById(CONTAINER_ID);
    if (!container || container.offsetWidth === 0) return;
    const oldSize = outSize, oldX = outX, oldY = outY;
    stage.width(container.offsetWidth);
    stage.height(container.offsetHeight);
    _recalcOutput();
    _drawBackground();
    _repositionShirts(oldSize, oldX, oldY);
    shirtLayer.batchDraw();
  }

  function _repositionShirts(oldSize, oldX, oldY) {
    if (oldSize <= 0) return;
    [['back', backNode, backLayout], ['front', frontNode, frontLayout]].forEach(([which, node, layout]) => {
      if (!layout.x) return;
      const relX = (layout.x - oldX) / oldSize;
      const relY = (layout.y - oldY) / oldSize;
      layout.x = outX + relX * outSize;
      layout.y = outY + relY * outSize;
      if (!node) return;
      node.x(layout.x);
      node.y(layout.y);
      // Reapply base scale (output size changed)
      const natW = which === 'back' ? backNatW  : frontNatW;
      const natH = which === 'back' ? backNatH  : frontNatH;
      const bs   = _baseScale(natW, natH);
      node.scaleX(bs * layout.scale);
      node.scaleY(bs * layout.scale);
    });
  }

  // ── Events ─────────────────────────────────────────────────────────────
  function _fireTransformChanged(which) {
    const layout = which === 'back' ? backLayout : frontLayout;
    document.dispatchEvent(new CustomEvent('composite-canvas:transform-changed', {
      detail: {
        shirt:    which,
        x:        layout.x,
        y:        layout.y,
        scale:    layout.scale,
        rotation: layout.rotation,
        outputSize: outSize,
      },
    }));
  }

  return {
    init,
    refresh,
    selectShirt,
    setTransform,
    setRotation,
    setZOrder,
    resetLayout,
    getSettings,
    applySettings,
    onViewActivate,
    captureArea,
    getLayoutForExport,
  };
})();
