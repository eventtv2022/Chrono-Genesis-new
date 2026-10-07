const { getDefaultConfig } = require("expo/metro-config");

const path = require("path");

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, "../..");

// Keep Expo's pnpm workspace folders and add shared source without watching
// transient workspace folders such as .local tool downloads.
config.watchFolders = [
  ...config.watchFolders,
  path.join(workspaceRoot, "lib"),
];

module.exports = config;
