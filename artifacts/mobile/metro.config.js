const { getDefaultConfig } = require("expo/metro-config");

const path = require("path");

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, "../..");

// Watch shared workspace libraries without including transient workspace folders.
config.watchFolders = [path.join(workspaceRoot, "lib")];

module.exports = config;
