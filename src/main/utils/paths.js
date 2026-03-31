/**
 * utils/paths.js — App path helpers
 *
 * Centralises all userData path construction so that the rest of the
 * main process never calls app.getPath() directly.
 *
 * Directory layout under app.getPath('userData'):
 *   profiles/   — saved KitProfile JSON files
 *   fonts/      — stored font file copies (TTF/OTF)
 *   exports/    — default output directory for ZIP archives
 *
 * Also ensures these directories exist on first call (mkdirSync recursive).
 */

'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function getUserDataDir() {
  // TODO: return app.getPath('userData')
}

function getProfilesDir() {
  // TODO: path.join(getUserDataDir(), 'profiles') — ensure exists
}

function getFontsDir() {
  // TODO: path.join(getUserDataDir(), 'fonts') — ensure exists
}

function getExportsDir() {
  // TODO: path.join(getUserDataDir(), 'exports') — ensure exists
}

module.exports = { getUserDataDir, getProfilesDir, getFontsDir, getExportsDir };
