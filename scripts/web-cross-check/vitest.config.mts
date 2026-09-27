/**
 * Runs sdk-script.test.tsx (beside this file) with the help center web app's own Vitest setup,
 * without adding anything to that repository. HELPKIT_WEB is the web app's folder; by default the
 * sibling checkout, ../helpkit-web. Run from inside the web app, so its node_modules are used:
 *
 *     npm run build                       # here: the test imports the built lib/module/bridge.js
 *     cd <helpkit-web>
 *     npx vitest run --config <this repo>/scripts/web-cross-check/vitest.config.mts
 *
 * No imports: Vite bundles a config before loading it, and packages from outside the web app's
 * folder don't resolve there.
 */
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const sdk = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const web = (process.env.HELPKIT_WEB ?? `${sdk}../helpkit-web`).replace(/\\/g, '/');

export default {
  root: web,
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': `${web}/src`,
      'sdk-bridge': `${sdk}lib/module/bridge.js`,
    },
    dedupe: ['react', 'react-dom', '@testing-library/react', 'vitest', 'next'],
  },
  server: { fs: { allow: [web, here, sdk] } },
  test: {
    environment: 'jsdom',
    dir: here,
    include: ['**/*.test.tsx'],
    setupFiles: [`${web}/tests/setup.ts`],
  },
};
