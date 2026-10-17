const express = require('express')
const router = express.Router()
const { query, withTransaction } = require('../db')
const { getRandomPenaltyTask } = require('../data/penaltyTasks')
const {
  XP_PER_TASK, PENALTY_XP, REFRESH_COST, CONFIRM_UNLOCK_BEFORE_END,
  getWindowSeconds, getMaxTaskLevel, getMinTaskLevel, addXp, deductXp
} = require('../lib/game')

function parseId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

// the user's currently active goal, or null (only ever their own)
async function getActiveGoal(db, user) {
  if (!user.active_goal_id) return null
  const { rows } = await db.query(
    'SELECT * FROM goals WHERE id = $1 AND user_id = $2', [user.active_goal_id, user.id]
  )
  return rows[0] || null
}

// window length is driven by the highest level task rolled for today
function windowForTasks(tasks) {
  const taskLevel = tasks.length > 0 ? Math.max(...tasks.map(t => t.level)) : 1
  return getWindowSeconds(taskLevel)
}

router.get('/', async (req, res) => {
  const userId = req.user.id
  const [{ rows: stateRows }, { rows: tasks }, { rows: penaltyRows }] = await Promise.all([
    query('SELECT * FROM daily_state WHERE user_id = $1', [userId]),
    query('SELECT * FROM daily_tasks WHERE user_id = $1 ORDER BY id ASC', [userId]),
    query('SELECT * FROM penalty_state WHERE user_id = $1', [userId])
  ])

  res.json({
    state: stateRows[0] || null,
    tasks,
    penalty: penaltyRows[0] || null,
    windowSeconds: windowForTasks(tasks)
  })
})

// stamp the start time so the countdown is consistent even across page refreshes
router.post('/start', async (req, res) => {
  const now = new Date().toISOString()
  await query(
    'UPDATE daily_state SET started = TRUE, window_start = $1 WHERE user_id = $2',
    [now, req.user.id]
  )
  res.json({ success: true, window_start: now })
})

router.patch('/tasks/:id/check', async (req, res) => {
  const { checked } = req.body ?? {}
  const { rowCount } = await query(
    'UPDATE daily_tasks SET checked = $1 WHERE id = $2 AND user_id = $3',
    [!!checked, parseId(req.params.id), req.user.id]
  )
  if (rowCount === 0) return res.status(404).json({ error: 'Task not found' })
  res.json({ success: true })
})

// confirm unlocks 1 minute before the window ends in demo mode
router.post('/confirm', async (req, res) => {
  const userId = req.user.id

  const result = await withTransaction(async client => {
    const goal = await getActiveGoal(client, req.user)
    if (!goal) return { status: 400, body: { error: 'No active goal' } }

    const { rows: stateRows } = await client.query(
      'SELECT * FROM daily_state WHERE user_id = $1', [userId]
    )
    const state = stateRows[0]
    const { rows: tasks } = await client.query(
      'SELECT * FROM daily_tasks WHERE user_id = $1', [userId]
    )

    const windowSeconds = windowForTasks(tasks)
    const elapsed = (new Date() - new Date(state.window_start)) / 1000
    const remaining = windowSeconds - elapsed

    if (remaining > CONFIRM_UNLOCK_BEFORE_END) {
      return {
        status: 403,
        body: { error: 'Confirm not yet unlocked', unlocks_in: Math.ceil(remaining - CONFIRM_UNLOCK_BEFORE_END) }
      }
    }

    const checkedCount = tasks.filter(t => t.checked).length
    const xpEarned = checkedCount * XP_PER_TASK
    const { xp, level } = addXp(goal.xp, goal.level, xpEarned)

    await client.query(
      'UPDATE goals SET xp = $1, level = $2 WHERE id = $3 AND user_id = $4', [xp, level, goal.id, userId]
    )
    await client.query('UPDATE daily_state SET confirmed = TRUE WHERE user_id = $1', [userId])

    return { status: 200, body: { success: true, xp, level, xp_earned: xpEarned } }
  })

  res.status(result.status).json(result.body)
})

// picks a random penalty task and stamps the start time
router.post('/penalty/trigger', async (req, res) => {
  const userId = req.user.id
  const task = getRandomPenaltyTask()
  await withTransaction(async client => {
    await client.query(
      `UPDATE penalty_state SET
         active = TRUE, task_title = $1, task_difficulty = $2,
         task_timer_seconds = $3, started_at = $4, confirmed = FALSE
       WHERE user_id = $5`,
      [task.title, task.difficulty, task.timer_seconds, new Date().toISOString(), userId]
    )
    await client.query('UPDATE daily_state SET penalty_shown = TRUE WHERE user_id = $1', [userId])
  })
  res.json({ success: true, task })
})

