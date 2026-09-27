#!/usr/bin/env node
/**
 * Reads the source map of an `expo export --source-maps` of the example app and says what Metro
 * put in the bundle: the SDK's files (its TypeScript source, or the built lib/module), and how many
 * copies of react, react-native and the two native libraries — which must be one each.
 *
 *     npm run build                                            # only for the built check
 *     npm run -w helpkit-react-native-example export:ios        # or export:android
 *     node scripts/check-bundle.mjs example/dist/ios example/dist/android
 *
 * Exits non-zero when a package appears twice, or the SDK isn't in the bundle at all.
 */
import fs from 'node:fs';
import path from 'node:path';

const SHARED = ['react', 'react-native', 'react-native-webview', 'react-native-safe-area-context'];

function findMap(dir) {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.endsWith('.map')) return full;
    }
  }
  return null;
}

let failed = false;
const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('Usage: node scripts/check-bundle.mjs <export dir> [more export dirs]');
  process.exit(2);
}

for (const dir of dirs) {
  const file = fs.existsSync(dir) ? findMap(dir) : null;
  if (!file) {
    console.error(`${dir}: no source map (export with --source-maps)`);
    failed = true;
    continue;
  }
  // Metro writes each source relative to the server root, which is this repository.
  const sources = JSON.parse(fs.readFileSync(file, 'utf8')).sources.map((s) => s.replace(/\\/g, '/'));
  const fromSource = sources.filter((s) => s.startsWith('/src/'));
  const fromBuild = sources.filter((s) => s.startsWith('/lib/module/'));
  console.log(`${dir}`);
  console.log(`  the SDK: ${fromSource.length} source files, ${fromBuild.length} built files`);
  if (fromSource.length + fromBuild.length === 0) failed = true;
  for (const pkg of SHARED) {
    const copies = [...new Set(sources.filter((s) => s.includes(`node_modules/${pkg}/`)).map((s) => s.split(`node_modules/${pkg}/`)[0] || '/'))];
    console.log(`  ${pkg}: ${copies.length} ${copies.length === 1 ? 'copy' : 'copies'} (${copies.join(', ')})`);
    if (copies.length !== 1) failed = true;
  }
}

process.exit(failed ? 1 : 0);
