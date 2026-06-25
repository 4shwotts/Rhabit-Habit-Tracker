const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'rhabit.db'))

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY DEFAULT 1,
      username TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      timer_visible INTEGER NOT NULL DEFAULT 1,
      task_refresh INTEGER NOT NULL DEFAULT 0,
      pause_progression INTEGER NOT NULL DEFAULT 0,
      active_goal_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      starred INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- tasks are stored per level so the unlock system can filter by tier
    CREATE TABLE IF NOT EXISTS goal_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL,
      level INTEGER NOT NULL,
      title TEXT NOT NULL,
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
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
      goal_task_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      level INTEGER NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0,
      refreshed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (goal_task_id) REFERENCES goal_tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS penalty_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
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
      goal_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      goal_task_id INTEGER,
      title TEXT,
      level INTEGER,
      checked INTEGER DEFAULT 0,
      refreshed INTEGER DEFAULT 0
    );
  `)
}

module.exports = { db, initDB }