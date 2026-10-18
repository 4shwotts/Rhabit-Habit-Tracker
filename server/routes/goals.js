const express = require('express')
const router = express.Router()
const { query, withTransaction } = require('../db')
const config = require('../config')
const { validate, z, idParam, fields } = require('../lib/validate')
const { getTodayInTimezone, generateTasks, getMinTaskLevel, getMaxTaskLevel } = require('../lib/game')

const goalIdParams = z.strictObject({ id: idParam })

// Loads a goal only if it belongs to the user. Callers return 404 on null so
// another user's goal ids are indistinguishable from ids that don't exist.
async function getOwnedGoal(db, goalId, userId) {
  const { rows } = await db.query(
    'SELECT * FROM goals WHERE id = $1 AND user_id = $2', [goalId, userId]
  )
  return rows[0] || null
}

router.get('/', async (req, res) => {
  const userId = req.user.id
  const { rows: goals } = await query(
    'SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at ASC, id ASC', [userId]
  )
  const { rows: tasks } = await query(
    'SELECT id, goal_id, level, title FROM goal_tasks WHERE user_id = $1 ORDER BY level ASC, id ASC',
    [userId]
  )

  const result = goals.map(goal => {
    const levelTasks = {}
    for (let l = 1; l <= 10; l++) levelTasks[l] = []
    tasks
      .filter(t => t.goal_id === goal.id)
      .forEach(t => {
        if (levelTasks[t.level]) levelTasks[t.level].push({ id: t.id, title: t.title })
      })
    return { ...goal, levelTasks }
  })
  res.json(result)
})

router.post('/', validate({ body: z.strictObject({ name: fields.goalName }) }), async (req, res) => {
  const userId = req.user.id
  const maxGoals = config.limits.goalsPerUser

  const id = await withTransaction(async client => {
    // lock the user row so parallel requests can't both slip under the cap
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId])
    const { rows: countRows } = await client.query(
      'SELECT count(*)::int AS count FROM goals WHERE user_id = $1', [userId]
    )
    if (countRows[0].count >= maxGoals) return null

    const { rows } = await client.query(
      'INSERT INTO goals (user_id, name) VALUES ($1, $2) RETURNING id',
      [userId, req.body.name]
    )
    return rows[0].id
  })

  if (!id) return res.status(409).json({ error: `You can have at most ${maxGoals} goal pathways` })
  res.json({ success: true, id })
})

router.patch('/:id/name',
  validate({ params: goalIdParams, body: z.strictObject({ name: fields.goalName }) }),
  async (req, res) => {
    const { rowCount } = await query(
      'UPDATE goals SET name = $1 WHERE id = $2 AND user_id = $3',
      [req.body.name, req.params.id, req.user.id]
    )
    if (rowCount === 0) return res.status(404).json({ error: 'Goal not found' })
    res.json({ success: true })
  }
)

