/**
 * export/ExportModal.js — Export settings modal
 *
 * Shows before export starts and lets the user configure:
 *   - Output types: Back / Front / Composite (checkboxes with preview thumbnails)
 *   - Format:       AVIF | PNG
 *   - Resolution:   2048px | 4096px
 *   - Filename templates for each output type
 *   - Live summary: 1 kit × N players × P types = X files total
 *
 * Public API (window.ExportModal):
 *   open({ playerCount, backPreviewUrl, frontPreviewUrl, compositePreviewUrl, onConfirm })
 *   close()
 *
 * onConfirm is called with:
 *   { outputTypes: { back, front, composite }, format, resolution, templates: { back, front, composite } }
 */

window.ExportModal = (() => {
  let _overlay = null;
  let _onConfirm = null;
  let _playerCount = 1;

  // Persisted settings across opens
  const _state = {
    format:     'avif',
    resolution: 2048,
    templates: {
      back:      '{productid}_2_3_1',
      front:     '{productid}_2_2_1',
      composite: '{productid}_2_1_1',
    },
  };

  // ── Public ────────────────────────────────────────────────────────────

  function open({ playerCount = 1, backPreviewUrl, frontPreviewUrl, compositePreviewUrl, onConfirm }) {
    close();
    _playerCount = playerCount;
    _onConfirm   = onConfirm;

    _overlay = document.createElement('div');
    _overlay.className = 'em-overlay';
    _overlay.innerHTML = _html(backPreviewUrl, frontPreviewUrl, compositePreviewUrl);
    document.body.appendChild(_overlay);

    _bind();
    _updateSummary();
  }

  function close() {
    if (_overlay) { _overlay.remove(); _overlay = null; }
  }

  // ── HTML builder ───────────────────────────────────────────────────────

  function _html(backUrl, frontUrl, compositeUrl) {
    const s = _state;
    return `
      <div class="em-modal">
        <div class="em-header">
          <span class="em-title">Export batch</span>
          <button class="em-x" id="em-close">×</button>
        </div>
        <div class="em-body">

          <div class="em-section-label">OUTPUT TYPES</div>
          <div class="em-type-row">
            ${_card('back',      'Back only',  backUrl)}
            ${_card('front',     'Front only', frontUrl)}
            ${_card('composite', 'Composite',  compositeUrl)}
          </div>

          <div class="em-two-col">
            <div>
              <div class="em-section-label">FORMAT</div>
              <div class="em-pills">
                <button class="em-pill${s.format==='avif'?' active':''}" id="em-avif">AVIF</button>
                <button class="em-pill${s.format==='png' ?' active':''}" id="em-png">PNG</button>
              </div>
            </div>
            <div>
              <div class="em-section-label">RESOLUTION</div>
              <div class="em-pills">
                <button class="em-pill${s.resolution===2048?' active':''}" id="em-2048">2048px</button>
                <button class="em-pill${s.resolution===4096?' active':''}" id="em-4096">4096px</button>
              </div>
            </div>
          </div>

          <div class="em-section-label">FILENAME TEMPLATES</div>
          <div class="em-templates">
            ${_tpl('Back',  'back',      s.templates.back)}
            ${_tpl('Front', 'front',     s.templates.front)}
            ${_tpl('Comp',  'composite', s.templates.composite)}
          </div>

          <div class="em-summary">
            <div>
              <div class="em-summary-line" id="em-summary-line">–</div>
              <div class="em-summary-total" id="em-summary-total">– files total</div>
            </div>
          </div>

        </div>
        <div class="em-footer">
          <button class="em-btn em-btn-cancel" id="em-cancel">Cancel</button>
          <button class="em-btn em-btn-export" id="em-export">Export → ZIP</button>
        </div>
      </div>`;
  }

  function _card(which, label, previewUrl) {
    const thumb = previewUrl
      ? `<img class="em-card-thumb" src="${previewUrl}" alt="${label}">`
      : `<div class="em-card-thumb em-card-thumb-empty"></div>`;
    return `
      <label class="em-card" id="em-card-${which}">
        <div class="em-card-top">
          <input type="checkbox" class="em-card-cb" id="em-cb-${which}" checked>
          <span class="em-card-name">${label}</span>
        </div>
        ${thumb}
        <span class="em-card-footer">1 file per player</span>
      </label>`;
  }

  function _tpl(labelText, which, defaultVal) {
    return `
      <div class="em-tpl-row">
        <span class="em-tpl-label">${labelText}</span>
        <input class="em-tpl-input" id="em-tpl-${which}" value="${_esc(defaultVal)}" spellcheck="false">
      </div>`;
  }

  // ── Event binding ──────────────────────────────────────────────────────

  function _bind() {
    const q = (id) => _overlay.querySelector(`#${id}`);

    q('em-close').addEventListener('click', close);
    q('em-cancel').addEventListener('click', close);
    _overlay.addEventListener('click', (e) => { if (e.target === _overlay) close(); });

    // Output type checkboxes → update summary
    ['back', 'front', 'composite'].forEach(w => {
      q(`em-cb-${w}`).addEventListener('change', _updateSummary);
    });

    // Format pills
    q('em-avif').addEventListener('click', () => {
      _state.format = 'avif';
      q('em-avif').classList.add('active');
      q('em-png').classList.remove('active');
    });
    q('em-png').addEventListener('click', () => {
      _state.format = 'png';
      q('em-png').classList.add('active');
      q('em-avif').classList.remove('active');
    });

    // Resolution pills
    q('em-2048').addEventListener('click', () => {
      _state.resolution = 2048;
      q('em-2048').classList.add('active');
      q('em-4096').classList.remove('active');
    });
    q('em-4096').addEventListener('click', () => {
      _state.resolution = 4096;
      q('em-4096').classList.add('active');
      q('em-2048').classList.remove('active');
    });

    // Export
    q('em-export').addEventListener('click', () => {
      // Read current form values
      _state.templates.back      = q('em-tpl-back').value      || _state.templates.back;
      _state.templates.front     = q('em-tpl-front').value     || _state.templates.front;
      _state.templates.composite = q('em-tpl-composite').value || _state.templates.composite;

      const outputTypes = {
        back:      q('em-cb-back').checked,
        front:     q('em-cb-front').checked,
        composite: q('em-cb-composite').checked,
      };

      // Must have at least one type selected
      if (!outputTypes.back && !outputTypes.front && !outputTypes.composite) return;

      close();
      _onConfirm && _onConfirm({
        outputTypes,
        format:     _state.format,
        resolution: _state.resolution,
        templates:  { ..._state.templates },
      });
    });
  }

  function _updateSummary() {
    if (!_overlay) return;
    const q  = (id) => _overlay.querySelector(`#${id}`);
    let types = 0;
    ['back', 'front', 'composite'].forEach(w => { if (q(`em-cb-${w}`).checked) types++; });
    const total = _playerCount * types;
    q('em-summary-line').textContent  =
      `1 kit × ${_playerCount} player${_playerCount !== 1 ? 's' : ''} × ${types} type${types !== 1 ? 's' : ''}`;
    q('em-summary-total').textContent = `${total} file${total !== 1 ? 's' : ''} total`;
    q('em-export').textContent        = `Export ${total} file${total !== 1 ? 's' : ''} → ZIP`;
  }

  function _esc(str) {
    return String(str).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { open, close };
})();
