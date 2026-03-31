/**
 * editor/FrontSliders.js — Controls bar for the Front view
 *
 * Single "Front Number" control group: X, Y, Scale, Rotate, Spacing, Colour.
 * Mirrors the pattern from Sliders.js but targets window.FrontCanvas.
 *
 * Public API (window.FrontSliders):
 *   init(containerEl)
 *   syncFromSettings(s)   — s is a frontNumber settings object
 */

window.FrontSliders = (() => {
  const _r = {
    sliderX: null, sliderY: null, sliderScale: null,
    valX: null,    valY: null,    valScale: null,
    colorInput: null, hexInput: null,
    sliderSpacing: null, valSpacing: null,
    sliderRotate: null,  valRotate: null,
    sliderSkewX: null, valSkewX: null,
    sliderSkewY: null, valSkewY: null,
  };

  let _syncing = false;

  function _normaliseHex(raw) {
    const s = raw.trim().replace(/^#?/, '#');
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      const [, r, g, b] = s;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return null;
  }

  function init(containerEl) {
    containerEl.innerHTML = `
      <div class="ctrl-group">
        <span class="ctrl-group-label">Front Number</span>
        <div class="ctrl-sliders">
          <div class="ctrl-row">
            <span class="ctrl-label">X</span>
            <input class="ctrl-slider" id="fn-slider-x" type="range" min="0" max="1000" step="1" value="0">
            <span class="ctrl-val" id="fn-val-x">0px</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Y</span>
            <input class="ctrl-slider" id="fn-slider-y" type="range" min="0" max="1000" step="1" value="0">
            <span class="ctrl-val" id="fn-val-y">0px</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Scale</span>
            <input class="ctrl-slider" id="fn-slider-scale" type="range" min="0.2" max="3" step="0.01" value="1">
            <span class="ctrl-val" id="fn-val-scale">1.00×</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Color</span>
            <input class="ctrl-color" id="fn-color" type="color" value="#ffffff">
            <input class="ctrl-hex"   id="fn-hex"   type="text" maxlength="7" value="#ffffff" spellcheck="false">
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Spacing</span>
            <input class="ctrl-slider" id="fn-slider-spacing" type="range" min="-20" max="80" step="1" value="4">
            <span class="ctrl-val" id="fn-val-spacing">4px</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Rotate</span>
            <input class="ctrl-slider" id="fn-slider-rotate" type="range" min="-180" max="180" step="0.5" value="0">
            <span class="ctrl-val" id="fn-val-rotate">0°</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Skew X</span>
            <input class="ctrl-slider" id="fn-slider-skewx" type="range" min="-0.5" max="0.5" step="0.01" value="0">
            <span class="ctrl-val" id="fn-val-skewx">0.00</span>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Skew Y</span>
            <input class="ctrl-slider" id="fn-slider-skewy" type="range" min="-0.5" max="0.5" step="0.01" value="0">
            <span class="ctrl-val" id="fn-val-skewy">0.00</span>
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
              <input type="checkbox" id="fn-grid-toggle">
              <span class="ctrl-toggle-track"><span class="ctrl-toggle-thumb"></span></span>
            </label>
          </div>
          <div class="ctrl-row">
            <span class="ctrl-label">Spacing</span>
            <input class="ctrl-slider" id="fn-grid-spacing" type="range" min="10" max="200" step="5" value="50">
            <span class="ctrl-val" id="fn-grid-val">50px</span>
          </div>
        </div>
      </div>`;

    _r.sliderX      = containerEl.querySelector('#fn-slider-x');
    _r.sliderY      = containerEl.querySelector('#fn-slider-y');
    _r.sliderScale  = containerEl.querySelector('#fn-slider-scale');
    _r.valX         = containerEl.querySelector('#fn-val-x');
    _r.valY         = containerEl.querySelector('#fn-val-y');
    _r.valScale     = containerEl.querySelector('#fn-val-scale');
    _r.colorInput   = containerEl.querySelector('#fn-color');
    _r.hexInput     = containerEl.querySelector('#fn-hex');
    _r.sliderSpacing = containerEl.querySelector('#fn-slider-spacing');
    _r.valSpacing    = containerEl.querySelector('#fn-val-spacing');
    _r.sliderRotate  = containerEl.querySelector('#fn-slider-rotate');
    _r.valRotate     = containerEl.querySelector('#fn-val-rotate');
    _r.sliderSkewX   = containerEl.querySelector('#fn-slider-skewx');
    _r.valSkewX      = containerEl.querySelector('#fn-val-skewx');
    _r.sliderSkewY   = containerEl.querySelector('#fn-slider-skewy');
    _r.valSkewY      = containerEl.querySelector('#fn-val-skewy');

    // X / Y / Scale
    function _onSlide() {
      if (_syncing) return;
      const x     = parseFloat(_r.sliderX.value);
      const y     = parseFloat(_r.sliderY.value);
      const scale = parseFloat(_r.sliderScale.value);
      _r.valX.textContent     = Math.round(x) + 'px';
      _r.valY.textContent     = Math.round(y) + 'px';
      _r.valScale.textContent = scale.toFixed(2) + '×';
      window.FrontCanvas.setTransform(x, y, scale);
    }
    _r.sliderX.addEventListener('input',     _onSlide);
    _r.sliderY.addEventListener('input',     _onSlide);
    _r.sliderScale.addEventListener('input', _onSlide);

    // Colour swatch
    _r.colorInput.addEventListener('input', () => {
      _r.hexInput.value = _r.colorInput.value;
      window.FrontCanvas.setColor(_r.colorInput.value);
    });

    // Hex field
    function _applyHex() {
      const hex = _normaliseHex(_r.hexInput.value);
      if (!hex) { _r.hexInput.classList.add('is-invalid'); return; }
      _r.hexInput.classList.remove('is-invalid');
      _r.hexInput.value  = hex;
      _r.colorInput.value = hex;
      window.FrontCanvas.setColor(hex);
    }
    _r.hexInput.addEventListener('change', _applyHex);
    _r.hexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') _applyHex(); });

    // Spacing
    _r.sliderSpacing.addEventListener('input', () => {
      const sp = parseInt(_r.sliderSpacing.value, 10);
      _r.valSpacing.textContent = sp + 'px';
      window.FrontCanvas.setDigitSpacing(sp);
    });

    // Rotation
    _r.sliderRotate.addEventListener('input', () => {
      const deg = parseFloat(_r.sliderRotate.value);
      _r.valRotate.textContent = (deg % 1 === 0 ? deg : deg.toFixed(1)) + '°';
      window.FrontCanvas.setRotation(deg);
    });

    // Skew
    function _onFnSkew() {
      const sx = parseFloat(_r.sliderSkewX.value);
      const sy = parseFloat(_r.sliderSkewY.value);
      _r.valSkewX.textContent = sx.toFixed(2);
      _r.valSkewY.textContent = sy.toFixed(2);
      window.FrontCanvas.setSkew(sx, sy);
    }
    _r.sliderSkewX.addEventListener('input', _onFnSkew);
    _r.sliderSkewY.addEventListener('input', _onFnSkew);

    // Sync from canvas drag events
    document.addEventListener('front-canvas:transform-changed', (e) => {
      const { x, y, scale, rotation, skewX, skewY, stageW, stageH } = e.detail;
      _syncing = true;
      _r.sliderX.max          = stageW;
      _r.sliderY.max          = stageH;
      _r.sliderX.value        = Math.round(x);
      _r.sliderY.value        = Math.round(y);
      _r.sliderScale.value    = scale.toFixed(2);
      _r.valX.textContent     = Math.round(x) + 'px';
      _r.valY.textContent     = Math.round(y) + 'px';
      _r.valScale.textContent = parseFloat(scale).toFixed(2) + '×';
      if (rotation !== undefined) {
        const deg = Math.round(rotation * 2) / 2;
        _r.sliderRotate.value    = deg;
        _r.valRotate.textContent = (deg % 1 === 0 ? deg : deg.toFixed(1)) + '°';
      }
      if (skewX !== undefined) {
        _r.sliderSkewX.value    = skewX.toFixed(2);
        _r.valSkewX.textContent = skewX.toFixed(2);
      }
      if (skewY !== undefined) {
        _r.sliderSkewY.value    = skewY.toFixed(2);
        _r.valSkewY.textContent = skewY.toFixed(2);
      }
      _syncing = false;
    });
  }

  function syncFromSettings(s) {
    if (!s || !_r.sliderX) return;
    _syncing = true;
    if (s.x !== null && s.x !== undefined) {
      _r.sliderX.value        = Math.round(s.x);
      _r.valX.textContent     = Math.round(s.x) + 'px';
    }
    if (s.y !== null && s.y !== undefined) {
      _r.sliderY.value        = Math.round(s.y);
      _r.valY.textContent     = Math.round(s.y) + 'px';
    }
    if (s.scale !== null && s.scale !== undefined) {
      _r.sliderScale.value    = parseFloat(s.scale).toFixed(3);
      _r.valScale.textContent = parseFloat(s.scale).toFixed(2) + '×';
    }
    if (s.rotation !== undefined) {
      const deg = Math.round((s.rotation || 0) * 2) / 2;
      _r.sliderRotate.value    = deg;
      _r.valRotate.textContent = (deg % 1 === 0 ? deg : deg.toFixed(1)) + '°';
    }
    if (s.skewX !== undefined) {
      _r.sliderSkewX.value    = (s.skewX || 0).toFixed(2);
      _r.valSkewX.textContent = (s.skewX || 0).toFixed(2);
    }
    if (s.skewY !== undefined) {
      _r.sliderSkewY.value    = (s.skewY || 0).toFixed(2);
      _r.valSkewY.textContent = (s.skewY || 0).toFixed(2);
    }
    if (s.spacing !== undefined) {
      _r.sliderSpacing.value    = s.spacing;
      _r.valSpacing.textContent = s.spacing + 'px';
    }
    if (s.color) {
      _r.colorInput.value = s.color;
      _r.hexInput.value   = s.color;
    }
    _syncing = false;
  }

  return { init, syncFromSettings };
})();
