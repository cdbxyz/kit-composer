/**
 * roster/RosterGrid.js — Player list in the right panel
 *
 * Public API (window.RosterGrid):
 *   init(containerEl, onPlayerSelect)
 *   setRoster(roster)     — replace list; roster = { name, number }[]
 *   clearRoster()
 *   getActiveIndex()      → number | null
 */

window.RosterGrid = (() => {
  let _container    = null;
  let _roster       = [];
  let _activeIndex  = null;
  let _onSelect     = null;

  function init(containerEl, onPlayerSelect) {
    _container = containerEl;
    _onSelect  = onPlayerSelect;
    _renderEmpty();

    document.addEventListener('keydown', (e) => {
      if (!_roster.length) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

      // Don't hijack arrow keys when the user is typing in an input
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

      e.preventDefault();

      if (_activeIndex === null) {
        _selectPlayer(e.key === 'ArrowDown' ? 0 : _roster.length - 1);
      } else {
        const next = e.key === 'ArrowDown'
          ? Math.min(_activeIndex + 1, _roster.length - 1)
          : Math.max(_activeIndex - 1, 0);
        if (next !== _activeIndex) _selectPlayer(next);
      }
    });
  }

  function setRoster(roster) {
    _roster      = roster;
    _activeIndex = null;
    _render();
  }

  function clearRoster() {
    _roster      = [];
    _activeIndex = null;
    _renderEmpty();
  }

  function getActiveIndex() {
    return _activeIndex;
  }

  function clearSelection() {
    if (_activeIndex !== null) {
      const prev = _container.querySelector(`[data-index="${_activeIndex}"]`);
      if (prev) prev.classList.remove('is-active');
    }
    _activeIndex = null;
  }

  // ── Private ───────────────────────────────────────────────────────────

  function _renderEmpty() {
    _container.innerHTML = `
      <div class="roster-header">
        <span class="roster-title">Roster</span>
      </div>
      <div class="roster-empty">
        <div class="roster-empty-icon">📋</div>
        <div class="roster-empty-hint">Load a CSV to see players</div>
      </div>`;
  }

  function _render() {
    _container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'roster-header';
    header.innerHTML = `
      <span class="roster-title">Roster</span>
      <span class="roster-count">${_roster.length}</span>`;
    _container.appendChild(header);

    if (_roster.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'roster-empty';
      empty.innerHTML = '<div class="roster-empty-hint">No players in CSV</div>';
      _container.appendChild(empty);
      return;
    }

    // Player list
    const list = document.createElement('ul');
    list.className = 'roster-list';

    _roster.forEach((player, i) => {
      const li = document.createElement('li');
      li.className = 'roster-row';
      li.dataset.index = i;
      li.innerHTML = `
        <span class="roster-num">${_esc(player.number)}</span>
        <span class="roster-name">${_esc(player.name)}</span>`;

      li.addEventListener('click', () => _selectPlayer(i));
      list.appendChild(li);
    });

    _container.appendChild(list);
  }

  function _selectPlayer(index) {
    // Update active styling
    if (_activeIndex !== null) {
      const prev = _container.querySelector(`[data-index="${_activeIndex}"]`);
      if (prev) prev.classList.remove('is-active');
    }
    _activeIndex = index;
    const next = _container.querySelector(`[data-index="${index}"]`);
    if (next) {
      next.classList.add('is-active');
      next.scrollIntoView({ block: 'nearest' });
    }

    if (_onSelect) _onSelect(_roster[index], index);
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  return { init, setRoster, clearRoster, getActiveIndex, clearSelection };
})();
