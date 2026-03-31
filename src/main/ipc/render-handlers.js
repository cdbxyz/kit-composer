/**
 * ipc/render-handlers.js — Render pipeline IPC handlers
 *
 * Channels:
 *   export:choose-zip-path  → show save-file dialog, return chosen path or null
 *   export:batch            → convert + ZIP all rendered player images
 */

'use strict';

const { ipcMain, dialog, shell } = require('electron');
const fs           = require('fs');
const path         = require('path');
const { batchExport } = require('../pipeline/exporter');
const { renderToAVIF } = require('../pipeline/composite');

function registerRenderHandlers(mainWindow) {

  // ── Choose where to save the ZIP ──────────────────────────────────────
  ipcMain.handle('export:choose-zip-path', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title:       'Save Export ZIP',
      defaultPath: path.join(require('electron').app.getPath('documents'), 'kit-export.zip'),
      filters:     [{ name: 'ZIP Archive', extensions: ['zip'] }],
    });
    return result.canceled ? null : result.filePath;
  });

  // ── Choose where to save a single AVIF ────────────────────────────────
  ipcMain.handle('export:choose-avif-path', async (_event, suggestedName) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title:       'Save Player Image',
      defaultPath: path.join(require('electron').app.getPath('documents'), suggestedName || 'player.avif'),
      filters:     [{ name: 'AVIF Image', extensions: ['avif'] }],
    });
    return result.canceled ? null : result.filePath;
  });

  // ── Save a single AVIF ─────────────────────────────────────────────────
  ipcMain.handle('export:save-avif', async (_event, { pngDataUrl, outputPath }) => {
    try {
      const avifBuffer = await renderToAVIF(pngDataUrl);
      fs.writeFileSync(outputPath, avifBuffer);
      return { ok: true, filePath: outputPath };
    } catch (err) {
      console.error('[export:save-avif]', err);
      return { ok: false, error: err.message };
    }
  });

  // ── Batch export ───────────────────────────────────────────────────────
  // args: { players: [{filename, pngDataUrl}], outputPath, format, targetSize }
  ipcMain.handle('export:batch', async (event, { players, outputPath, format, targetSize }) => {
    const sender = event.sender;
    const safeSend = (channel, data) => {
      if (!sender.isDestroyed()) sender.send(channel, data);
    };
    try {
      await batchExport({
        players,
        outputPath,
        format:     format     || 'avif',
        targetSize: targetSize || 2048,
        onProgress(current, total) {
          safeSend('export:progress', { current, total });
        },
      });
      safeSend('export:complete', { zipPath: outputPath });
      return { ok: true, zipPath: outputPath };
    } catch (err) {
      console.error('[export:batch]', err);
      return { ok: false, error: err.message };
    }
  });

  // ── Reveal ZIP in system file manager ─────────────────────────────────
  ipcMain.handle('export:reveal', async (_event, filePath) => {
    shell.showItemInFolder(filePath);
  });
}

module.exports = { registerRenderHandlers };
