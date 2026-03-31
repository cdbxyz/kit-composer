/**
 * editor/KitCanvas.js
 *
 * Number rendering uses digit PNG images (0.png–9.png) when loaded via
 * setDigitImages(). Falls back to custom sceneFunc text if no digit set is
 * loaded. The name always uses font/text rendering.
 *
 * Text nodes are center-anchored: node.x() is always the horizontal center.
 * Digit groups use Konva.Group with offsetX = totalWidth/2 for the same
 * centre-anchor behaviour.
 *
 * Public API:
 *   init()
 *   loadKitImage(url)
 *   loadFont(path, name)
 *   setPreviewPlayer(name, number)
 *   setTransform(which, x, y, scale)
 *   setColor(which, color)
 *   setDigitImages(urlMap)          — { '0': url, ..., '9': url } | {}
 *   setDigitSpacing(px)
 *   getTextPositions()
 *
 * Fires 'kit-canvas:transform-changed' { element, x, y, scale, stageW, stageH }
 */

/* global Konva */

window.KitCanvas = (() => {
  let stage      = null;
  let kitLayer   = null;
  let textLayer  = null;

  let kitImage   = null;
  let nameNode   = null;
  let numberNode = null;   // Konva.Shape (text) or Konva.Group (digit PNGs)

  let imgBounds  = { x: 0, y: 0, w: 0, h: 0 };
  let fontFamily = 'sans-serif';
  let playerName = 'PLAYER';
  let playerNum  = '99';

  let nameTransform   = null;
  let numberTransform = null;

  let nameColor   = '#ffffff';
  let numberColor = '#ffffff';
  let nameCurve   = 0;          // -1…1 arc amount for the name (0 = flat)
  let nameKerning = 0;          // extra px between each character (can be negative)
  let nameStrokeColor = '#000000';
  let nameStrokeWidth = 0;      // px at font size; 0 = no stroke

  // Digit PNG state
  let digitImages      = {};    // { '0': HTMLImageElement, … }
  let digitSpacing     = 4;     // px gap between digits at scale 1
  let usingDigitImages = false;

  const CONTAINER_ID = 'canvas-container';

  function init() {}

  // ── Load kit image ─────────────────────────────────────────────────────
  function loadKitImage(url) {
    document.getElementById('editor-pane').classList.add('has-image');

    requestAnimationFrame(() => {
      _ensureStage();

      Konva.Image.fromURL(url, (img) => {
        kitLayer.destroyChildren();
        kitImage = img;
        _fitImage();
        kitLayer.add(kitImage);
        kitLayer.batchDraw();
        nameTransform   = null;
        numberTransform = null;
        _placeText();
        // Signal app.js that the image + text are placed — used to apply profile settings
        document.dispatchEvent(new CustomEvent('kit-canvas:image-ready'));
      });
    });
  }

  // ── Load font ──────────────────────────────────────────────────────────
  async function loadFont(path, name) {
    if (!path) {
      fontFamily = 'sans-serif';
      _redrawText();
      return;
    }
    const family = name.replace(/\.[^.]+$/, '').replace(/[\s-]+/g, '');
    try {
      const ff = new FontFace(family, `url("file://${path}")`);
      await ff.load();
      document.fonts.add(ff);
      fontFamily = family;
    } catch (err) {
      console.warn('KitCanvas: font load failed, using sans-serif', err);
      fontFamily = 'sans-serif';
    }
    _redrawText();
  }

  // ── Set preview player ─────────────────────────────────────────────────
  function setPreviewPlayer(name, number) {
    playerName = (name   || 'PLAYER').toUpperCase();
    playerNum  = String(number || '99');

    if (!nameNode || !numberNode) return;

    nameTransform   = _readTransform(nameNode);
    numberTransform = _readTransform(numberNode);

    _applyTextToShape(nameNode, playerName, fontFamily);
    _syncOffsetX(nameNode);

    if (usingDigitImages) {
      // Resize the existing node in-place — no destroy/rebuild needed because
      // sceneFunc now reads _computeDigitLayout() at draw-time.
      const { totalW, digitH } = _computeDigitLayout();
      numberNode.width(totalW);
      numberNode.height(digitH);
      _syncOffsetX(numberNode);
    } else {
      _applyTextToShape(numberNode, playerNum, fontFamily);
      _syncOffsetX(numberNode);
    }

    textLayer.batchDraw();
    _fireTransformChanged('name');
    _fireTransformChanged('number');
  }

  // ── Move/scale a node from sliders ─────────────────────────────────────
  function setTransform(which, x, y, scale) {
    const node = which === 'name' ? nameNode : numberNode;
    if (!node) return;
    node.x(x);
    node.y(y);
    node.scaleX(scale);
    node.scaleY(scale);
    if (which === 'name') nameTransform   = { x, y, scale };
    else                  numberTransform = { x, y, scale };
    textLayer.batchDraw();
  }

  function setColor(which, color) {
    if (which === 'name') nameColor   = color;
    else                  numberColor = color;
    const node = which === 'name' ? nameNode : numberNode;
    if (!node) return;
    // Color only applies to text-mode nodes; digit PNGs carry their own colour
    if (which === 'number' && usingDigitImages) return;
    node.setAttr('_color', color);
    textLayer.batchDraw();
  }

  // ── Load digit PNG set ─────────────────────────────────────────────────
  // urlMap: { '0': objectURL, '1': objectURL, … '9': objectURL }
  // Pass an empty object or null to revert to text rendering.
  function setDigitImages(urlMap) {
    if (!urlMap || Object.keys(urlMap).length === 0) {
      digitImages      = {};
      usingDigitImages = false;
      _switchNumberMode();
      return;
    }

    const entries = Object.entries(urlMap);
    let pending = entries.length;
    digitImages  = {};

    entries.forEach(([digit, url]) => {
      const img = new Image();
      img.onload = () => {
        digitImages[digit] = img;
        if (--pending === 0) {
          usingDigitImages = true;
          _switchNumberMode();
        }
      };
      img.onerror = () => { if (--pending === 0) _switchNumberMode(); };
      img.src = url;
    });
  }

  // ── Adjust spacing between digit images ────────────────────────────────
  // ── Set name arc curve ─────────────────────────────────────────────────
  // value: -1 (edges rise) … 0 (flat) … 1 (jersey arch, edges dip)
  function setNameCurve(value) {
    nameCurve = value;
    if (!nameNode) return;
    nameNode.setAttr('_curve', value);
    textLayer.batchDraw();
  }

  // ── Set name stroke (border) ───────────────────────────────────────────
  function setNameStroke(color, width) {
    nameStrokeColor = color  !== undefined ? color : nameStrokeColor;
    nameStrokeWidth = width  !== undefined ? width : nameStrokeWidth;
    if (!nameNode) return;
    nameNode.setAttr('_strokeColor', nameStrokeColor);
    nameNode.setAttr('_strokeWidth', nameStrokeWidth);
    textLayer.batchDraw();
  }

  // ── Set name inter-character kerning ───────────────────────────────────
  function setNameKerning(px) {
    nameKerning = px;
    if (!nameNode) return;
    nameNode.setAttr('_kerning', px);
    // Re-measure width so centre-anchor stays accurate
    const text     = nameNode.getAttr('_text');
    const fontSize = nameNode.getAttr('_fontSize');
    const family   = nameNode.getAttr('_fontFamily');
    nameNode.width(_measureWidth(text, family, fontSize, px));
    _syncOffsetX(nameNode);
    textLayer.batchDraw();
  }

  // Force-render all layers and return the full stage as a data URL.
  // pixelRatio < 1 gives a smaller / faster thumbnail (e.g. 0.4 = 40% resolution).
  function captureStage(pixelRatio) {
    if (!stage || !kitImage) return null;
    kitLayer.draw();
    textLayer.draw();
    return stage.toDataURL({ pixelRatio: pixelRatio || 1 });
  }

  // Capture only the kit image bounds (no surrounding stage border)
  function captureKitArea(pixelRatio) {
    if (!stage || !kitImage) return null;
    kitLayer.draw();
    textLayer.draw();
    return stage.toDataURL({
      x:         imgBounds.x,
      y:         imgBounds.y,
      width:     imgBounds.w,
      height:    imgBounds.h,
      pixelRatio: pixelRatio || 1,
    });
  }

  function setRotation(which, degrees) {
    const node = which === 'name' ? nameNode : numberNode;
    if (!node) return;
    node.rotation(degrees);
    if (which === 'name') { if (nameTransform)   nameTransform.rotation   = degrees; }
    else                  { if (numberTransform) numberTransform.rotation = degrees; }
    textLayer.batchDraw();
  }

  function setSkew(which, skewX, skewY) {
    const node = which === 'name' ? nameNode : numberNode;
    if (!node) return;
    node.skewX(skewX);
    node.skewY(skewY);
    if (which === 'name') { if (nameTransform)   { nameTransform.skewX   = skewX; nameTransform.skewY   = skewY; } }
    else                  { if (numberTransform) { numberTransform.skewX = skewX; numberTransform.skewY = skewY; } }
    textLayer.batchDraw();
  }

  function getSettings() {
    return {
      nameTransform:   nameTransform   ? { ...nameTransform }   : null,
      numberTransform: numberTransform ? { ...numberTransform } : null,
      nameColor,
      numberColor,
      nameCurve,
      nameKerning,
      nameStrokeColor,
      nameStrokeWidth,
      digitSpacing,
    };
  }

  function applySettings(s) {
    if (!s) return;
    if (s.nameColor)   setColor('name',   s.nameColor);
    if (s.numberColor) setColor('number', s.numberColor);
    if (s.nameCurve   !== undefined) setNameCurve(s.nameCurve);
    if (s.nameKerning !== undefined) setNameKerning(s.nameKerning);
    if (s.digitSpacing !== undefined) setDigitSpacing(s.digitSpacing);
    if (s.nameStrokeColor !== undefined || s.nameStrokeWidth !== undefined) {
      setNameStroke(s.nameStrokeColor, s.nameStrokeWidth);
    }
    if (s.nameTransform) {
      const { x, y, scale, rotation, skewX, skewY } = s.nameTransform;
      setTransform('name', x, y, scale);
      setRotation('name', rotation || 0);
      setSkew('name', skewX || 0, skewY || 0);
    }
    if (s.numberTransform) {
      const { x, y, scale, rotation, skewX, skewY } = s.numberTransform;
      setTransform('number', x, y, scale);
      setRotation('number', rotation || 0);
      setSkew('number', skewX || 0, skewY || 0);
    }
  }

  function setDigitSpacing(px) {
    digitSpacing = px;
    if (!usingDigitImages || !numberNode) return;
    const { totalW, digitH } = _computeDigitLayout();
    numberNode.width(totalW);
    numberNode.height(digitH);
    _syncOffsetX(numberNode);
    textLayer.batchDraw();
    _fireTransformChanged('number');
  }

  function getStageSize() {
    return stage ? { width: stage.width(), height: stage.height() } : null;
  }

  function getTextPositions() {
    if (!nameNode || !numberNode) return null;
    return {
      name:   { x: nameNode.x(),   y: nameNode.y()   },
      number: { x: numberNode.x(), y: numberNode.y() },
    };
  }

  // ── Private ────────────────────────────────────────────────────────────

  // Rebuild the number node after digit-mode switch, preserving any stored transform
  function _switchNumberMode() {
    if (!nameNode) return;   // canvas not initialised yet
    numberTransform = numberNode ? _readTransform(numberNode) : null;
    _rebuildNumberNode();
    _applyStoredNumberTransform();
    textLayer.batchDraw();
    _fireTransformChanged('number');
  }

  // Destroy old numberNode and create the appropriate replacement
  function _rebuildNumberNode() {
    if (numberNode) numberNode.destroy();

    if (usingDigitImages) {
      numberNode = _buildNumberShape();
    } else {
      const fontSize = Math.max(20, Math.round(imgBounds.h * 0.18));
      numberNode = _makeTextShape(playerNum, fontFamily, fontSize, true);
      numberNode.setAttr('_color', numberColor);
    }

    _syncOffsetX(numberNode);
    textLayer.add(numberNode);
    _attachDragEvents(numberNode, 'number');
  }

  function _applyStoredNumberTransform() {
    if (!numberNode || !numberTransform) return;
    numberNode.x(numberTransform.x);
    numberNode.y(numberTransform.y);
    numberNode.scaleX(numberTransform.scale);
    numberNode.scaleY(numberTransform.scale);
    numberNode.rotation(numberTransform.rotation || 0);
    numberNode.skewX(numberTransform.skewX || 0);
    numberNode.skewY(numberTransform.skewY || 0);
  }

  // Compute digit layout from current state (playerNum, digitImages, digitSpacing)
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

  // Build a Konva.Shape that renders digit images.
  // sceneFunc recomputes the layout at draw-time so the same node can be
  // reused across player changes — no destroy/rebuild needed.
  function _buildNumberShape() {
    const { totalW, digitH } = _computeDigitLayout();

    const shape = new Konva.Shape({
      width:    totalW,
      height:   digitH,
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

  // Measure text width using an offscreen canvas, honouring inter-character kerning
  function _measureWidth(text, fontFamily, fontSize, kerning = 0) {
    const offscreen = document.createElement('canvas');
    const ctx = offscreen.getContext('2d');
    ctx.font = `bold ${fontSize}px "${fontFamily}"`;
    const chars = [...text];
    const charW = chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0);
    return charW + kerning * Math.max(0, chars.length - 1);
  }

  // ── Shared name-text renderer ─────────────────────────────────────────
  // Two-pass render: stroke pass first (all chars), then fill pass on top.
  // This ensures no character's fill is obscured by a neighbour's stroke.
  function _renderNameText(ctx, text, size, family, color, curve, kerning, strokeColor, strokeWidth) {
    ctx.save();
    ctx.font         = `bold ${size}px "${family}"`;
    ctx.textBaseline = 'top';

    const hasStroke  = strokeWidth > 0;
    const flat       = Math.abs(curve)   < 0.001;
    const noKern     = Math.abs(kerning) < 0.001;

    // Pre-compute character positions
    const chars      = [...text];
    const charWidths = chars.map(c => ctx.measureText(c).width);
    const totalW     = charWidths.reduce((a, b) => a + b, 0)
                     + kerning * Math.max(0, chars.length - 1);

    // Build transform for each character: { tx, ty, angle }
    const transforms = [];
    if (flat) {
      let x = 0;
      chars.forEach((c, i) => {
        transforms.push({ tx: x, ty: 0, angle: 0, cw: charWidths[i] });
        x += charWidths[i] + kerning;
      });
    } else {
      const totalArcAngle = curve * (Math.PI * 2 / 3);
      const radius = totalW / Math.abs(totalArcAngle);
      const sign   = curve > 0 ? 1 : -1;
      let flatX = 0;
      chars.forEach((c, i) => {
        const cw     = charWidths[i];
        const offset = (flatX + cw / 2) - totalW / 2;
        const theta  = offset / radius;
        transforms.push({
          tx:    totalW / 2 + radius * Math.sin(theta),
          ty:    sign * radius * (1 - Math.cos(theta)),
          angle: sign * theta,
          cw,
        });
        flatX += cw + kerning;
      });
    }

    // Helper: draw one pass (stroke or fill) over all chars
    function _drawPass(pass) {
      chars.forEach((c, i) => {
        const { tx, ty, angle, cw } = transforms[i];
        ctx.save();
        ctx.translate(tx, ty);
        if (angle) ctx.rotate(angle);
        // For flat text the x-origin is already the left edge;
        // for arced text we centred each char, so offset by -cw/2
        const xOff = flat ? 0 : -cw / 2;
        if (pass === 'stroke') ctx.strokeText(c, xOff, 0);
        else                   ctx.fillText(c, xOff, 0);
        ctx.restore();
      });
    }

    // For flat+no-kern single-pass fast path (no stroke)
    if (!hasStroke && flat && noKern) {
      ctx.fillStyle = color;
      ctx.fillText(text, 0, 0);
      ctx.restore();
      return;
    }

    if (hasStroke) {
      ctx.strokeStyle  = strokeColor || '#000000';
      ctx.lineWidth    = strokeWidth * 2; // lineWidth paints half inside, half outside
      ctx.lineJoin     = 'round';
      ctx.miterLimit   = 2;
      _drawPass('stroke');
    }

    ctx.fillStyle = color;
    _drawPass('fill');

    ctx.restore();
  }

  // Create a Konva.Shape supporting curve and kerning.
  function _makeTextShape(text, fontFamily, fontSize, draggable, curve = 0, kerning = 0) {
    const w = _measureWidth(text, fontFamily, fontSize, kerning);

    const shape = new Konva.Shape({
      width:    w,
      height:   fontSize * 2.5,
      draggable,
      sceneFunc(ctx) {
        const raw   = ctx._context;
        const _text   = shape.getAttr('_text');
        const _size   = shape.getAttr('_fontSize');
        const _fam    = shape.getAttr('_fontFamily');
        const _col    = shape.getAttr('_color');
        const _curve  = shape.getAttr('_curve')        || 0;
        const _kern   = shape.getAttr('_kerning')      || 0;
        const _sColor = shape.getAttr('_strokeColor')  || '#000000';
        const _sWidth = shape.getAttr('_strokeWidth')  || 0;
        _renderNameText(raw, _text, _size, _fam, _col, _curve, _kern, _sColor, _sWidth);
      },
      hitFunc(ctx, shape) {
        ctx.beginPath();
        ctx.rect(0, 0, shape.width(), shape.height());
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      },
    });

    shape.setAttr('_text',       text);
    shape.setAttr('_fontFamily', fontFamily);
    shape.setAttr('_fontSize',   fontSize);
    shape.setAttr('_color',      '#ffffff');
    shape.setAttr('_curve',      curve);
    shape.setAttr('_kerning',    kerning);

    return shape;
  }

  function _applyTextToShape(shape, text, fontFamily) {
    const fontSize = shape.getAttr('_fontSize');
    const kerning  = shape.getAttr('_kerning') || 0;
    shape.setAttr('_text',       text);
    shape.setAttr('_fontFamily', fontFamily);
    shape.width(_measureWidth(text, fontFamily, fontSize, kerning));
  }

  // Set offsetX = half width so node.x() is always the horizontal centre.
  function _syncOffsetX(node) {
    node.offsetX(node.width() / 2);
  }

  function _readTransform(node) {
    return { x: node.x(), y: node.y(), scale: node.scaleX(), rotation: node.rotation(), skewX: node.skewX(), skewY: node.skewY() };
  }

  function _ensureStage() {
    const measure = document.getElementById('canvas-area');
    const w = measure.offsetWidth;
    const h = measure.offsetHeight;

    if (!stage) {
      stage = new Konva.Stage({ container: CONTAINER_ID, width: w, height: h });
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
    const sw = stage.width();
    const sh = stage.height();
    const src = kitImage.image();
    const iw = src.naturalWidth  || src.width;
    const ih = src.naturalHeight || src.height;

    const scale = Math.min(sw / iw, sh / ih);
    const w = iw * scale;
    const h = ih * scale;
    const x = (sw - w) / 2;
    const y = (sh - h) / 2;

    kitImage.setAttrs({ x, y, width: w, height: h });
    imgBounds = { x, y, w, h };
  }

  function _placeText() {
    textLayer.destroyChildren();
    nameNode   = null;
    numberNode = null;

    const { x, y, w, h } = imgBounds;
    const nameFontSize = Math.max(12, Math.round(h * 0.08));

    nameNode = _makeTextShape(playerName, fontFamily, nameFontSize, true, nameCurve, nameKerning);
    nameNode.setAttr('_color',       nameColor);
    nameNode.setAttr('_strokeColor', nameStrokeColor);
    nameNode.setAttr('_strokeWidth', nameStrokeWidth);
    textLayer.add(nameNode);

    _rebuildNumberNode();

    // Apply stored or default transforms — name
    if (nameTransform) {
      nameNode.x(nameTransform.x);
      nameNode.y(nameTransform.y);
      nameNode.scaleX(nameTransform.scale);
      nameNode.scaleY(nameTransform.scale);
      nameNode.rotation(nameTransform.rotation || 0);
      nameNode.skewX(nameTransform.skewX || 0);
      nameNode.skewY(nameTransform.skewY || 0);
    } else {
      nameNode.x(x + w / 2);
      nameNode.y(y + h * 0.12);
      nameNode.scaleX(1);
      nameNode.scaleY(1);
      nameNode.rotation(0);
    }
    _syncOffsetX(nameNode);

    // Apply stored or default transforms — number
    if (numberTransform) {
      numberNode.x(numberTransform.x);
      numberNode.y(numberTransform.y);
      numberNode.scaleX(numberTransform.scale);
      numberNode.scaleY(numberTransform.scale);
      numberNode.rotation(numberTransform.rotation || 0);
    } else {
      numberNode.x(x + w / 2);
      numberNode.y(y + h * 0.21);
      numberNode.scaleX(1.63);
      numberNode.scaleY(1.63);
      numberNode.rotation(0);
    }
    _syncOffsetX(numberNode);

    _attachDragEvents(nameNode,   'name');
    // _rebuildNumberNode already called _attachDragEvents for numberNode

    textLayer.batchDraw();
    _fireTransformChanged('name');
    _fireTransformChanged('number');
  }

  function _redrawText() {
    if (!nameNode || !numberNode) return;

    nameTransform   = _readTransform(nameNode);
    numberTransform = _readTransform(numberNode);

    _applyTextToShape(nameNode, playerName, fontFamily);
    nameNode.setAttr('_strokeColor', nameStrokeColor);
    nameNode.setAttr('_strokeWidth', nameStrokeWidth);
    _syncOffsetX(nameNode);

    if (!usingDigitImages) {
      _applyTextToShape(numberNode, playerNum, fontFamily);
      _syncOffsetX(numberNode);
    }

    textLayer.batchDraw();
    _fireTransformChanged('name');
    _fireTransformChanged('number');
  }

  function _attachDragEvents(node, elName) {
    node.on('mouseenter', () => { stage.container().style.cursor = 'grab'; });
    node.on('mousedown',  () => { stage.container().style.cursor = 'grabbing'; });
    node.on('mouseleave', () => { stage.container().style.cursor = 'default'; });

    node.on('dragmove', () => {
      const t = _readTransform(node);
      if (elName === 'name') nameTransform   = t;
      else                   numberTransform = t;
      _fireTransformChanged(elName);
    });

    node.on('dragend mouseup', () => {
      stage.container().style.cursor = 'grab';
      _fireTransformChanged(elName);
    });
  }

  function _fireTransformChanged(elName) {
    const node = elName === 'name' ? nameNode : numberNode;
    if (!node || !stage) return;
    document.dispatchEvent(new CustomEvent('kit-canvas:transform-changed', {
      detail: {
        element:  elName,
        x:        node.x(),
        y:        node.y(),
        scale:    node.scaleX(),
        rotation: node.rotation(),
        skewX:    node.skewX(),
        skewY:    node.skewY(),
        stageW:   stage.width(),
        stageH:   stage.height(),
      },
    }));
  }

  function _onResize() {
    if (!stage) return;
    const measure = document.getElementById('canvas-area');
    stage.width(measure.offsetWidth);
    stage.height(measure.offsetHeight);

    const oldBounds = { ...imgBounds };
    _fitImage();
    kitLayer.batchDraw();

    if (nameNode && oldBounds.w > 0) {
      [
        { node: nameNode,   elName: 'name'   },
        { node: numberNode, elName: 'number' },
      ].forEach(({ node, elName }) => {
        if (!node) return;
        const relX = (node.x() - oldBounds.x) / oldBounds.w;
        const relY = (node.y() - oldBounds.y) / oldBounds.h;
        const scaleRatio = imgBounds.w / oldBounds.w;
        node.x(imgBounds.x + relX * imgBounds.w);
        node.y(imgBounds.y + relY * imgBounds.h);
        node.scaleX(node.scaleX() * scaleRatio);
        node.scaleY(node.scaleY() * scaleRatio);
        if (elName === 'name') nameTransform   = _readTransform(node);
        else                   numberTransform = _readTransform(node);
      });
      textLayer.batchDraw();
      _fireTransformChanged('name');
      _fireTransformChanged('number');
    }
  }

  return {
    init,
    loadKitImage,
    loadFont,
    setPreviewPlayer,
    setTransform,
    setColor,
    setNameCurve,
    setNameKerning,
    setNameStroke,
    setRotation,
    setSkew,
    captureStage,
    captureKitArea,
    getStageSize,
    setDigitImages,
    setDigitSpacing,
    getTextPositions,
    getSettings,
    applySettings,
  };
})();
