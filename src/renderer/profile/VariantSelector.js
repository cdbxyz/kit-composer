/**
 * renderer/profile/VariantSelector.js — Home / Away / Third variant tabs
 *
 * A kit profile can store separate settings per shirt variant.
 * This component renders tab buttons for switching between variants.
 *
 * Variants: 'home' | 'away' | 'third'
 *
 * Behaviour:
 *   - Active variant tab is highlighted
 *   - Switching tabs swaps the canvas to the variant's kit image and style settings
 *   - Fires 'profile:variant-changed' CustomEvent with { variant } on switch
 *   - Each variant independently stores: kitImagePath, nameStyle.color, numberStyle.color
 *
 * Public API (window.VariantSelector):
 *   init(containerEl, onVariantChange)
 *   setActiveVariant(variant)
 *   getActiveVariant() → 'home' | 'away' | 'third'
 */

window.VariantSelector = (() => {
  let activeVariant = 'home';

  function init(containerEl, onVariantChange) {
    // TODO: render three tab buttons
    // TODO: wire click handlers to setActiveVariant + onVariantChange callback
  }

  function setActiveVariant(variant) {
    activeVariant = variant;
    // TODO: update active tab styling
    document.dispatchEvent(new CustomEvent('profile:variant-changed', { detail: { variant } }));
  }

  function getActiveVariant() {
    return activeVariant;
  }

  return { init, setActiveVariant, getActiveVariant };
})();
