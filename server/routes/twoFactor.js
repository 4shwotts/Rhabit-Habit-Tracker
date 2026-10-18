// Optional authenticator-app two-step sign-in.
//   POST /setup   (logged in) password -> QR code + manual key (pending secret)
//   POST /enable  (logged in) code from the app -> 2FA on, backup codes shown once
//   POST /disable (logged in) password + code -> 2FA off
//   POST /verify  (login step) challenge cookie + code -> real session
const express = require('express')
const bcrypt = require('bcrypt')
const router = express.Router()
const { query, withTransaction } = require('../db')
const { requireAuth, requireVerified } = require('../middleware/requireAuth')
const limits = require('../middleware/rateLimits')
const { validate, z, fields } = require('../lib/validate')
const { setSessionCookie } = require('../lib/auth')
const {
  createSetup, verifyCode, replaceBackupCodes, checkSecondFactor,
  clearChallengeCookie, readChallenge
} = require('../lib/twoFactor')

const codeField = z.string().trim().min(6).max(20)
const INVALID_CODE = 'Incorrect authenticator or backup code'

// loads the columns 2FA checks need for the logged-in user, locking the row
async function loadTotpUser(db, userId) {
  const { rows } = await db.query(
    `SELECT id, email, password_hash, token_version, totp_enabled, totp_secret,
            totp_pending_secret, totp_last_step
     FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  )
  return rows[0]
}

router.post('/setup',
  requireAuth, requireVerified, limits.twoFactorManage,
  validate({ body: z.strictObject({ password: fields.password }) }),
  async (req, res) => {
    const result = await withTransaction(async client => {
      const user = await loadTotpUser(client, req.user.id)
      if (!await bcrypt.compare(req.body.password, user.password_hash)) {
        return [401, { error: 'Incorrect password' }]
      }
      if (user.totp_enabled) return [409, { error: 'Two-step sign-in is already on' }]

      const setup = await createSetup(user.email)
      await client.query(
        'UPDATE users SET totp_pending_secret = $1 WHERE id = $2', [setup.encryptedSecret, user.id]
      )
      return [200, { qr: setup.qr, manual_key: setup.manualKey }]
    })
    res.status(result[0]).json(result[1])
  }
)

router.post('/enable',
  requireAuth, requireVerified, limits.twoFactorManage,
  validate({ body: z.strictObject({ code: codeField }) }),
  async (req, res) => {
    const result = await withTransaction(async client => {
      const user = await loadTotpUser(client, req.user.id)
      if (user.totp_enabled) return [409, { error: 'Two-step sign-in is already on' }]
      if (!user.totp_pending_secret) return [400, { error: 'Start setup first' }]

      // proves the app was set up correctly before 2FA is switched on
      const step = verifyCode(user.totp_pending_secret, req.body.code, null)
      if (step === null) return [400, { error: 'That code did not match. Check your app and try again.' }]

      await client.query(
        `UPDATE users SET totp_enabled = TRUE, totp_secret = totp_pending_secret,
           totp_pending_secret = NULL, totp_last_step = $1
         WHERE id = $2`,
        [step, user.id]
      )
      const backupCodes = await replaceBackupCodes(client, user.id)
      return [200, { success: true, backup_codes: backupCodes }]
    })
    res.status(result[0]).json(result[1])
  }
)

router.post('/disable',
  requireAuth, limits.twoFactorManage,
  validate({ body: z.strictObject({ password: fields.password, code: codeField }) }),
  async (req, res) => {
    const result = await withTransaction(async client => {
      const user = await loadTotpUser(client, req.user.id)
      if (!user.totp_enabled) return [409, { error: 'Two-step sign-in is already off' }]
      if (!await bcrypt.compare(req.body.password, user.password_hash)) {
        return [401, { error: 'Incorrect password' }]
      }
      if (!await checkSecondFactor(client, user, req.body.code)) return [401, { error: INVALID_CODE }]

      await client.query(
        `UPDATE users SET totp_enabled = FALSE, totp_secret = NULL,
           totp_pending_secret = NULL, totp_last_step = NULL
         WHERE id = $1`,
        [user.id]
      )
      await client.query('DELETE FROM totp_backup_codes WHERE user_id = $1', [user.id])
      return [200, { success: true }]
    })
    res.status(result[0]).json(result[1])
  }
)

// second login step: swaps the challenge cookie + a valid code for a session
router.post('/verify',
  limits.twoFactorVerifyIp,
  (req, res, next) => {
    req.twoFactorChallenge = readChallenge(req)
    if (!req.twoFactorChallenge) {
      return res.status(401).json({ error: 'Your sign-in expired. Please log in again.', code: 'CHALLENGE_EXPIRED' })
    }
    next()
  },
  limits.twoFactorVerifyUser,
  validate({ body: z.strictObject({ code: codeField }), invalidBodyStatus: 401, invalidBodyMessage: INVALID_CODE }),
  async (req, res) => {
    const challenge = req.twoFactorChallenge
    const result = await withTransaction(async client => {
      const user = await loadTotpUser(client, parseInt(challenge.sub, 10))
      // password changed or 2FA turned off since the password step
      if (!user || !user.totp_enabled || user.token_version !== challenge.tv) {
        return { status: 401, body: { error: 'Your sign-in expired. Please log in again.', code: 'CHALLENGE_EXPIRED' } }
      }
      if (!await checkSecondFactor(client, user, req.body.code)) {
        return { status: 401, body: { error: INVALID_CODE } }
      }
      return { status: 200, user }
    })

    if (result.status !== 200) return res.status(result.status).json(result.body)
    clearChallengeCookie(res)
    setSessionCookie(res, result.user)
    res.json({ success: true })
  }
)

module.exports = router
