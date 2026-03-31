'use strict';

const { ipcMain, app, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs   = require('fs');

const profilesDir = path.join(app.getPath('userData'), 'profiles');
const fontsDir    = path.join(app.getPath('userData'), 'fonts');

function ensureDirs() {
  fs.mkdirSync(profilesDir, { recursive: true });
  fs.mkdirSync(fontsDir,    { recursive: true });
}

function registerProfileHandlers() {
  ensureDirs();

  ipcMain.handle('profile:get-dirs', () => ({ profilesDir, fontsDir }));

  ipcMain.handle('profile:list', () => {
    const files = fs.readdirSync(profilesDir).filter(f => f.endsWith('.json'));
    return files.map(f => {
      const filePath = path.join(profilesDir, f);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return { name: data.name || f.replace(/\.json$/, ''), path: filePath };
      } catch { return null; }
    }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  });

  ipcMain.handle('profile:load', (_e, profilePath) => {
    return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  });

  ipcMain.handle('profile:save', (_e, profilePath, profile) => {
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf8');
  });

  ipcMain.handle('profile:delete', (_e, profilePath) => {
    fs.unlinkSync(profilePath);
  });

  ipcMain.handle('font-library:list', () => {
    const files = fs.readdirSync(fontsDir).filter(f => /\.(ttf|otf)$/i.test(f));
    return files.map(f => ({ name: f, path: path.join(fontsDir, f) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  ipcMain.handle('font-library:add', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'Add Fonts to Library',
      filters: [{ name: 'Font Files', extensions: ['ttf', 'otf'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled) return [];
    const added = [];
    for (const src of result.filePaths) {
      const dest = path.join(fontsDir, path.basename(src));
      fs.copyFileSync(src, dest);
      added.push({ name: path.basename(src), path: dest });
    }
    return added;
  });

  ipcMain.handle('font-library:delete', (_e, fontPath) => {
    fs.unlinkSync(fontPath);
  });
}

module.exports = { registerProfileHandlers };
