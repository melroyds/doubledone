// Monorepo Metro config. The repo root is an npm-workspaces monorepo, so deps
// hoist to the root node_modules. Point Metro at both the workspace root (to
// watch it) and both node_modules folders (to resolve hoisted packages).
// https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Honour package.json "exports" maps. @supabase/supabase-js and its subpackages
// (e.g. realtime-js) ship correct paths only via "exports"; their legacy main/
// module fields point at files that do not exist, so without this Metro fails to
// resolve them and the web bundle dies. See the DoubleDone gotchas note.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
