#!/usr/bin/env node
/**
 * Prints the exact scripts the SDK injects into the help center's page — from the built SDK
 * (lib/module), so what you paste is what an app runs. For the DevTools check in
 * docs/development.md: paste them into the console of a `/_mobile` page in a desktop browser and
 * watch the page react as it would inside the app.
 *
 *     npm run print-injection                                  # builds first; the lane's site "acme"
 *     node scripts/print-injection.mjs http://acme.localhost:3212
 */
import { injectionScript } from '../lib/module/bridge.js';
import { parseOrigin } from '../lib/module/url.js';

const given = process.argv[2] ?? 'http://acme.localhost:3212';
const site = parseOrigin(given);
if (!site) {
  console.error(`Not an http(s) address: ${given}`);
  process.exit(2);
}

const samples = [
  [
    'prefill: fills the contact form’s empty fields, and shows "Sent with your message"',
    {
      type: 'prefill',
      fields: {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        subject: 'Help from the DevTools check',
        metadata: JSON.stringify({ appVersion: '1.0.0', platform: 'ios' }),
      },
    },
  ],
  ['prefill, empty: takes back everything offered', { type: 'prefill', fields: {} }],
  ['up: one step back, or "close" at the first view', { type: 'up' }],
  ['signOut: forgets the draft and what was offered; a reader holding a pass is signed out', { type: 'signOut' }],
];

console.log(`// The page at ${site.origin}/_mobile believes these only while the app's bridge object exists.`);
console.log('// Define it first, so the page\'s messages to the app show in this console:');
console.log('window.ReactNativeWebView = { postMessage: (message) => console.log("to app", message) };');
for (const [what, message] of samples) {
  console.log(`\n// ${what}`);
  console.log(injectionScript(site.origin, message));
}
