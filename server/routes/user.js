const express = require('express')
const router = express.Router()
const db = require('../db/database')

// single user app so we always fetch id=1
router.get('/', (req, res) => {
  const user = db.prepare('SELECT * FROM user WHERE id = 1').get()
  if (!user) return res.status(404).json({ error: 'No user found' })
  res.json(user)
})

router.post('/', (req, res) => {
  const { username, timezone } = req.body

  if (!username || typeof username !== 'string' || username.trim().length < 1 || username.trim().length > 30) {
    return res.status(400).json({ error: 'Username must be between 1 and 30 characters' })
  }

  // fall back to UTC if the timezone string isn't valid
  const validTimezones = Intl.supportedValuesOf('timeZone')
  const tz = timezone && validTimezones.includes(timezone) ? timezone : 'UTC'

  const existing = db.prepare('SELECT * FROM user WHERE id = 1').get()
  if (existing) return res.status(400).json({ error: 'User already exists' })

  db.prepare(`
    INSERT INTO user (id, username, timezone)
    VALUES (1, ?, ?)
  `).run(username.trim(), tz)

  db.prepare(`INSERT OR IGNORE INTO daily_state (id) VALUES (1)`).run()
  db.prepare(`INSERT OR IGNORE INTO penalty_state (id) VALUES (1)`).run()

  res.json({ success: true })
})

router.patch('/settings', (req, res) => {
  const { timer_visible, task_refresh, pause_progression } = req.body

  // COALESCE means we only update fields that were actually sent
  db.prepare(`
    UPDATE user SET
      timer_visible = COALESCE(?, timer_visible),
      task_refresh = COALESCE(?, task_refresh),
      pause_progression = COALESCE(?, pause_progression)
    WHERE id = 1
  `).run(
    timer_visible !== undefined ? (timer_visible ? 1 : 0) : null,
    task_refresh !== undefined ? (task_refresh ? 1 : 0) : null,
    pause_progression !== undefined ? (pause_progression ? 1 : 0) : null
  )

  res.json({ success: true })
})

router.patch('/active-goal', (req, res) => {
  const { goal_id } = req.body
  if (!goal_id || typeof goal_id !== 'number') {
    return res.status(400).json({ error: 'Invalid goal ID' })
  }
  db.prepare('UPDATE user SET active_goal_id = ? WHERE id = 1').run(goal_id)
  res.json({ success: true })
})

router.patch('/username', (req, res) => {
  const { username } = req.body
  if (!username || typeof username !== 'string' || username.trim().length < 1 || username.trim().length > 30) {
    return res.status(400).json({ error: 'Username must be between 1 and 30 characters' })
  }
  db.prepare('UPDATE user SET username = ? WHERE id = 1').run(username.trim())
  res.json({ success: true })
})

module.exports = router