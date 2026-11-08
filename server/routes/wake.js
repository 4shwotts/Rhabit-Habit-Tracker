// GET /api/wake: the login page calls this as it loads, so a sleeping server
// (Render's free tier) and database (Neon) start waking before the visitor
// clicks anything. It runs one trivial query so the database wakes too.
// /api/health stays separate and never touches the database, in case the
// host uses it as its health check.
const express = require('express')
const router = express.Router()
const db = require('../db')
const limits = require('../middleware/rateLimits')

router.get('/', limits.wake, async (req, res) => {
  try {
    await db.query('SELECT 1')
    res.json({ status: 'awake' })
  } catch (err) {
    console.error('Wake-up query failed:', err.message)
    res.status(503).json({ status: 'unavailable' })
  }
})

module.exports = router
