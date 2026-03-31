/**
 * pipeline/exporter.js — Batch AVIF exporter + ZIP packer
 *
 * Accepts an array of pre-rendered PNG data URLs from the renderer,
 * converts each to 2048×2048 AVIF via composite.js, and streams all
 * files into a single ZIP archive saved to outputPath.
 *
 * @param {object}   opts
 * @param {Array<{filename:string, pngDataUrl:string}>} opts.players
 * @param {string}   opts.outputPath   — absolute path for the output .zip
 * @param {function} [opts.onProgress] — (current, total) => void
 * @returns {Promise<string>}          — resolves with outputPath when ZIP is closed
 */

'use strict';

const archiver = require('archiver');
const fs       = require('fs');
const { renderToFormat } = require('./composite');

/**
 * Convert and ZIP all rendered player images.
 *
 * @param {object} opts
 * @param {Array<{filename:string, pngDataUrl:string}>} opts.players
 * @param {string}   opts.outputPath
 * @param {'avif'|'png'} [opts.format='avif']
 * @param {number}   [opts.targetSize=2048]
 * @param {function} [opts.onProgress]
 */
async function batchExport({ players, outputPath, format = 'avif', targetSize = 2048, onProgress = () => {} }) {
  const output  = fs.createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 6 } });

  const streamDone = new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });

  archive.pipe(output);

  for (let i = 0; i < players.length; i++) {
    const { filename, pngDataUrl } = players[i];
    const buffer = await renderToFormat(pngDataUrl, format, targetSize);
    archive.append(buffer, { name: filename });
    onProgress(i + 1, players.length);
  }

  archive.finalize();
  await streamDone;

  return outputPath;
}

module.exports = { batchExport };
