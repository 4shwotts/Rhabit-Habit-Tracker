// Proves the test setup can never reach the real database: hosted database
// URLs are refused, DATABASE_URL is ignored, and server/.env is never read.
// Each check runs in its own Node process, as the real setup would.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const serverDir = fileURLToPath(new URL('../..', import.meta.url))
const NEON_URL = 'postgres://owner:s3cret@ep-quiet-wave-123456.eu-west-2.aws.neon.tech/neondb?sslmode=require'

// this process's environment minus anything that would decide the outcome
function cleanEnv(extra) {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^(VITEST|DATABASE_URL$|TEST_DATABASE_URL$|NODE_ENV$|NODE_OPTIONS$)/.test(key)) delete env[key]
  }
  return { ...env, ...extra }
}

function runNode(code, env) {
  const r = spawnSync(process.execPath, ['-e', code], { cwd: serverDir, env: cleanEnv(env), encoding: 'utf8' })
  return { status: r.status, out: r.stdout + r.stderr }
}

describe('test database guard', () => {
  it('refuses a Neon database given as TEST_DATABASE_URL, without printing the password', () => {
    const r = runNode("require('./tests/setup-env.js')", { TEST_DATABASE_URL: NEON_URL })
    expect(r.status).not.toBe(0)
    expect(r.out).toContain('Refusing to run tests against a hosted database')
    expect(r.out).not.toContain('s3cret')
  })

  it('ignores a Neon DATABASE_URL and points the server at the local test database', () => {
    const r = runNode(
      "require('./tests/setup-env.js'); console.log('URL=' + process.env.DATABASE_URL)",
      { DATABASE_URL: NEON_URL }
    )
    expect(r.status).toBe(0)
    expect(r.out).toContain('URL=postgres://postgres:postgres@localhost:5434/rhabit_test')
    expect(r.out).not.toContain('neon.tech')
  })

  it('stops a whole Vitest run before any test starts', () => {
    const vitest = path.join(serverDir, 'node_modules', 'vitest', 'vitest.mjs')
    const r = spawnSync(process.execPath, [vitest, 'run', 'tests/unit/game.test.mjs'], {
      cwd: serverDir, env: cleanEnv({ TEST_DATABASE_URL: NEON_URL }), encoding: 'utf8', timeout: 60000
    })
    expect(r.status).not.toBe(0)
    expect(r.stdout + r.stderr).toContain('Refusing to run tests against a hosted database')
    expect(r.stdout + r.stderr).not.toMatch(/Tests\s+\d+ passed/)
  })
})

describe('test-only routes', () => {
  // starts the real app in its own process (from a folder with no .env) and
  // asks for a test route
  function statusOfTestRoute(env) {
    const appPath = JSON.stringify(path.join(serverDir, 'app.js'))
    const code = `
      const app = require(${appPath})
      const server = app.listen(0, async () => {
        const res = await fetch('http://127.0.0.1:' + server.address().port + '/api/test/emails?to=a@b.com')
        console.log('STATUS=' + res.status)
        process.exit(0)
      })`
    const r = spawnSync(process.execPath, ['-e', code], {
      cwd: os.tmpdir(), env: cleanEnv({ DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none', ...env }), encoding: 'utf8'
    })
    return r.stdout.match(/STATUS=(\d+)/)?.[1]
  }

  it.each([
    ['development', { NODE_ENV: 'development' }],
    ['production', {
      NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), TOTP_ENCRYPTION_KEY: 'y'.repeat(40),
      BREVO_API_KEY: 'not-used', EMAIL_FROM: 'noreply@rhabit-tests.com'
    }]
  ])('do not exist in %s', (_, env) => {
    expect(statusOfTestRoute(env)).toBe('404')
  })
})

describe('server/.env', () => {
  it('is never read when NODE_ENV=test', () => {
    // with no DATABASE_URL set, config.js only succeeds if it found one in .env
    const r = runNode("require('./config')", { NODE_ENV: 'test' })
    expect(r.status).not.toBe(0)
    expect(r.out).toContain('Missing required environment variable: DATABASE_URL')
    expect(r.out).not.toContain('injected env')
  })
})
