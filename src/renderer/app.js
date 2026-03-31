'use strict';

const appState = {
  currentProfile:   null,
  roster:           [],
  kitImagePath:     null,
  kitImageUrl:      null,
  frontImagePath:   null,
  frontImageUrl:    null,
  fontPath:         null,
  fontName:         null,
  digitPaths:       null,    // { '0': path, ..., '9': path }
  csvPath:          null,
  activePlayerKey:  null,
  activeView:       'back',  // 'back' | 'front' | 'composite'
};

function _playerKey(player) {
  return `${player.name}|${player.number}`;
}

// ── Helpers ────────────────────────────────────────────────────────────

function _pathToFileUrl(p) {
  if (!p) return null;
  // On Windows paths may use backslashes; normalise to forward slashes.
  const normalised = p.replace(/\\/g, '/');
  return 'file://' + (normalised.startsWith('/') ? normalised : '/' + normalised);
}

// Return a Sharp-converted sRGB data URL for the given file path.
// This ensures images with non-sRGB ICC profiles (AdobeRGB, ProPhoto, etc.)
// are properly colour-managed before reaching the Konva canvas.
// Falls back to a plain file:// URL if Sharp conversion fails.
async function _imageAsSrgbUrl(filePath) {
  if (!filePath) return null;
  try {
    const url = await window.kitAPI.readImageAsSrgb(filePath);
    if (url) return url;
  } catch (err) {
    console.warn('_imageAsSrgbUrl: Sharp conversion failed, falling back to file URL', err);
  }
  return _pathToFileUrl(filePath);
}

async function _applyProfileToApp(profile) {
  if (!profile) return;

  // --- Kit image ---
  if (profile.kitImagePath) {
    const url = await _imageAsSrgbUrl(profile.kitImagePath);
    appState.kitImagePath = profile.kitImagePath;
    appState.kitImageUrl  = url;
    window.KitCanvas.loadKitImage(url);
    setStatus(`Kit image loaded: ${profile.kitImagePath.replace(/.*[\\/]/, '')}`);
    // Canvas settings will be applied once the image is ready (kit-canvas:image-ready)
    _pendingSettings = profile;
  }

  // --- Font ---
  if (profile.fontPath) {
    appState.fontPath = profile.fontPath;
    appState.fontName = profile.fontName || profile.fontPath.replace(/.*[\\/]/, '');
    window.KitCanvas.loadFont(profile.fontPath, appState.fontName);
    setStatus(`Font loaded: ${appState.fontName}`);
  }

  // --- Front image ---
  if (profile.frontImagePath) {
    const url = await _imageAsSrgbUrl(profile.frontImagePath);
    appState.frontImagePath = profile.frontImagePath;
    appState.frontImageUrl  = url;
    window.FrontCanvas.loadFrontImage(url);
    // frontNumber settings applied once the front image is ready
    if (profile.frontNumber) _pendingFrontSettings = profile.frontNumber;
  }

  // --- Digit PNGs ---
  if (profile.digitPaths && Object.keys(profile.digitPaths).length) {
    appState.digitPaths = profile.digitPaths;
    const digitUrls = {};
    Object.entries(profile.digitPaths).forEach(([d, p]) => { digitUrls[d] = _pathToFileUrl(p); });
    window.KitCanvas.setDigitImages(digitUrls);
    window.FrontCanvas.setDigitImages(digitUrls);
    setStatus('Digit PNGs loaded from profile');
  }

  // --- Composite layout ---
  if (profile.compositeLayout) {
    window.CompositeCanvas.applySettings(profile.compositeLayout);
    window.CompositePanel.syncFromSettings(profile.compositeLayout);
  }

  // If no kit image was loaded we can apply canvas settings immediately
  if (!profile.kitImagePath) {
    window.KitCanvas.applySettings(profile);
    window.Sliders.syncFromSettings(profile);
  }
}

// ── Player restoration ─────────────────────────────────────────────────

