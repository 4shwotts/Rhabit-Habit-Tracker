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
const limits = require('../middleware/rateLimits')
const { validate, z, fields } = require('../lib/validate')
const { createFormToken, checkSignup } = require('../lib/botCheck')
const { isAcceptableEmail } = require('../lib/emailDomain')
const { setChallengeCookie, checkSecondFactor } = require('../lib/twoFactor')
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

// ---- request schemas (strict: unknown fields are rejected) ----

const signupBody = z.strictObject({
  username: fields.username,
  email: fields.email,
  password: fields.newPassword,
  timezone: z.string().max(64).optional(),
  // bot checks — see lib/botCheck.js
  form_token: z.string().max(200).optional(),
  website: z.string().max(200).optional()
})
const loginBody = z.strictObject({ email: fields.email, password: fields.password })
const emailBody = z.strictObject({ email: fields.email })
const tokenBody = z.strictObject({ token: fields.token })
const resetBody = z.strictObject({ token: fields.token, password: fields.newPassword })
// `code` (authenticator or backup code) is required when 2FA is on
const deleteBody = z.strictObject({ password: fields.password, code: z.string().max(20).optional() })

// ---- helpers ----

function validTimezone(value) {
  if (!value) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value })
    return value
  } catch {
    return 'UTC'
  }
}

function isUniqueViolation(err) {
  // Postgres SQLSTATE for unique_violation
  return err?.code === '23505'
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
    active_goal_id: user.active_goal_id,
    two_factor_enabled: !!user.totp_enabled
  }
}

// Issues a fresh one-time token of `type`, replacing any older ones.
async function issueToken(db, userId, type, ttlMs) {
  const { raw, hash } = createOneTimeToken()
  await db.query('DELETE FROM auth_tokens WHERE user_id = $1 AND type = $2', [userId, type])
  await db.query(
    'INSERT INTO auth_tokens (user_id, type, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [userId, type, hash, new Date(Date.now() + ttlMs)]
  )
  return raw
}

