/**
 * profile/ProfilePanel.js — Kit profile save / load / delete.
 *
 * Layout (in left panel):
 *   Dropdown   — lists saved profiles
 *   Name field — editable profile name; pre-fills when a profile is selected
 *   [Save] [Delete] buttons
 *   Dirty dot  — orange dot when there are unsaved changes
 *
 * Note: window.prompt() and window.confirm() are blocked in Electron with
 * contextIsolation: true, so all user interaction is done with inline UI.
 *
 * Public API (window.ProfilePanel):
 *   init(containerEl, { getState, onLoad })
 *   markDirty()
 *   markClean()
 */

window.ProfilePanel = (() => {
  let _sel       = null;   // <select>
  let _nameInput = null;   // <input type="text"> for profile name
  let _dot       = null;   // dirty-indicator dot
  let _btnSave   = null;
  let _btnDelete = null;
  let _profiles  = [];     // [{ name, path }]
  let _delPending = false; // true after first Delete click (waiting for confirm)

  let _getState = null;
  let _onLoad   = null;

  // ── Public ─────────────────────────────────────────────────────────────

  function init(containerEl, { getState, onLoad }) {
    _getState = getState;
    _onLoad   = onLoad;

    containerEl.innerHTML = `
      <div class="profile-section">
        <h2 class="panel-title">Kit Profile</h2>
        <div class="profile-select-row">
          <select class="profile-select" id="pp-select">
            <option value="">— select profile —</option>
          </select>
          <span class="profile-dirty-dot" id="pp-dirty" title="Unsaved changes"></span>
        </div>
        <input class="profile-name-input" id="pp-name"
               type="text" placeholder="Profile name…" maxlength="40" spellcheck="false">
        <div class="profile-btn-row">
          <button class="profile-btn primary" id="pp-save">Save</button>
          <button class="profile-btn" id="pp-delete" disabled>Delete</button>
        </div>
      </div>`;

    _sel       = containerEl.querySelector('#pp-select');
    _nameInput = containerEl.querySelector('#pp-name');
    _dot       = containerEl.querySelector('#pp-dirty');
    _btnSave   = containerEl.querySelector('#pp-save');
    _btnDelete = containerEl.querySelector('#pp-delete');

    _sel.addEventListener('change', _onSelectChange);
    _btnSave.addEventListener('click', _onSave);
    _btnDelete.addEventListener('click', _onDelete);

    // Any edit to the name field cancels a pending delete
    _nameInput.addEventListener('input', _cancelDelete);

    _refreshProfiles();
  }

  function markDirty() {
    if (_dot) _dot.classList.add('visible');
  }

  function markClean() {
    if (_dot) _dot.classList.remove('visible');
  }

  // ── Private ────────────────────────────────────────────────────────────

  async function _refreshProfiles() {
    try {
      _profiles = await window.kitAPI.listProfiles();
    } catch { _profiles = []; }
    _renderProfiles();
  }

  function _renderProfiles() {
    if (!_sel) return;
    const prev = _sel.value;
    _sel.innerHTML = '<option value="">— select profile —</option>';
    _profiles.forEach(p => {
      const opt = document.createElement('option');
      opt.value       = p.path;
      opt.textContent = p.name;
      _sel.appendChild(opt);
    });
    if (prev && _profiles.some(p => p.path === prev)) _sel.value = prev;
    _btnDelete.disabled = !_sel.value;
  }

  async function _onSelectChange() {
    _cancelDelete();
    const profilePath = _sel.value;
    _btnDelete.disabled = !profilePath;

    // Pre-fill the name field with the selected profile's name
    const p = _profiles.find(p => p.path === profilePath);
    if (_nameInput) _nameInput.value = p ? p.name : '';

    if (!profilePath) return;
    try {
      const profile = await window.kitAPI.loadProfile(profilePath);
      markClean();
      _onLoad && _onLoad(profile);
    } catch (err) {
      console.error('[ProfilePanel] load error', err);
    }
  }

  async function _onSave() {
    _cancelDelete();
    if (!_getState) return;

    const rawName = _nameInput ? _nameInput.value.trim() : '';
    const safeName = rawName.replace(/[^a-z0-9 _\-]/gi, '').trim() || 'profile';

    let filePath;
    // If we're updating an existing profile by the same name, reuse its path
    const existing = _profiles.find(p => p.path === _sel.value);
    if (existing) {
      filePath = existing.path;
    } else {
      const dirs     = await window.kitAPI.getProfileDirs();
      const fileName = safeName.toLowerCase().replace(/\s+/g, '-') + '.json';
      filePath = dirs.profilesDir + '/' + fileName;
    }

    const profile = { version: 1, name: safeName, ..._getState() };

    try {
      await window.kitAPI.saveProfile(filePath, profile);
      markClean();
      await _refreshProfiles();
      _sel.value          = filePath;
      _btnDelete.disabled = false;
      if (_nameInput) _nameInput.value = safeName;
    } catch (err) {
      console.error('[ProfilePanel] save error', err);
    }
  }

  async function _onDelete() {
    const profilePath = _sel.value;
    if (!profilePath) return;

    if (!_delPending) {
      // First click: arm the confirm state
      _delPending = true;
      _btnDelete.textContent = 'Confirm?';
      _btnDelete.classList.add('danger');
      return;
    }

    // Second click: actually delete
    _cancelDelete();
    try {
      await window.kitAPI.deleteProfile(profilePath);
      await _refreshProfiles();
      _sel.value          = '';
      _btnDelete.disabled = true;
      if (_nameInput) _nameInput.value = '';
      markClean();
    } catch (err) {
      console.error('[ProfilePanel] delete error', err);
    }
  }

  function _cancelDelete() {
    if (!_delPending) return;
    _delPending = false;
    if (_btnDelete) {
      _btnDelete.textContent = 'Delete';
      _btnDelete.classList.remove('danger');
    }
  }

  return { init, markDirty, markClean };
})();
