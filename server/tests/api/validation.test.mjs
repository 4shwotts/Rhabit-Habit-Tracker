// Validation: bad input is turned away with a 400 and a short, readable
// message, never a stack trace or database error.
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  request, resetDb, closeDb, createUser, createPlayer, as, formToken, uniqueEmail, goalOf, PASSWORD, SETUP_BODY
} from './helpers.mjs'

beforeEach(resetDb)
afterAll(closeDb)

// a clean error: one short `error` string and nothing else
function expectCleanError(res, status, message) {
  expect(res.status).toBe(status)
  expect(Object.keys(res.body)).toEqual(['error'])
  if (message) expect(res.body.error).toBe(message)
  expect(res.body.error.length).toBeLessThan(120)
  expect(res.body.error).not.toMatch(/\n| {4}at |SELECT|INSERT|relation|syntax|node_modules/)
}

const signup = body => request().post('/api/auth/signup').send({
  username: 'player', email: uniqueEmail(), password: PASSWORD, form_token: formToken(), ...body
})

describe('sign-up fields', () => {
  it.each([
    ['an email without an @', { email: 'not-an-email' }, 'Enter a valid email address'],
    ['an email with a space', { email: 'a b@rhabit-tests.com' }, 'Enter a valid email address'],
    ['a password under 8 characters', { password: 'short' }, 'Password must be at least 8 characters'],
    ['a password over 72 bytes', { password: 'é'.repeat(37) }, 'Password must be at most 72 bytes'],
    ['an empty username', { username: '   ' }, 'Username must be between 1 and 30 characters'],
    ['a username over 30 characters', { username: 'x'.repeat(31) }, 'Username must be between 1 and 30 characters']
  ])('rejects %s', async (_, body, message) => {
    expectCleanError(await signup(body), 400, message)
  })

  it('rejects a missing field', async () => {
    const res = await request().post('/api/auth/signup').send({ username: 'player', form_token: formToken() })
    expectCleanError(res, 400)
  })

  it('rejects the wrong type', async () => {
    expectCleanError(await signup({ username: 12345 }), 400)
  })
})

describe('game fields', () => {
  it.each([
    ['an empty goal name', { name: '  ' }, 'Goal name must be between 1 and 50 characters'],
    ['a goal name over 50 characters', { name: 'x'.repeat(51) }, 'Goal name must be between 1 and 50 characters'],
    ['a goal name that is a number', { name: 42 }, null]
  ])('rejects %s', async (_, body, message) => {
    const user = await createUser()
    expectCleanError(await as(user).post('/api/goals').send(body), 400, message)
  })

  it('rejects a task title over 40 characters', async () => {
    const player = await createPlayer()
    const goal = await goalOf(player)
    const res = await as(player).post(`/api/goals/${goal.id}/tasks`).send({ level: 4, tasks: [{ title: 'x'.repeat(41) }] })
    expectCleanError(res, 400, 'Task titles must be at most 40 characters')
  })

  it('rejects more than 6 tasks for one level', async () => {
    const player = await createPlayer()
    const goal = await goalOf(player)
    const tasks = Array.from({ length: 7 }, (_, i) => ({ title: `Task ${i}` }))
    expectCleanError(await as(player).post(`/api/goals/${goal.id}/tasks`).send({ level: 4, tasks }), 400, 'At most 6 tasks per level')
  })

  it.each([0, 11, 2.5, '3'])('rejects task level %s', async level => {
    const player = await createPlayer()
    const goal = await goalOf(player)
    expectCleanError(await as(player).post(`/api/goals/${goal.id}/tasks`).send({ level, tasks: [] }), 400)
  })

  it('needs at least three tasks for each of levels 1 to 3 at setup', async () => {
    const user = await createUser()
    const body = { ...SETUP_BODY, levels: SETUP_BODY.levels.map(l => l.level === 2 ? { ...l, titles: ['One', ' ', ''] } : l) }
    const res = await as(user).post('/api/setup').send(body)
    expectCleanError(res, 400)
    expect(res.body.error).toMatch(/need at least 3 tasks each/)
  })

  it('rejects a setting that is not true or false', async () => {
    const user = await createUser()
    expectCleanError(await as(user).patch('/api/user/settings').send({ timer_visible: 'yes' }), 400)
  })
})

describe('malformed requests', () => {
  it('answers broken JSON with 400 "Invalid JSON"', async () => {
    const res = await request().post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ')
    expectCleanError(res, 400, 'Invalid JSON')
  })

  it('answers a body over 10kb with 413', async () => {
    const user = await createUser()
    const res = await as(user).post('/api/goals').send({ name: 'x'.repeat(11_000) })
    expectCleanError(res, 413, 'Request too large')
  })

  it('answers an unknown route with a JSON 404', async () => {
    expectCleanError(await request().get('/api/nope'), 404, 'Not found')
  })

  it('gives login the same answer for a malformed email as for a wrong password', async () => {
    const res = await request().post('/api/auth/login').send({ email: 'nonsense', password: 'whatever1' })
    expectCleanError(res, 401, 'Invalid email or password')
  })
})
