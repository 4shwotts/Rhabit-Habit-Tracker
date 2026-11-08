// Demo accounts through the API: one click signs a visitor in to a seeded
// account with fast timers, demos are kept apart from each other and from real
// accounts, expired demos are deleted with all their data, and creation is
// limited per IP and in total. The public sign-up switch has its own file.
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import {
  query, config, request, resetDb, closeDb, createPlayer, createUser, as, setClock, PASSWORD, outbox
} from './helpers.mjs'

const require = createRequire(import.meta.url)
const { deleteExpiredDemos } = require('../../lib/demo')
const { createOneTimeToken } = require('../../lib/auth')

beforeEach(resetDb)

afterAll(closeDb)

// the tables that hold a user's data
const USER_TABLES = ['goals', 'goal_tasks', 'daily_state', 'daily_tasks', 'penalty_state', 'goal_daily_snapshot']

// Starts a demo the way the login page will. Returns the response, the session
// cookie it set, and the account's row.
async function startDemo(body = { timezone: 'Europe/London' }) {
  const res = await request().post('/api/auth/demo').send(body)
  const cookie = res.headers['set-cookie']?.find(c => c.startsWith(`${config.cookieName}=`))?.split(';')[0]
  const user = res.body.user
    ? (await query('SELECT * FROM users WHERE id = $1', [res.body.user.id])).rows[0]
    : null
  return { res, cookie, user }
}

const withCookie = cookie => ({
  get: url => request().get(url).set('Cookie', cookie),
  post: url => request().post(url).set('Cookie', cookie),
  patch: url => request().patch(url).set('Cookie', cookie),
  delete: url => request().delete(url).set('Cookie', cookie)
})

const exists = async id => (await query('SELECT 1 FROM users WHERE id = $1', [id])).rows.length === 1

async function rowsFor(userId) {
  const counts = {}
  for (const table of USER_TABLES) {
    const { rows } = await query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [userId])
    counts[table] = rows[0].n
  }
  return counts
}

describe('starting a demo', () => {
  it('signs the visitor in with the normal session cookie', async () => {
    const { res, cookie } = await startDemo()
    expect(res.status).toBe(201)
    expect(cookie).toBeTruthy()
    expect(res.headers['set-cookie'].join(';')).toMatch(/HttpOnly/i)

    const me = await withCookie(cookie).get('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.user).toMatchObject({
      is_demo: true, email_verified: true, setup_complete: true, username: 'Demo player'
    })
    expect(me.body.user.email).toMatch(/@demo\.invalid$/)
  })

  it('needs no email or password, and keeps the browser time zone', async () => {
    const { user } = await startDemo({ timezone: 'Asia/Tokyo' })
    expect(user).toMatchObject({ is_demo: true, timezone: 'Asia/Tokyo' })
  })

  it('expires 24 hours after it starts', async () => {
    const { res, user } = await startDemo()
    expect(new Date(user.expires_at).toISOString()).toBe('2026-07-15T09:00:00.000Z')
    expect(res.body.user.demo_expires_at).toBeTruthy()
  })

  it('starts with seeded data: a level 4 pathway, others beside it, and today part-done', async () => {
    const { cookie } = await startDemo()
    const goals = (await withCookie(cookie).get('/api/goals')).body
    expect(goals.length).toBe(3)
    const active = goals.find(g => g.starred)
    expect(active).toMatchObject({ name: 'Fitness', level: 4, xp: 55 })
    expect(new Set(goals.map(g => g.level)).size).toBe(3)

    const day = (await withCookie(cookie).get('/api/daily')).body
    expect(day.state.started).toBe(true)
    expect(day.tasks).toHaveLength(3)
    expect(day.tasks.filter(t => t.checked)).toHaveLength(1)
  })

  it('refuses unexpected fields', async () => {
    const { res } = await startDemo({ timezone: 'UTC', is_demo: false })
    expect(res.status).toBe(400)
  })

  it('cannot be logged in to with an email and password', async () => {
    const { user } = await startDemo()
    const res = await request().post('/api/auth/login').send({ email: user.email, password: PASSWORD })
    expect(res.status).toBe(401)
  })
})

