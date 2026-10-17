// Account routes: sign up, log in/out, session check, email verification,
// password reset and account deletion.
//
// Anti-enumeration: signup, login, resend-verification and forgot-password all
// respond identically whether or not the email has an account.
const express = require('express')
const bcrypt = require('bcrypt')
const router = express.Router()
const { query, withTransaction } = require('../db')
const { requireAuth } = require('../middleware/requireAuth')
const {
  setSessionCookie, clearSessionCookie, createOneTimeToken, hashToken
} = require('../lib/auth')
const {
  sendVerificationEmail, sendPasswordResetEmail, sendAccountExistsEmail
} = require('../lib/email')

const BCRYPT_ROUNDS = 12
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000

// Compared against when the email doesn't exist, so a failed login takes the
// same time either way and response timing can't reveal registered emails.
const DUMMY_HASH = bcrypt.hashSync('rhabit-timing-equaliser', BCRYPT_ROUNDS)

const GENERIC_LOGIN_ERROR = 'Invalid email or password'
const GENERIC_SIGNUP_MESSAGE = 'Check your inbox — if this email can be used, we have sent a verification link.'
const GENERIC_RESEND_MESSAGE = 'If that account exists and still needs verifying, a new link is on its way.'
const GENERIC_FORGOT_MESSAGE = 'If an account exists for that email, a reset link is on its way.'
const INVALID_RESET_TOKEN = 'This reset link is invalid or has expired.'
const INVALID_VERIFY_TOKEN = 'This verification link is invalid or has expired.'

// ---- small validators (Stage 3 replaces these with a shared schema layer) ----

function normaliseEmail(value) {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  // deliberately simple — the verification email is the real check
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

// bcrypt only uses the first 72 bytes, so longer passwords are rejected rather
// than silently truncated.
function validatePassword(value) {
  if (typeof value !== 'string') return 'Password is required'
  if (value.length < 8) return 'Password must be at least 8 characters'
  if (Buffer.byteLength(value, 'utf8') > 72) return 'Password must be at most 72 bytes'
  return null
}

function validUsername(value) {
  if (typeof value !== 'string') return null
  const username = value.trim()
  return username.length >= 1 && username.length <= 30 ? username : null
}

function validTimezone(value) {
  if (typeof value !== 'string' || value.length > 64) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value })
    return value
  } catch {
    return 'UTC'
  }
}

function isUniqueViolation(err) {
  // pg uses SQLSTATE 23505, better-sqlite3 uses SQLITE_CONSTRAINT_UNIQUE
  return err?.code === '23505' || err?.code === 'SQLITE_CONSTRAINT_UNIQUE'
}

// The shape of the user returned to the browser — never includes secrets.
function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    email_verified: !!user.email_verified,
    setup_complete: !!user.setup_complete,
    timezone: user.timezone,
    timer_visible: !!user.timer_visible,
    task_refresh: !!user.task_refresh,
    pause_progression: !!user.pause_progression,
    active_goal_id: user.active_goal_id
  }
}

// Issues a fresh one-time token of `type`, replacing any older ones.
async function issueToken(db, userId, type, ttlMs) {
  const { raw, hash } = createOneTimeToken()
  const now = new Date()
  await db.query('DELETE FROM auth_tokens WHERE user_id = $1 AND type = $2', [userId, type])
  await db.query(
    `INSERT INTO auth_tokens (user_id, type, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, hash, new Date(now.getTime() + ttlMs), now]
  )
  return raw
}

// Looks up a token by its hash and deletes it in the same step, so it can only
// be used once. Returns the user_id, or null if missing or expired.
async function consumeToken(db, rawToken, type) {
  if (typeof rawToken !== 'string' || rawToken.length < 20 || rawToken.length > 200) return null
  const { rows } = await db.query(
    'DELETE FROM auth_tokens WHERE token_hash = $1 AND type = $2 RETURNING user_id, expires_at',
    [hashToken(rawToken), type]
  )
  const token = rows[0]
  if (!token || new Date(token.expires_at) < new Date()) return null
  return token.user_id
}

// Email failures are logged but never change the response, otherwise the
// response would differ between existing and non-existing accounts.
async function safeSend(promiseFactory) {
  try {
    await promiseFactory()
  } catch (err) {
    console.error('Email send failed:', err.message)
  }
}

// ---- routes ----

router.post('/signup', async (req, res) => {
  const username = validUsername(req.body?.username)
  const email = normaliseEmail(req.body?.email)
  const passwordError = validatePassword(req.body?.password)
  const timezone = validTimezone(req.body?.timezone)

  if (!username) return res.status(400).json({ error: 'Username must be between 1 and 30 characters' })
  if (!email) return res.status(400).json({ error: 'Enter a valid email address' })
  if (passwordError) return res.status(400).json({ error: passwordError })

  const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS)

  const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [email])
  if (existing.length > 0) {
    await safeSend(() => sendAccountExistsEmail(email))
    return res.status(202).json({ message: GENERIC_SIGNUP_MESSAGE })
  }

  let rawToken
  try {
    rawToken = await withTransaction(async client => {
      const { rows } = await client.query(
        `INSERT INTO users (email, username, password_hash, timezone, created_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [email, username, passwordHash, timezone, new Date()]
      )
      const userId = rows[0].id
      // per-user game state rows, created up front so routes can always UPDATE
      await client.query('INSERT INTO daily_state (user_id) VALUES ($1)', [userId])
      await client.query('INSERT INTO penalty_state (user_id) VALUES ($1)', [userId])
      return issueToken(client, userId, 'verify_email', VERIFY_TOKEN_TTL_MS)
    })
  } catch (err) {
    // two signups for the same email at once — treat like "already exists"
    if (isUniqueViolation(err)) return res.status(202).json({ message: GENERIC_SIGNUP_MESSAGE })
    throw err
  }

  await safeSend(() => sendVerificationEmail(email, username, rawToken))
  res.status(202).json({ message: GENERIC_SIGNUP_MESSAGE })
})

