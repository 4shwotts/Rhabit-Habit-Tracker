const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { publicUser } = require('./auth')

// the logged-in user's profile and settings (never includes the password hash)
router.get('/', (req, res) => {
  res.json(publicUser(req.user))
})

router.patch('/settings', async (req, res) => {
  const { timer_visible, task_refresh, pause_progression } = req.body ?? {}

  // COALESCE means we only update fields that were actually sent
  const toFlag = value => (value === undefined ? null : !!value)
  await query(
    `UPDATE users SET
       timer_visible = COALESCE($1, timer_visible),
       task_refresh = COALESCE($2, task_refresh),
       pause_progression = COALESCE($3, pause_progression)
     WHERE id = $4`,
    [toFlag(timer_visible), toFlag(task_refresh), toFlag(pause_progression), req.user.id]
  )

  res.json({ success: true })
})

router.patch('/active-goal', async (req, res) => {
  const { goal_id } = req.body ?? {}
  if (!Number.isInteger(goal_id)) {
    return res.status(400).json({ error: 'Invalid goal ID' })
  }
  // only allow pointing at a goal this user owns
  const { rowCount } = await query(
    'UPDATE users SET active_goal_id = $1 WHERE id = $2 AND EXISTS (SELECT 1 FROM goals WHERE id = $1 AND user_id = $2)',
    [goal_id, req.user.id]
  )
  if (rowCount === 0) return res.status(404).json({ error: 'Goal not found' })
  res.json({ success: true })
})

router.patch('/username', async (req, res) => {
  const { username } = req.body ?? {}
  if (!username || typeof username !== 'string' || username.trim().length < 1 || username.trim().length > 30) {
    return res.status(400).json({ error: 'Username must be between 1 and 30 characters' })
  }
  await query('UPDATE users SET username = $1 WHERE id = $2', [username.trim(), req.user.id])
  res.json({ success: true })
})

// marks first-time setup as done so the route guard stops sending the user to /setup
router.post('/setup-complete', async (req, res) => {
  await query('UPDATE users SET setup_complete = TRUE WHERE id = $1', [req.user.id])
  res.json({ success: true })
})

module.exports = router
