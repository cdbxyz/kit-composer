/**
 * export/ExportPanel.js — Export progress overlay
 *
 * Manages the full-screen progress overlay shown during batch export.
 * The overlay covers the whole app while exporting and shows:
 *   - Two-phase progress: "Rendering X of N" then "Packaging X of N"
 *   - Animated progress bar
 *   - On completion: ZIP path + Reveal button + Close button
 *   - On error: error message + Close button
 *
 * Public API (window.ExportPanel):
 *   show(total)                           — open overlay, rendering phase
 *   updateRender(current, total)          — update render progress
 *   updatePackage(current, total)         — switch to packaging phase
 *   showComplete(zipPath)                 — show success state
 *   showError(message)                    — show error state
 *   hide()                                — remove overlay
 */

window.ExportPanel = (() => {
  let _overlay = null;

  // ── Public ────────────────────────────────────────────────────────────

  function show(total) {
    hide();
    _overlay = document.createElement('div');
    _overlay.className = 'ep-overlay';
    _overlay.innerHTML = `
      <div class="ep-modal">
        <div class="ep-phase" id="ep-phase">Rendering players…</div>
        <div class="ep-count" id="ep-count">0 of ${total}</div>
        <div class="ep-bar-track">
          <div class="ep-bar-fill" id="ep-bar" style="width:0%"></div>
        </div>
        <div class="ep-detail" id="ep-detail">Starting…</div>
      </div>`;
    document.body.appendChild(_overlay);
  }

  function updateRender(current, total) {
    _set('ep-phase', 'Rendering players…');
    _set('ep-count', `${current} of ${total}`);
    _setBar(current, total);
    _set('ep-detail', `Player ${current} rendered`);
  }

  function updatePackage(current, total) {
    _set('ep-phase', 'Packaging into ZIP…');
    _set('ep-count', `${current} of ${total}`);
    _setBar(current, total);
    _set('ep-detail', `Converting player ${current} to AVIF`);
  }

  function showComplete(zipPath) {
    if (!_overlay) return;
    const shortPath = zipPath.length > 60
      ? '…' + zipPath.slice(zipPath.length - 57)
      : zipPath;
    _overlay.querySelector('.ep-modal').innerHTML = `
      <div class="ep-icon ep-icon-ok">✓</div>
      <div class="ep-phase">Export complete</div>
      <div class="ep-saved" title="${_esc(zipPath)}">${_esc(shortPath)}</div>
      <div class="ep-actions">
        <button class="ep-btn ep-btn-secondary" id="ep-reveal">Show in Finder</button>
        <button class="ep-btn ep-btn-primary"   id="ep-close">Close</button>
      </div>`;
    document.getElementById('ep-reveal').addEventListener('click', () => {
      window.kitAPI.revealFile(zipPath);
    });
    document.getElementById('ep-close').addEventListener('click', hide);
  }

  function showError(message) {
    if (!_overlay) return;
    _overlay.querySelector('.ep-modal').innerHTML = `
      <div class="ep-icon ep-icon-err">✕</div>
      <div class="ep-phase">Export failed</div>
      <div class="ep-saved">${_esc(message)}</div>
      <div class="ep-actions">
        <button class="ep-btn ep-btn-primary" id="ep-close">Close</button>
      </div>`;
    document.getElementById('ep-close').addEventListener('click', hide);
  }

  function hide() {
    if (_overlay) { _overlay.remove(); _overlay = null; }
  }

  // ── Private ───────────────────────────────────────────────────────────

  function _set(id, text) {
    const el = _overlay && _overlay.querySelector(`#${id}`);
    if (el) el.textContent = text;
  }

  function _setBar(current, total) {
    const el = _overlay && _overlay.querySelector('#ep-bar');
    if (el) el.style.width = (total > 0 ? (current / total) * 100 : 0) + '%';
  }

  function _esc(str) {
    return String(str).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { show, updateRender, updatePackage, showComplete, showError, hide };
})();
