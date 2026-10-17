// Database access layer.
//
// STAGE 1 (temporary): backed by a local SQLite file, but exposes the same shape
// as node-postgres — `query(sql, params)` returning `{ rows, rowCount }`, with
// Postgres-style `$1, $2…` placeholders. Every route is written against this
// interface, so Stage 2 only has to swap this file for a `pg` Pool.
//
// All SQL must use placeholders. Never build SQL with string concatenation or
// template literals containing user input.
const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'rhabit_dev.db'))
db.pragma('journal_mode = WAL')
// SQLite ignores foreign keys unless this is switched on per connection —
// without it ON DELETE CASCADE (used for account deletion) does nothing.
db.pragma('foreign_keys = ON')

// better-sqlite3 can't bind booleans, Dates or undefined, so normalise them.
function normaliseParam(value) {
  if (value === undefined) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof Date) return value.toISOString()
  return value
}

// Rewrites `$1`-style placeholders into SQLite's positional `?`, reordering the
// parameters to match. `$1` may appear more than once.
function toSqlite(sql, params) {
  const values = []
  const text = sql.replace(/\$(\d+)/g, (_, n) => {
    values.push(normaliseParam(params[parseInt(n, 10) - 1]))
    return '?'
  })
  return [text, values]
}

function runQuery(sql, params = []) {
  const [text, values] = toSqlite(sql, params)
  const stmt = db.prepare(text)
  // `reader` is true for SELECTs and for INSERT/UPDATE/DELETE ... RETURNING
  if (stmt.reader) {
    const rows = stmt.all(...values)
    return { rows, rowCount: rows.length }
  }
  const info = stmt.run(...values)
  return { rows: [], rowCount: info.changes }
}

// SQLite has a single connection, so a transaction must not interleave with
// other requests' queries. Each transaction holds this lock, and plain queries
// wait for it to be released.
let lock = Promise.resolve()

async function query(sql, params) {
  await lock
  return runQuery(sql, params)
}

// Runs `fn(client)` inside a transaction. Use `client.query` (not the top-level
// `query`) for everything inside `fn`, exactly as you would with pg.
function withTransaction(fn) {
  const client = { query: async (sql, params) => runQuery(sql, params) }
  const run = lock.then(async () => {
    db.exec('BEGIN')
    try {
      const result = await fn(client)
      db.exec('COMMIT')
      return result
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  })
  lock = run.catch(() => {})
  return run
}

// Schema: every row of game data belongs to a user and is removed with them.
// daily_tasks.goal_task_id is SET NULL rather than CASCADE so that editing a
// goal's task list mid-day doesn't wipe the tasks already rolled for today.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    token_version INTEGER NOT NULL DEFAULT 0,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    timer_visible INTEGER NOT NULL DEFAULT 1,
    task_refresh INTEGER NOT NULL DEFAULT 0,
    pause_progression INTEGER NOT NULL DEFAULT 0,
    active_goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
    setup_complete INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- one-time tokens for email verification and password reset; only a SHA-256
  -- hash is stored so a database leak doesn't hand out working links
  CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('verify_email', 'reset_password')),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    starred INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- tasks are stored per level so the unlock system can filter by tier
  CREATE TABLE IF NOT EXISTS goal_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    level INTEGER NOT NULL,
    title TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_state (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    goal_id INTEGER,
    started INTEGER NOT NULL DEFAULT 0,
    confirmed INTEGER NOT NULL DEFAULT 0,
    penalty_shown INTEGER NOT NULL DEFAULT 0,
    window_start TEXT,
    last_reset TEXT NOT NULL DEFAULT '1970-01-01'
  );

  -- refreshed column tracks whether the swap button has been used for each task
  CREATE TABLE IF NOT EXISTS daily_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_task_id INTEGER REFERENCES goal_tasks(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    level INTEGER NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    refreshed INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS penalty_state (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    active INTEGER NOT NULL DEFAULT 0,
    task_title TEXT,
    task_difficulty TEXT,
    task_timer_seconds INTEGER,
    started_at TEXT,
    confirmed INTEGER NOT NULL DEFAULT 0
  );

  -- snapshot of daily tasks per goal per day so switching pathways mid-day
  -- and switching back restores the exact same tasks rather than re-rolling
  CREATE TABLE IF NOT EXISTS goal_daily_snapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    goal_task_id INTEGER,
    title TEXT,
    level INTEGER,
    checked INTEGER DEFAULT 0,
    refreshed INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
  CREATE INDEX IF NOT EXISTS idx_goal_tasks_goal ON goal_tasks(goal_id, level);
  CREATE INDEX IF NOT EXISTS idx_daily_tasks_user ON daily_tasks(user_id);
  CREATE INDEX IF NOT EXISTS idx_snapshot_goal_date ON goal_daily_snapshot(goal_id, date);
  CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, type);
`)

module.exports = { query, withTransaction }
