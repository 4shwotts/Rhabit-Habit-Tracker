const { query, withTransaction } = require('../db')
const { getTodayInTimezone, rollDailyTasks } = require('../lib/game')

// Runs before every game route (after requireAuth) — checks whether the logged-in
// user's day has rolled over in their timezone and, if so, rolls new tasks and
// clears yesterday's daily/penalty state. Only touches req.user's rows.
async function checkDailyReset(req, res, next) {
  const user = req.user
  if (!user || user.pause_progression) return next()

  const { rows } = await query('SELECT last_reset FROM daily_state WHERE user_id = $1', [user.id])
  const state = rows[0]
  if (!state) return next()

  const today = getTodayInTimezone(user.timezone)
  if (state.last_reset === today) return next()

  await withTransaction(async client => {
    // re-check inside the transaction so two simultaneous requests don't both reset
    const { rows: fresh } = await client.query(
      'SELECT last_reset FROM daily_state WHERE user_id = $1', [user.id]
    )
    if (fresh[0]?.last_reset === today) return

    const { rows: goals } = await client.query(
      'SELECT * FROM goals WHERE id = $1 AND user_id = $2', [user.active_goal_id, user.id]
    )
    await rollDailyTasks(client, user.id, goals[0])

    await client.query(
      `UPDATE daily_state SET
         started = FALSE, confirmed = FALSE, penalty_shown = FALSE, window_start = NULL, last_reset = $1
       WHERE user_id = $2`,
      [today, user.id]
    )
    await client.query(
      `UPDATE penalty_state SET
         active = FALSE, task_title = NULL, task_difficulty = NULL,
         task_timer_seconds = NULL, started_at = NULL, confirmed = FALSE
       WHERE user_id = $1`,
      [user.id]
    )
  })

  next()
}

module.exports = { checkDailyReset }
