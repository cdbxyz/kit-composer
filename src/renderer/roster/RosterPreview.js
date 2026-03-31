/**
 * roster/RosterPreview.js — Thumbnail grid of all roster players
 *
 * Iterates the roster, temporarily sets each player on the Konva canvas,
 * force-draws it, captures a low-res dataURL and displays it in a card grid.
 * Generation runs one player per task (setTimeout 0) to keep the UI responsive.
 *
 * Public API (window.RosterPreview):
 *   init(paneEl)
 *   generate(roster, appState, onDone)
 *   cancel()
 */

window.RosterPreview = (() => {
  let _paneEl          = null;
  let _cancelRequested = false;
  let _generating      = false;

  // ── Public ────────────────────────────────────────────────────────────

  function init(paneEl) {
    _paneEl = paneEl;
  }

  /**
   * Generate thumbnails for every player in roster.
   * onDone() is called when all thumbnails are rendered (or cancel was called).
   */
  function generate(roster, appState, onDone) {
    if (_generating) cancel();
    _cancelRequested = false;
    _generating      = true;

    _paneEl.innerHTML = `
      <div class="rp-toolbar">
        <span class="rp-title">Roster Preview</span>
        <span class="rp-progress" id="rp-progress">Rendering…</span>
      </div>
      <div class="rp-grid" id="rp-grid"></div>`;

    const grid = _paneEl.querySelector('#rp-grid');

    // Render placeholder cards immediately so the grid layout is visible
    roster.forEach((player, i) => {
      const card = document.createElement('div');
      card.className = 'rp-card';
      card.id        = `rp-card-${i}`;
      card.innerHTML = `
        <div class="rp-thumb-wrap"><div class="rp-spinner"></div></div>
        <div class="rp-label">
          <strong>${_esc(player.name)}</strong>
          <span>#${_esc(String(player.number))}</span>
        </div>`;
      grid.appendChild(card);
    });

    let idx = 0;

    async function _next() {
      if (_cancelRequested) { _generating = false; onDone && onDone(); return; }

      const prog = _paneEl.querySelector('#rp-progress');
      if (idx >= roster.length) {
        _generating = false;
        if (prog) prog.textContent = `${roster.length} player${roster.length === 1 ? '' : 's'}`;
        onDone && onDone();
        return;
      }

      if (prog) prog.textContent = `Rendering ${idx + 1} of ${roster.length}…`;

      const player = roster[idx];

      window.KitCanvas.setPreviewPlayer(player.name, player.number);

      // Capture at 1× then trim transparent border so the jersey fills the card
      const rawUrl  = window.KitCanvas.captureKitArea(1.0);
      const dataUrl = rawUrl ? await _trimTransparent(rawUrl) : null;

      const card = _paneEl.querySelector(`#rp-card-${idx}`);
      if (card) {
        const wrap = card.querySelector('.rp-thumb-wrap');
        if (dataUrl) {
          wrap.innerHTML = `<img src="${dataUrl}" class="rp-thumb" alt="${_esc(player.name)} #${_esc(String(player.number))}">`;
          card.classList.add('rp-done');
        } else {
          wrap.innerHTML = `<span class="rp-err">–</span>`;
        }
      }

      idx++;
      setTimeout(_next, 0);
    }

    setTimeout(_next, 0);
  }

  function cancel() {
    _cancelRequested = true;
    _generating      = false;
  }

  // ── Private ───────────────────────────────────────────────────────────

  // Crop transparent pixels from all four edges of a PNG data URL.
  // Returns a new data URL containing only the non-transparent bounding box.
  function _trimTransparent(dataUrl) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width  = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
        let minX = width, maxX = 0, minY = height, maxY = 0;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        if (minX > maxX || minY > maxY) { resolve(dataUrl); return; }

        const pad = 6;
        minX = Math.max(0,         minX - pad);
        minY = Math.max(0,         minY - pad);
        maxX = Math.min(width  - 1, maxX + pad);
        maxY = Math.min(height - 1, maxY + pad);

        const out = document.createElement('canvas');
        out.width  = maxX - minX + 1;
        out.height = maxY - minY + 1;
        out.getContext('2d').drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
        resolve(out.toDataURL());
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function _esc(str) {
    return String(str).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { init, generate, cancel };
})();
