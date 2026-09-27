/**
 * Jest, with React Native's own preset (it moved to @react-native/jest-preset in RN 0.86) and a
 * mocked WebView: everything here runs on any machine, with no simulator and no phone.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // A cold transform cache makes the first test to draw React Native's lazily loaded parts slow.
  testTimeout: 20000,
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.{ts,tsx}'],
  modulePathIgnorePatterns: ['<rootDir>/example/', '<rootDir>/lib/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-webview|react-native-safe-area-context)/)',
  ],
};
