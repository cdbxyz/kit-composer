/**
 * renderer/roster/OverrideEditor.js — Per-player override modal
 *
 * Allows individual roster entries to override specific profile settings:
 *   - Custom name text (e.g. "O'BRIEN" vs CSV value)
 *   - Custom number text
 *   - Font colour override (for special editions)
 *   - Font size scale override
 *
 * Overrides are stored on the player object: player.overrides = { ... }
 * They are shallow-merged with the active profile at render time.
 *
 * Behaviour:
 *   - Opened by clicking a thumbnail in RosterGrid
 *   - Modal overlay with live preview (calls renderPreview with overrides)
 *   - Save → updates roster entry, fires 'roster:player-updated' event
 *   - Cancel → discards changes
 *
 * Public API (window.OverrideEditor):
 *   open(player, profile, onSave)
 *   close()
 */

window.OverrideEditor = (() => {
  function open(player, profile, onSave) {
    // TODO: create modal DOM, populate with player data + override fields
    // TODO: wire live preview button → kitAPI.renderPreview
    // TODO: wire Save/Cancel buttons
  }

  function close() {
    // TODO: remove modal DOM from document
  }

  return { open, close };
})();