function _restoreActivePlayer() {
  if (!appState.activePlayerKey || !appState.roster.length) return;
  const player = appState.roster.find(p => _playerKey(p) === appState.activePlayerKey);
  if (!player) return;
  window.KitCanvas.setPreviewPlayer(player.name, player.number);
  window.FrontCanvas.setPreviewPlayer(player.name, player.number);
  if (appState.activeView === 'composite') _refreshComposite();
}

function _refreshComposite() {
  const pixelRatio = _pixelRatio();
  const backUrl  = window.KitCanvas.captureKitArea(pixelRatio);
  const frontUrl = window.FrontCanvas.captureArea(pixelRatio);
  window.CompositeCanvas.refresh(backUrl, frontUrl);
}

// ── Export helpers ─────────────────────────────────────────────────────

function _kitLabel() {
  return appState.kitImagePath
    ? appState.kitImagePath
        .replace(/.*[\\/]/, '')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase()
        .slice(0, 16) || 'kit'
    : 'kit';
}

function _pixelRatio(targetSize = 2048) {
  const stageSize = window.KitCanvas.getStageSize();
  const kitDim    = Math.max(stageSize ? stageSize.width : 600, 1);
  return Math.max(2, Math.ceil(targetSize / kitDim));
}

function _expandTemplate(template, kitLabel, player) {
  const safe = (s) => String(s).replace(/[^a-z0-9]/gi, '').toLowerCase();
  return template
    .replace('{productid}', String(player.productId || '').trim())
    .replace('{kit}',       safe(kitLabel))
    .replace('{number}',    safe(player.number))
    .replace('{name}',      safe(player.name));
}

// Render both shirt images onto a square 2D canvas at targetSize×targetSize.
// layout = { back: { xFrac, yFrac, scale, rotation, zOrder }, front: {...} }
async function _renderCompositeForExport(backDataUrl, frontDataUrl, layout, targetSize) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, targetSize, targetSize);

    const images = {};
    const urls = {};
    if (backDataUrl  && layout.back)  urls.back  = backDataUrl;
    if (frontDataUrl && layout.front) urls.front = frontDataUrl;

    let pending = Object.keys(urls).length;
    if (pending === 0) { resolve(canvas.toDataURL('image/png')); return; }

    function draw() {
      // Collect items and sort by z-order (zOrder='front' draws last = on top)
      const items = [];
      if (layout.back  && images.back)  items.push({ img: images.back,  l: layout.back  });
      if (layout.front && images.front) items.push({ img: images.front, l: layout.front });
      items.sort((a, b) => (a.l.zOrder === 'front' ? 1 : 0) - (b.l.zOrder === 'front' ? 1 : 0));

      items.forEach(({ img, l }) => {
        const natW = img.naturalWidth  || img.width  || 1;
        const natH = img.naturalHeight || img.height || 1;
        const bs   = (targetSize * 0.80) / Math.max(natW, natH);
        const dw   = natW * bs * l.scale;
        const dh   = natH * bs * l.scale;
        ctx.save();
        ctx.translate(l.xFrac * targetSize, l.yFrac * targetSize);
        ctx.rotate((l.rotation || 0) * Math.PI / 180);
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
      });
      resolve(canvas.toDataURL('image/png'));
    }

    Object.entries(urls).forEach(([which, url]) => {
      const img = new Image();
      img.onload  = () => { images[which] = img; if (--pending === 0) draw(); };
      img.onerror = () => {                       if (--pending === 0) draw(); };
      img.src = url;
    });
  });
}

// ── Open export modal ──────────────────────────────────────────────────

function _doExportCurrent() {
  if (!appState.kitImageUrl) { setStatus('Load a kit image first'); return; }
  if (!appState.activePlayerKey) { setStatus('Select a player first'); return; }
  const player = appState.roster.find(p => _playerKey(p) === appState.activePlayerKey);
  if (!player) { setStatus('Select a player first'); return; }

  window.ExportModal.open({
    playerCount:       1,
    backPreviewUrl:    window.KitCanvas.captureKitArea(0.3),
    frontPreviewUrl:   window.FrontCanvas.captureArea(0.3),
    compositePreviewUrl: window.CompositeCanvas.captureArea(0.3),
    onConfirm(opts) {
      _runExport([player], opts).catch(err => {
        window.ExportPanel.showError(err.message || String(err));
        setStatus(`Export error: ${err.message || err}`);
      });
    },
  });
}

