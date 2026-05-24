// Metro config for the Kirei Expo app.
//
// This app lives inside the larger Invoicer repo (the Next.js web app), which
// has its OWN node_modules containing a different React version. Without this,
// Metro's hierarchical lookup can resolve the web app's React and crash the
// bundle with a duplicate-React error. We extend Expo's default config and pin
// module resolution to this folder's node_modules only.
//
// (EAS cloud builds install fresh from mobile/package.json in isolation, so
// this mainly protects local `expo start`, but keeping it explicit avoids
// surprises and satisfies expo-doctor's metro check.)

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Prefer this folder's node_modules first (so the web app's React up the tree
// is never resolved). We intentionally leave hierarchical lookup on its
// default so expo-doctor stays happy; nodeModulesPaths priority is enough.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

module.exports = config;
