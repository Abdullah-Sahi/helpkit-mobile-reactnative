/**
 * What every test runs with: safe-area-context's own Jest mock (zero insets), and our stand-in for
 * the WebView (src/__tests__/support/webview.tsx), which records its props and gives its ref
 * jest.fn()s. Nothing here needs a device or a simulator.
 */

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

jest.mock('react-native-webview', () => require('./src/__tests__/support/webview'));
