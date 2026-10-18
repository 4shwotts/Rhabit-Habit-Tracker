-- 002_session_rules: supports server-side enforcement of the daily window.

-- The window length is fixed when the session starts, so changes to today's
-- tasks (e.g. a refresh) can't stretch or shrink a window already running.
ALTER TABLE daily_state
  ADD COLUMN window_seconds INTEGER CHECK (window_seconds > 0);

-- daily_state.goal_id is now the goal today's session belongs to (XP is
-- awarded/deducted there, even if the user switches pathway mid-session).
-- Backfill it from the active goal for existing rows.
UPDATE daily_state ds
SET goal_id = u.active_goal_id
FROM users u
WHERE ds.user_id = u.id AND ds.goal_id IS NULL;