// Looks up a token by its hash and deletes it in the same statement, so it can
// only be used once. Returns the user_id, or null if missing or expired.
async function consumeToken(db, rawToken, type) {
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

// Signed timestamp the signup form must send back (timing check).
router.get('/signup-token', limits.signupToken, (req, res) => {
  res.json({ token: createFormToken() })
})

router.post('/signup', limits.signup, validate({ body: signupBody }), async (req, res) => {
  const { username, email, password, form_token: formToken, website } = req.body

  const botReason = checkSignup({ formToken, honeypot: website })
  if (botReason === 'form token expired') {
    // a real person who left the page open for hours — tell them to reload
    return res.status(400).json({ error: 'This form has expired. Please reload the page and try again.' })
  }
  if (botReason) {
    // pretend it worked so bots learn nothing; nothing is created or sent
    console.warn(`Signup blocked by bot check: ${botReason}`)
    return res.status(202).json({ message: GENERIC_SIGNUP_MESSAGE })
  }

  // no throwaway inboxes or domains that can't receive mail. This says nothing
  // about whether an account exists, so it can be a real error message.
  if (!await isAcceptableEmail(email)) {
    return res.status(400).json({ error: 'Please use a verified email address' })
  }

  // hashed before the existence check so both paths take the same time
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [email])
  if (existing.length > 0) {
    await safeSend(() => sendAccountExistsEmail(email))
    return res.status(202).json({ message: GENERIC_SIGNUP_MESSAGE })
  }

  let rawToken
  try {
    rawToken = await withTransaction(async client => {
      const { rows } = await client.query(
        `INSERT INTO users (email, username, password_hash, timezone)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [email, username, passwordHash, validTimezone(req.body.timezone)]
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

router.post('/login',
  limits.loginIp,
  limits.loginEmail,
  // a malformed email gets the same answer as a wrong password
  validate({ body: loginBody, invalidBodyStatus: 401, invalidBodyMessage: GENERIC_LOGIN_ERROR }),
  async (req, res) => {
    const { email, password } = req.body
    const { rows } = await query(
      'SELECT id, password_hash, token_version, email_verified, totp_enabled FROM users WHERE email = $1',
      [email]
    )
    const user = rows[0]

    // always run bcrypt, even for unknown emails, to keep timing identical
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH)
    if (!user || !ok) return res.status(401).json({ error: GENERIC_LOGIN_ERROR })

    // Unverified accounts never get a session. Only reachable with the right
    // password, so it reveals nothing to someone guessing emails.
    if (!user.email_verified) {
      return res.status(403).json({ error: 'Verify your email to continue', code: 'EMAIL_NOT_VERIFIED' })
    }

    // 2FA on: no session yet — the browser gets a 5-minute challenge cookie and
    // must send a valid code to /api/auth/2fa/verify
    if (user.totp_enabled) {
      setChallengeCookie(res, user)
      return res.json({ two_factor_required: true })
    }

    setSessionCookie(res, user)
    res.json({ success: true })
  }
)

router.post('/logout', validate(), (req, res) => {
  clearSessionCookie(res)
  res.json({ success: true })
})

// Session check used by the frontend route guards.
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) })
})

router.post('/verify-email',
  limits.verifyEmail,
  validate({ body: tokenBody, invalidBodyMessage: INVALID_VERIFY_TOKEN }),
  async (req, res) => {
    const userId = await consumeToken({ query }, req.body.token, 'verify_email')
    if (!userId) return res.status(400).json({ error: INVALID_VERIFY_TOKEN })

    await query('UPDATE users SET email_verified = TRUE WHERE id = $1', [userId])
    res.json({ success: true })
  }
)

router.post('/resend-verification',
  limits.emailSendIp,
  limits.emailSendEmail,
  validate({ body: emailBody }),
  async (req, res) => {
    const { email } = req.body
    const { rows } = await query(
      'SELECT id, username, email_verified FROM users WHERE email = $1', [email]
    )
    const user = rows[0]
    if (user && !user.email_verified) {
      const raw = await issueToken({ query }, user.id, 'verify_email', VERIFY_TOKEN_TTL_MS)
      await safeSend(() => sendVerificationEmail(email, user.username, raw))
    }
    res.json({ message: GENERIC_RESEND_MESSAGE })
  }
)

router.post('/forgot-password',
  limits.emailSendIp,
  limits.emailSendEmail,
  validate({ body: emailBody }),
  async (req, res) => {
    const { email } = req.body
    const { rows } = await query('SELECT id FROM users WHERE email = $1', [email])
    if (rows[0]) {
      const raw = await issueToken({ query }, rows[0].id, 'reset_password', RESET_TOKEN_TTL_MS)
      await safeSend(() => sendPasswordResetEmail(email, raw))
    }
    res.json({ message: GENERIC_FORGOT_MESSAGE })
  }
)

router.post('/reset-password', limits.resetPassword, validate({ body: resetBody }), async (req, res) => {
  const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS)

  const userId = await consumeToken({ query }, req.body.token, 'reset_password')
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
router.delete('/account',
  requireAuth,
  limits.deleteAccount,
  validate({ body: deleteBody, invalidBodyStatus: 401, invalidBodyMessage: 'Incorrect password' }),
  async (req, res) => {
    const { rows } = await query(
      'SELECT id, password_hash, totp_enabled, totp_secret, totp_last_step FROM users WHERE id = $1',
      [req.user.id]
    )
    const user = rows[0]
    const ok = user && await bcrypt.compare(req.body.password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Incorrect password' })
    if (user.totp_enabled && !await checkSecondFactor({ query }, user, req.body.code)) {
      return res.status(401).json({ error: 'Incorrect authenticator or backup code' })
    }

    await query('DELETE FROM users WHERE id = $1', [req.user.id])
    clearSessionCookie(res)
    res.json({ success: true })
  }
)

module.exports = router
module.exports.publicUser = publicUser
