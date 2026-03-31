/**
 * pipeline/composite.js — Per-player image compositor
 *
 * Receives a PNG data URL captured from the renderer's Konva stage,
 * decodes it, resizes/letterboxes it to targetSize × targetSize via
 * Sharp, and encodes the result as AVIF.
 *
 * The renderer captures the full Konva stage (kit image + text layers)
 * at ≥3× scale, so this step only needs to handle resize + encode.
 *
 * @param {string} pngDataUrl   — "data:image/png;base64,…" from renderer
 * @param {number} [targetSize] — output width & height in px (default 2048)
 * @returns {Promise<Buffer>}   — AVIF-encoded image buffer
 */

'use strict';

/**
 * Resize a PNG data URL to targetSize×targetSize and encode as AVIF or PNG.
 *
 * @param {string} pngDataUrl
 * @param {'avif'|'png'} [format='avif']
 * @param {number} [targetSize=2048]
 * @returns {Promise<Buffer>}
 */
async function renderToFormat(pngDataUrl, format = 'avif', targetSize = 2048) {
  const sharp = require('sharp');
  const base64    = pngDataUrl.replace(/^data:image\/[^;]+;base64,/, '');
  const pngBuffer = Buffer.from(base64, 'base64');

  // withMetadata({ icc: 'srgb' }) embeds a standard sRGB ICC profile in the
  // output. Konva's canvas-to-PNG capture does not embed an ICC profile, so
  // plain withMetadata() has nothing to preserve. Explicitly tagging the output
  // as sRGB prevents colour-managed viewers from mis-interpreting the colour
  // space and rendering the image as dull/desaturated.
  const resized = sharp(pngBuffer)
    .withMetadata({ icc: 'srgb' })
    .resize(targetSize, targetSize, {
      fit: 'inside',
      withoutEnlargement: false,
    });

  return format === 'png'
    ? resized.png({ compressionLevel: 8 }).toBuffer()
    : resized.avif({ quality: 80, effort: 4 }).toBuffer();
}

// Keep existing export for compatibility
async function renderToAVIF(pngDataUrl, targetSize = 2048) {
  return renderToFormat(pngDataUrl, 'avif', targetSize);
}

module.exports = { renderToAVIF, renderToFormat };
