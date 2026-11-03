import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // sets a safe test environment before any server code loads
    setupFiles: ['tests/setup-env.js'],
    coverage: {
      provider: 'v8',
      include: ['app.js', 'config.js', 'db/**/*.js', 'lib/**/*.js', 'middleware/**/*.js', 'routes/**/*.js'],
      reporter: ['text', 'html', 'json-summary'],
    },
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.mjs'] },
      },
      {
        extends: true,
        test: {
          name: 'api',
          include: ['tests/api/**/*.test.mjs'],
          // starts the test database and runs the migrations
          globalSetup: ['tests/api/global-setup.mjs'],
          // the files share one database, so they run one at a time
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
