const express = require('express')
const router = express.Router()
const db = require('../db/database')
const { getRandomPenaltyTask } = require('../data/penaltyTasks')
const { getWindowSeconds, getUnlockedTaskLevel } = require('../middleware/checkDailyReset')

router.get('/', (req, res) => {
  const state = db.prepare('SELECT * FROM daily_state WHERE id = 1').get()
  const tasks = db.prepare('SELECT * FROM daily_tasks').all()
  const penalty = db.prepare('SELECT * FROM penalty_state WHERE id = 1').get()
  const user = db.prepare('SELECT * FROM user WHERE id = 1').get()
  const goal = user?.active_goal_id
    ? db.prepare('SELECT * FROM goals WHERE id = ?').get(user.active_goal_id)
    : null

  const windowSeconds = getWindowSeconds(goal?.level || 1)
  res.json({ state, tasks, penalty, windowSeconds })
})

// stamp the start time so the countdown is consistent even across page refreshes
router.post('/start', (req, res) => {
  const now = new Date().toISOString()
  db.prepare('UPDATE daily_state SET started = 1, window_start = ? WHERE id = 1').run(now)
  res.json({ success: true, window_start: now })
})

router.patch('/tasks/:id/check', (req, res) => {
  const { checked } = req.body
  db.prepare('UPDATE daily_tasks SET checked = ? WHERE id = ?')
    .run(checked ? 1 : 0, req.params.id)
  res.json({ success: true })
})

// confirm is only available in the last 10 minutes of the window so the user
// actually has to sit with the timer for most of it
router.post('/confirm', (req, res) => {
  const user = db.prepare('SELECT * FROM user WHERE id = 1').get()
  if (!user?.active_goal_id) return res.status(400).json({ error: 'No active goal' })

  const state = db.prepare('SELECT * FROM daily_state WHERE id = 1').get()
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(user.active_goal_id)
  const windowSeconds = getWindowSeconds(goal.level)
  const elapsed = (new Date() - new Date(state.window_start)) / 1000
  const remaining = windowSeconds - elapsed
  const XP_PER_TASK = 15

  if (remaining > 600) {
    return res.status(403).json({
      error: 'Confirm not yet unlocked',
      unlocks_in: Math.ceil(remaining - 600)
    })
  }

  const tasks = db.prepare('SELECT * FROM daily_tasks').all()
  const checkedCount = tasks.filter(t => t.checked).length
  let newXp = goal.xp + checkedCount * XP_PER_TASK
  let newLevel = goal.level

  while (newXp >= 100) { newXp -= 100; newLevel++ }

  db.prepare('UPDATE goals SET xp = ?, level = ? WHERE id = ?')
    .run(newXp, newLevel, goal.id)
  db.prepare('UPDATE daily_state SET confirmed = 1 WHERE id = 1').run()

  res.json({ success: true, xp: newXp, level: newLevel, xp_earned: checkedCount * XP_PER_TASK })
})

// picks a random penalty task and stamps the start time
router.post('/penalty/trigger', (req, res) => {
  const task = getRandomPenaltyTask()
  db.prepare(`
    UPDATE penalty_state SET
      active = 1, task_title = ?, task_difficulty = ?,
      task_timer_seconds = ?, started_at = ?, confirmed = 0
    WHERE id = 1
  `).run(task.title, task.difficulty, task.timer_seconds, new Date().toISOString())
  db.prepare('UPDATE daily_state SET penalty_shown = 1 WHERE id = 1').run()
  res.json({ success: true, task })
})

// unlock threshold varies by difficulty — hard tasks give more time before you can confirm
router.post('/penalty/confirm', (req, res) => {
  const penalty = db.prepare('SELECT * FROM penalty_state WHERE id = 1').get()
  if (!penalty?.active) return res.status(400).json({ error: 'No active penalty' })

  const elapsed = (new Date() - new Date(penalty.started_at)) / 1000
  const unlockThreshold = penalty.task_difficulty === 'hard'
    ? penalty.task_timer_seconds - 3600
    : penalty.task_timer_seconds - 600

  if (elapsed < unlockThreshold) {
    return res.status(403).json({
      error: 'Confirm not yet unlocked',
      unlocks_in: Math.ceil(unlockThreshold - elapsed)
    })
  }

  db.prepare('UPDATE penalty_state SET confirmed = 1, active = 0 WHERE id = 1').run()
  db.prepare('UPDATE daily_state SET confirmed = 1 WHERE id = 1').run()
  res.json({ success: true })
})

