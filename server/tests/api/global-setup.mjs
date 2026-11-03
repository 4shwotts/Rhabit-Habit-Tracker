// Runs once before the API tests: provides an empty test database with every
// migration applied, and removes it afterwards.
//
// - TEST_DATABASE_URL set (CI uses a Postgres service): that database is used.
// - Otherwise (e.g. on Windows with nothing installed): a throwaway Postgres is
//   started with embedded-postgres in a temporary folder and deleted at the end.
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const serverDir = fileURLToPath(new URL('../..', import.meta.url))

// Deletes data folders left by earlier runs that crashed, i.e. whose test
// process (the number in the folder name) is no longer running.
function removeStaleFolders() {
  for (const name of fs.readdirSync(os.tmpdir())) {
    const pid = Number(name.match(/^rhabit-test-pg-(\d+)$/)?.[1])
    if (!pid || pid === process.pid) continue
    try {
      process.kill(pid, 0) // still running: leave it alone
    } catch {
      fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true })
    }
  }
}

export default async function setup() {
  // same environment and hosted-database guard as every test file
  require('../setup-env.js')

  let pg = null
  if (!process.env.TEST_DATABASE_URL) {
    const { default: EmbeddedPostgres } = await import('embedded-postgres')
    const { port } = new URL(process.env.DATABASE_URL)
    removeStaleFolders()
    pg = new EmbeddedPostgres({
      databaseDir: path.join(os.tmpdir(), `rhabit-test-pg-${process.pid}`),
      user: 'postgres',
      password: 'postgres',
      port: Number(port),
      persistent: false, // the folder is deleted when it stops
      onLog: () => {}
    })
    await pg.initialise()
    try {
      await pg.start()
    } catch (err) {
      throw new Error(`Could not start the test database on port ${port} (is something else using it?): ${err.message}`, { cause: err })
    }
    await pg.createDatabase('rhabit_test')

    // stopping the run early (Ctrl+C) skips the normal teardown, which would
    // leave Postgres running on the port; stop it first
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      process.once(signal, () => pg.stop().finally(() => process.exit(130)))
    }
  }

  // the real migration script, in its own process, against the test database
  execFileSync(process.execPath, ['db/migrate.js'], { cwd: serverDir, env: process.env, stdio: 'pipe' })

  return async () => {
    if (pg) await pg.stop()
  }
}