function _doExportAll() {
  if (!appState.kitImageUrl)    { setStatus('Load a kit image first');    return; }
  if (!appState.roster.length)  { setStatus('Load a roster CSV first');   return; }

  window.ExportModal.open({
    playerCount:         appState.roster.length,
    backPreviewUrl:      window.KitCanvas.captureKitArea(0.3),
    frontPreviewUrl:     window.FrontCanvas.captureArea(0.3),
    compositePreviewUrl: window.CompositeCanvas.captureArea(0.3),
    onConfirm(opts) {
      _runExport(appState.roster, opts).catch(err => {
        window.ExportPanel.showError(err.message || String(err));
        setStatus(`Export error: ${err.message || err}`);
      });
    },
  });
}

// ── Shared render+ZIP pipeline ─────────────────────────────────────────

async function _runExport(players, { outputTypes, format, resolution, templates }) {
  const outputPath = await window.kitAPI.chooseZipPath();
  if (!outputPath) return;

  const kitLabel    = _kitLabel();
  const targetSize  = resolution || 2048;
  const pixelRatio  = _pixelRatio(targetSize);
  const ext         = format === 'png' ? 'png' : 'avif';
  const total       = players.length;
  const showFront   = window.Sliders.getShowFrontNumber();
  const compLayout  = window.CompositeCanvas.getLayoutForExport();

  // Count total files for progress
  const typeCount   = Object.values(outputTypes).filter(Boolean).length;
  const totalFiles  = total * typeCount;

  window.ExportPanel.show(totalFiles);

  let renderCount = 0;
  const files = [];

  for (let i = 0; i < total; i++) {
    const player = players[i];

    // Always set both canvases so captured images are correct
    window.KitCanvas.setPreviewPlayer(player.name, player.number);
    window.FrontCanvas.setPreviewPlayer(player.name, player.number);

    const backUrl  = outputTypes.back || outputTypes.composite
      ? window.KitCanvas.captureKitArea(pixelRatio)
      : null;
    const frontUrl = (outputTypes.front || outputTypes.composite) && showFront
      ? window.FrontCanvas.captureArea(pixelRatio)
      : null;

    if (outputTypes.back && backUrl) {
      const name = _expandTemplate(templates.back, kitLabel, player);
      files.push({ filename: `back/${name}.${ext}`, pngDataUrl: backUrl });
      window.ExportPanel.updateRender(++renderCount, totalFiles);
    }

    if (outputTypes.front && frontUrl) {
      const name = _expandTemplate(templates.front, kitLabel, player);
      files.push({ filename: `front/${name}.${ext}`, pngDataUrl: frontUrl });
      window.ExportPanel.updateRender(++renderCount, totalFiles);
    }

    if (outputTypes.composite) {
      const compUrl = await _renderCompositeForExport(backUrl, frontUrl, compLayout, targetSize);
      const name = _expandTemplate(templates.composite, kitLabel, player);
      files.push({ filename: `composite/${name}.${ext}`, pngDataUrl: compUrl });
      window.ExportPanel.updateRender(++renderCount, totalFiles);
    }

    await new Promise(r => setTimeout(r, 0)); // yield to keep UI responsive
  }

  _restoreActivePlayer();

  // Phase 2: convert + ZIP in main process
  const unsubProgress = window.kitAPI.onExportProgress(({ current, total: t }) => {
    window.ExportPanel.updatePackage(current, t);
  });

  const result = await window.kitAPI.batchExport({ players: files, outputPath, format, targetSize });
  unsubProgress();

  if (result.ok) {
    window.ExportPanel.showComplete(result.zipPath);
    setStatus(`Exported ${files.length} files → ${result.zipPath}`);
  } else {
    window.ExportPanel.showError(result.error || 'Unknown error');
    setStatus(`Export failed: ${result.error}`);
  }
}

// ── Roster preview tab ─────────────────────────────────────────────────

