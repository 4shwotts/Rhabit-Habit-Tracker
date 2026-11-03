import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'server/coverage', 'playwright-report', 'test-results']),
  // the React frontend (browser code, ES modules)
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // build and tooling config at the repo root (Node, ES modules)
  {
    files: ['*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  // end-to-end tests and their test stack (Node, ES modules)
  {
    files: ['e2e/**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  // the Express API (Node, CommonJS)
  {
    files: ['server/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs',
    },
    // `const { maxAge, ...rest } = opts` is how a field is dropped on purpose
    rules: { 'no-unused-vars': ['error', { ignoreRestSiblings: true }] },
  },
  // the tests and the Vitest config (Node, ES modules)
  {
    files: ['server/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
])
