import { VERSION } from '../version';

// The user agent says HelpKitRN/<version>, so the constant must be the package's version.
test('VERSION is package.json’s version', () => {
  const pkg = require('../../package.json') as { version: string };
  expect(VERSION).toBe(pkg.version);
});