// confirm unlocks 1 minute before end for all penalty tasks in demo mode
router.post('/penalty/confirm', async (req, res) => {
  const userId = req.user.id
  const { rows } = await query('SELECT * FROM penalty_state WHERE user_id = $1', [userId])
  const penalty = rows[0]
  if (!penalty?.active) return res.status(400).json({ error: 'No active penalty' })

  const elapsed = (new Date() - new Date(penalty.started_at)) / 1000
  const unlockThreshold = penalty.task_timer_seconds - CONFIRM_UNLOCK_BEFORE_END

  if (elapsed < unlockThreshold) {
    return res.status(403).json({
      error: 'Confirm not yet unlocked',
      unlocks_in: Math.ceil(unlockThreshold - elapsed)
    })
  }

  await withTransaction(async client => {
    await client.query('UPDATE penalty_state SET confirmed = TRUE, active = FALSE WHERE user_id = $1', [userId])
    await client.query('UPDATE daily_state SET confirmed = TRUE WHERE user_id = $1', [userId])
  })
  res.json({ success: true })
})

// deducts a day's worth of XP — can't go below 0 on level 1
router.post('/penalty/fail', async (req, res) => {
  const userId = req.user.id
  const result = await withTransaction(async client => {
    const goal = await getActiveGoal(client, req.user)
    if (!goal) return { status: 400, body: { error: 'No active goal' } }

    const { xp, level } = deductXp(goal.xp, goal.level, PENALTY_XP)
    await client.query(
      'UPDATE goals SET xp = $1, level = $2 WHERE id = $3 AND user_id = $4', [xp, level, goal.id, userId]
    )
    await client.query('UPDATE penalty_state SET active = FALSE WHERE user_id = $1', [userId])
    await client.query('UPDATE daily_state SET confirmed = TRUE WHERE user_id = $1', [userId])
    return { status: 200, body: { success: true, xp, level } }
  })
  res.status(result.status).json(result.body)
})

// skips the penalty modal entirely — not enough time left in the day for even a penalty task
router.post('/penalty/auto-fail', async (req, res) => {
  const userId = req.user.id
  const result = await withTransaction(async client => {
    const goal = await getActiveGoal(client, req.user)
    if (!goal) return { status: 400, body: { error: 'No active goal' } }

    const { xp, level } = deductXp(goal.xp, goal.level, PENALTY_XP)
    await client.query(
      'UPDATE goals SET xp = $1, level = $2 WHERE id = $3 AND user_id = $4', [xp, level, goal.id, userId]
    )
    await client.query(
      'UPDATE daily_state SET confirmed = TRUE, penalty_shown = TRUE WHERE user_id = $1', [userId]
    )
    return { status: 200, body: { success: true, xp, level } }
  })
  res.status(result.status).json(result.body)
})

// costs 5XP to refresh unless the free refresh setting is on
// can only be used once per task per day — tracked via the refreshed column
router.post('/tasks/:id/refresh', async (req, res) => {
  const user = req.user
  const taskId = parseId(req.params.id)

  const result = await withTransaction(async client => {
    const goal = await getActiveGoal(client, user)
    if (!goal) return { status: 400, body: { error: 'No active goal' } }

    const { rows: taskRows } = await client.query(
      'SELECT * FROM daily_tasks WHERE id = $1 AND user_id = $2', [taskId, user.id]
    )
    const currentTask = taskRows[0]
    if (!currentTask) return { status: 404, body: { error: 'Task not found' } }
    if (currentTask.refreshed) return { status: 403, body: { error: 'Task already refreshed' } }

    if (!user.task_refresh && goal.xp <= 0 && goal.level <= 1) {
      return { status: 403, body: { error: 'Not enough XP to refresh' } }
    }

    const { rows: currentTasks } = await client.query(
      'SELECT title FROM daily_tasks WHERE user_id = $1', [user.id]
    )
    const currentTitles = currentTasks.map(t => t.title)

    const { rows: pool } = await client.query(
      `SELECT * FROM goal_tasks
       WHERE goal_id = $1 AND user_id = $2 AND title != '' AND level >= $3 AND level <= $4`,
      [goal.id, user.id, getMinTaskLevel(goal.level), getMaxTaskLevel(goal.level)]
    )

    const available = pool.filter(t => !currentTitles.includes(t.title))
    const source = available.length > 0 ? available : pool
    const newTask = source[Math.floor(Math.random() * source.length)]
    if (!newTask) return { status: 400, body: { error: 'No tasks available to swap' } }

    let { xp, level } = goal
    if (!user.task_refresh) {
      ({ xp, level } = deductXp(goal.xp, goal.level, REFRESH_COST))
      await client.query(
        'UPDATE goals SET xp = $1, level = $2 WHERE id = $3 AND user_id = $4', [xp, level, goal.id, user.id]
      )
    }

    await client.query(
      `UPDATE daily_tasks SET goal_task_id = $1, title = $2, level = $3, checked = FALSE, refreshed = TRUE
       WHERE id = $4 AND user_id = $5`,
      [newTask.id, newTask.title, newTask.level, taskId, user.id]
    )

    return {
      status: 200,
      body: { success: true, task: { id: newTask.id, title: newTask.title, level: newTask.level }, xp, level }
    }
  })

  res.status(result.status).json(result.body)
})

module.exports = router
