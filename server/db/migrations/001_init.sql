-- 001_init: multi-user schema for Rhabit on Postgres (Neon).
--
-- Every row of game data carries a user_id that references users(id) with
-- ON DELETE CASCADE, so deleting a user removes all of their data in one go.
-- CHECK constraints mirror the API's validation as a second line of defence.

CREATE TABLE users (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE CHECK (char_length(email) <= 254 AND email = lower(email)),
  username          TEXT NOT NULL CHECK (char_length(username) BETWEEN 1 AND 30),
  password_hash     TEXT NOT NULL,
  email_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  -- bumped to revoke every existing session (e.g. after a password reset)
  token_version     INTEGER NOT NULL DEFAULT 0,
  timezone          TEXT NOT NULL DEFAULT 'UTC' CHECK (char_length(timezone) <= 64),
  timer_visible     BOOLEAN NOT NULL DEFAULT TRUE,
  task_refresh      BOOLEAN NOT NULL DEFAULT FALSE,
  pause_progression BOOLEAN NOT NULL DEFAULT FALSE,
  active_goal_id    INTEGER,
  setup_complete    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one-time tokens for email verification and password reset; only a SHA-256
-- hash is stored so a database leak doesn't hand out working links
CREATE TABLE auth_tokens (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('verify_email', 'reset_password')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE goals (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  xp          INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level       INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  starred     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- added after goals exists (users <-> goals reference each other).
-- SET NULL: deleting the active goal just leaves the user with no active goal.
ALTER TABLE users
  ADD CONSTRAINT users_active_goal_fk
  FOREIGN KEY (active_goal_id) REFERENCES goals(id) ON DELETE SET NULL;

-- tasks are stored per level so the unlock system can filter by tier
CREATE TABLE goal_tasks (
  id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id  INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  level    INTEGER NOT NULL CHECK (level BETWEEN 1 AND 10),
  title    TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 40)
);

-- one row per user: today's session state
CREATE TABLE daily_state (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  goal_id        INTEGER REFERENCES goals(id) ON DELETE SET NULL,
  started        BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed      BOOLEAN NOT NULL DEFAULT FALSE,
  penalty_shown  BOOLEAN NOT NULL DEFAULT FALSE,
  window_start   TIMESTAMPTZ,
  -- the user's local date of the last reset (their timezone, not UTC)
  last_reset     DATE NOT NULL DEFAULT '1970-01-01'
);

-- today's rolled tasks. goal_task_id is SET NULL rather than CASCADE so that
-- editing a goal's task list mid-day doesn't wipe the tasks already rolled.
-- refreshed tracks whether the swap button has been used for each task.
CREATE TABLE daily_tasks (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_task_id  INTEGER REFERENCES goal_tasks(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  level         INTEGER NOT NULL CHECK (level BETWEEN 1 AND 10),
  checked       BOOLEAN NOT NULL DEFAULT FALSE,
  refreshed     BOOLEAN NOT NULL DEFAULT FALSE
);

-- one row per user: the current penalty challenge, if any
CREATE TABLE penalty_state (
  user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active              BOOLEAN NOT NULL DEFAULT FALSE,
  task_title          TEXT,
  task_difficulty     TEXT CHECK (task_difficulty IN ('easy', 'hard')),
  task_timer_seconds  INTEGER CHECK (task_timer_seconds > 0),
  started_at          TIMESTAMPTZ,
  confirmed           BOOLEAN NOT NULL DEFAULT FALSE
);

-- snapshot of daily tasks per goal per day so switching pathways mid-day
-- and switching back restores the exact same tasks rather than re-rolling.
-- Old days are pruned by the daily reset.
CREATE TABLE goal_daily_snapshot (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id       INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  goal_task_id  INTEGER,
  title         TEXT,
  level         INTEGER,
  checked       BOOLEAN NOT NULL DEFAULT FALSE,
  refreshed     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_auth_tokens_user ON auth_tokens (user_id, type);
CREATE INDEX idx_goals_user ON goals (user_id);
CREATE INDEX idx_goal_tasks_goal ON goal_tasks (goal_id, level);
CREATE INDEX idx_goal_tasks_user ON goal_tasks (user_id);
CREATE INDEX idx_daily_tasks_user ON daily_tasks (user_id);
CREATE INDEX idx_snapshot_user_goal_date ON goal_daily_snapshot (user_id, goal_id, date);
