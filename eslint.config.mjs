import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * ESLint's recommended rules, typescript-eslint's, and the two classic rules of hooks. The React
 * Compiler rules that eslint-plugin-react-hooks 7 also offers are left off: this library isn't
 * compiled with it, and the sheet's WebView bridge is imperative on purpose (src/sheet.ts).
 */
export default defineConfig([
  globalIgnores(['lib/', 'node_modules/', 'coverage/', 'example/dist/', 'example/.expo/', 'example/android/', 'example/ios/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'example/**/*.{ts,tsx}'],
    languageOptions: { globals: { __DEV__: 'readonly' } },
  },
  {
    files: ['src/**/__tests__/**', 'jest.setup.ts'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['*.js', 'example/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
]);