// deducts a full day's worth of XP — can't go below 0 on level 1
router.post('/penalty/fail', (req, res) => {
  const user = db.prepare('SELECT * FROM user WHERE id = 1').get()
  if (!user?.active_goal_id) return res.status(400).json({ error: 'No active goal' })

  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(user.active_goal_id)
  const PENALTY_XP = 45
  let newXp = goal.xp - PENALTY_XP
  let newLevel = goal.level

  while (newXp < 0) {
    if (newLevel > 1) { newLevel -= 1; newXp = 100 + newXp }
    else { newXp = 0; break }
  }

  db.prepare('UPDATE goals SET xp = ?, level = ? WHERE id = ?')
    .run(newXp, newLevel, goal.id)
  db.prepare('UPDATE penalty_state SET active = 0 WHERE id = 1').run()
  db.prepare('UPDATE daily_state SET confirmed = 1 WHERE id = 1').run()

  res.json({ success: true, xp: newXp, level: newLevel })
})

// skips the penalty modal entirely — not enough time left in the day for even a penalty task
router.post('/penalty/auto-fail', (req, res) => {
  const user = db.prepare('SELECT * FROM user WHERE id = 1').get()
  if (!user?.active_goal_id) return res.status(400).json({ error: 'No active goal' })

  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(user.active_goal_id)
  const PENALTY_XP = 45
  let newXp = goal.xp - PENALTY_XP
  let newLevel = goal.level

  while (newXp < 0) {
    if (newLevel > 1) { newLevel -= 1; newXp = 100 + newXp }
    else { newXp = 0; break }
  }

  db.prepare('UPDATE goals SET xp = ?, level = ? WHERE id = ?')
    .run(newXp, newLevel, goal.id)
  db.prepare('UPDATE daily_state SET confirmed = 1, penalty_shown = 1 WHERE id = 1').run()

  res.json({ success: true, xp: newXp, level: newLevel })
})

// costs 5XP to refresh unless the free refresh setting is on
// can only be used once per task per day — tracked via the refreshed column
router.post('/tasks/:id/refresh', (req, res) => {
  const user = db.prepare('SELECT * FROM user WHERE id = 1').get()
  if (!user?.active_goal_id) return res.status(400).json({ error: 'No active goal' })

  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(user.active_goal_id)
  const currentTask = db.prepare('SELECT * FROM daily_tasks WHERE id = ?').get(req.params.id)
  if (!currentTask) return res.status(404).json({ error: 'Task not found' })

  if (currentTask.refreshed) return res.status(403).json({ error: 'Task already refreshed' })

  if (!user.task_refresh && goal.xp <= 0 && goal.level <= 1) {
    return res.status(403).json({ error: 'Not enough XP to refresh' })
  }

  if (!user.task_refresh) {
    let newXp = goal.xp - 5
    let newLevel = goal.level
    if (newXp < 0) {
      if (newLevel > 1) { newLevel -= 1; newXp = 100 + newXp }
      else { newXp = 0 }
    }
    db.prepare('UPDATE goals SET xp = ?, level = ? WHERE id = ?')
      .run(newXp, newLevel, goal.id)
  }

  // only pull from tasks the user has actually unlocked
  const unlockedLevel = getUnlockedTaskLevel(goal.level)
  const currentTasks = db.prepare('SELECT * FROM daily_tasks').all()
  const currentTitles = currentTasks.map(t => t.title)

  const pool = db.prepare(`
    SELECT * FROM goal_tasks
    WHERE goal_id = ? AND title != '' AND level <= ?
  `).all(goal.id, unlockedLevel)

  // prefer tasks not already on the board
  const available = pool.filter(t => !currentTitles.includes(t.title))
  const source = available.length > 0 ? available : pool
  const newTask = source[Math.floor(Math.random() * source.length)]

  if (!newTask) return res.status(400).json({ error: 'No tasks available to swap' })

  db.prepare('UPDATE daily_tasks SET goal_task_id = ?, title = ?, level = ?, checked = 0, refreshed = 1 WHERE id = ?')
    .run(newTask.id, newTask.title, newTask.level, req.params.id)

  const updatedGoal = db.prepare('SELECT * FROM goals WHERE id = ?').get(goal.id)
  res.json({ success: true, task: newTask, xp: updatedGoal.xp, level: updatedGoal.level })
})

module.exports = router