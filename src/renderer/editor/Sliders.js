/**
 * editor/Sliders.js — Controls bar: two independent rows (Name, Number)
 *
 * Each row has X, Y, Scale sliders that independently control that element.
 * Dragging on the canvas fires 'kit-canvas:transform-changed' which syncs
 * the relevant row without triggering a canvas update loop.
 */

window.Sliders = (() => {
  // Per-element slider state
  const _rows = {
    name:   { sliderX: null, sliderY: null, sliderScale: null, valX: null, valY: null, valScale: null, colorInput: null, hexInput: null, sliderCurve: null, valCurve: null, sliderKerning: null, valKerning: null, sliderRotate: null, valRotate: null, strokeColorInput: null, strokeHexInput: null, sliderStrokeWidth: null, valStrokeWidth: null, sliderSkewX: null, valSkewX: null, sliderSkewY: null, valSkewY: null },
    number: { sliderX: null, sliderY: null, sliderScale: null, valX: null, valY: null, valScale: null, colorInput: null, hexInput: null, sliderSpacing: null, valSpacing: null, sliderRotate: null, valRotate: null, sliderSkewX: null, valSkewX: null, sliderSkewY: null, valSkewY: null },
  };

  let _showFrontNumber = true;
  let _toggleFrontNumber = null;

  // Expand 3-char hex to 6-char; return null if invalid
  function _normaliseHex(raw) {
    const s = raw.trim().replace(/^#?/, '#');
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      const [, r, g, b] = s;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return null;
  }

  let _syncing = false;

  function init(containerEl) {
    containerEl.innerHTML = `
      <div class="ctrl-group">
        <span class="ctrl-group-label">Name</span>
        <div class="ctrl-sliders">
          <div class="ctrl-row">
            <span class="ctrl-label">X</span>
            <input class="ctrl-slider" id="name-slider-x" type="range" min="0" max="1000" step="1" value="0">
            <span class="ctrl-val" id="name-val-x">0px</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Y</span>
            <input class="ctrl-slider" id="name-slider-y" type="range" min="0" max="1000" step="1" value="0">
            <span class="ctrl-val" id="name-val-y">0px</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Scale</span>
            <input class="ctrl-slider" id="name-slider-scale" type="range" min="0.2" max="3" step="0.01" value="1">
            <span class="ctrl-val" id="name-val-scale">1.00×</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Color</span>
            <input class="ctrl-color" id="name-color" type="color" value="#ffffff">
            <input class="ctrl-hex" id="name-hex" type="text" maxlength="7" value="#ffffff" spellcheck="false">
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Curve</span>
            <input class="ctrl-slider" id="name-slider-curve" type="range" min="-1" max="1" step="0.01" value="0">
            <span class="ctrl-val" id="name-val-curve">0.00</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Kerning</span>
            <input class="ctrl-slider" id="name-slider-kerning" type="range" min="-20" max="60" step="1" value="0">
            <span class="ctrl-val" id="name-val-kerning">0px</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Rotate</span>
            <input class="ctrl-slider" id="name-slider-rotate" type="range" min="-180" max="180" step="0.5" value="0">
            <span class="ctrl-val" id="name-val-rotate">0°</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Skew X</span>
            <input class="ctrl-slider" id="name-slider-skewx" type="range" min="-0.5" max="0.5" step="0.01" value="0">
            <span class="ctrl-val" id="name-val-skewx">0.00</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Skew Y</span>
            <input class="ctrl-slider" id="name-slider-skewy" type="range" min="-0.5" max="0.5" step="0.01" value="0">
            <span class="ctrl-val" id="name-val-skewy">0.00</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Border</span>
            <input class="ctrl-color" id="name-stroke-color" type="color" value="#000000">
            <input class="ctrl-hex" id="name-stroke-hex" type="text" maxlength="7" value="#000000" spellcheck="false">
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Width</span>
            <input class="ctrl-slider" id="name-slider-stroke-width" type="range" min="0" max="20" step="0.5" value="0">
            <span class="ctrl-val" id="name-val-stroke-width">0px</span>
          </div>
        </div>
      </div>
      <div class="ctrl-divider"></div>
      <div class="ctrl-group">
        <span class="ctrl-group-label">Number</span>
        <div class="ctrl-sliders">
          <div class="ctrl-row">
            <span class="ctrl-label">X</span>
            <input class="ctrl-slider" id="number-slider-x" type="range" min="0" max="1000" step="1" value="0">
            <span class="ctrl-val" id="number-val-x">0px</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Y</span>
            <input class="ctrl-slider" id="number-slider-y" type="range" min="0" max="1000" step="1" value="0">
            <span class="ctrl-val" id="number-val-y">0px</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Scale</span>
            <input class="ctrl-slider" id="number-slider-scale" type="range" min="0.2" max="3" step="0.01" value="1">
            <span class="ctrl-val" id="number-val-scale">1.00×</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Color</span>
            <input class="ctrl-color" id="number-color" type="color" value="#ffffff">
            <input class="ctrl-hex" id="number-hex" type="text" maxlength="7" value="#ffffff" spellcheck="false">
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Spacing</span>
            <input class="ctrl-slider" id="number-slider-spacing" type="range" min="-20" max="80" step="1" value="4">
            <span class="ctrl-val" id="number-val-spacing">4px</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Rotate</span>
            <input class="ctrl-slider" id="number-slider-rotate" type="range" min="-180" max="180" step="0.5" value="0">
            <span class="ctrl-val" id="number-val-rotate">0°</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Skew X</span>
            <input class="ctrl-slider" id="number-slider-skewx" type="range" min="-0.5" max="0.5" step="0.01" value="0">
            <span class="ctrl-val" id="number-val-skewx">0.00</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Skew Y</span>
            <input class="ctrl-slider" id="number-slider-skewy" type="range" min="-0.5" max="0.5" step="0.01" value="0">
            <span class="ctrl-val" id="number-val-skewy">0.00</span>
          </div>
        </div>
      </div>
      <div class="ctrl-divider"></div>
      <div class="ctrl-group ctrl-group--settings">
        <span class="ctrl-group-label">Settings</span>
        <div class="ctrl-sliders">
          <div class="ctrl-row">
            <span class="ctrl-label">Front Number</span>
            <label class="ctrl-toggle">
              <input type="checkbox" id="toggle-front-number" checked>
              <span class="ctrl-toggle-track"><span class="ctrl-toggle-thumb"></span></span>
            </label>
          </div>
        </div>
      </div>
      <div class="ctrl-divider"></div>
      <div class="ctrl-group ctrl-group--settings">
        <span class="ctrl-group-label">Grid</span>
        <div class="ctrl-sliders">
          <div class="ctrl-row">
            <span class="ctrl-label">Show Grid</span>
            <label class="ctrl-toggle">
              <input type="checkbox" id="back-grid-toggle">
              <span class="ctrl-toggle-track"><span class="ctrl-toggle-thumb"></span></span>
            </label>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Spacing</span>
            <input class="ctrl-slider" id="back-grid-spacing" type="range" min="10" max="200" step="5" value="50">
            <span class="ctrl-val" id="back-grid-val">50px</span>
          </div>
        </div>
      </div>`;

    ['name', 'number'].forEach(el => {
      const r = _rows[el];
      r.sliderX     = containerEl.querySelector(`#${el}-slider-x`);
      r.sliderY     = containerEl.querySelector(`#${el}-slider-y`);
      r.sliderScale = containerEl.querySelector(`#${el}-slider-scale`);
      r.valX        = containerEl.querySelector(`#${el}-val-x`);
      r.valY        = containerEl.querySelector(`#${el}-val-y`);
      r.valScale    = containerEl.querySelector(`#${el}-val-scale`);
      r.colorInput  = containerEl.querySelector(`#${el}-color`);
      r.hexInput    = containerEl.querySelector(`#${el}-hex`);
      r.sliderRotate = containerEl.querySelector(`#${el}-slider-rotate`);
      r.valRotate    = containerEl.querySelector(`#${el}-val-rotate`);
      r.sliderSkewX  = containerEl.querySelector(`#${el}-slider-skewx`);
      r.valSkewX     = containerEl.querySelector(`#${el}-val-skewx`);
      r.sliderSkewY  = containerEl.querySelector(`#${el}-slider-skewy`);
      r.valSkewY     = containerEl.querySelector(`#${el}-val-skewy`);

      // Color swatch → update hex field + canvas
      r.colorInput.addEventListener('input', () => {
        r.hexInput.value = r.colorInput.value;
        window.KitCanvas.setColor(el, r.colorInput.value);
      });

      // Hex field → validate, update swatch + canvas
      function _applyHex() {
        const hex = _normaliseHex(r.hexInput.value);
        if (!hex) {
          r.hexInput.classList.add('is-invalid');
          return;
        }
        r.hexInput.classList.remove('is-invalid');
        r.hexInput.value  = hex;
        r.colorInput.value = hex;
        window.KitCanvas.setColor(el, hex);
      }
      r.hexInput.addEventListener('change', _applyHex);
      r.hexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') _applyHex(); });

      // Rotation — both elements
      r.sliderRotate.addEventListener('input', () => {
        const deg = parseFloat(r.sliderRotate.value);
        r.valRotate.textContent = (deg % 1 === 0 ? deg : deg.toFixed(1)) + '°';
        window.KitCanvas.setRotation(el, deg);
      });

      // Skew — both elements
      function _onSkew() {
        const sx = parseFloat(r.sliderSkewX.value);
        const sy = parseFloat(r.sliderSkewY.value);
        r.valSkewX.textContent = sx.toFixed(2);
        r.valSkewY.textContent = sy.toFixed(2);
        window.KitCanvas.setSkew(el, sx, sy);
      }
      r.sliderSkewX.addEventListener('input', _onSkew);
      r.sliderSkewY.addEventListener('input', _onSkew);

      // Curve + Kerning + Stroke — Name only
      if (el === 'name') {
        r.sliderCurve   = containerEl.querySelector('#name-slider-curve');
        r.valCurve      = containerEl.querySelector('#name-val-curve');
        r.sliderKerning = containerEl.querySelector('#name-slider-kerning');
        r.valKerning    = containerEl.querySelector('#name-val-kerning');
        r.strokeColorInput    = containerEl.querySelector('#name-stroke-color');
        r.strokeHexInput      = containerEl.querySelector('#name-stroke-hex');
        r.sliderStrokeWidth   = containerEl.querySelector('#name-slider-stroke-width');
        r.valStrokeWidth      = containerEl.querySelector('#name-val-stroke-width');

        r.sliderCurve.addEventListener('input', () => {
          const cv = parseFloat(r.sliderCurve.value);
          r.valCurve.textContent = cv.toFixed(2);
          window.KitCanvas.setNameCurve(cv);
        });

        r.sliderKerning.addEventListener('input', () => {
          const kp = parseInt(r.sliderKerning.value, 10);
          r.valKerning.textContent = kp + 'px';
          window.KitCanvas.setNameKerning(kp);
        });

        r.strokeColorInput.addEventListener('input', () => {
          r.strokeHexInput.value = r.strokeColorInput.value;
          window.KitCanvas.setNameStroke(r.strokeColorInput.value, undefined);
        });

        function _applyStrokeHex() {
          const hex = _normaliseHex(r.strokeHexInput.value);
          if (!hex) { r.strokeHexInput.classList.add('is-invalid'); return; }
          r.strokeHexInput.classList.remove('is-invalid');
          r.strokeHexInput.value      = hex;
          r.strokeColorInput.value    = hex;
          window.KitCanvas.setNameStroke(hex, undefined);
        }
        r.strokeHexInput.addEventListener('change', _applyStrokeHex);
        r.strokeHexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') _applyStrokeHex(); });

        r.sliderStrokeWidth.addEventListener('input', () => {
          const w = parseFloat(r.sliderStrokeWidth.value);
          r.valStrokeWidth.textContent = w + 'px';
          window.KitCanvas.setNameStroke(undefined, w);
        });
      }

      // Spacing — Number only
      if (el === 'number') {
        r.sliderSpacing = containerEl.querySelector('#number-slider-spacing');
        r.valSpacing    = containerEl.querySelector('#number-val-spacing');
        r.sliderSpacing.addEventListener('input', () => {
          const sp = parseInt(r.sliderSpacing.value, 10);
          r.valSpacing.textContent = sp + 'px';
          window.KitCanvas.setDigitSpacing(sp);
        });
      }

      function onSlide() {
        if (_syncing) return;
        const x     = parseFloat(r.sliderX.value);
        const y     = parseFloat(r.sliderY.value);
        const scale = parseFloat(r.sliderScale.value);
        r.valX.textContent     = Math.round(x) + 'px';
        r.valY.textContent     = Math.round(y) + 'px';
        r.valScale.textContent = scale.toFixed(2) + '×';
        window.KitCanvas.setTransform(el, x, y, scale);
      }

      r.sliderX.addEventListener('input',     onSlide);
      r.sliderY.addEventListener('input',     onSlide);
      r.sliderScale.addEventListener('input', onSlide);
    });

    // Front Number toggle
    _toggleFrontNumber = containerEl.querySelector('#toggle-front-number');
    _toggleFrontNumber.addEventListener('change', () => {
      _showFrontNumber = _toggleFrontNumber.checked;
      if (window.FrontCanvas) window.FrontCanvas.setNumberVisible(_showFrontNumber);
    });

    // Sync from canvas drag events
    document.addEventListener('kit-canvas:transform-changed', (e) => {
      const { element, x, y, scale, rotation, skewX, skewY, stageW, stageH } = e.detail;
      const r = _rows[element];
      if (!r || !r.sliderX) return;

      _syncing = true;
      r.sliderX.max          = stageW;
      r.sliderY.max          = stageH;
      r.sliderX.value        = Math.round(x);
      r.sliderY.value        = Math.round(y);
      r.sliderScale.value    = scale.toFixed(2);
      r.valX.textContent     = Math.round(x) + 'px';
      r.valY.textContent     = Math.round(y) + 'px';
      r.valScale.textContent = parseFloat(scale).toFixed(2) + '×';
      if (r.sliderRotate && rotation !== undefined) {
        const deg = Math.round(rotation * 2) / 2;
        r.sliderRotate.value    = deg;
        r.valRotate.textContent = (deg % 1 === 0 ? deg : deg.toFixed(1)) + '°';
      }
      if (r.sliderSkewX && skewX !== undefined) {
        r.sliderSkewX.value    = skewX.toFixed(2);
        r.valSkewX.textContent = skewX.toFixed(2);
      }
      if (r.sliderSkewY && skewY !== undefined) {
        r.sliderSkewY.value    = skewY.toFixed(2);
        r.valSkewY.textContent = skewY.toFixed(2);
      }
      _syncing = false;
    });
  }

  function syncFromSettings(s) {
    if (!s) return;
    _syncing = true;
    ['name', 'number'].forEach(el => {
      const r = _rows[el];
      if (!r.sliderX) return;
      const t = el === 'name' ? s.nameTransform : s.numberTransform;
      if (t) {
        r.sliderX.value        = Math.round(t.x);
        r.sliderY.value        = Math.round(t.y);
        r.sliderScale.value    = t.scale.toFixed(3);
        r.valX.textContent     = Math.round(t.x) + 'px';
        r.valY.textContent     = Math.round(t.y) + 'px';
        r.valScale.textContent = parseFloat(t.scale).toFixed(2) + '×';
        if (r.sliderRotate && t.rotation !== undefined) {
          const deg = Math.round(t.rotation * 2) / 2;
          r.sliderRotate.value    = deg;
          r.valRotate.textContent = (deg % 1 === 0 ? deg : deg.toFixed(1)) + '°';
        }
        if (r.sliderSkewX && t.skewX !== undefined) {
          r.sliderSkewX.value    = (t.skewX || 0).toFixed(2);
          r.valSkewX.textContent = (t.skewX || 0).toFixed(2);
        }
        if (r.sliderSkewY && t.skewY !== undefined) {
          r.sliderSkewY.value    = (t.skewY || 0).toFixed(2);
          r.valSkewY.textContent = (t.skewY || 0).toFixed(2);
        }
      }
      const color = el === 'name' ? s.nameColor : s.numberColor;
      if (color && r.colorInput) {
        r.colorInput.value = color;
        r.hexInput.value   = color;
      }
    });
    const nr = _rows.name;
    if (s.nameCurve !== undefined && nr.sliderCurve) {
      nr.sliderCurve.value    = s.nameCurve;
      nr.valCurve.textContent = parseFloat(s.nameCurve).toFixed(2);
    }
    if (s.nameKerning !== undefined && nr.sliderKerning) {
      nr.sliderKerning.value    = s.nameKerning;
      nr.valKerning.textContent = s.nameKerning + 'px';
    }
    if (s.nameStrokeColor !== undefined && nr.strokeColorInput) {
      nr.strokeColorInput.value = s.nameStrokeColor;
      nr.strokeHexInput.value   = s.nameStrokeColor;
    }
    if (s.nameStrokeWidth !== undefined && nr.sliderStrokeWidth) {
      nr.sliderStrokeWidth.value    = s.nameStrokeWidth;
      nr.valStrokeWidth.textContent = s.nameStrokeWidth + 'px';
    }
    const numR = _rows.number;
    if (s.digitSpacing !== undefined && numR.sliderSpacing) {
      numR.sliderSpacing.value    = s.digitSpacing;
      numR.valSpacing.textContent = s.digitSpacing + 'px';
    }
    if (s.showFrontNumber !== undefined && _toggleFrontNumber) {
      _showFrontNumber = s.showFrontNumber !== false;
      _toggleFrontNumber.checked = _showFrontNumber;
    }
    _syncing = false;
  }

  function getShowFrontNumber() {
    return _showFrontNumber;
  }

  return { init, syncFromSettings, getShowFrontNumber };
})();
