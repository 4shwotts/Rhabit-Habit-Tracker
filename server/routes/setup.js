// First-time setup in a single request. Replaces the old flow of ~13 separate
// calls (create goal, save each level, star, mark complete), which could leave
// a half-made goal behind if one failed and created duplicates on retry.
// Everything here happens in one transaction: it all succeeds or none of it does.
const express = require('express')
const router = express.Router()
const { withTransaction } = require('../db')
const config = require('../config')
const { validate, z, fields } = require('../lib/validate')
const { getTodayInTimezone, rollDailyTasks } = require('../lib/game')

// Levels 1–3 must be filled in before starting (they cover the first few
// level-ups); levels 4–10 are optional and can be added later from Goals.
const REQUIRED_LEVELS = [1, 2, 3]
const MIN_TASKS_PER_REQUIRED_LEVEL = 3

const setupBody = z.strictObject({
  goal_name: fields.goalName,
  levels: z.array(z.strictObject({
    level: fields.level,
    titles: z.array(fields.taskTitle).max(config.limits.tasksPerLevel,
      `At most ${config.limits.tasksPerLevel} tasks per level`)
  })).max(10)
})

router.post('/', validate({ body: setupBody }), async (req, res) => {
  const userId = req.user.id

  // trim, drop blanks, and merge into one list per level
  const tasksByLevel = new Map()
  for (const { level, titles } of req.body.levels) {
    if (tasksByLevel.has(level)) return res.status(400).json({ error: 'Each level may only appear once' })
    tasksByLevel.set(level, titles.map(t => t.trim()).filter(Boolean))
  }
  for (const level of REQUIRED_LEVELS) {
    if ((tasksByLevel.get(level) || []).length < MIN_TASKS_PER_REQUIRED_LEVEL) {
      return res.status(400).json({
        error: `Levels ${REQUIRED_LEVELS[0]}–${REQUIRED_LEVELS.at(-1)} need at least ${MIN_TASKS_PER_REQUIRED_LEVEL} tasks each`
      })
    }
  }

  const result = await withTransaction(async client => {
    // lock the user row: stops a double-clicked Start creating two goals
    const { rows } = await client.query(
      'SELECT setup_complete FROM users WHERE id = $1 FOR UPDATE', [userId]
    )
    if (rows[0]?.setup_complete) return 'already'

    // the per-user goal cap applies here too (goals can exist before setup)
    const { rows: countRows } = await client.query(
      'SELECT count(*)::int AS count FROM goals WHERE user_id = $1', [userId]
    )
    if (countRows[0].count >= config.limits.goalsPerUser) return 'cap'

    const { rows: goalRows } = await client.query(
      'INSERT INTO goals (user_id, name, starred) VALUES ($1, $2, TRUE) RETURNING *',
      [userId, req.body.goal_name]
    )
    const goal = goalRows[0]

    for (const [level, titles] of tasksByLevel) {
      for (const title of titles) {
        await client.query(
          'INSERT INTO goal_tasks (user_id, goal_id, level, title) VALUES ($1, $2, $3, $4)',
          [userId, goal.id, level, title]
        )
      }
    }

    // make it the active pathway and roll today's tasks straight away
    await client.query(
      'UPDATE users SET active_goal_id = $1, setup_complete = TRUE WHERE id = $2', [goal.id, userId]
    )
    await rollDailyTasks(client, userId, goal)
    await client.query(
      `UPDATE daily_state SET
         goal_id = $1, last_reset = $2, started = FALSE, confirmed = FALSE, penalty_shown = FALSE,
         window_start = NULL, window_seconds = NULL
       WHERE user_id = $3`,
      [goal.id, getTodayInTimezone(req.user.timezone), userId]
    )
    return 'created'
  })

  if (result === 'already') return res.status(409).json({ error: 'Setup is already complete' })
  if (result === 'cap') {
    return res.status(409).json({ error: `You can have at most ${config.limits.goalsPerUser} goal pathways` })
  }
  res.json({ success: true })
})

module.exports = router
module.exports.REQUIRED_LEVELS = REQUIRED_LEVELS
module.exports.MIN_TASKS_PER_REQUIRED_LEVEL = MIN_TASKS_PER_REQUIRED_LEVEL
