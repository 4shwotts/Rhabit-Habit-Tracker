// Shared helpers for the API tests: the app under Supertest, database reset,
// and quick ways to create users and sessions.
import { createRequire } from 'node:module'
import { beforeEach, afterEach, vi } from 'vitest'
import supertest from 'supertest'

// the server is CommonJS, so load it the same way it loads itself
const require = createRequire(import.meta.url)
const app = require('../../app')
const { pool, query } = require('../../db')
const config = require('../../config')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { getTestOutbox } = require('../../lib/email')
const { resetRateLimitsForTests } = require('../../middleware/rateLimits')
const { createFormToken } = require('../../lib/botCheck')

export { query, config }
export const request = () => supertest(app)
export const PASSWORD = 'correct-horse-battery'

// Every API test starts at the same time of day, because the game rules depend
// on it (from late evening a day's window no longer fits). Only the server's
// clock (Date) is faked; real timers keep the database and HTTP working.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-07-14T09:00:00Z') })
})
afterEach(() => vi.useRealTimers())

// moves the frozen clock to a moment in UTC
export const setClock = iso => vi.setSystemTime(new Date(iso))

// Empties every table, the email outbox and the rate limit counters.
export async function resetDb() {
  const { rows } = await query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'"
  )
  await query(`TRUNCATE ${rows.map(r => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`)
  getTestOutbox().length = 0
  await resetRateLimitsForTests()
}

export const closeDb = () => pool.end()

let counter = 0
export const uniqueEmail = (prefix = 'user') => `${prefix}${++counter}.${Date.now()}@rhabit-tests.com`

// Inserts a user directly (much faster than signing up through the API).
// A low bcrypt cost keeps it quick; login still checks it the normal way.
export async function createUser({
  email = uniqueEmail(), username = 'tester', password = PASSWORD, verified = true, timezone = 'Europe/London'
} = {}) {
  const hash = await bcrypt.hash(password, 4)
  const { rows } = await query(
    `INSERT INTO users (email, username, password_hash, email_verified, timezone)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [email, username, hash, verified, timezone]
  )
  await query('INSERT INTO daily_state (user_id) VALUES ($1)', [rows[0].id])
  await query('INSERT INTO penalty_state (user_id) VALUES ($1)', [rows[0].id])
  return rows[0]
}

// A session cookie for `user`, signed the way the server signs them. The
// options make deliberately bad ones (wrong secret, expired, old version).
export function sessionCookie(user, { secret = config.jwtSecret, tv = user.token_version, claims = {}, expired = false } = {}) {
  const exp = Math.floor(Date.now() / 1000) + (expired ? -60 : 3600)
  const token = jwt.sign({ sub: String(user.id), tv, exp, ...claims }, secret, { algorithm: 'HS256' })
  return `${config.cookieName}=${token}`
}

// Requests sent as `user`: as(user).get('/api/goals')
export function as(user, cookie = sessionCookie(user)) {
  const send = method => url => request()[method](url).set('Cookie', cookie)
  return { get: send('get'), post: send('post'), patch: send('patch'), delete: send('delete') }
}

// A genuine sign-up form token that is `ageMs` old, so the 3-second minimum
// (which stays in force) is met without waiting.
export function formToken(ageMs = 4000) {
  const realNow = Date.now
  Date.now = () => realNow() - ageMs
  try {
    return createFormToken()
  } finally {
    Date.now = realNow
  }
}

// emails sent during the test, newest last
export const outbox = () => getTestOutbox()
export const emailsTo = to => getTestOutbox().filter(e => e.to === to)

// the token from the link in an email
export function tokenFrom(email) {
  const match = email?.text.match(/token=([^\s&]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

// a valid first-time setup: three tasks for each of levels 1 to 3
export const SETUP_BODY = {
  goal_name: 'Fitness',
  levels: [1, 2, 3].map(level => ({ level, titles: [1, 2, 3].map(i => `Level ${level} task ${i}`) }))
}

// A verified user who has finished setup, so has a goal and today's tasks.
export async function createPlayer(options) {
  const user = await createUser(options)
  const res = await as(user).post('/api/setup').send(SETUP_BODY)
  if (res.status !== 200) throw new Error(`Setup failed: ${res.status} ${JSON.stringify(res.body)}`)
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [user.id])
  return rows[0]
}

export async function goalOf(user) {
  const { rows } = await query('SELECT * FROM goals WHERE id = $1', [user.active_goal_id])
  return rows[0]
}

export async function dailyTasksOf(user) {
  const { rows } = await query('SELECT * FROM daily_tasks WHERE user_id = $1 ORDER BY id', [user.id])
  return rows
}

// a time `seconds` before the test's clock (the database's now() is the real time)
export const secondsAgo = seconds => new Date(Date.now() - seconds * 1000)

// moves today's window start back, as if it started `seconds` ago
export async function startedSecondsAgo(user, seconds) {
  await query('UPDATE daily_state SET window_start = $1 WHERE user_id = $2', [secondsAgo(seconds), user.id])
}
