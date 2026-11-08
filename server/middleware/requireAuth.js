// Server-side session check. Every non-public API route sits behind this, so
// the UI guards are only a convenience — the API refuses requests on its own.
const { query } = require('../db')
const config = require('../config')
const { readSessionToken, clearSessionCookie } = require('../lib/auth')


async function requireAuth(req, res, next) {
  const payload = readSessionToken(req.cookies?.[config.cookieName])
  if (!payload) return res.status(401).json({ error: 'Not logged in' })

  // explicit column list: password_hash is deliberately never loaded onto
  // req.user, so it can't be serialised into a response by accident
  const { rows } = await query(
    `SELECT id, email, username, email_verified, token_version, timezone,
            timer_visible, task_refresh, pause_progression, active_goal_id,
            setup_complete, totp_enabled, created_at, is_demo, expires_at
     FROM users WHERE id = $1`,
    [parseInt(payload.sub, 10)]
  )
  const user = rows[0]

  // token_version mismatch means the session was revoked (password reset).
  // An expired demo is refused even if clean-up hasn't deleted it yet.
  const expiredDemo = user?.is_demo && new Date(user.expires_at) <= new Date()
  if (!user || user.token_version !== payload.tv || expiredDemo) {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Not logged in' })
  }

  req.user = user
  next()
}

// Game routes additionally need a verified email address.
function requireVerified(req, res, next) {
  if (!req.user?.email_verified) {
    return res.status(403).json({ error: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' })
  }
  next()
}

// What a demo account can't do: anything involving its email address or a
// password (it has neither), or two-step sign-in. Must come after requireAuth.
const DEMO_RESTRICTED = 'This is not available in the demo. Sign up for a full account to use it.'

function forbidDemo(req, res, next) {
  if (req.user?.is_demo) return res.status(403).json({ error: DEMO_RESTRICTED, code: 'DEMO_RESTRICTED' })
  next()
}

module.exports = { requireAuth, requireVerified, forbidDemo, DEMO_RESTRICTED }
