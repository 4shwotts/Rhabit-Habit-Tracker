-- 004_pending_xp_loss: remembers XP lost while the player wasn't watching (for
-- example a day settled at midnight after they closed the site), so the next
-- visit can show the message and animate the bar. Cleared once it has been shown.
ALTER TABLE daily_state
  ADD COLUMN pending_xp_loss INTEGER NOT NULL DEFAULT 0 CHECK (pending_xp_loss >= 0),
  ADD COLUMN pending_loss_reason TEXT CHECK (pending_loss_reason IN ('late', 'penalty', 'missed_day'));