// Makes this goal the active pathway. Today's tasks for the previous goal are
// snapshotted so switching back later the same day restores them.
router.patch('/:id/star', validate({ params: goalIdParams }), async (req, res) => {
  const userId = req.user.id
  const id = req.params.id
  // use the user's own date so snapshots line up with their daily reset
  const today = getTodayInTimezone(req.user.timezone)

  const found = await withTransaction(async client => {
    const goal = await getOwnedGoal(client, id, userId)
    if (!goal) return false

    // lock today's state so this can't interleave with a start/confirm
    const { rows: stateRows } = await client.query(
      'SELECT started, confirmed, penalty_shown FROM daily_state WHERE user_id = $1 FOR UPDATE', [userId]
    )
    const state = stateRows[0]

    const { rows: userRows } = await client.query(
      'SELECT active_goal_id FROM users WHERE id = $1', [userId]
    )
    const previousGoalId = userRows[0]?.active_goal_id

    if (previousGoalId && previousGoalId !== id) {
      const { rows: currentTasks } = await client.query(
        'SELECT * FROM daily_tasks WHERE user_id = $1 ORDER BY id ASC', [userId]
      )
      await client.query(
        'DELETE FROM goal_daily_snapshot WHERE goal_id = $1 AND user_id = $2 AND date = $3',
        [previousGoalId, userId, today]
      )
      for (const t of currentTasks) {
        await client.query(
          `INSERT INTO goal_daily_snapshot (user_id, goal_id, date, goal_task_id, title, level, checked, refreshed)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [userId, previousGoalId, today, t.goal_task_id, t.title, t.level, !!t.checked, !!t.refreshed]
        )
      }
    }

    await client.query('UPDATE goals SET starred = FALSE WHERE user_id = $1', [userId])
    await client.query('UPDATE goals SET starred = TRUE WHERE id = $1 AND user_id = $2', [id, userId])
    await client.query('UPDATE users SET active_goal_id = $1 WHERE id = $2', [id, userId])

    // only swap today's tasks if the day hasn't started or been settled —
    // switching pathway must never reopen a finished or penalised day
    if (state && !state.started && !state.confirmed && !state.penalty_shown) {
      const { rows: snapshot } = await client.query(
        'SELECT * FROM goal_daily_snapshot WHERE goal_id = $1 AND user_id = $2 AND date = $3 ORDER BY id ASC',
        [id, userId, today]
      )

      await client.query('DELETE FROM daily_tasks WHERE user_id = $1', [userId])

      if (snapshot.length > 0) {
        for (const t of snapshot) {
          await client.query(
            `INSERT INTO daily_tasks (user_id, goal_task_id, title, level, checked, refreshed)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, t.goal_task_id, t.title, t.level, !!t.checked, !!t.refreshed]
          )
        }
      } else {
        const tasks = await generateTasks(
          client, userId, goal.id, getMinTaskLevel(goal.level), getMaxTaskLevel(goal.level)
        )
        for (const task of tasks) {
          await client.query(
            `INSERT INTO daily_tasks (user_id, goal_task_id, title, level, checked, refreshed)
             VALUES ($1, $2, $3, $4, FALSE, FALSE)`,
            [userId, task.id, task.title, task.level]
          )
        }
      }

      await client.query(
        `UPDATE daily_state SET last_reset = $1, goal_id = $2, window_start = NULL, window_seconds = NULL
         WHERE user_id = $3`,
        [today, id, userId]
      )
    }
    return true
  })

  if (!found) return res.status(404).json({ error: 'Goal not found' })
  res.json({ success: true })
})

router.patch('/:id/unstar', validate({ params: goalIdParams }), async (req, res) => {
  const userId = req.user.id
  const { rowCount } = await query(
    'UPDATE goals SET starred = FALSE WHERE id = $1 AND user_id = $2', [req.params.id, userId]
  )
  if (rowCount === 0) return res.status(404).json({ error: 'Goal not found' })
  await query('UPDATE users SET active_goal_id = NULL WHERE id = $1', [userId])
  res.json({ success: true })
})

router.delete('/:id', validate({ params: goalIdParams }), async (req, res) => {
  const { rowCount } = await query(
    'DELETE FROM goals WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]
  )
  if (rowCount === 0) return res.status(404).json({ error: 'Goal not found' })
  res.json({ success: true })
})

// replaces the full task list for one level of a goal
const saveTasksBody = z.strictObject({
  level: fields.level,
  tasks: z.array(
    // the client sends back { id, title } for existing tasks and { title } for new ones
    z.strictObject({ id: idParam.optional(), title: fields.taskTitle })
  ).max(config.limits.tasksPerLevel, `At most ${config.limits.tasksPerLevel} tasks per level`)
})

router.post('/:id/tasks', validate({ params: goalIdParams, body: saveTasksBody }), async (req, res) => {
  const userId = req.user.id
  const goalId = req.params.id
  const { level, tasks } = req.body
  const titles = tasks.map(t => t.title.trim()).filter(Boolean)

  const found = await withTransaction(async client => {
    if (!await getOwnedGoal(client, goalId, userId)) return false
    await client.query(
      'DELETE FROM goal_tasks WHERE goal_id = $1 AND user_id = $2 AND level = $3',
      [goalId, userId, level]
    )
    for (const title of titles) {
      await client.query(
        'INSERT INTO goal_tasks (user_id, goal_id, level, title) VALUES ($1, $2, $3, $4)',
        [userId, goalId, level, title]
      )
    }
    return true
  })

  if (!found) return res.status(404).json({ error: 'Goal not found' })
  res.json({ success: true })
})

router.delete('/tasks/:taskId',
  validate({ params: z.strictObject({ taskId: idParam }) }),
  async (req, res) => {
    const { rowCount } = await query(
      'DELETE FROM goal_tasks WHERE id = $1 AND user_id = $2', [req.params.taskId, req.user.id]
    )
    if (rowCount === 0) return res.status(404).json({ error: 'Task not found' })
    res.json({ success: true })
  }
)

module.exports = router
