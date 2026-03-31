/**
 * composite/CompositePanel.js — Left panel for Composite view
 *
 * Shows two stacked cards (Back shirt / Front shirt) each with:
 *   X, Y, Scale, Rotate sliders + Z-order toggle (Behind / In front)
 * The selected shirt's card is highlighted.
 * A "Reset to default layout" button sits below both cards.
 *
 * Public API (window.CompositePanel):
 *   init(containerEl)
 *   syncFromSettings(s)           — s is a compositeLayout object { back, front }
 *   syncTransform(shirt, detail)  — called from transform-changed event
 *   syncZOrder(back, front)       — called from zorder-changed event
 *   selectShirt(which)            — highlight the correct card
 */

window.CompositePanel = (() => {
  // Per-shirt slider references
  const _cards = {
    back:  { el: null, sliderX: null, sliderY: null, sliderScale: null, sliderRotate: null,
             valX: null, valY: null, valScale: null, valRotate: null,
             btnBehind: null, btnFront: null },
    front: { el: null, sliderX: null, sliderY: null, sliderScale: null, sliderRotate: null,
             valX: null, valY: null, valScale: null, valRotate: null,
             btnBehind: null, btnFront: null },
  };

  let _syncing = false;

  function init(containerEl) {
    containerEl.innerHTML = `
      <h2 class="panel-title">Composite Layout</h2>
      ${_cardHTML('back',  'Back shirt')}
      ${_cardHTML('front', 'Front shirt')}
      <button class="comp-reset-btn" id="comp-reset">Reset to default layout</button>
      <div class="comp-grid-row">
        <span class="comp-grid-label">Show Grid</span>
        <label class="ctrl-toggle">
          <input type="checkbox" id="comp-grid-toggle">
          <span class="ctrl-toggle-track"><span class="ctrl-toggle-thumb"></span></span>
        </label>
        <input class="ctrl-slider comp-grid-spacing-slider" id="comp-grid-spacing" type="range" min="10" max="200" step="5" value="50">
        <span class="ctrl-val" id="comp-grid-val">50px</span>
      </div>`;

    ['back', 'front'].forEach(which => {
      const c   = _cards[which];
      const pfx = `comp-${which}`;
      c.el          = containerEl.querySelector(`#${pfx}-card`);
      c.sliderX     = containerEl.querySelector(`#${pfx}-x`);
      c.sliderY     = containerEl.querySelector(`#${pfx}-y`);
      c.sliderScale = containerEl.querySelector(`#${pfx}-scale`);
      c.sliderRotate = containerEl.querySelector(`#${pfx}-rotate`);
      c.valX        = containerEl.querySelector(`#${pfx}-vx`);
      c.valY        = containerEl.querySelector(`#${pfx}-vy`);
      c.valScale    = containerEl.querySelector(`#${pfx}-vs`);
      c.valRotate   = containerEl.querySelector(`#${pfx}-vr`);
      c.btnBehind   = containerEl.querySelector(`#${pfx}-behind`);
      c.btnFront    = containerEl.querySelector(`#${pfx}-infront`);

      // Click card → select shirt
      c.el.addEventListener('click', () => {
        window.CompositeCanvas.selectShirt(which);
      });

      // X / Y / Scale / Rotate
      function _onSlide() {
        if (_syncing) return;
        const x     = parseFloat(c.sliderX.value);
        const y     = parseFloat(c.sliderY.value);
        const scale = parseFloat(c.sliderScale.value);
        c.valX.textContent     = Math.round(x) + 'px';
        c.valY.textContent     = Math.round(y) + 'px';
        c.valScale.textContent = scale.toFixed(2) + '×';
        window.CompositeCanvas.setTransform(which, x, y, scale);
      }
      c.sliderX.addEventListener('input',      _onSlide);
      c.sliderY.addEventListener('input',      _onSlide);
      c.sliderScale.addEventListener('input',  _onSlide);

      c.sliderRotate.addEventListener('input', () => {
        if (_syncing) return;
        const deg = parseFloat(c.sliderRotate.value);
        c.valRotate.textContent = (deg % 1 === 0 ? deg : deg.toFixed(1)) + '°';
        window.CompositeCanvas.setRotation(which, deg);
      });

      // Z-order buttons
      c.btnBehind.addEventListener('click', (e) => {
        e.stopPropagation();
        window.CompositeCanvas.setZOrder(which, 'behind');
      });
      c.btnFront.addEventListener('click', (e) => {
        e.stopPropagation();
        window.CompositeCanvas.setZOrder(which, 'front');
      });
    });

    // Reset button
    containerEl.querySelector('#comp-reset').addEventListener('click', () => {
      window.CompositeCanvas.resetLayout();
    });

    // Listen to canvas events
    document.addEventListener('composite-canvas:transform-changed', (e) => {
      syncTransform(e.detail.shirt, e.detail);
    });
    document.addEventListener('composite-canvas:shirt-selected', (e) => {
      selectShirt(e.detail.shirt);
    });
    document.addEventListener('composite-canvas:zorder-changed', (e) => {
      syncZOrder(e.detail.back, e.detail.front);
    });
  }

  function _cardHTML(which, label) {
    const pfx = `comp-${which}`;
    return `
      <div class="comp-card" id="${pfx}-card">
        <div class="comp-card-header">
          <span class="comp-card-label">${label}</span>
          <span class="comp-card-selected-badge">selected</span>
        </div>
        <div class="ctrl-row">
          <span class="ctrl-label">X</span>
          <input class="ctrl-slider" id="${pfx}-x" type="range" min="0" max="1000" step="1" value="0">
          <span class="ctrl-val" id="${pfx}-vx">0px</span>
        </div>
        <div class="ctrl-row">
          <span class="ctrl-label">Y</span>
          <input class="ctrl-slider" id="${pfx}-y" type="range" min="0" max="1000" step="1" value="0">
          <span class="ctrl-val" id="${pfx}-vy">0px</span>
        </div>
        <div class="ctrl-row">
          <span class="ctrl-label">Scale</span>
          <input class="ctrl-slider" id="${pfx}-scale" type="range" min="0.2" max="3" step="0.01" value="1">
          <span class="ctrl-val" id="${pfx}-vs">1.00×</span>
        </div>
        <div class="ctrl-row">
          <span class="ctrl-label">Rotate</span>
          <input class="ctrl-slider" id="${pfx}-rotate" type="range" min="-180" max="180" step="0.5" value="0">
          <span class="ctrl-val" id="${pfx}-vr">0°</span>
        </div>
        <div class="ctrl-row comp-zorder-row">
          <span class="ctrl-label">Z Order</span>
          <div class="comp-zorder-group">
            <button class="comp-zorder-btn active" id="${pfx}-behind">Behind</button>
            <button class="comp-zorder-btn"        id="${pfx}-infront">In front</button>
          </div>
        </div>
      </div>`;
  }

  // ── Public ─────────────────────────────────────────────────────────────

  function syncFromSettings(s) {
    if (!s) return;
    _syncing = true;
    ['back', 'front'].forEach(which => {
      const t = s[which];
      const c = _cards[which];
      if (!t || !c.sliderX) return;

      if (t.x !== null && t.x !== undefined) {
        c.sliderX.value    = Math.round(t.x);
        c.valX.textContent = Math.round(t.x) + 'px';
      }
      if (t.y !== null && t.y !== undefined) {
        c.sliderY.value    = Math.round(t.y);
        c.valY.textContent = Math.round(t.y) + 'px';
      }
      if (t.scale !== undefined) {
        c.sliderScale.value    = parseFloat(t.scale).toFixed(3);
        c.valScale.textContent = parseFloat(t.scale).toFixed(2) + '×';
      }
      if (t.rotation !== undefined) {
        const deg = Math.round((t.rotation || 0) * 2) / 2;
        c.sliderRotate.value    = deg;
        c.valRotate.textContent = (deg % 1 === 0 ? deg : deg.toFixed(1)) + '°';
      }
      if (t.zOrder) _applyZOrderButtons(which, t.zOrder);
    });
    _syncing = false;
  }

  function syncTransform(shirt, detail) {
    const c = _cards[shirt];
    if (!c || !c.sliderX) return;
    _syncing = true;
    const { x, y, scale, rotation, outputSize } = detail;
    if (outputSize) {
      c.sliderX.max = Math.round(outputSize * 1.2);
      c.sliderY.max = Math.round(outputSize * 1.2);
    }
    c.sliderX.value        = Math.round(x);
    c.sliderY.value        = Math.round(y);
    c.sliderScale.value    = parseFloat(scale).toFixed(3);
    c.valX.textContent     = Math.round(x) + 'px';
    c.valY.textContent     = Math.round(y) + 'px';
    c.valScale.textContent = parseFloat(scale).toFixed(2) + '×';
    if (rotation !== undefined) {
      const deg = Math.round(rotation * 2) / 2;
      c.sliderRotate.value    = deg;
      c.valRotate.textContent = (deg % 1 === 0 ? deg : deg.toFixed(1)) + '°';
    }
    _syncing = false;
  }

  function syncZOrder(backOrder, frontOrder) {
    _applyZOrderButtons('back',  backOrder);
    _applyZOrderButtons('front', frontOrder);
  }

  function selectShirt(which) {
    ['back', 'front'].forEach(w => {
      const el = _cards[w].el;
      if (!el) return;
      el.classList.toggle('comp-card--selected', w === which);
    });
  }

  function _applyZOrderButtons(which, zOrder) {
    const c = _cards[which];
    if (!c.btnBehind) return;
    c.btnBehind.classList.toggle('active', zOrder === 'behind');
    c.btnFront.classList.toggle('active',  zOrder === 'front');
  }

  return { init, syncFromSettings, syncTransform, syncZOrder, selectShirt };
})();
