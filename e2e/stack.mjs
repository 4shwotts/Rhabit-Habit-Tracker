// Starts everything the end-to-end tests need, on spare ports, and stops it all
// again when Playwright is done. Playwright runs this itself (see
// playwright.config.js); it is never pointed at Neon or the live site.
//
//   database  embedded Postgres on 5435 in a temporary folder (deleted after),
//             or TEST_DATABASE_URL when set (CI uses a Postgres service)
//   API       http://localhost:3011, NODE_ENV=test with the 30-second timers
//   frontend  http://localhost:5181 (Vite), proxying /api to the test API
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const serverDir = path.join(root, 'server')
export const PORTS = { db: 5435, api: 3011, web: 5181 }

const children = []
let pg = null

// Everything the test API needs, set explicitly. NODE_ENV=test means
// server/.env is never read, so nothing can come from the real setup.
function apiEnv(databaseUrl) {
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot, // Windows needs this for networking
    NODE_ENV: 'test',
    TEST_TIMERS: 'true',
    DATABASE_URL: databaseUrl,
    PORT: String(PORTS.api),
    CORS_ORIGINS: `http://localhost:${PORTS.web}`,
    APP_URL: `http://localhost:${PORTS.web}`,
    JWT_SECRET: process.env.E2E_JWT_SECRET || 'e2e-only-jwt-secret-not-used-anywhere-else',
    TOTP_ENCRYPTION_KEY: process.env.E2E_TOTP_KEY || 'e2e-only-totp-key-not-used-anywhere-else',
    BREVO_API_KEY: ''
  }
}

// deletes data folders left by earlier runs that were killed part-way
function removeStaleFolders() {
  for (const name of fs.readdirSync(os.tmpdir())) {
    const pid = Number(name.match(/^rhabit-e2e-pg-(\d+)$/)?.[1])
    if (!pid || pid === process.pid) continue
    try { process.kill(pid, 0) } catch { fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true }) }
  }
}

async function startDatabase() {
  const url = process.env.TEST_DATABASE_URL
  if (url) {
    if (/neon\.tech|render\.com|amazonaws\.com/i.test(url)) throw new Error('Refusing to run end-to-end tests against a hosted database')
    return url
  }
  removeStaleFolders()
  // embedded-postgres is installed in server/, so resolve it from there
  const fromServer = createRequire(path.join(serverDir, 'package.json'))
  const { default: EmbeddedPostgres } = await import(pathToFileURL(fromServer.resolve('embedded-postgres')).href)
  pg = new EmbeddedPostgres({
    databaseDir: path.join(os.tmpdir(), `rhabit-e2e-pg-${process.pid}`),
    user: 'postgres', password: 'postgres', port: PORTS.db, persistent: false, onLog: () => {}
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('rhabit_e2e')
  return `postgres://postgres:postgres@localhost:${PORTS.db}/rhabit_e2e`
}

// runs the real migrations, then empties every table so each run starts clean
function prepareDatabase(env) {
  execFileSync(process.execPath, ['db/migrate.js'], { cwd: serverDir, env, stdio: 'pipe' })
  execFileSync(process.execPath, ['-e', `
    const { pool } = require('./db')
    pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'")
      .then(({ rows }) => pool.query('TRUNCATE ' + rows.map(r => '"' + r.tablename + '"').join(', ') + ' RESTART IDENTITY CASCADE'))
      .then(() => pool.end())`], { cwd: serverDir, env, stdio: 'pipe' })
}

function start(name, args, options) {
  const child = spawn(process.execPath, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', d => process.stdout.write(`[${name}] ${d}`))
  child.stderr.on('data', d => process.stderr.write(`[${name}] ${d}`))
  children.push(child)
  return child
}

async function waitFor(url, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try { if ((await fetch(url)).ok) return } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

let stopping = false
async function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill()
  if (pg) await pg.stop().catch(() => {})
  process.exit(code)
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => stop(0))

try {
  const env = apiEnv(await startDatabase())
  prepareDatabase(env)
  start('api', ['index.js'], { cwd: serverDir, env })
  await waitFor(`http://localhost:${PORTS.api}/api/health`)
  start('web', [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORTS.web), '--strictPort'], {
    cwd: root, env: { ...process.env, API_PROXY_TARGET: `http://localhost:${PORTS.api}` }
  })
  // Playwright watches the frontend URL and starts the tests once it answers
} catch (err) {
  console.error('Could not start the end-to-end test stack:', err)
  await stop(1)
}
