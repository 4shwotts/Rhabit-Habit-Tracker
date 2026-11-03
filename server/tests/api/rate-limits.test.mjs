// Rate limiting: repeated attempts are cut off with a 429 before they can
// guess passwords, spam sign-ups or flood someone's inbox.
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { request, resetDb, closeDb, createUser, formToken, uniqueEmail, outbox, PASSWORD } from './helpers.mjs'

beforeEach(resetDb)
afterAll(closeDb)

const TOO_MANY = { error: 'Too many attempts. Please wait a while and try again.' }
const login = (email, password) => request().post('/api/auth/login').send({ email, password })

describe('rate limits', () => {
  it('locks one account after 5 wrong passwords, even for the right one', async () => {
    const user = await createUser()
    for (let i = 0; i < 5; i++) expect((await login(user.email, `wrong-${i}-pass`)).status).toBe(401)

    const blocked = await login(user.email, 'wrong-again-pass')
    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual(TOO_MANY)
    expect(blocked.headers['ratelimit-policy']).toBeDefined()
    expect((await login(user.email, PASSWORD)).status).toBe(429)
  })

  it('does not count successful logins towards the limit', async () => {
    const user = await createUser()
    for (let i = 0; i < 8; i++) expect((await login(user.email, PASSWORD)).status).toBe(200)
  })

  it('stops one address trying 20 different accounts', async () => {
    for (let i = 0; i < 20; i++) {
      expect((await login(uniqueEmail('guess'), 'some-password')).status).toBe(401)
    }
    expect((await login(uniqueEmail('guess'), 'some-password')).status).toBe(429)
  })

  it('allows 5 sign-ups an hour from one address', async () => {
    const signup = () => request().post('/api/auth/signup')
      .send({ username: 'player', email: uniqueEmail(), password: PASSWORD, form_token: formToken() })
    for (let i = 0; i < 5; i++) expect((await signup()).status).toBe(202)
    const blocked = await signup()
    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual(TOO_MANY)
  })

  it('sends at most 3 password reset emails an hour to one address', async () => {
    const user = await createUser()
    const forgot = () => request().post('/api/auth/forgot-password').send({ email: user.email })
    for (let i = 0; i < 3; i++) expect((await forgot()).status).toBe(200)
    expect((await forgot()).status).toBe(429)
    expect(outbox()).toHaveLength(3)
  })

  it('caps the whole API at 300 requests per 15 minutes from one address', async () => {
    for (let i = 0; i < 300; i++) {
      const res = await request().get('/api/health')
      if (res.status !== 200) throw new Error(`request ${i + 1} got ${res.status}`)
    }
    const blocked = await request().get('/api/health')
    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toMatch(/Too many requests/)
  })
})
