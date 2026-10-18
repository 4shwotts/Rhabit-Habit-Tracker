// Authenticator-app two-step sign-in (TOTP, RFC 6238): 6-digit codes that
// change every 30 seconds, from Google Authenticator, Authy, 1Password etc.
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const QRCode = require('qrcode')
const { TOTP, Secret } = require('otpauth')
const config = require('../config')
const { encrypt, decrypt } = require('./secretBox')

const ISSUER = 'Rhabit'
const PERIOD = 30
// accept the previous and next code too, to allow for phone clock drift
const DRIFT_WINDOW = 1
const BACKUP_CODE_COUNT = 10
const CHALLENGE_MINUTES = 5

function totpFor(base32Secret, label = 'Rhabit account') {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1', // what every authenticator app supports
    digits: 6,
    period: PERIOD,
    secret: Secret.fromBase32(base32Secret)
  })
}

// New random secret for setup. Returns what the user needs (QR code and the
// key for manual entry) plus the encrypted value to store.
async function createSetup(email) {
  const secret = new Secret({ size: 20 })
  const totp = totpFor(secret.base32, email)
  const qr = await QRCode.toDataURL(totp.toString(), {
    margin: 1,
    width: 220,
    color: { dark: '#07070A', light: '#FFFFFF' }
  })
  return { qr, manualKey: secret.base32, encryptedSecret: encrypt(secret.base32) }
}

// Checks a 6-digit code. Returns the matched time step, or null. Codes at or
// before `lastStep` were already used and are refused (no replays).
function verifyCode(encryptedSecret, code, lastStep) {
  if (!encryptedSecret || !/^\d{6}$/.test(code)) return null
  const delta = totpFor(decrypt(encryptedSecret)).validate({ token: code, window: DRIFT_WINDOW })
  if (delta === null) return null
  const step = Math.floor(Date.now() / 1000 / PERIOD) + delta
  if (lastStep != null && step <= lastStep) return null
  return step
}

// ---- backup codes ----

// e.g. "k7m2-xq9d": 8 characters from an unambiguous alphabet (~40 bits each)
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function normaliseBackupCode(code) {
  return String(code).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function hashBackupCode(code) {
  return crypto.createHash('sha256').update(normaliseBackupCode(code)).digest('hex')
}

function generateBackupCodes() {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const bytes = crypto.randomBytes(8)
    const chars = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
    return `${chars.slice(0, 4)}-${chars.slice(4)}`
  })
}

// Replaces the user's backup codes and returns the new plain codes (shown once).
async function replaceBackupCodes(db, userId) {
  const codes = generateBackupCodes()
  await db.query('DELETE FROM totp_backup_codes WHERE user_id = $1', [userId])
  for (const code of codes) {
    await db.query(
      'INSERT INTO totp_backup_codes (user_id, code_hash) VALUES ($1, $2)',
      [userId, hashBackupCode(code)]
    )
  }
  return codes
}

// Uses up a backup code if it's valid and unused. Returns true on success.
async function consumeBackupCode(db, userId, code) {
  if (typeof code !== 'string' || normaliseBackupCode(code).length !== 8) return false
  const { rowCount } = await db.query(
    `UPDATE totp_backup_codes SET used_at = now()
     WHERE id = (
       SELECT id FROM totp_backup_codes
       WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
       LIMIT 1 FOR UPDATE
     )`,
    [userId, hashBackupCode(code)]
  )
  return rowCount === 1
}

// Accepts either an authenticator code or a backup code for `user` (a row with
// id, totp_secret, totp_last_step). Records the step so the code can't be reused.
async function checkSecondFactor(db, user, code) {
  const trimmed = typeof code === 'string' ? code.trim() : ''
  if (/^\d{6}$/.test(trimmed)) {
    const step = verifyCode(user.totp_secret, trimmed, user.totp_last_step)
    if (step === null) return false
    await db.query('UPDATE users SET totp_last_step = $1 WHERE id = $2', [step, user.id])
    return true
  }
  return consumeBackupCode(db, user.id, trimmed)
}

// ---- login challenge ----
// After a correct password on a 2FA account, the browser gets this short-lived
// cookie instead of a session; /api/auth/2fa/verify swaps it (plus a valid
// code) for a real session.

function challengeCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/api/auth/2fa',
    maxAge: CHALLENGE_MINUTES * 60 * 1000
  }
}

function setChallengeCookie(res, user) {
  const token = jwt.sign(
    { sub: String(user.id), tv: user.token_version, purpose: '2fa-login' },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: `${CHALLENGE_MINUTES}m` }
  )
  res.cookie(config.twoFactorCookieName, token, challengeCookieOptions())
}

function clearChallengeCookie(res) {
  const { maxAge, ...opts } = challengeCookieOptions()
  res.clearCookie(config.twoFactorCookieName, opts)
}

function readChallenge(req) {
  const token = req.cookies?.[config.twoFactorCookieName]
  if (!token) return null
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })
    return payload.purpose === '2fa-login' ? payload : null
  } catch {
    return null
  }
}

module.exports = {
  createSetup,
  verifyCode,
  replaceBackupCodes,
  checkSecondFactor,
  setChallengeCookie,
  clearChallengeCookie,
  readChallenge
}
