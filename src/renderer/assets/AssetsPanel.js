/**
 * assets/AssetsPanel.js — Left panel with asset drop zones
 *
 * Click-to-browse uses a hidden <input type="file"> triggered directly from
 * the user's click event. This is more reliable than IPC dialogs in Electron
 * and gives us File.path (Electron's extension) the same as drag-and-drop.
 */

window.AssetsPanel = (() => {
  // Prevent Electron from navigating away when a file is dropped outside a zone
  function _preventGlobalDrop() {
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop',     (e) => e.preventDefault());
  }

  function _ext(filename) {
    return filename.split('.').pop().toLowerCase();
  }

  // Read a CSV File object and return [{ name, number }].
  // Handles UTF-8 BOM, optional header row, and whitespace trimming.
  async function _parseCSV(file) {
    let text = await file.text();

    // Strip UTF-8 BOM (Excel exports)
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];

    // Split a CSV line respecting quoted fields
    function splitLine(line) {
      const cols = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; }
        else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
        else { cur += c; }
      }
      cols.push(cur.trim());
      return cols;
    }

    const firstCols = splitLine(lines[0]).map(c => c.toLowerCase());
    const hasHeader = firstCols.includes('name') || firstCols.includes('number');

    const dataLines = hasHeader ? lines.slice(1) : lines;

    if (hasHeader) {
      const pidIdx  = firstCols.indexOf('productid');
      const nameIdx = firstCols.indexOf('name');
      const numIdx  = firstCols.indexOf('number');
      return dataLines
        .map(line => {
          const cols = splitLine(line);
          return {
            productId: pidIdx  >= 0 ? (cols[pidIdx]  || '') : '',
            name:      nameIdx >= 0 ? (cols[nameIdx] || '') : '',
            number:    numIdx  >= 0 ? (cols[numIdx]  || '') : '',
          };
        })
        .filter(r => r.name || r.number);
    }

    // Headerless: 3-column = productId, name, number; 2-column = name, number
    const sampleCols = splitLine(lines[0]);
    const hasProductId = sampleCols.length >= 3;

    return dataLines
      .map(line => {
        const cols = splitLine(line);
        return hasProductId
          ? { productId: cols[0] || '', name: cols[1] || '', number: cols[2] || '' }
          : { productId: '',           name: cols[0] || '', number: cols[1] || '' };
      })
      .filter(r => r.name || r.number);
  }

  function _setLoaded(zoneEl, filename, thumbUrl) {
    zoneEl.classList.remove('asset-zone--idle');
    zoneEl.classList.add('asset-zone--loaded');
    zoneEl.querySelector('.az-filename').textContent = filename;

    const thumb = zoneEl.querySelector('.az-thumb');
    if (thumb && thumbUrl) thumb.src = thumbUrl;
  }

  function _clearZone(zoneEl) {
    const thumb = zoneEl.querySelector('.az-thumb');
    if (thumb && thumb.src.startsWith('blob:')) {
      URL.revokeObjectURL(thumb.src);
      thumb.src = '';
    }
    zoneEl.classList.remove('asset-zone--loaded');
    zoneEl.classList.add('asset-zone--idle');
    zoneEl.querySelector('.az-filename').textContent = '';
  }

  function _buildZoneHTML(showThumb, fileIconLabel) {
    const thumbMarkup = showThumb
      ? '<img class="az-thumb" src="" alt="Kit preview" />'
      : '';
    const iconMarkup = fileIconLabel
      ? `<span class="az-file-icon">${fileIconLabel}</span>`
      : '';

    return `
      <div class="az-idle">
        <div class="az-idle-icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 3v10M6 7l4-4 4 4" stroke="currentColor" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3 14v1a2 2 0 002 2h10a2 2 0 002-2v-1" stroke="currentColor"
                  stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="az-idle-hint">Drop or click to browse</div>
      </div>
      <div class="az-loaded">
        ${thumbMarkup}
        <div class="az-file-row">
          ${iconMarkup}
          <span class="az-filename"></span>
          <button class="az-clear" title="Remove">×</button>
        </div>
      </div>
    `;
  }

  function _createZone({ label, accept, showThumb, fileIconLabel, onLoad }) {
    const section = document.createElement('div');
    section.className = 'asset-section';

    const labelEl = document.createElement('div');
    labelEl.className = 'asset-label';
    labelEl.textContent = label;
    section.appendChild(labelEl);

    const zoneEl = document.createElement('div');
    zoneEl.className = 'asset-zone asset-zone--idle';
    zoneEl.innerHTML = _buildZoneHTML(showThumb, fileIconLabel);
    section.appendChild(zoneEl);

    // Hidden file input — triggered by zone click, avoids IPC dialog issues
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = accept.map(ext => '.' + ext).join(',');
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    async function _handleFile(file) {
      if (!file) return;
      if (!accept.includes(_ext(file.name))) {
        zoneEl.classList.add('is-error');
        setTimeout(() => zoneEl.classList.remove('is-error'), 600);
        return;
      }
      const thumbUrl = showThumb ? URL.createObjectURL(file) : null;
      _setLoaded(zoneEl, file.name, thumbUrl);

      // For CSV: read and parse in the renderer so we never need an IPC round-trip
      if (_ext(file.name) === 'csv') {
        const rows = await _parseCSV(file);
        onLoad({ path: file.path, name: file.name, rows });
      } else {
        onLoad({ path: file.path, name: file.name, url: thumbUrl });
      }
    }

    // ── File input change ──
    fileInput.addEventListener('change', () => {
      _handleFile(fileInput.files[0]);
      fileInput.value = ''; // reset so same file can be re-selected
    });

    // ── Drag over ──
    zoneEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoneEl.classList.add('is-drag-over');
    });

    zoneEl.addEventListener('dragleave', (e) => {
      if (!zoneEl.contains(e.relatedTarget)) {
        zoneEl.classList.remove('is-drag-over');
      }
    });

    // ── Drop ──
    zoneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoneEl.classList.remove('is-drag-over');
      _handleFile(e.dataTransfer.files[0]);
    });

    // ── Click to browse ──
    zoneEl.addEventListener('click', (e) => {
      if (e.target.closest('.az-clear')) return;
      fileInput.click();
    });

    // ── Clear ──
    zoneEl.querySelector('.az-clear').addEventListener('click', (e) => {
      e.stopPropagation();
      _clearZone(zoneEl);
      onLoad(null);
    });

    return section;
  }

  // ── Digit folder zone ─────────────────────────────────────────────────
  // Accepts a folder containing 0.png–9.png via click (webkitdirectory) or
  // drag-drop of a folder / multiple PNGs.
  function _createDigitZone(onLoad) {
    const REQUIRED = ['0','1','2','3','4','5','6','7','8','9'];

    const section = document.createElement('div');
    section.className = 'asset-section';

    const labelEl = document.createElement('div');
    labelEl.className = 'asset-label';
    labelEl.textContent = 'NUMBER DIGITS';
    section.appendChild(labelEl);

    const zoneEl = document.createElement('div');
    zoneEl.className = 'asset-zone asset-zone--idle';
    zoneEl.innerHTML = `
      <div class="az-idle">
        <div class="az-idle-icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 3v10M6 7l4-4 4 4" stroke="currentColor" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3 14v1a2 2 0 002 2h10a2 2 0 002-2v-1" stroke="currentColor"
                  stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="az-idle-hint">Drop folder of 0–9.png</div>
      </div>
      <div class="az-loaded">
        <div class="az-file-row">
          <span class="az-file-icon">0–9</span>
          <span class="az-filename"></span>
          <button class="az-clear" title="Remove">×</button>
        </div>
        <div class="az-digit-grid"></div>
      </div>`;
    section.appendChild(zoneEl);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png';
    fileInput.multiple = true;
    fileInput.setAttribute('webkitdirectory', '');
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    function _processFiles(files) {
      const map = {};
      for (const f of files) {
        const digit = f.name.replace(/\.png$/i, '');
        if (REQUIRED.includes(digit)) map[digit] = f;
      }

      const missing = REQUIRED.filter(d => !map[d]);
      if (missing.length > 0) {
        zoneEl.classList.add('is-error');
        setTimeout(() => zoneEl.classList.remove('is-error'), 800);
        console.warn('KitComposer: missing digit PNGs:', missing.join(', '));
        return;
      }

      const urls  = {};
      const paths = {};
      REQUIRED.forEach(d => {
        urls[d]  = URL.createObjectURL(map[d]);
        paths[d] = map[d].path || null;
      });

      const firstPath  = map['0'].path || '';
      const folderName = firstPath
        ? firstPath.split('/').slice(-2, -1)[0] || 'digits'
        : 'digit set';

      zoneEl.classList.remove('asset-zone--idle');
      zoneEl.classList.add('asset-zone--loaded');
      zoneEl.querySelector('.az-filename').textContent = folderName;

      const grid = zoneEl.querySelector('.az-digit-grid');
      grid.innerHTML = '';
      REQUIRED.forEach(d => {
        const img = document.createElement('img');
        img.src = urls[d];
        img.className = 'az-digit-thumb';
        img.title = d + '.png';
        grid.appendChild(img);
      });

      onLoad({ digits: urls, paths, folderName });
    }

    async function _readDirEntries(dirEntry) {
      return new Promise(resolve => {
        dirEntry.createReader().readEntries(entries => {
          let pending = 0;
          const files = [];
          entries.forEach(e => {
            if (e.isFile && /\.png$/i.test(e.name)) {
              pending++;
              e.file(f => { files.push(f); if (--pending === 0) resolve(files); });
            }
          });
          if (pending === 0) resolve(files);
        });
      });
    }

    fileInput.addEventListener('change', () => {
      _processFiles([...fileInput.files]);
      fileInput.value = '';
    });

    zoneEl.addEventListener('dragover', (e) => {
      e.preventDefault(); e.stopPropagation();
      zoneEl.classList.add('is-drag-over');
    });
    zoneEl.addEventListener('dragleave', (e) => {
      if (!zoneEl.contains(e.relatedTarget)) zoneEl.classList.remove('is-drag-over');
    });
    zoneEl.addEventListener('drop', async (e) => {
      e.preventDefault(); e.stopPropagation();
      zoneEl.classList.remove('is-drag-over');
      const items = [...(e.dataTransfer.items || [])];
      const entry = items[0] && items[0].webkitGetAsEntry && items[0].webkitGetAsEntry();
      if (entry && entry.isDirectory) {
        const files = await _readDirEntries(entry);
        _processFiles(files);
      } else {
        _processFiles([...e.dataTransfer.files]);
      }
    });

    zoneEl.addEventListener('click', (e) => {
      if (e.target.closest('.az-clear')) return;
      fileInput.click();
    });

    zoneEl.querySelector('.az-clear').addEventListener('click', (e) => {
      e.stopPropagation();
      zoneEl.classList.remove('asset-zone--loaded');
      zoneEl.classList.add('asset-zone--idle');
      zoneEl.querySelector('.az-filename').textContent = '';
      zoneEl.querySelector('.az-digit-grid').innerHTML = '';
      onLoad(null);
    });

    return section;
  }

  function _createCustomPlayerSection(onCustomPlayer) {
    const section = document.createElement('div');
    section.className = 'asset-section';

    const labelEl = document.createElement('div');
    labelEl.className = 'asset-label';
    labelEl.textContent = 'CUSTOM PLAYER';
    section.appendChild(labelEl);

    const card = document.createElement('div');
    card.className = 'custom-player-card';
    card.innerHTML = `
      <div class="cp-fields">
        <div class="cp-field">
          <label class="cp-field-label" for="cp-name">Name</label>
          <input class="cp-input" id="cp-name" type="text" placeholder="e.g. KANE" maxlength="24" spellcheck="false">
        </div>
        <div class="cp-field cp-field--narrow">
          <label class="cp-field-label" for="cp-number">No.</label>
          <input class="cp-input" id="cp-number" type="text" placeholder="9" maxlength="4" spellcheck="false">
        </div>
      </div>
      <button class="cp-preview-btn" id="cp-preview">Preview</button>`;
    section.appendChild(card);

    const nameInput   = card.querySelector('#cp-name');
    const numberInput = card.querySelector('#cp-number');
    const previewBtn  = card.querySelector('#cp-preview');

    function _submit() {
      const name   = nameInput.value.trim();
      const number = numberInput.value.trim();
      if (!name && !number) return;
      onCustomPlayer({ name: name || 'PLAYER', number: number || '0' });
    }

    previewBtn.addEventListener('click', _submit);
    [nameInput, numberInput].forEach(input => {
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') _submit(); });
    });

    return section;
  }

  function init(containerEl, { onImageLoad, onFrontImageLoad, onFontLoad, onCsvLoad, onDigitFolderLoad, onCustomPlayer }) {
    _preventGlobalDrop();

    containerEl.innerHTML = '<h2 class="panel-title">Assets</h2>';

    containerEl.appendChild(_createZone({
      label:         'KIT IMAGE (BACK)',
      accept:        ['png', 'jpg', 'jpeg', 'avif', 'webp'],
      showThumb:     true,
      fileIconLabel: null,
      onLoad:        onImageLoad,
    }));

    containerEl.appendChild(_createZone({
      label:         'FRONT IMAGE',
      accept:        ['png', 'jpg', 'jpeg', 'avif', 'webp'],
      showThumb:     true,
      fileIconLabel: null,
      onLoad:        onFrontImageLoad,
    }));

    containerEl.appendChild(_createZone({
      label:         'FONT',
      accept:        ['ttf', 'otf'],
      showThumb:     false,
      fileIconLabel: 'Aa',
      onLoad:        onFontLoad,
    }));

    containerEl.appendChild(_createDigitZone(onDigitFolderLoad));

    containerEl.appendChild(_createZone({
      label:         'ROSTER CSV',
      accept:        ['csv'],
      showThumb:     false,
      fileIconLabel: '⊞',
      onLoad:        onCsvLoad,
    }));

    if (onCustomPlayer) {
      containerEl.appendChild(_createCustomPlayerSection(onCustomPlayer));
    }
  }

  return { init };
})();
