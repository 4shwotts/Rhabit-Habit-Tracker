const express = require('express')
const router = express.Router()
const db = require('../db/database')
const { getUnlockedTaskLevel, generateTasks } = require('../middleware/checkDailyReset')

// returns all goals with their tasks nested by level
router.get('/', (req, res) => {
  const goals = db.prepare('SELECT * FROM goals ORDER BY created_at ASC').all()
  const result = goals.map(goal => {
    const tasks = db.prepare(
      'SELECT * FROM goal_tasks WHERE goal_id = ? ORDER BY level ASC, id ASC'
    ).all(goal.id)

    const levelTasks = {}
    for (let l = 1; l <= 10; l++) levelTasks[l] = []
    tasks.forEach(t => {
      if (levelTasks[t.level]) levelTasks[t.level].push({ id: t.id, title: t.title })
    })

    return { ...goal, levelTasks }
  })
  res.json(result)
})

router.post('/', (req, res) => {
  const { name } = req.body
  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 50) {
    return res.status(400).json({ error: 'Invalid goal name' })
  }
  const result = db.prepare('INSERT INTO goals (name) VALUES (?)').run(name.trim())
  res.json({ success: true, id: result.lastInsertRowid })
})

router.patch('/:id/name', (req, res) => {
  const { name } = req.body
  db.prepare('UPDATE goals SET name = ? WHERE id = ?').run(name, req.params.id)
  res.json({ success: true })
})

router.patch('/:id/xp', (req, res) => {
  const { xp, level } = req.body
  db.prepare('UPDATE goals SET xp = ?, level = ? WHERE id = ?')
    .run(xp, level, req.params.id)
  res.json({ success: true })
})

// when starring a new goal, save the current goal's tasks as a snapshot first
// so switching back restores exactly where you left off
router.patch('/:id/star', (req, res) => {
  const id = parseInt(req.params.id)
  const today = new Date().toISOString().split('T')[0]

  const previousUser = db.prepare('SELECT active_goal_id FROM user WHERE id = 1').get()
  const previousGoalId = previousUser?.active_goal_id

  if (previousGoalId && previousGoalId !== id) {
    const currentTasks = db.prepare('SELECT * FROM daily_tasks').all()

    db.prepare('DELETE FROM goal_daily_snapshot WHERE goal_id = ? AND date = ?')
      .run(previousGoalId, today)

    const insertSnapshot = db.prepare(
      'INSERT INTO goal_daily_snapshot (goal_id, date, goal_task_id, title, level, checked, refreshed) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    currentTasks.forEach(t => {
      insertSnapshot.run(previousGoalId, today, t.goal_task_id, t.title, t.level, t.checked, t.refreshed)
    })
  }

  db.prepare('UPDATE goals SET starred = 0').run()
  db.prepare('UPDATE goals SET starred = 1 WHERE id = ?').run(id)
  db.prepare('UPDATE user SET active_goal_id = ? WHERE id = 1').run(id)

  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id)
  const unlockedLevel = getUnlockedTaskLevel(goal.level)
  const state = db.prepare('SELECT * FROM daily_state WHERE id = 1').get()

  // only swap tasks if the session hasn't started yet
  if (!state?.started) {
    const snapshot = db.prepare(
      'SELECT * FROM goal_daily_snapshot WHERE goal_id = ? AND date = ?'
    ).all(id, today)

    db.prepare('DELETE FROM daily_tasks').run()

    if (snapshot.length > 0) {
      const insert = db.prepare(
        'INSERT INTO daily_tasks (goal_task_id, title, level, checked, refreshed) VALUES (?, ?, ?, ?, ?)'
      )
      snapshot.forEach(t => insert.run(t.goal_task_id, t.title, t.level, t.checked, t.refreshed))
    } else {
      const tasks = generateTasks(id, unlockedLevel)
      const insert = db.prepare(
        'INSERT INTO daily_tasks (goal_task_id, title, level, checked, refreshed) VALUES (?, ?, ?, 0, 0)'
      )
      tasks.forEach(task => insert.run(task.id, task.title, task.level))
    }

    db.prepare('UPDATE daily_state SET last_reset = ?, goal_id = ?, started = 0, confirmed = 0, window_start = NULL WHERE id = 1')
      .run(today, id)
  }

  res.json({ success: true })
})

router.patch('/:id/unstar', (req, res) => {
  db.prepare('UPDATE goals SET starred = 0 WHERE id = ?').run(req.params.id)
  db.prepare('UPDATE user SET active_goal_id = NULL WHERE id = 1').run()
  res.json({ success: true })
})

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// replaces all tasks for a given level — easier than diffing individual rows
router.post('/:id/tasks', (req, res) => {
  const { level, tasks } = req.body
  const goalId = req.params.id

  db.prepare('DELETE FROM goal_tasks WHERE goal_id = ? AND level = ?').run(goalId, level)

  const insert = db.prepare(
    'INSERT INTO goal_tasks (goal_id, level, title) VALUES (?, ?, ?)'
  )
  tasks.forEach(task => {
    if (task.title && task.title.trim() !== '') {
      insert.run(goalId, level, task.title.trim())
    }
  })

  res.json({ success: true })
})

router.delete('/tasks/:taskId', (req, res) => {
  db.prepare('DELETE FROM goal_tasks WHERE id = ?').run(req.params.taskId)
  res.json({ success: true })
})

module.exports = router