function _startPreview() {
  if (!appState.roster.length) {
    document.getElementById('preview-pane').innerHTML =
      '<p class="rp-empty">Load a roster CSV to see player previews.</p>';
    return;
  }
  window.RosterPreview.generate(appState.roster, appState, _restoreActivePlayer);
}

// ── DOMContentLoaded ───────────────────────────────────────────────────

// Holds profile settings to apply once the kit/front image has finished loading
let _pendingSettings     = null;
let _pendingFrontSettings = null;

document.addEventListener('DOMContentLoaded', () => {
  window.KitCanvas.init();
  window.FrontCanvas.init();
  window.CompositeCanvas.init();
  window.GuideGrid.init(document.getElementById('canvas-area'));
  window.Sliders.init(document.getElementById('controls-bar'));
  window.FrontSliders.init(document.getElementById('front-controls-bar'));
  window.CompositePanel.init(document.getElementById('composite-panel-container'));
  window.RosterPreview.init(document.getElementById('preview-pane'));

  // ── Left panel sub-containers ──────────────────────────────────────
  const leftPanel = document.getElementById('left-panel');

  const profileContainer = document.createElement('div');
  profileContainer.id = 'profile-container';
  leftPanel.appendChild(profileContainer);

  const assetsContainer = document.createElement('div');
  assetsContainer.id = 'assets-container';
  leftPanel.appendChild(assetsContainer);

  // ── Profile Panel ──────────────────────────────────────────────────
  window.ProfilePanel.init(profileContainer, {
    getState() {
      return {
        kitImagePath:     appState.kitImagePath,
        frontImagePath:   appState.frontImagePath,
        fontPath:         appState.fontPath,
        fontName:         appState.fontName,
        digitPaths:       appState.digitPaths,
        showFrontNumber:  window.Sliders.getShowFrontNumber(),
        frontNumber:      window.FrontCanvas.getSettings(),
        compositeLayout:  window.CompositeCanvas.getSettings(),
        ...window.KitCanvas.getSettings(),
      };
    },
    onLoad(profile) {
      _applyProfileToApp(profile);
    },
  });

  // Apply pending canvas settings once kit image is ready
  document.addEventListener('kit-canvas:image-ready', () => {
    if (_pendingSettings) {
      window.KitCanvas.applySettings(_pendingSettings);
      window.Sliders.syncFromSettings(_pendingSettings);
      _pendingSettings = null;
    }
  });

  // Apply pending front number settings once front image is ready
  document.addEventListener('front-canvas:image-ready', () => {
    if (_pendingFrontSettings) {
      window.FrontCanvas.applySettings(_pendingFrontSettings);
      window.FrontSliders.syncFromSettings(_pendingFrontSettings);
      _pendingFrontSettings = null;
    }
  });

  // ── Guide grid controls ────────────────────────────────────────────────
  // All three views (back, front, composite) share the same GuideGrid instance.
  // Changing any control syncs all others so state is consistent across views.
  const _backGridToggle  = document.getElementById('back-grid-toggle');
  const _backGridSpacing = document.getElementById('back-grid-spacing');
  const _backGridVal     = document.getElementById('back-grid-val');
  const _fnGridToggle    = document.getElementById('fn-grid-toggle');
  const _fnGridSpacing   = document.getElementById('fn-grid-spacing');
  const _fnGridVal       = document.getElementById('fn-grid-val');
  const _compGridToggle  = document.getElementById('comp-grid-toggle');
  const _compGridSpacing = document.getElementById('comp-grid-spacing');
  const _compGridVal     = document.getElementById('comp-grid-val');

  function _applyGridVisible(v) {
    window.GuideGrid.setVisible(v);
    _backGridToggle.checked  = v;
    _fnGridToggle.checked    = v;
    _compGridToggle.checked  = v;
  }
  function _applyGridSpacing(px) {
    window.GuideGrid.setSpacing(px);
    _backGridSpacing.value   = px;
    _backGridVal.textContent = px + 'px';
    _fnGridSpacing.value     = px;
    _fnGridVal.textContent   = px + 'px';
    _compGridSpacing.value   = px;
    _compGridVal.textContent = px + 'px';
  }

  _backGridToggle.addEventListener('change', (e) => { e.stopPropagation(); _applyGridVisible(_backGridToggle.checked); });
  _fnGridToggle.addEventListener('change',   (e) => { e.stopPropagation(); _applyGridVisible(_fnGridToggle.checked); });
  _compGridToggle.addEventListener('change', (e) => { e.stopPropagation(); _applyGridVisible(_compGridToggle.checked); });

  _backGridSpacing.addEventListener('input', (e) => { e.stopPropagation(); _applyGridSpacing(parseInt(_backGridSpacing.value, 10)); });
  _fnGridSpacing.addEventListener('input',   (e) => { e.stopPropagation(); _applyGridSpacing(parseInt(_fnGridSpacing.value, 10)); });
  _compGridSpacing.addEventListener('input', (e) => { e.stopPropagation(); _applyGridSpacing(parseInt(_compGridSpacing.value, 10)); });

  // Mark profile dirty on any slider change (back or front)
  document.getElementById('controls-bar').addEventListener('input', () => {
    window.ProfilePanel.markDirty();
  });
  document.getElementById('front-controls-bar').addEventListener('input', () => {
    window.ProfilePanel.markDirty();
  });

  // Mark dirty when front number is dragged
  document.addEventListener('front-canvas:transform-changed', () => {
    window.ProfilePanel.markDirty();
  });

  // Mark dirty when composite layout changes
  document.addEventListener('composite-canvas:transform-changed', () => {
    window.ProfilePanel.markDirty();
  });
  document.addEventListener('composite-canvas:zorder-changed', () => {
    window.ProfilePanel.markDirty();
  });

  // ── View switcher ──────────────────────────────────────────────────────
  const viewSwitcher = document.getElementById('view-switcher');
  viewSwitcher.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-tab');
    if (!btn) return;
    const view = btn.dataset.view;
    if (view === appState.activeView) return;
    appState.activeView = view;

    viewSwitcher.querySelectorAll('.view-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const editorPane = document.getElementById('editor-pane');
    editorPane.classList.remove('view-front', 'view-composite');
    if (view !== 'back') editorPane.classList.add(`view-${view}`);

    // Show/hide composite left panel vs normal left panel
    const compositePanel   = document.getElementById('composite-panel-container');
    const profileContainer = document.getElementById('profile-container');
    const assetsContainer  = document.getElementById('assets-container');
    if (view === 'composite') {
      compositePanel.style.display   = 'block';
      if (profileContainer) profileContainer.style.display = 'none';
      if (assetsContainer)  assetsContainer.style.display  = 'none';
    } else {
      compositePanel.style.display   = 'none';
      if (profileContainer) profileContainer.style.display = '';
      if (assetsContainer)  assetsContainer.style.display  = '';
    }

    if (view === 'front') {
      window.FrontCanvas.onViewActivate();
      if (appState.frontImagePath && !appState.frontImageUrl) {
        _imageAsSrgbUrl(appState.frontImagePath).then(url => {
          appState.frontImageUrl = url;
          window.FrontCanvas.loadFrontImage(url);
        });
      }
    }

    if (view === 'composite') {
      window.CompositeCanvas.onViewActivate();
      _refreshComposite();
    }
  });

  // Export buttons
  document.getElementById('btn-export-player').addEventListener('click', _doExportCurrent);
  document.getElementById('btn-export-all').addEventListener('click', _doExportAll);

  // Tab switching
  const editorPane = document.getElementById('editor-pane');
  const tabEditor  = document.getElementById('tab-editor');
  const tabPreview = document.getElementById('tab-preview');

  tabEditor.addEventListener('click', () => {
    if (!editorPane.classList.contains('preview-active')) return;
    window.RosterPreview.cancel();
    editorPane.classList.remove('preview-active');
    tabEditor.classList.add('active');
    tabPreview.classList.remove('active');
    _restoreActivePlayer();
  });

  tabPreview.addEventListener('click', () => {
    if (!appState.kitImageUrl) { setStatus('Load a kit image first'); return; }
    const wasActive = editorPane.classList.contains('preview-active');
    editorPane.classList.add('preview-active');
    tabEditor.classList.remove('active');
    tabPreview.classList.add('active');
    // Re-generate on every click (refresh if already on preview)
    if (!wasActive || true) _startPreview();
  });

  // Roster player selection
  window.RosterGrid.init(document.getElementById('roster-pane'), (player) => {
    appState.activePlayerKey = _playerKey(player);
    window.KitCanvas.setPreviewPlayer(player.name, player.number);
    window.FrontCanvas.setPreviewPlayer(player.name, player.number);
    if (appState.activeView === 'composite') _refreshComposite();
    setStatus(`Editing: ${player.name} — ${player.number}`);
  });

  // Assets panel — mounted into its sub-container
  window.AssetsPanel.init(assetsContainer, {
    onCustomPlayer({ name, number }) {
      if (!appState.kitImageUrl) { setStatus('Load a kit image first'); return; }
      appState.activePlayerKey = `${name}|${number}`;
      window.KitCanvas.setPreviewPlayer(name, number);
      window.FrontCanvas.setPreviewPlayer(name, number);
      if (appState.activeView === 'composite') _refreshComposite();
      // Deselect any roster row so there's no stale highlight
      window.RosterGrid.clearSelection();
      setStatus(`Previewing: ${name} — ${number}`);
    },

    async onFrontImageLoad(result) {
      if (result) {
        appState.frontImagePath = result.path;
        const url = await _imageAsSrgbUrl(result.path) || result.url;
        appState.frontImageUrl  = url;
        window.FrontCanvas.loadFrontImage(url);
        setStatus(`Front image loaded: ${result.name}`);
        window.ProfilePanel.markDirty();
      } else {
        appState.frontImagePath = null;
        appState.frontImageUrl  = null;
        setStatus('Front image cleared');
        window.ProfilePanel.markDirty();
      }
    },

    async onImageLoad(result) {
      if (result) {
        appState.kitImagePath = result.path;
        const url = await _imageAsSrgbUrl(result.path) || result.url;
        appState.kitImageUrl  = url;
        window.KitCanvas.loadKitImage(url);
        setStatus(`Kit image loaded: ${result.name}`);
        window.ProfilePanel.markDirty();
      } else {
        appState.kitImagePath = null;
        appState.kitImageUrl  = null;
        document.getElementById('editor-pane').classList.remove('has-image');
        setStatus('Kit image cleared');
        window.ProfilePanel.markDirty();
      }
    },

    onFontLoad(result) {
      if (result) {
        appState.fontPath = result.path;
        appState.fontName = result.name;
        window.KitCanvas.loadFont(result.path, result.name);
        setStatus(`Font loaded: ${result.name}`);
        window.ProfilePanel.markDirty();
      } else {
        appState.fontPath = null;
        appState.fontName = null;
        window.KitCanvas.loadFont(null, null);
        setStatus('Font cleared');
        window.ProfilePanel.markDirty();
      }
    },

    onDigitFolderLoad(result) {
      if (result) {
        appState.digitPaths = result.paths;
        window.KitCanvas.setDigitImages(result.digits);
        window.FrontCanvas.setDigitImages(result.digits);
        setStatus(`Digit PNGs loaded: ${result.folderName}`);
        window.ProfilePanel.markDirty();
      } else {
        appState.digitPaths = null;
        window.KitCanvas.setDigitImages({});
        window.FrontCanvas.setDigitImages({});
        setStatus('Digit PNGs cleared');
        window.ProfilePanel.markDirty();
      }
    },

    onCsvLoad(result) {
      if (!result) {
        appState.csvPath = null;
        appState.roster  = [];
        window.RosterGrid.clearRoster();
        setStatus('Roster cleared');
        return;
      }
      appState.csvPath = result.path;
      appState.roster  = result.rows;
      window.RosterGrid.setRoster(result.rows);
      setStatus(`Roster loaded: ${result.rows.length} players`);
    },
  });
});

function setStatus(text) {
  const el = document.getElementById('status-text');
  if (el) el.textContent = text;
}