describe('demo timers', () => {
  it('demos get a 3-minute window with confirm open after 1 minute', async () => {
    const { cookie } = await startDemo()
    const day = (await withCookie(cookie).get('/api/daily')).body
    expect(day).toMatchObject({ windowSeconds: 180, confirmUnlockBeforeEnd: 120 })
  })

  it('real accounts keep their normal window', async () => {
    const player = await createPlayer()
    const day = (await as(player).get('/api/daily')).body
    expect(day).toMatchObject({ windowSeconds: 3 * 60 * 60, confirmUnlockBeforeEnd: 30 * 60 })
  })

  it('a missed demo window starts a 2-minute penalty', async () => {
    const { cookie, user } = await startDemo()
    await query('UPDATE daily_state SET window_start = $1 WHERE user_id = $2',
      [new Date(Date.now() - 190 * 1000), user.id])
    const day = (await withCookie(cookie).get('/api/daily')).body
    expect(day.penalty).toMatchObject({ active: true, task_timer_seconds: 120, unlock_before_end: 90 })
  })

  it('demo confirm unlocks after 1 minute, not before', async () => {
    const { cookie, user } = await startDemo()
    const tasks = (await withCookie(cookie).get('/api/daily')).body.tasks
    for (const t of tasks) await withCookie(cookie).patch(`/api/daily/tasks/${t.id}/check`).send({ checked: true })

    expect((await withCookie(cookie).post('/api/daily/confirm')).status).toBe(403)
    await query('UPDATE daily_state SET window_start = $1 WHERE user_id = $2',
      [new Date(Date.now() - 61 * 1000), user.id])
    const res = await withCookie(cookie).post('/api/daily/confirm')
    expect(res.status).toBe(200)
    expect(res.body.xp_earned).toBe(45)
  })
})

describe('keeping demos apart', () => {
  it('one demo cannot see or change another demo\'s goals', async () => {
    const a = await startDemo()
    const b = await startDemo()
    const goalOfA = (await withCookie(a.cookie).get('/api/goals')).body[0]

    const rename = await withCookie(b.cookie).patch(`/api/goals/${goalOfA.id}/name`).send({ name: 'Taken' })
    expect(rename.status).toBe(404)
    const star = await withCookie(b.cookie).patch(`/api/goals/${goalOfA.id}/star`)
    expect(star.status).toBe(404)

    const goalsOfB = (await withCookie(b.cookie).get('/api/goals')).body
    expect(goalsOfB.map(g => g.id)).not.toContain(goalOfA.id)
  })
})

