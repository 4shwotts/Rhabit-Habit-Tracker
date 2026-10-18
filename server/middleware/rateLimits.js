// Rate limits (express-rate-limit). A general limit covers the whole API;
// account routes get much stricter ones. Sensitive routes are limited both per
// IP and per target email, so rotating IPs doesn't help brute-force one
// account, and one IP can't spray many accounts.
//
// Counters are kept in memory, which is fine for a single Render instance.
// If the backend is ever scaled to several instances, switch to a shared store
// (e.g. rate-limit-postgresql or Redis).
const { rateLimit, ipKeyGenerator } = require('express-rate-limit')

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

function limiter({ windowMs, limit, message, keyGenerator, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests,
    ...(keyGenerator && { keyGenerator }),
    message: { error: message || 'Too many requests. Please wait a little and try again.' },
    // trust proxy is configured deliberately in index.js (see TRUST_PROXY)
    validate: { trustProxy: false }
  })
}

// Keys a limit on the email in the request body (normalised the same way the
// routes do), falling back to the IP when no email was sent.
function byEmail(prefix) {
  return req => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    return email ? `${prefix}:${email}` : `${prefix}-ip:${ipKeyGenerator(req.ip)}`
  }
}

const TOO_MANY_ATTEMPTS = 'Too many attempts. Please wait a while and try again.'

module.exports = {
  // whole API, per IP
  general: limiter({ windowMs: 15 * MINUTE, limit: 300 }),

  // login: per IP, and failed attempts per email (successful logins don't count)
  loginIp: limiter({ windowMs: 15 * MINUTE, limit: 20, message: TOO_MANY_ATTEMPTS }),
  loginEmail: limiter({
    windowMs: 15 * MINUTE, limit: 5, message: TOO_MANY_ATTEMPTS,
    keyGenerator: byEmail('login'), skipSuccessfulRequests: true
  }),

  signupToken: limiter({ windowMs: HOUR, limit: 30 }),
  signup: limiter({ windowMs: HOUR, limit: 5, message: TOO_MANY_ATTEMPTS }),

  // forgot-password and resend-verification send email, so they're the
  // tightest: per IP and per target address
  emailSendIp: limiter({ windowMs: HOUR, limit: 5, message: TOO_MANY_ATTEMPTS }),
  emailSendEmail: limiter({
    windowMs: HOUR, limit: 3, message: TOO_MANY_ATTEMPTS, keyGenerator: byEmail('send')
  }),

  resetPassword: limiter({ windowMs: HOUR, limit: 10, message: TOO_MANY_ATTEMPTS }),
  verifyEmail: limiter({ windowMs: HOUR, limit: 20, message: TOO_MANY_ATTEMPTS }),

  // 2FA login step: failed codes per pending login (the challenge's user), and per IP
  twoFactorVerifyIp: limiter({ windowMs: 15 * MINUTE, limit: 20, message: TOO_MANY_ATTEMPTS }),
  twoFactorVerifyUser: limiter({
    windowMs: 15 * MINUTE, limit: 5, message: TOO_MANY_ATTEMPTS, skipSuccessfulRequests: true,
    keyGenerator: req => `2fa:${req.twoFactorChallenge?.sub ?? ipKeyGenerator(req.ip)}`
  }),
  // turning 2FA on/off re-checks the password and a code
  twoFactorManage: limiter({
    windowMs: 15 * MINUTE, limit: 10, message: TOO_MANY_ATTEMPTS, skipSuccessfulRequests: true,
    keyGenerator: req => `2fa-manage:${req.user?.id ?? ipKeyGenerator(req.ip)}`
  }),

  // account deletion re-checks the password, so limit failed guesses per user
  deleteAccount: limiter({
    windowMs: 15 * MINUTE, limit: 5, message: TOO_MANY_ATTEMPTS, skipSuccessfulRequests: true,
    keyGenerator: req => `delete:${req.user?.id ?? ipKeyGenerator(req.ip)}`
  })
}
