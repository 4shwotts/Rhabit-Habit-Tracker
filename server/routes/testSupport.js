// Routes for the end-to-end tests only. app.js mounts these only when
// NODE_ENV=test (never in development or production), and each one checks
// again, so they can't be reached on a real server.
//   GET  /api/test/emails?to=   emails "sent" to an address, newest last
//   POST /api/test/reset-rate-limits
//   POST /api/test/new-day      { email } — the next request starts a new day
const express = require('express')
const router = express.Router()
const config = require('../config')
const { query } = require('../db')
const { getTestOutbox } = require('../lib/email')
const { getYesterdayInTimezone } = require('../lib/game')
const { resetRateLimitsForTests } = require('../middleware/rateLimits')

router.use((req, res, next) => {
  if (!config.isTest) return res.status(404).json({ error: 'Not found' })
  next()
})

router.get('/emails', (req, res) => {
  const to = String(req.query.to || '').toLowerCase()
  res.json({ emails: getTestOutbox().filter(e => e.to === to) })
})

router.post('/reset-rate-limits', async (req, res) => {
  await resetRateLimitsForTests()
  res.json({ success: true })
})

router.post('/new-day', async (req, res) => {
  const { rows } = await query(
    'SELECT id, timezone FROM users WHERE email = $1', [String(req.body?.email || '').toLowerCase()]
  )
  if (!rows[0]) return res.status(404).json({ success: false })
  // yesterday, so the reset sees one finished day and no days missed in between
  await query('UPDATE daily_state SET last_reset = $1 WHERE user_id = $2', [
    getYesterdayInTimezone(rows[0].timezone), rows[0].id
  ])
  res.json({ success: true })
})

module.exports = router