describe('clean-up', () => {
  it('refuses an expired demo\'s session, even before it is deleted', async () => {
    const { cookie } = await startDemo()
    setClock('2026-07-15T09:00:01Z')
    expect((await withCookie(cookie).get('/api/auth/me')).status).toBe(401)
  })

  it('deletes expired demos and every row of their data', async () => {
    const { user } = await startDemo()
    expect(Object.values(await rowsFor(user.id)).some(n => n > 0)).toBe(true)

    setClock('2026-07-15T09:00:01Z')
    expect(await deleteExpiredDemos({ query })).toBe(1)
    expect((await query('SELECT 1 FROM users WHERE id = $1', [user.id])).rows).toHaveLength(0)
    expect(Object.values(await rowsFor(user.id)).every(n => n === 0)).toBe(true)
  })

  it('keeps demos that have not expired yet', async () => {
    const { user } = await startDemo()
    setClock('2026-07-15T08:59:59Z')
    expect(await deleteExpiredDemos({ query })).toBe(0)
    expect((await query('SELECT 1 FROM users WHERE id = $1', [user.id])).rows).toHaveLength(1)
  })

  it('runs whenever a new demo starts', async () => {
    const { user: old } = await startDemo()
    setClock('2026-07-15T10:00:00Z')
    await startDemo()
    expect((await query('SELECT 1 FROM users WHERE id = $1', [old.id])).rows).toHaveLength(0)
  })

  it('never deletes a real account, however old', async () => {
    const player = await createPlayer()
    await query("UPDATE users SET created_at = '2000-01-01' WHERE id = $1", [player.id])
    await startDemo()
    setClock('2099-01-01T00:00:00Z')
    expect(await deleteExpiredDemos({ query })).toBe(1)
    expect((await query('SELECT 1 FROM users WHERE id = $1', [player.id])).rows).toHaveLength(1)
    expect((await rowsFor(player.id)).goals).toBe(1)
  })

  it('the database refuses a real account with an expiry, or a demo without one', async () => {
    const player = await createPlayer()
    await expect(query("UPDATE users SET expires_at = '2026-07-15' WHERE id = $1", [player.id]))
      .rejects.toThrow(/users_demo_shape/)
    await expect(query('UPDATE users SET is_demo = TRUE WHERE id = $1', [player.id]))
      .rejects.toThrow(/users_demo_shape/)
    const { user } = await startDemo()
    await expect(query('UPDATE users SET expires_at = NULL WHERE id = $1', [user.id]))
      .rejects.toThrow(/users_demo_shape/)
  })
})

describe('abuse limits', () => {
  it('limits demos per IP address', async () => {
    for (let i = 0; i < config.demo.perIpPerHour; i++) {
      expect((await startDemo()).res.status).toBe(201)
    }
    const { res } = await startDemo()
    expect(res.status).toBe(429)
    expect(res.body.error).toMatch(/too many demos/i)
  })

  describe('the cap on live demos', () => {
    const realCap = config.demo.maxActive
    beforeEach(() => { config.demo.maxActive = 2 })
    afterAll(() => { config.demo.maxActive = realCap })

    it('says the demo is busy once the cap is reached', async () => {
      await startDemo()
      await startDemo()
      const { res, cookie } = await startDemo()
      expect(res.status).toBe(503)
      expect(res.body.error).toBe('The demo is busy right now. Please try again shortly.')
      expect(cookie).toBeUndefined()
      const { rows } = await query('SELECT count(*)::int AS n FROM users WHERE is_demo')
      expect(rows[0].n).toBe(2)
    })

    it('frees a place once a demo expires', async () => {
      await startDemo()
      await startDemo()
      setClock('2026-07-15T09:00:01Z')
      expect((await startDemo()).res.status).toBe(201)
    })

    it('holds even when demos are started at the same moment', async () => {
      const results = await Promise.all(Array.from({ length: 4 }, () => startDemo()))
      expect(results.filter(r => r.res.status === 201)).toHaveLength(2)
      expect(results.filter(r => r.res.status === 503)).toHaveLength(2)
    })
  })

  it('keeps the normal cap on goals for demo accounts', async () => {
    const { cookie } = await startDemo()
    for (let i = 3; i < config.limits.goalsPerUser; i++) {
      expect((await withCookie(cookie).post('/api/goals').send({ name: `Goal ${i}` })).status).toBe(200)
    }
    const res = await withCookie(cookie).post('/api/goals').send({ name: 'One too many' })
    expect(res.status).toBe(409)
  })
})

