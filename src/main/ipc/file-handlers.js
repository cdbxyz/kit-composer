'use strict';

const { ipcMain, dialog, BrowserWindow } = require('electron');
const path = require('path');
const { parseRosterCSV } = require('../utils/csv-parser');

function getParentWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function registerFileHandlers() {
  ipcMain.handle('file:open-image', async (event) => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(getParentWindow(event), {
        title: 'Select kit image',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'avif', 'webp'] }],
        properties: ['openFile'],
      });
      if (canceled || !filePaths.length) return null;
      return { path: filePaths[0], name: path.basename(filePaths[0]) };
    } catch (err) {
      console.error('file:open-image error:', err);
      return null;
    }
  });

  ipcMain.handle('file:open-font', async (event) => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(getParentWindow(event), {
        title: 'Select font file',
        filters: [{ name: 'Fonts', extensions: ['ttf', 'otf'] }],
        properties: ['openFile'],
      });
      if (canceled || !filePaths.length) return null;
      return { path: filePaths[0], name: path.basename(filePaths[0]) };
    } catch (err) {
      console.error('file:open-font error:', err);
      return null;
    }
  });

  ipcMain.handle('file:open-csv', async (event) => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(getParentWindow(event), {
        title: 'Select roster CSV',
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
        properties: ['openFile'],
      });
      if (canceled || !filePaths.length) return null;
      return { path: filePaths[0], name: path.basename(filePaths[0]) };
    } catch (err) {
      console.error('file:open-csv error:', err);
      return null;
    }
  });

  ipcMain.handle('file:parse-csv', async (_event, filePath) => {
    try {
      return await parseRosterCSV(filePath);
    } catch (err) {
      console.error('file:parse-csv error:', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('file:select-dir', async (event) => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(getParentWindow(event), {
        title: 'Select output folder',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (canceled || !filePaths.length) return null;
      return filePaths[0];
    } catch (err) {
      console.error('file:select-dir error:', err);
      return null;
    }
  });

  ipcMain.handle('file:save', async () => null); // TODO: profile save dialog

  // Convert any image file to a sRGB PNG data URL.
  // Sharp decodes the source image applying its embedded ICC profile and
  // converts pixel values to sRGB, so the renderer always receives correctly
  // colour-managed data regardless of the source colour space.
  ipcMain.handle('file:read-image-srgb', async (_event, filePath) => {
    try {
      const sharp = require('sharp');
      const buffer = await sharp(filePath)
        .toColorspace('srgb')
        .withMetadata({ icc: 'srgb' })
        .png()
        .toBuffer();
      return 'data:image/png;base64,' + buffer.toString('base64');
    } catch (err) {
      console.error('file:read-image-srgb error:', err);
      return null;
    }
  });
}

module.exports = { registerFileHandlers };
