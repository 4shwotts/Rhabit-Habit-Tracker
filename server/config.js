// Central place for reading environment variables, so every module agrees on
// defaults and production fails fast if something essential is missing.
require('dotenv').config()

const isProduction = process.env.NODE_ENV === 'production'

// Throws if the variable is missing in production, or in development when
// there is no sensible dev fallback (e.g. DATABASE_URL).
function required(name, devFallback) {
  const value = process.env[name]
  if (value) return value
  if (isProduction || devFallback === undefined) {
    throw new Error(`Missing required environment variable: ${name} (see server/.env.example)`)
  }
  return devFallback
}

function parseTrustProxy(value, production) {
  if (value === undefined || value === '') return production
  if (value === 'true') return true
  if (value === 'false') return false
  const hops = parseInt(value, 10)
  return Number.isInteger(hops) ? hops : production
}

const config = {
  isProduction,
  port: parseInt(process.env.PORT, 10) || 3001,

  // Neon Postgres connection string (use a separate Neon branch for local dev)
  databaseUrl: required('DATABASE_URL'),

  // Per-user caps to stop one account filling the database
  limits: {
    goalsPerUser: 20,
    tasksPerLevel: 6
  },

  // Secret used to sign session JWTs. Must be long and random in production.
  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
  // sessions are per visit (the frontend logs out on a fresh tab) and the
  // cookie ends when the browser closes; the token itself expires after this
  sessionHours: 12,
  cookieName: 'rhabit_session',
  // short-lived cookie between "password correct" and "authenticator code correct"
  twoFactorCookieName: 'rhabit_2fa',

  // Encrypts authenticator-app (TOTP) secrets at rest. Long and random in
  // production; changing it disables everyone's existing 2FA setups.
  totpEncryptionKey: required('TOTP_ENCRYPTION_KEY', 'dev-only-insecure-totp-key-change-me'),

  // Public URL of the frontend, used to build links in emails.
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),

  // Origins allowed to call the API directly (the Vercel proxy is server-to-server
  // so it doesn't need CORS, but local dev and direct calls do).
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),

  // How Express works out the client IP (used by rate limiting) behind proxies.
  // Production requests arrive via Vercel's rewrite and Render's load balancer;
  // Vercel overwrites X-Forwarded-For with the real client IP, so trusting the
  // forwarded chain gives the right address. Override with TRUST_PROXY (a hop
  // count, or "false") if the hosting setup changes.
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY, isProduction),

  // Brevo transactional email. Without a key in dev, emails are logged to the console.
  brevoApiKey: process.env.BREVO_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || '',
  emailFromName: process.env.EMAIL_FROM_NAME || 'Rhabit'
}

if (isProduction && (!config.brevoApiKey || !config.emailFrom)) {
  throw new Error('BREVO_API_KEY and EMAIL_FROM must be set in production')
}

module.exports = config
