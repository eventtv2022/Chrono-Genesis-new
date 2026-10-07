const { getDefaultConfig } = require("expo/metro-config");

const path = require("path");

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, "../..");

// The tutorial content is shared with the web artifact from the workspace root.
config.watchFolders = [workspaceRoot];

module.exports = config;
