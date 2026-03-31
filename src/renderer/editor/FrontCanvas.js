/**
 * editor/FrontCanvas.js — Front shirt canvas
 *
 * Manages a separate Konva stage for the Front view.
 * Renders the front shirt image + a draggable digit-group number.
 * Uses the same digit PNG set as KitCanvas (set via setDigitImages).
 *
 * Public API (window.FrontCanvas):
 *   init()
 *   loadFrontImage(url)
 *   setPreviewPlayer(name, number)
 *   setDigitImages(urlMap)
 *   setTransform(x, y, scale)
 *   setRotation(degrees)
 *   setColor(color)
 *   setDigitSpacing(px)
 *   setNumberVisible(bool)
 *   captureArea(pixelRatio)          → dataURL
 *   getSettings()                    → { x, y, scale, rotation, spacing, color }
 *   applySettings(s)
 *   getStageSize()
 *   onViewActivate()                 — call when switching to Front view
 *
 * Fires 'front-canvas:transform-changed' { x, y, scale, rotation, stageW, stageH }
 * Fires 'front-canvas:image-ready'
 */

/* global Konva */

window.FrontCanvas = (() => {
  let stage      = null;
  let kitLayer   = null;
  let textLayer  = null;

  let kitImage   = null;
  let numberNode = null;

  let imgBounds     = { x: 0, y: 0, w: 0, h: 0 };
  let playerNum     = '99';
  let numberColor   = '#ffffff';
  let numberTransform = null;   // { x, y, scale, rotation }
  let _numberVisible  = true;

  let digitImages      = {};
  let digitSpacing     = 4;
  let usingDigitImages = false;

  const CONTAINER_ID = 'front-canvas-container';

  function init() {}

  // ── Load front image ───────────────────────────────────────────────────
  function loadFrontImage(url) {
    document.getElementById('editor-pane').classList.add('has-front-image');
    requestAnimationFrame(() => {
      _ensureStage();
      Konva.Image.fromURL(url, (img) => {
        kitLayer.destroyChildren();
        kitImage = img;
        _fitImage();
        kitLayer.add(kitImage);
        kitLayer.batchDraw();
        numberTransform = null;
        _placeNumber();
        document.dispatchEvent(new CustomEvent('front-canvas:image-ready'));
      });
    });
  }

  // ── Preview player ─────────────────────────────────────────────────────
  function setPreviewPlayer(name, number) {
    playerNum = String(number || '99');
    if (!numberNode) return;
    numberTransform = _readTransform(numberNode);
    if (usingDigitImages) {
      // Resize in-place — sceneFunc recomputes layout at draw-time.
      const { totalW, digitH } = _computeDigitLayout();
      numberNode.width(Math.max(totalW, 1));
      numberNode.height(digitH);
      _syncOffsetX(numberNode);
    }
    textLayer.batchDraw();
    _fireTransformChanged();
  }

  // ── Digit images ───────────────────────────────────────────────────────
  function setDigitImages(urlMap) {
    if (!urlMap || Object.keys(urlMap).length === 0) {
      digitImages      = {};
      usingDigitImages = false;
      if (numberNode) _rebuildNumber();
      return;
    }
    const entries = Object.entries(urlMap);
    let pending   = entries.length;
    digitImages   = {};
    entries.forEach(([digit, url]) => {
      const img = new Image();
      img.onload = () => {
        digitImages[digit] = img;
        if (--pending === 0) { usingDigitImages = true; if (numberNode) _rebuildNumber(); }
      };
      img.onerror = () => { if (--pending === 0) { if (numberNode) _rebuildNumber(); } };
      img.src = url;
    });
  }

  // ── Transform / style ─────────────────────────────────────────────────
  function setTransform(x, y, scale) {
    if (!numberNode) return;
    numberNode.x(x);
    numberNode.y(y);
    numberNode.scaleX(scale);
    numberNode.scaleY(scale);
    if (!numberTransform) numberTransform = { x, y, scale, rotation: 0 };
    else { numberTransform.x = x; numberTransform.y = y; numberTransform.scale = scale; }
    textLayer.batchDraw();
  }

  function setRotation(degrees) {
    if (!numberNode) return;
    numberNode.rotation(degrees);
    if (numberTransform) numberTransform.rotation = degrees;
    textLayer.batchDraw();
  }

  function setSkew(skewX, skewY) {
    if (!numberNode) return;
    numberNode.skewX(skewX);
    numberNode.skewY(skewY);
    if (numberTransform) { numberTransform.skewX = skewX; numberTransform.skewY = skewY; }
    textLayer.batchDraw();
  }

  function setColor(color) {
    numberColor = color;
    if (numberNode && !usingDigitImages) {
      numberNode.setAttr('_color', color);
      textLayer.batchDraw();
    }
  }

  function setDigitSpacing(px) {
    digitSpacing = px;
    if (!usingDigitImages || !numberNode) return;
    const { totalW, digitH } = _computeDigitLayout();
    numberNode.width(Math.max(totalW, 1));
    numberNode.height(digitH);
    _syncOffsetX(numberNode);
    textLayer.batchDraw();
    _fireTransformChanged();
  }

  function setNumberVisible(visible) {
    _numberVisible = visible;
    if (numberNode) {
      numberNode.visible(visible);
      textLayer && textLayer.batchDraw();
    }
  }

  // ── Capture ────────────────────────────────────────────────────────────
  function captureArea(pixelRatio) {
    if (!stage || !kitImage) return null;
    kitLayer.draw();
    textLayer.draw();
    return stage.toDataURL({
      x: imgBounds.x, y: imgBounds.y,
      width: imgBounds.w, height: imgBounds.h,
      pixelRatio: pixelRatio || 1,
    });
  }

  // ── Settings ───────────────────────────────────────────────────────────
  function getSettings() {
    return {
      x:        numberTransform ? numberTransform.x                : null,
      y:        numberTransform ? numberTransform.y                : null,
      scale:    numberTransform ? numberTransform.scale            : null,
      rotation: numberTransform ? (numberTransform.rotation || 0) : 0,
      skewX:    numberTransform ? (numberTransform.skewX    || 0) : 0,
      skewY:    numberTransform ? (numberTransform.skewY    || 0) : 0,
      spacing:  digitSpacing,
      color:    numberColor,
    };
  }

  function applySettings(s) {
    if (!s) return;
    if (s.color   !== undefined) setColor(s.color);
    if (s.spacing !== undefined) setDigitSpacing(s.spacing);
    if (s.x !== null && s.x !== undefined && s.y !== null && s.scale !== null) {
      setTransform(s.x, s.y, s.scale);
    }
    if (s.rotation !== undefined) setRotation(s.rotation || 0);
    if (s.skewX !== undefined || s.skewY !== undefined) setSkew(s.skewX || 0, s.skewY || 0);
  }

  function getStageSize() {
    return stage ? { width: stage.width(), height: stage.height() } : null;
  }

  // Re-sync stage size when user switches to this view (container was hidden)
  function onViewActivate() {
    if (!stage) return;
    const container = document.getElementById(CONTAINER_ID);
    if (!container || container.offsetWidth === 0) return;
    stage.width(container.offsetWidth);
    stage.height(container.offsetHeight);
    if (kitImage) _fitImage();
    kitLayer.batchDraw();
    if (numberNode) { textLayer.batchDraw(); _fireTransformChanged(); }
  }

  // ── Private ────────────────────────────────────────────────────────────

  function _computeDigitLayout() {
    const digitH = Math.max(20, Math.round(imgBounds.h * 0.18));
    const chars  = playerNum.split('').filter(c => digitImages[c]);
    const widths = chars.map(c => {
      const img = digitImages[c];
      return (img.naturalWidth > 0 && img.naturalHeight > 0)
        ? Math.round((img.naturalWidth / img.naturalHeight) * digitH)
        : digitH;
    });
    const totalW = widths.reduce((a, b) => a + b, 0)
                 + digitSpacing * Math.max(0, chars.length - 1);
    return { chars, widths, digitH, totalW };
  }

  function _buildNumberShape() {
    const { totalW, digitH } = _computeDigitLayout();
    const shape = new Konva.Shape({
      width:     Math.max(totalW, 1),
      height:    digitH,
      draggable: true,
      sceneFunc(ctx) {
        const raw = ctx._context;
        const { chars, widths, digitH: dh } = _computeDigitLayout();
        let xOff = 0;
        chars.forEach((c, i) => {
          if (digitImages[c]) raw.drawImage(digitImages[c], xOff, 0, widths[i], dh);
          xOff += widths[i] + digitSpacing;
        });
      },
      hitFunc(ctx, shape) {
        ctx.beginPath();
        ctx.rect(0, 0, shape.width(), shape.height());
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      },
    });
    return shape;
  }

  function _buildTextShape() {
    const fontSize = Math.max(20, Math.round(imgBounds.h * 0.18));
    const w        = _measureTextWidth(playerNum, fontSize);
    const shape    = new Konva.Shape({
      width:     Math.max(w, 1),
      height:    fontSize * 1.5,
      draggable: true,
      sceneFunc(ctx) {
        const raw = ctx._context;
        const col = shape.getAttr('_color') || '#ffffff';
        raw.font         = `bold ${fontSize}px sans-serif`;
        raw.fillStyle    = col;
        raw.textBaseline = 'top';
        raw.fillText(playerNum, 0, 0);
      },
      hitFunc(ctx, shape) {
        ctx.beginPath();
        ctx.rect(0, 0, shape.width(), shape.height());
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      },
    });
    shape.setAttr('_color', numberColor);
    return shape;
  }

  function _measureTextWidth(text, fontSize) {
    const off = document.createElement('canvas');
    const ctx = off.getContext('2d');
    ctx.font  = `bold ${fontSize}px sans-serif`;
    return Math.ceil(ctx.measureText(text).width) || 1;
  }

  function _rebuildNumber() {
    if (!textLayer) return;
    numberTransform = numberNode ? _readTransform(numberNode) : null;
    if (numberNode) { numberNode.destroy(); numberNode = null; }
    numberNode = usingDigitImages ? _buildNumberShape() : _buildTextShape();
    _syncOffsetX(numberNode);
    numberNode.visible(_numberVisible);
    textLayer.add(numberNode);
    _attachDragEvents(numberNode);
    if (numberTransform) _applyStoredTransform();
    textLayer.batchDraw();
    _fireTransformChanged();
  }

  function _placeNumber() {
    textLayer.destroyChildren();
    numberNode = null;

    numberNode = usingDigitImages ? _buildNumberShape() : _buildTextShape();

    const { x, y, w, h } = imgBounds;

    if (numberTransform) {
      _applyStoredTransform();
    } else {
      numberNode.x(x + w / 2);
      numberNode.y(y + h * 0.42);
      numberNode.scaleX(1.5);
      numberNode.scaleY(1.5);
      numberNode.rotation(0);
    }

    _syncOffsetX(numberNode);
    numberNode.visible(_numberVisible);
    textLayer.add(numberNode);
    _attachDragEvents(numberNode);
    textLayer.batchDraw();
    _fireTransformChanged();
  }

  function _applyStoredTransform() {
    if (!numberNode || !numberTransform) return;
    numberNode.x(numberTransform.x);
    numberNode.y(numberTransform.y);
    numberNode.scaleX(numberTransform.scale);
    numberNode.scaleY(numberTransform.scale);
    numberNode.rotation(numberTransform.rotation || 0);
    numberNode.skewX(numberTransform.skewX || 0);
    numberNode.skewY(numberTransform.skewY || 0);
  }

  function _syncOffsetX(node) { node.offsetX(node.width() / 2); }

  function _readTransform(node) {
    return { x: node.x(), y: node.y(), scale: node.scaleX(), rotation: node.rotation(), skewX: node.skewX(), skewY: node.skewY() };
  }

  function _ensureStage() {
    const container = document.getElementById(CONTAINER_ID);
    const w = container.offsetWidth  || 600;
    const h = container.offsetHeight || 500;
    if (!stage) {
      stage     = new Konva.Stage({ container: CONTAINER_ID, width: w, height: h });
      kitLayer  = new Konva.Layer();
      textLayer = new Konva.Layer();
      stage.add(kitLayer);
      stage.add(textLayer);
      window.addEventListener('resize', _onResize);
    } else {
      stage.width(w);
      stage.height(h);
    }
  }

  function _fitImage() {
    const sw  = stage.width();
    const sh  = stage.height();
    const src = kitImage.image();
    const iw  = src.naturalWidth  || src.width;
    const ih  = src.naturalHeight || src.height;
    const sc  = Math.min(sw / iw, sh / ih);
    const w   = iw * sc;
    const h   = ih * sc;
    const x   = (sw - w) / 2;
    const y   = (sh - h) / 2;
    kitImage.setAttrs({ x, y, width: w, height: h });
    imgBounds = { x, y, w, h };
  }

  function _attachDragEvents(node) {
    node.on('mouseenter', () => { if (stage) stage.container().style.cursor = 'grab'; });
    node.on('mousedown',  () => { if (stage) stage.container().style.cursor = 'grabbing'; });
    node.on('mouseleave', () => { if (stage) stage.container().style.cursor = 'default'; });
    node.on('dragmove',   () => { numberTransform = _readTransform(node); _fireTransformChanged(); });
    node.on('dragend mouseup', () => {
      if (stage) stage.container().style.cursor = 'grab';
      _fireTransformChanged();
    });
  }

  function _fireTransformChanged() {
    if (!numberNode || !stage) return;
    document.dispatchEvent(new CustomEvent('front-canvas:transform-changed', {
      detail: {
        x:        numberNode.x(),
        y:        numberNode.y(),
        scale:    numberNode.scaleX(),
        rotation: numberNode.rotation(),
        skewX:    numberNode.skewX(),
        skewY:    numberNode.skewY(),
        stageW:   stage.width(),
        stageH:   stage.height(),
      },
    }));
  }

  function _onResize() {
    if (!stage) return;
    const container = document.getElementById(CONTAINER_ID);
    if (!container || container.offsetWidth === 0) return;
    const oldBounds = { ...imgBounds };
    stage.width(container.offsetWidth);
    stage.height(container.offsetHeight);
    if (kitImage) {
      _fitImage();
      kitLayer.batchDraw();
      if (numberNode && oldBounds.w > 0) {
        const relX       = (numberNode.x() - oldBounds.x) / oldBounds.w;
        const relY       = (numberNode.y() - oldBounds.y) / oldBounds.h;
        const scaleRatio = imgBounds.w / oldBounds.w;
        numberNode.x(imgBounds.x + relX * imgBounds.w);
        numberNode.y(imgBounds.y + relY * imgBounds.h);
        numberNode.scaleX(numberNode.scaleX() * scaleRatio);
        numberNode.scaleY(numberNode.scaleY() * scaleRatio);
        numberTransform = _readTransform(numberNode);
        textLayer.batchDraw();
        _fireTransformChanged();
      }
    }
  }

  return {
    init,
    loadFrontImage,
    setPreviewPlayer,
    setDigitImages,
    setTransform,
    setRotation,
    setSkew,
    setColor,
    setDigitSpacing,
    setNumberVisible,
    captureArea,
    getSettings,
    applySettings,
    getStageSize,
    onViewActivate,
  };
})();
