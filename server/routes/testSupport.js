// Routes for the end-to-end tests only. app.js mounts these only when
// NODE_ENV=test (never in development or production), and each one checks
// again, so they can't be reached on a real server.
//   GET  /api/test/emails?to=   emails "sent" to an address, newest last
//   POST /api/test/reset-rate-limits
//   POST /api/test/new-day      { email } — the next request starts a new day
//   POST /api/test/rewind-window { seconds } — today's window, for the signed-in
//                               account, started `seconds` earlier than it did
//   GET  /api/test/user-exists?email= — whether an account still exists
const express = require('express')
const router = express.Router()
const config = require('../config')
const { query } = require('../db')
const { getTestOutbox } = require('../lib/email')
const { getYesterdayInTimezone } = require('../lib/game')
const { resetRateLimitsForTests } = require('../middleware/rateLimits')
const { readSessionToken } = require('../lib/auth')

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

// Lets a journey reach a demo's confirm time, or the end of its window, without
// waiting minutes. Works on whoever is signed in, so a test never needs the
// demo's random email address.
router.post('/rewind-window', async (req, res) => {
  const payload = readSessionToken(req.cookies?.[config.cookieName])
  const seconds = Number(req.body?.seconds)
  if (!payload || !Number.isFinite(seconds)) return res.status(400).json({ success: false })
  await query(
    `UPDATE daily_state SET window_start = window_start - make_interval(secs => $1) WHERE user_id = $2`,
    [seconds, parseInt(payload.sub, 10)]
  )
  res.json({ success: true })
})

router.get('/user-exists', async (req, res) => {
  const { rows } = await query('SELECT 1 FROM users WHERE email = $1', [String(req.query.email || '').toLowerCase()])
  res.json({ exists: rows.length > 0 })
})

module.exports = router
