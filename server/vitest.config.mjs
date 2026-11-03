import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.mjs'],
    // sets a safe test environment before any server code loads
    setupFiles: ['tests/setup-env.js'],
    coverage: {
      provider: 'v8',
      include: ['app.js', 'config.js', 'db/**/*.js', 'lib/**/*.js', 'middleware/**/*.js', 'routes/**/*.js'],
      reporter: ['text', 'html', 'json-summary'],
    },
  },
})
