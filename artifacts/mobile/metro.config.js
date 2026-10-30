const { getDefaultConfig } = require("expo/metro-config");

const path = require("path");

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, "../..");

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "@expo/vector-icons") {
    return context.resolveRequest(
      context,
      path.join(__dirname, "components/VectorIcons.web.tsx"),
      platform,
    );
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

// Keep Expo's pnpm workspace folders and add shared source without watching
// transient workspace folders such as .local tool downloads.
config.watchFolders = [
  ...config.watchFolders,
  path.join(workspaceRoot, "lib"),
];

module.exports = config;
