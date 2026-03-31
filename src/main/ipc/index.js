'use strict';

const { registerFileHandlers }    = require('./file-handlers');
const { registerRenderHandlers }  = require('./render-handlers');
const { registerProfileHandlers } = require('./profile-handlers');

function registerAllHandlers(mainWindow) {
  registerFileHandlers();
  registerRenderHandlers(mainWindow);
  registerProfileHandlers();
}

module.exports = { registerAllHandlers };
