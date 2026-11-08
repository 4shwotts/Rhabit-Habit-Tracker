// The public sign-up switch (PUBLIC_SIGNUP_ENABLED). With it off, the server
// refuses every sign-up, however it's called, while existing accounts keep
// logging in, resetting passwords, verifying emails and using 2FA. With it on,
// everything works as normal. Each check runs under both settings.
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { createRequire } from 'node:module'
import {
  request, query, config, resetDb, closeDb, createUser, as, PASSWORD, outbox, emailsTo, tokenFrom, formToken
} from './helpers.mjs'

const require = createRequire(import.meta.url)
const { TOTP, Secret } = require('otpauth')

beforeEach(resetDb)
afterEach(() => { config.publicSignupEnabled = true })
afterAll(closeDb)

const signUp = (email = 'new.player@example.com') => request().post('/api/auth/signup').send({
  username: 'New', email, password: 'correct-horse-battery', form_token: formToken()
})

const userCount = async () => (await query('SELECT count(*)::int AS n FROM users')).rows[0].n

it('is on by default', () => {
  expect(config.publicSignupEnabled).toBe(true)
})

describe.each([
  ['on', true],
  ['off', false]
])('with sign-up %s', (_, enabled) => {
  beforeEach(() => { config.publicSignupEnabled = enabled })

  it('tells the frontend', async () => {
    expect((await request().get('/api/auth/config')).body).toEqual({ public_signup_enabled: enabled })
  })

  it(enabled ? 'accepts sign-up' : 'rejects sign-up with a clean 403, creating and sending nothing', async () => {
    const res = await signUp()
    if (enabled) {
      expect(res.status).toBe(202)
      expect(await userCount()).toBe(1)
      expect(emailsTo('new.player@example.com')).toHaveLength(1)
    } else {
      expect(res.status).toBe(403)
      expect(res.body).toEqual({
        error: 'Sign-up is closed at the moment. You can still try the demo.', code: 'SIGNUP_DISABLED'
      })
      expect(await userCount()).toBe(0)
      expect(outbox()).toEqual([])
    }
  })

  it(enabled ? 'hands out the sign-up form token' : 'refuses the sign-up form token too', async () => {
    expect((await request().get('/api/auth/signup-token')).status).toBe(enabled ? 200 : 403)
  })

  it('lets existing accounts log in', async () => {
    const real = await createUser()
    const res = await request().post('/api/auth/login').send({ email: real.email, password: PASSWORD })
    expect(res.status).toBe(200)
    expect((await as(real).get('/api/auth/me')).status).toBe(200)
  })

  it('lets existing accounts reset a forgotten password', async () => {
    const real = await createUser()
    expect((await request().post('/api/auth/forgot-password').send({ email: real.email })).status).toBe(200)
    const token = tokenFrom(emailsTo(real.email).at(-1))
    const reset = await request().post('/api/auth/reset-password').send({ token, password: 'a-brand-new-password' })
    expect(reset.status).toBe(200)
    const login = await request().post('/api/auth/login').send({ email: real.email, password: 'a-brand-new-password' })
    expect(login.status).toBe(200)
  })

  it('lets existing accounts verify their email', async () => {
    const unverified = await createUser({ verified: false })
    await request().post('/api/auth/resend-verification').send({ email: unverified.email })
    const token = tokenFrom(emailsTo(unverified.email).at(-1))
    expect((await request().post('/api/auth/verify-email').send({ token })).status).toBe(200)
    const { rows } = await query('SELECT email_verified FROM users WHERE id = $1', [unverified.id])
    expect(rows[0].email_verified).toBe(true)
  })

  it('lets existing accounts set up two-step sign-in and log in with it', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-07-14T12:00:05Z') })
    try {
      const real = await createUser()
      const key = (await as(real).post('/api/auth/2fa/setup').send({ password: PASSWORD })).body.manual_key
      const code = (periods = 0) => new TOTP({
        secret: Secret.fromBase32(key), algorithm: 'SHA1', digits: 6, period: 30
      }).generate({ timestamp: Date.now() + periods * 30_000 })
      expect((await as(real).post('/api/auth/2fa/enable').send({ code: code() })).status).toBe(200)

      vi.setSystemTime(Date.now() + 30_000) // the code used to switch it on can't be used again
      const login = await request().post('/api/auth/login').send({ email: real.email, password: PASSWORD })
      expect(login.body).toEqual({ two_factor_required: true })
      const challenge = login.headers['set-cookie'].find(c => c.startsWith(`${config.twoFactorCookieName}=`)).split(';')[0]
      const verify = await request().post('/api/auth/2fa/verify').set('Cookie', challenge).send({ code: code() })
      expect(verify.status).toBe(200)
    } finally {
      vi.useRealTimers()
    }
  })

  it('still lets visitors in through the demo', async () => {
    expect((await request().post('/api/auth/demo').send({})).status).toBe(201)
  })
})
