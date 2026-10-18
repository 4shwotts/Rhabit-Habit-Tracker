// Lightweight bot protection for sign-up, without a CAPTCHA:
//
// 1. Timing check — the signup page fetches a signed "form token" when it
//    loads. The server only accepts a signup if that token is genuine and at
//    least MIN_FILL_MS old (humans take a few seconds to fill the form; simple
//    bots post instantly) and not older than MAX_AGE_MS.
// 2. Honeypot — the form has a hidden "website" field that people never see
//    or fill in. Bots that fill every field give themselves away.
//
// Failed checks are answered with the normal "check your inbox" message so a
// bot can't tell it was caught.
const crypto = require('crypto')
const config = require('../config')

const MIN_FILL_MS = 3000
const MAX_AGE_MS = 2 * 60 * 60 * 1000

// a separate key derived from the JWT secret, so these tokens can never be
// confused with session tokens
const key = crypto.createHmac('sha256', config.jwtSecret).update('rhabit-signup-form').digest()

function sign(issuedAt) {
  return crypto.createHmac('sha256', key).update(String(issuedAt)).digest('base64url')
}

function createFormToken() {
  const issuedAt = Date.now()
  return `${issuedAt}.${sign(issuedAt)}`
}

// Returns null if the submission looks human, or a short reason (for logs only).
function checkSignup({ formToken, honeypot }) {
  if (honeypot) return 'honeypot filled'
  if (typeof formToken !== 'string') return 'missing form token'

  const [issuedAtRaw, signature] = formToken.split('.')
  const issuedAt = Number(issuedAtRaw)
  if (!Number.isSafeInteger(issuedAt) || !signature) return 'malformed form token'

  const expected = Buffer.from(sign(issuedAt))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return 'bad form token signature'
  }

  const age = Date.now() - issuedAt
  if (age < MIN_FILL_MS) return 'submitted too quickly'
  if (age > MAX_AGE_MS) return 'form token expired'
  return null
}

module.exports = { createFormToken, checkSignup }
