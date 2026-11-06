// Security: SQL injection is harmless, the client can't set XP or any other
// value the server works out, writes from other websites are refused, and
// responses carry the security headers.
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  request, query, resetDb, closeDb, createUser, createPlayer, as, goalOf, dailyTasksOf,
  startedSecondsAgo, PASSWORD, SETUP_BODY
} from './helpers.mjs'

beforeEach(resetDb)
afterAll(closeDb)

const INJECTIONS = [
  "'; DROP TABLE users; --",
  "Robert'); DROP TABLE goals;--",
  "' OR '1'='1",
  '1; DELETE FROM goals WHERE 1=1',
  "x' UNION SELECT password_hash FROM users --"
]

async function tablesStillThere() {
  const { rows } = await query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('users', 'goals', 'goal_tasks')")
  return rows[0].n === 3
}

describe('SQL injection', () => {
  it.each(INJECTIONS)('stores %j as plain text in a goal name', async text => {
    const player = await createPlayer()
    const goal = await goalOf(player)
    const name = text.slice(0, 50)
    expect((await as(player).patch(`/api/goals/${goal.id}/name`).send({ name })).status).toBe(200)

    const goals = (await as(player).get('/api/goals')).body
    expect(goals.find(g => g.id === goal.id).name).toBe(name.trim())
    expect(await tablesStillThere()).toBe(true)
  })

  it.each(INJECTIONS)('stores %j as plain text in a username and task title', async text => {
    const player = await createPlayer()
    const goal = await goalOf(player)
    expect((await as(player).patch('/api/user/username').send({ username: text.slice(0, 30) })).status).toBe(200)
    expect((await as(player).post(`/api/goals/${goal.id}/tasks`).send({ level: 5, tasks: [{ title: text.slice(0, 40) }] })).status).toBe(200)
    expect((await as(player).get('/api/user')).body.username).toBe(text.slice(0, 30).trim())
    expect(await tablesStillThere()).toBe(true)
  })

  it('cannot log in with an injection instead of a password', async () => {
    const user = await createUser()
    for (const password of INJECTIONS) {
      const res = await request().post('/api/auth/login').send({ email: user.email, password })
      expect(res.status).toBe(401)
    }
  })

  it('cannot log in with an injection in the email', async () => {
    await createUser()
    const res = await request().post('/api/auth/login').send({ email: "x'or'1'='1'--@rhabit-tests.com", password: PASSWORD })
    expect(res.status).toBe(401)
  })

  it('treats an injection in an id as not found', async () => {
    const player = await createPlayer()
    for (const id of ['1 OR 1=1', '1;DROP TABLE goals', "1' OR '1'='1"]) {
      const res = await as(player).delete(`/api/goals/${encodeURIComponent(id)}`)
      expect(res.status).toBe(404)
    }
    expect((await query('SELECT count(*)::int AS n FROM goals')).rows[0].n).toBe(1)
  })
})

describe('values only the server may set', () => {
  // every one of these is a real route with an extra field the client has no
  // business sending; the strict schemas refuse the whole request
  const attempts = [
    ['XP on a new goal', (p) => as(p).post('/api/goals').send({ name: 'Cheat', xp: 9999, level: 10 })],
    ['XP when renaming', (p, g) => as(p).patch(`/api/goals/${g.id}/name`).send({ name: 'Cheat', xp: 9999 })],
    ['XP earned when confirming', (p) => as(p).post('/api/daily/confirm').send({ xp_earned: 1000 })],
    ['the window start time', (p) => as(p).post('/api/daily/start').send({ window_start: '2000-01-01T00:00:00Z' })],
    ['the window length', (p) => as(p).post('/api/daily/start').send({ window_seconds: 999999 })],
    ['XP when ticking a task', (p, g, t) => as(p).patch(`/api/daily/tasks/${t.id}/check`).send({ checked: true, xp: 50 })],
    ['XP in settings', (p) => as(p).patch('/api/user/settings').send({ timer_visible: true, xp: 9999 })],
    ['email verified status', (p) => as(p).patch('/api/user/settings').send({ email_verified: true })],
    ['XP during setup', (p) => as(p).post('/api/setup').send({ ...SETUP_BODY, xp: 9999 })],
    ['the penalty timer', (p) => as(p).post('/api/daily/penalty/confirm').send({ task_timer_seconds: 1 })]
  ]

  it.each(attempts)('refuses %s', async (_, attempt) => {
    const player = await createPlayer()
    const goal = await goalOf(player)
    const [task] = await dailyTasksOf(player)
    const res = await attempt(player, goal, task)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Unrecognized key/)
    const after = await goalOf(player)
    expect([after.xp, after.level]).toEqual([goal.xp, goal.level])
  })

  it('awards exactly what the server works out for a completed day', async () => {
    const player = await createPlayer()
    await as(player).post('/api/daily/start')
    for (const t of await dailyTasksOf(player)) {
      await as(player).patch(`/api/daily/tasks/${t.id}/check`).send({ checked: true })
    }
    await startedSecondsAgo(player, 9100) // confirm unlocks 30 minutes before the end
    const res = await as(player).post('/api/daily/confirm')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ xp: 45, level: 1, xp_earned: 45 })
    expect((await goalOf(player)).xp).toBe(45)
  })
})

describe('cross-site requests and headers', () => {
  it('refuses a write coming from another website', async () => {
    const user = await createUser()
    const res = await as(user).post('/api/goals').set('Origin', 'https://evil.example').send({ name: 'x' })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Forbidden' })
    expect((await query('SELECT count(*)::int AS n FROM goals')).rows[0].n).toBe(0)
  })

  it('allows a write from the app\'s own origin', async () => {
    const user = await createUser()
    const res = await as(user).post('/api/goals').set('Origin', 'http://localhost:5173').send({ name: 'Mine' })
    expect(res.status).toBe(200)
  })

  it('sends the security headers and hides the framework', async () => {
    const res = await request().get('/api/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(res.headers['strict-transport-security']).toBeDefined()
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('never sends password hashes or 2FA secrets back', async () => {
    const player = await createPlayer()
    for (const url of ['/api/auth/me', '/api/user', '/api/goals', '/api/daily']) {
      const text = JSON.stringify((await as(player).get(url)).body)
      expect(text).not.toMatch(/password|hash|totp_secret|\$2[aby]\$/i)
    }
  })
})
