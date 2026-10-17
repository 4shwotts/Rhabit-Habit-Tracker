const express = require('express')
const router = express.Router()
const { query, withTransaction } = require('../db')
const { getTodayInTimezone, generateTasks, getMinTaskLevel, getMaxTaskLevel } = require('../lib/game')

// Parses a route id; anything that isn't a positive integer can't match a row.
function parseId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

// Loads a goal only if it belongs to the user. Callers return 404 on null so
// another user's goal ids are indistinguishable from ids that don't exist.
async function getOwnedGoal(db, goalId, userId) {
  if (!goalId) return null
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

router.post('/', async (req, res) => {
  const { name } = req.body ?? {}
  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 50) {
    return res.status(400).json({ error: 'Invalid goal name' })
  }
  const { rows } = await query(
    'INSERT INTO goals (user_id, name, created_at) VALUES ($1, $2, $3) RETURNING id',
    [req.user.id, name.trim(), new Date()]
  )
  res.json({ success: true, id: rows[0].id })
})

router.patch('/:id/name', async (req, res) => {
  const { name } = req.body ?? {}
  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 50) {
    return res.status(400).json({ error: 'Invalid goal name' })
  }
  const { rowCount } = await query(
    'UPDATE goals SET name = $1 WHERE id = $2 AND user_id = $3',
    [name.trim(), parseId(req.params.id), req.user.id]
  )
  if (rowCount === 0) return res.status(404).json({ error: 'Goal not found' })
  res.json({ success: true })
})

// Makes this goal the active pathway. Today's tasks for the previous goal are
// snapshotted so switching back later the same day restores them.
router.patch('/:id/star', async (req, res) => {
  const userId = req.user.id
  const id = parseId(req.params.id)
  // use the user's own date so snapshots line up with their daily reset
  const today = getTodayInTimezone(req.user.timezone)

  const found = await withTransaction(async client => {
    const goal = await getOwnedGoal(client, id, userId)
    if (!goal) return false

    const { rows: userRows } = await client.query(
      'SELECT active_goal_id FROM users WHERE id = $1', [userId]
    )
    const previousGoalId = userRows[0]?.active_goal_id

    if (previousGoalId && previousGoalId !== id) {
      const { rows: currentTasks } = await client.query(
        'SELECT * FROM daily_tasks WHERE user_id = $1', [userId]
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

    const { rows: stateRows } = await client.query(
      'SELECT started FROM daily_state WHERE user_id = $1', [userId]
    )

    // only swap today's tasks if the session hasn't been started yet
    if (!stateRows[0]?.started) {
      const { rows: snapshot } = await client.query(
        'SELECT * FROM goal_daily_snapshot WHERE goal_id = $1 AND user_id = $2 AND date = $3',
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
        `UPDATE daily_state SET last_reset = $1, goal_id = $2, started = FALSE, confirmed = FALSE, window_start = NULL
         WHERE user_id = $3`,
        [today, id, userId]
      )
    }
    return true
  })

  if (!found) return res.status(404).json({ error: 'Goal not found' })
  res.json({ success: true })
})

router.patch('/:id/unstar', async (req, res) => {
  const userId = req.user.id
  const id = parseId(req.params.id)
  const { rowCount } = await query(
    'UPDATE goals SET starred = FALSE WHERE id = $1 AND user_id = $2', [id, userId]
  )
  if (rowCount === 0) return res.status(404).json({ error: 'Goal not found' })
  await query('UPDATE users SET active_goal_id = NULL WHERE id = $1', [userId])
  res.json({ success: true })
})

router.delete('/:id', async (req, res) => {
  const { rowCount } = await query(
    'DELETE FROM goals WHERE id = $1 AND user_id = $2', [parseId(req.params.id), req.user.id]
  )
  if (rowCount === 0) return res.status(404).json({ error: 'Goal not found' })
  res.json({ success: true })
})

// replaces the full task list for one level of a goal
router.post('/:id/tasks', async (req, res) => {
  const userId = req.user.id
  const goalId = parseId(req.params.id)
  const { level, tasks } = req.body ?? {}

  if (!Number.isInteger(level) || level < 1 || level > 10) {
    return res.status(400).json({ error: 'Invalid level' })
  }
  if (!Array.isArray(tasks) || tasks.length > 6) {
    return res.status(400).json({ error: 'Invalid task list' })
  }
  const titles = []
  for (const task of tasks) {
    const title = task?.title
    if (typeof title !== 'string' || title.length > 40) {
      return res.status(400).json({ error: 'Task titles must be at most 40 characters' })
    }
    if (title.trim() !== '') titles.push(title.trim())
  }

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

router.delete('/tasks/:taskId', async (req, res) => {
  const { rowCount } = await query(
    'DELETE FROM goal_tasks WHERE id = $1 AND user_id = $2', [parseId(req.params.taskId), req.user.id]
  )
  if (rowCount === 0) return res.status(404).json({ error: 'Task not found' })
  res.json({ success: true })
})

module.exports = router