describe('what a demo cannot do', () => {
  const RESTRICTED = 'This is not available in the demo. Sign up for a full account to use it.'

  it.each([
    ['set up two-step sign-in', c => withCookie(c).post('/api/auth/2fa/setup').send({ password: 'anything' })],
    ['turn on two-step sign-in', c => withCookie(c).post('/api/auth/2fa/enable').send({ code: '123456' })],
    ['turn off two-step sign-in', c => withCookie(c).post('/api/auth/2fa/disable').send({ password: 'x', code: '123456' })],
    ['ask for a password reset while signed in', c => withCookie(c).post('/api/auth/forgot-password').send({ email: 'someone@example.com' })],
    ['ask for a verification email while signed in', c => withCookie(c).post('/api/auth/resend-verification').send({ email: 'someone@example.com' })]
  ])('%s: 403', async (_, call) => {
    const { cookie } = await startDemo()
    const res = await call(cookie)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: RESTRICTED, code: 'DEMO_RESTRICTED' })
  })

  it.each([
    ['a password reset', '/api/auth/forgot-password'],
    ['a verification email', '/api/auth/resend-verification']
  ])('nobody can ask for %s for a demo address', async (_, url) => {
    const { user } = await startDemo()
    const res = await request().post(url).send({ email: user.email })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('DEMO_RESTRICTED')
  })

  it("refuses to change a demo's password, even with a reset token", async () => {
    const { user } = await startDemo()
    const { raw, hash } = createOneTimeToken()
    await query(
      `INSERT INTO auth_tokens (user_id, type, token_hash, expires_at) VALUES ($1, 'reset_password', $2, $3)`,
      [user.id, hash, new Date(Date.now() + 60 * 60 * 1000)]
    )
    const res = await request().post('/api/auth/reset-password').send({ token: raw, password: 'a-brand-new-password' })
    expect(res.status).toBe(403)
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [user.id])
    expect(rows[0].password_hash).toBe(user.password_hash)
  })

  it('never sends an email, whatever a demo does', async () => {
    const { cookie, user } = await startDemo()
    await withCookie(cookie).post('/api/auth/forgot-password').send({ email: user.email })
    await withCookie(cookie).post('/api/auth/resend-verification').send({ email: user.email })
    await withCookie(cookie).post('/api/auth/2fa/setup').send({ password: 'x' })
    expect(outbox()).toEqual([])
  })

  it('still lets a real account do all of these', async () => {
    const real = await createUser()
    const res = await as(real).post('/api/auth/2fa/setup').send({ password: PASSWORD })
    expect(res.status).toBe(200)
    expect((await request().post('/api/auth/forgot-password').send({ email: real.email })).status).toBe(200)
  })
})

describe('ending a demo', () => {
  it('logging out deletes the demo and all its data straight away', async () => {
    const { cookie, user } = await startDemo()
    expect((await withCookie(cookie).post('/api/auth/logout').send({})).status).toBe(200)
    expect(await exists(user.id)).toBe(false)
    expect(Object.values(await rowsFor(user.id)).every(n => n === 0)).toBe(true)
  })

  it('the clean-up when a new visit starts deletes it too', async () => {
    const { cookie, user } = await startDemo()
    await withCookie(cookie).post('/api/auth/logout').send({ this_browser_only: true })
    expect(await exists(user.id)).toBe(false)
  })

  it('"delete account" needs no password for a demo, and deletes it', async () => {
    const { cookie, user } = await startDemo()
    const res = await withCookie(cookie).delete('/api/auth/account').send({})
    expect(res.status).toBe(200)
    expect(await exists(user.id)).toBe(false)
  })

  it('a real account still needs its password to be deleted', async () => {
    const real = await createUser()
    expect((await as(real).delete('/api/auth/account').send({})).status).toBe(401)
    expect(await exists(real.id)).toBe(true)
  })

  it('logging out of a real account never deletes it', async () => {
    const real = await createUser()
    await as(real).post('/api/auth/logout').send({})
    await as(real).post('/api/auth/logout').send({ this_browser_only: true })
    expect(await exists(real.id)).toBe(true)
  })

  it("an old, revoked demo cookie can't delete anything", async () => {
    const { cookie, user } = await startDemo()
    await query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [user.id])
    await withCookie(cookie).post('/api/auth/logout').send({})
    expect(await exists(user.id)).toBe(true)
  })
})
