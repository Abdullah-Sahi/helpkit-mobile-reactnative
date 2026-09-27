const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withMetroConfig } = require('react-native-monorepo-config');

const root = path.resolve(__dirname, '..');

/**
 * The library is this workspace's root. react-native-monorepo-config (what
 * react-native-builder-bob's own Expo example uses) lets Metro find it by name and keeps a single
 * copy of react, react-native and the library's other peers.
 *
 * By default it also adds the `helpkit-rn-source` condition, so the example runs the library's
 * TypeScript source and edits there reload at once. With HELPKIT_EXAMPLE_BUILT=1 it doesn't, and
 * Metro takes the package as an app would: `exports` → the built `lib/module` (run `npm run build`
 * first). docs/development.md uses both. (app.json turns off Expo's tsconfig `paths` in Metro:
 * the root tsconfig's alias is for TypeScript, and would otherwise always pick the source.)
 *
 * @type {import('metro-config').MetroConfig}
 */
module.exports = withMetroConfig(getDefaultConfig(__dirname), {
  root,
  dirname: __dirname,
  conditions: process.env.HELPKIT_EXAMPLE_BUILT === '1' ? [] : ['helpkit-rn-source'],
});
