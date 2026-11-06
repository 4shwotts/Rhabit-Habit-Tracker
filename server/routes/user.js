const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { publicUser } = require('./auth')
const { validate, z, idParam, fields } = require('../lib/validate')
const { getTodayInTimezone, getYesterdayInTimezone } = require('../lib/game')

// the logged-in user's profile and settings (never includes the password hash)
router.get('/', (req, res) => {
  res.json(publicUser(req.user))
})

const settingsBody = z.strictObject({
  timer_visible: z.boolean().optional(),
  task_refresh: z.boolean().optional(),
  pause_progression: z.boolean().optional()
})

router.patch('/settings', validate({ body: settingsBody }), async (req, res) => {
  const { timer_visible, task_refresh, pause_progression } = req.body

  // COALESCE means we only update fields that were actually sent
  await query(
    `UPDATE users SET
       timer_visible = COALESCE($1::boolean, timer_visible),
       task_refresh = COALESCE($2::boolean, task_refresh),
       pause_progression = COALESCE($3::boolean, pause_progression)
     WHERE id = $4`,
    [timer_visible ?? null, task_refresh ?? null, pause_progression ?? null, req.user.id]
  )

  // Resuming after a pause: paused days freeze losses, so they don't count as
  // missed, and neither does a day that was never started. A day already
  // started before pausing is still punished at the next reset.
  if (req.user.pause_progression && pause_progression === false) {
    await query(
      `UPDATE daily_state SET
         last_reset = $2::date,
         confirmed = confirmed OR (NOT started AND NOT penalty_shown)
       WHERE user_id = $1 AND last_reset < $3::date`,
      [req.user.id, getYesterdayInTimezone(req.user.timezone), getTodayInTimezone(req.user.timezone)]
    )
  }

  res.json({ success: true })
})

router.patch('/active-goal',
  validate({ body: z.strictObject({ goal_id: idParam }) }),
  async (req, res) => {
    // only allow pointing at a goal this user owns
    const { rowCount } = await query(
      `UPDATE users SET active_goal_id = $1
       WHERE id = $2 AND EXISTS (SELECT 1 FROM goals WHERE id = $1 AND user_id = $2)`,
      [req.body.goal_id, req.user.id]
    )
    if (rowCount === 0) return res.status(404).json({ error: 'Goal not found' })
    res.json({ success: true })
  }
)

router.patch('/username',
  validate({ body: z.strictObject({ username: fields.username }) }),
  async (req, res) => {
    await query('UPDATE users SET username = $1 WHERE id = $2', [req.body.username, req.user.id])
    res.json({ success: true })
  }
)

module.exports = router
