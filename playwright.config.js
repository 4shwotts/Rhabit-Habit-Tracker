// End-to-end tests: real browser (Chromium), real frontend and API, throwaway
// test database. e2e/stack.mjs starts all three on spare ports.
import { defineConfig, devices } from '@playwright/test'

const isCI = !!process.env.CI

export default defineConfig({
  testDir: 'e2e',
  // the journeys share one server (and its rate limits), so run them in order
  workers: 1,
  fullyParallel: false,
  retries: isCI ? 1 : 0,
  forbidOnly: isCI,
  // the penalty journey waits through a 30-second window and penalty
  timeout: 180_000,
  // CI machines are slower, especially Vite's first page load
  expect: { timeout: isCI ? 20_000 : 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5181',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1600, height: 900 }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } } },
    // the closest thing to an iPhone's Safari: it has caught what Chromium let through
    { name: 'webkit', testMatch: /phones\.spec/, use: { ...devices['iPhone 13'] } }
  ],
  webServer: {
    command: 'node e2e/stack.mjs',
    url: 'http://localhost:5181',
    // never reuse a dev server that happens to be running: always our own stack
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe'
  }
})
