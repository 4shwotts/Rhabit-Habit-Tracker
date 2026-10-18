// Session cookies and one-time tokens (email verification, password reset).
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const config = require('../config')

// httpOnly so page scripts can't read it, Secure so it only travels over HTTPS
// (browsers make an exception for http://localhost), SameSite=Lax so other
// sites can't make the browser send it on cross-site POSTs. In production the
// frontend proxies /api through Vercel, so the cookie is first-party.
// No maxAge: a browser-session cookie, gone when the browser closes.
function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/'
  }
}

// `tv` (token version) lets us invalidate every existing session for a user,
// e.g. after a password reset, by bumping users.token_version.
function setSessionCookie(res, user) {
  const token = jwt.sign(
    { sub: String(user.id), tv: user.token_version },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: `${config.sessionHours}h` }
  )
  res.cookie(config.cookieName, token, cookieOptions())
}

function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, cookieOptions())
}

// Returns the decoded payload, or null if the token is missing, forged or expired.
function readSessionToken(token) {
  if (!token) return null
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })
    // tokens with a purpose (e.g. the 2FA login challenge) are not sessions
    return payload.purpose ? null : payload
  } catch {
    return null
  }
}

// One-time tokens: the raw value goes in the emailed link, only its SHA-256
// hash is stored. 32 random bytes is far beyond brute-force range.
function createOneTimeToken() {
  const raw = crypto.randomBytes(32).toString('base64url')
  return { raw, hash: hashToken(raw) }
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex')
}

module.exports = {
  setSessionCookie,
  clearSessionCookie,
  readSessionToken,
  createOneTimeToken,
  hashToken
}