router.post('/login', async (req, res) => {
  const email = normaliseEmail(req.body?.email)
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  const { rows } = email
    ? await query('SELECT id, password_hash, token_version FROM users WHERE email = $1', [email])
    : { rows: [] }
  const user = rows[0]

  // always run bcrypt, even for unknown emails, to keep timing identical
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH)
  if (!user || !ok) return res.status(401).json({ error: GENERIC_LOGIN_ERROR })

  setSessionCookie(res, user)
  res.json({ success: true })
})

router.post('/logout', (req, res) => {
  clearSessionCookie(res)
  res.json({ success: true })
})

// Session check used by the frontend route guards.
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) })
})

router.post('/verify-email', async (req, res) => {
  const userId = await consumeToken({ query }, req.body?.token, 'verify_email')
  if (!userId) return res.status(400).json({ error: INVALID_VERIFY_TOKEN })

  await query('UPDATE users SET email_verified = TRUE WHERE id = $1', [userId])
  res.json({ success: true })
})

router.post('/resend-verification', async (req, res) => {
  const email = normaliseEmail(req.body?.email)
  if (email) {
    const { rows } = await query(
      'SELECT id, username, email_verified FROM users WHERE email = $1', [email]
    )
    const user = rows[0]
    if (user && !user.email_verified) {
      const raw = await issueToken({ query }, user.id, 'verify_email', VERIFY_TOKEN_TTL_MS)
      await safeSend(() => sendVerificationEmail(email, user.username, raw))
    }
  }
  res.json({ message: GENERIC_RESEND_MESSAGE })
})

router.post('/forgot-password', async (req, res) => {
  const email = normaliseEmail(req.body?.email)
  if (email) {
    const { rows } = await query('SELECT id FROM users WHERE email = $1', [email])
    if (rows[0]) {
      const raw = await issueToken({ query }, rows[0].id, 'reset_password', RESET_TOKEN_TTL_MS)
      await safeSend(() => sendPasswordResetEmail(email, raw))
    }
  }
  res.json({ message: GENERIC_FORGOT_MESSAGE })
})

router.post('/reset-password', async (req, res) => {
  const passwordError = validatePassword(req.body?.password)
  if (passwordError) return res.status(400).json({ error: passwordError })

  const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS)

  const userId = await consumeToken({ query }, req.body?.token, 'reset_password')
  if (!userId) return res.status(400).json({ error: INVALID_RESET_TOKEN })

  // bumping token_version logs out every existing session; clicking the emailed
  // link also proves ownership of the address, so mark it verified
  await query(
    `UPDATE users SET password_hash = $1, token_version = token_version + 1, email_verified = TRUE
     WHERE id = $2`,
    [passwordHash, userId]
  )
  clearSessionCookie(res)
  res.json({ success: true })
})

// Permanently deletes the account. Every table references users(id) with
// ON DELETE CASCADE, so this one statement removes all of the user's data.
router.delete('/account', requireAuth, async (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id])
  const ok = rows[0] && await bcrypt.compare(password, rows[0].password_hash)
  if (!ok) return res.status(401).json({ error: 'Incorrect password' })

  await query('DELETE FROM users WHERE id = $1', [req.user.id])
  clearSessionCookie(res)
  res.json({ success: true })
})

module.exports = router
module.exports.publicUser = publicUser
