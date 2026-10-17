// Applies any SQL files in db/migrations that haven't run yet, in filename
// order, each inside its own transaction. Applied migrations are recorded in
// schema_migrations so it's safe to run on every start (`npm start` does).
//
// Usage: npm run migrate
const fs = require('fs')
const path = require('path')
const { pool, withTransaction } = require('./index')

const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  // stop two instances starting at once from applying the same migration
  const LOCK_ID = 727472
  const lockClient = await pool.connect()
  try {
    await lockClient.query('SELECT pg_advisory_lock($1)', [LOCK_ID])

    const { rows } = await lockClient.query('SELECT name FROM schema_migrations')
    const applied = new Set(rows.map(r => r.name))

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      if (applied.has(file)) continue
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      await withTransaction(async client => {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      })
      console.log(`Applied migration ${file}`)
    }
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {})
    lockClient.release()
  }
}

migrate()
  .then(() => {
    console.log('Migrations up to date')
    return pool.end()
  })
  .catch(err => {
    console.error('Migration failed:', err.message)
    process.exit(1)
  })
