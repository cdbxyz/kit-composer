/**
 * preload/preload.js — Context bridge (renderer ↔ main)
 *
 * Exposes a secure, typed API surface on window.kitAPI.
 * Nothing in the renderer can call Node/Electron APIs directly.
 * All cross-boundary communication goes through this bridge.
 *
 * window.kitAPI shape:
 *
 *   // File I/O
 *   openImage()                          → Promise<{ path: string, buffer: Uint8Array }>
 *   openFont()                           → Promise<{ path: string, buffer: Uint8Array }>
 *   openCSV()                            → Promise<{ path: string }>
 *   selectOutputDir()                    → Promise<string>
 *
 *   // Kit profile persistence
 *   listProfiles()                       → Promise<{ name, path, updatedAt }[]>
 *   loadProfile(profilePath)             → Promise<KitProfile>
 *   saveProfile(profilePath, profile)    → Promise<void>
 *   deleteProfile(profilePath)           → Promise<void>
 *
 *   // CSV parsing
 *   parseRoster(csvPath)                 → Promise<{ name, number }[]>
 *
 *   // Render pipeline
 *   renderPreview(player, profile)       → Promise<Uint8Array>  (PNG thumbnail)
 *   batchExport(roster, profile, opts)   → Promise<{ zipPath: string }>
 *
 *   // Progress events (main → renderer push)
 *   onExportProgress(cb)                 → () => void  (unsubscribe fn)
 *   onExportComplete(cb)                 → () => void  (unsubscribe fn)
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kitAPI', {
  // --- File I/O ---
  openImage:       () => ipcRenderer.invoke('file:open-image'),
  openFont:        () => ipcRenderer.invoke('file:open-font'),
  openCSV:         () => ipcRenderer.invoke('file:open-csv'),
  selectOutputDir: () => ipcRenderer.invoke('file:select-dir'),

  // --- Kit profile ---
  listProfiles:   ()                      => ipcRenderer.invoke('profile:list'),
  loadProfile:    (profilePath)           => ipcRenderer.invoke('profile:load', profilePath),
  saveProfile:    (profilePath, profile)  => ipcRenderer.invoke('profile:save', profilePath, profile),
  deleteProfile:  (profilePath)           => ipcRenderer.invoke('profile:delete', profilePath),

  // --- CSV ---
  parseRoster: (csvPath) => ipcRenderer.invoke('file:parse-csv', csvPath),

  // --- Export ---
  chooseZipPath: () =>
    ipcRenderer.invoke('export:choose-zip-path'),

  chooseAvifPath: (suggestedName) =>
    ipcRenderer.invoke('export:choose-avif-path', suggestedName),

  saveAvif: ({ pngDataUrl, outputPath }) =>
    ipcRenderer.invoke('export:save-avif', { pngDataUrl, outputPath }),

  batchExport: ({ players, outputPath, format, targetSize }) =>
    ipcRenderer.invoke('export:batch', { players, outputPath, format, targetSize }),

  revealFile: (filePath) =>
    ipcRenderer.invoke('export:reveal', filePath),

  // --- Profile dirs ---
  getProfileDirs: () => ipcRenderer.invoke('profile:get-dirs'),

  // --- Image colour management ---
  // Converts an image file to sRGB PNG data URL via Sharp so the renderer
  // always receives correctly colour-managed data before it reaches canvas.
  readImageAsSrgb: (filePath) => ipcRenderer.invoke('file:read-image-srgb', filePath),

  // --- Font library ---
  listLibraryFonts:      ()         => ipcRenderer.invoke('font-library:list'),
  addFontToLibrary:      ()         => ipcRenderer.invoke('font-library:add'),
  deleteFontFromLibrary: (fontPath) => ipcRenderer.invoke('font-library:delete', fontPath),

  // --- Progress events (main → renderer push) ---
  onExportProgress: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('export:progress', handler);
    return () => ipcRenderer.removeListener('export:progress', handler);
  },

  onExportComplete: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('export:complete', handler);
    return () => ipcRenderer.removeListener('export:complete', handler);
  },
});
