// Two-step sign-in (authenticator app): setting it up, signing in with it,
// backup codes, and the ways it must refuse to be bypassed. Codes are made
// with the same TOTP settings an authenticator app uses.
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { createRequire } from 'node:module'
import {
  request, query, config, resetDb, closeDb, createUser, sessionCookie, as, PASSWORD
} from './helpers.mjs'

const require = createRequire(import.meta.url)
const { TOTP, Secret } = require('otpauth')
const { encrypt, decrypt } = require('../../lib/secretBox')

// Only Date is faked, so the 30-second codes are predictable while the
// database and HTTP keep running on real timers.
beforeEach(async () => {
  await resetDb()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-07-14T12:00:05Z') })
})
afterEach(() => vi.useRealTimers())
afterAll(closeDb)

// the code an authenticator app shows for `key`, `periods` steps from now
const codeFor = (key, periods = 0) => new TOTP({
  secret: Secret.fromBase32(key), algorithm: 'SHA1', digits: 6, period: 30
}).generate({ timestamp: Date.now() + periods * 30_000 })
const nextPeriod = () => vi.setSystemTime(Date.now() + 30_000)

const cookieNamed = (res, name) => res.headers['set-cookie']?.find(c => c.startsWith(`${name}=`))
const login = email => request().post('/api/auth/login').send({ email, password: PASSWORD })
const verify = (challenge, code) => request().post('/api/auth/2fa/verify').set('Cookie', challenge).send({ code })

// a user with 2FA switched on; returns the user, their key and backup codes
async function userWith2fa() {
  const user = await createUser()
  const setup = await as(user).post('/api/auth/2fa/setup').send({ password: PASSWORD })
  const key = setup.body.manual_key
  const enable = await as(user).post('/api/auth/2fa/enable').send({ code: codeFor(key) })
  expect(enable.status).toBe(200)
  nextPeriod() // the code used to switch it on can't be used again
  return { user, key, backupCodes: enable.body.backup_codes }
}

// logs in with the password; returns the challenge cookie for step two
async function passwordStep(user) {
  const res = await login(user.email)
  expect(res.body).toEqual({ two_factor_required: true })
  return cookieNamed(res, config.twoFactorCookieName).split(';')[0]
}

describe('turning 2FA on', () => {
  it('needs the account password to start', async () => {
    const user = await createUser()
    const res = await as(user).post('/api/auth/2fa/setup').send({ password: 'wrong-password' })
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Incorrect password' })
  })

  it('gives a QR code and key, and stores the secret encrypted', async () => {
    const user = await createUser()
    const res = await as(user).post('/api/auth/2fa/setup').send({ password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.qr).toMatch(/^data:image\/png;base64,/)
    expect(res.body.manual_key).toMatch(/^[A-Z2-7]{32}$/)

    const { rows } = await query('SELECT totp_pending_secret, totp_enabled FROM users WHERE id = $1', [user.id])
    expect(rows[0].totp_enabled).toBe(false) // not on until a code proves the app works
    expect(rows[0].totp_pending_secret).not.toContain(res.body.manual_key)
    expect(decrypt(rows[0].totp_pending_secret)).toBe(res.body.manual_key)
  })

  it('only switches on with a correct code from the app', async () => {
    const user = await createUser()
    const { body } = await as(user).post('/api/auth/2fa/setup').send({ password: PASSWORD })
    const wrong = await as(user).post('/api/auth/2fa/enable').send({ code: '000000' })
    expect(wrong.status).toBe(400)

    const right = await as(user).post('/api/auth/2fa/enable').send({ code: codeFor(body.manual_key) })
    expect(right.status).toBe(200)
    expect(right.body.backup_codes).toHaveLength(10)
    expect(new Set(right.body.backup_codes).size).toBe(10)
    right.body.backup_codes.forEach(c => expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/))
  })

  it('stores backup codes hashed, never as plain text', async () => {
    const { user, backupCodes } = await userWith2fa()
    const { rows } = await query('SELECT code_hash FROM totp_backup_codes WHERE user_id = $1', [user.id])
    expect(rows).toHaveLength(10)
    const stored = rows.map(r => r.code_hash).join(' ')
    backupCodes.forEach(code => expect(stored).not.toContain(code.replace('-', '')))
  })

  it('refuses to enable without setup, or to set up twice', async () => {
    const fresh = await createUser()
    expect((await as(fresh).post('/api/auth/2fa/enable').send({ code: '123456' })).body.error).toBe('Start setup first')
    const { user } = await userWith2fa()
    expect((await as(user).post('/api/auth/2fa/setup').send({ password: PASSWORD })).status).toBe(409)
  })
})

describe('signing in with 2FA', () => {
  it('gives no session after the password alone', async () => {
    const { user } = await userWith2fa()
    const res = await login(user.email)
    expect(res.status).toBe(200)
    expect(cookieNamed(res, config.cookieName)).toBeUndefined()
    const challenge = cookieNamed(res, config.twoFactorCookieName)
    expect(challenge).toMatch(/HttpOnly/i)
    expect(challenge).toMatch(/Path=\/api\/auth\/2fa/)
  })

  it('does not accept the half-way cookie as a session', async () => {
    const { user } = await userWith2fa()
    const challenge = await passwordStep(user)
    const token = challenge.split('=')[1]
    const res = await request().get('/api/user').set('Cookie', `${config.cookieName}=${token}`)
    expect(res.status).toBe(401)
  })

  it('signs in with the right code', async () => {
    const { user, key } = await userWith2fa()
    const res = await verify(await passwordStep(user), codeFor(key))
    expect(res.status).toBe(200)
    const session = cookieNamed(res, config.cookieName).split(';')[0]
    expect((await request().get('/api/auth/me').set('Cookie', session)).status).toBe(200)
  })

  it('accepts the code either side of now (phone clock drift) but no further', async () => {
    const { user, key } = await userWith2fa()
    expect((await verify(await passwordStep(user), codeFor(key, 2))).status).toBe(401)
    expect((await verify(await passwordStep(user), codeFor(key, 1))).status).toBe(200)
  })

  it('refuses a wrong code and the same code used twice', async () => {
    const { user, key } = await userWith2fa()
    const challenge = await passwordStep(user)
    expect((await verify(challenge, '123456')).body).toEqual({ error: 'Incorrect authenticator or backup code' })

    const code = codeFor(key)
    expect((await verify(challenge, code)).status).toBe(200)
    expect((await verify(await passwordStep(user), code)).status).toBe(401) // replay
  })

  it('locks the sign-in after 5 wrong codes, even for the right one', async () => {
    const { user, key } = await userWith2fa()
    const challenge = await passwordStep(user)
    for (let i = 0; i < 5; i++) expect((await verify(challenge, String(100000 + i))).status).toBe(401)
    expect((await verify(challenge, codeFor(key))).status).toBe(429)
  })

  it('needs the password step first', async () => {
    const { key } = await userWith2fa()
    const res = await request().post('/api/auth/2fa/verify').send({ code: codeFor(key) })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('CHALLENGE_EXPIRED')
  })

  it('refuses a half-way cookie after its 5 minutes are up', async () => {
    const { user, key } = await userWith2fa()
    const challenge = await passwordStep(user)
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1000)
    const res = await verify(challenge, codeFor(key))
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('CHALLENGE_EXPIRED')
  })

  it('refuses a half-way cookie once the password has been reset', async () => {
    const { user, key } = await userWith2fa()
    const challenge = await passwordStep(user)
    await query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [user.id])
    expect((await verify(challenge, codeFor(key))).status).toBe(401)
  })

  it('refuses a forged half-way cookie', async () => {
    const { user, key } = await userWith2fa()
    const forged = sessionCookie(user, { secret: 'not-the-real-secret', claims: { purpose: '2fa-login' } })
      .replace(`${config.cookieName}=`, `${config.twoFactorCookieName}=`)
    expect((await verify(forged, codeFor(key))).status).toBe(401)
  })
})

describe('backup codes', () => {
  it('sign in once each, in any case and with or without the dash', async () => {
    const { user, backupCodes } = await userWith2fa()
    const [code] = backupCodes
    expect((await verify(await passwordStep(user), code.replace('-', '').toUpperCase())).status).toBe(200)
    expect((await verify(await passwordStep(user), code)).status).toBe(401)
    expect((await verify(await passwordStep(user), backupCodes[1])).status).toBe(200)
  })

  it('belong to one account only', async () => {
    const alice = await userWith2fa()
    const bob = await userWith2fa()
    expect((await verify(await passwordStep(bob.user), alice.backupCodes[0])).status).toBe(401)
  })
})

describe('turning 2FA off and deleting the account', () => {
  it('needs both the password and a code to switch off', async () => {
    const { user, key } = await userWith2fa()
    const noCode = await as(user).post('/api/auth/2fa/disable').send({ password: PASSWORD, code: '000000' })
    expect(noCode.status).toBe(401)
    const noPassword = await as(user).post('/api/auth/2fa/disable').send({ password: 'wrong-pass', code: codeFor(key) })
    expect(noPassword.status).toBe(401)

    const ok = await as(user).post('/api/auth/2fa/disable').send({ password: PASSWORD, code: codeFor(key) })
    expect(ok.status).toBe(200)
    const after = await login(user.email)
    expect(cookieNamed(after, config.cookieName)).toBeDefined() // straight in again
    expect((await query('SELECT count(*)::int AS n FROM totp_backup_codes WHERE user_id = $1', [user.id])).rows[0].n).toBe(0)
  })

  it('needs a code to delete an account with 2FA on', async () => {
    const { user, key } = await userWith2fa()
    const without = await as(user).delete('/api/auth/account').send({ password: PASSWORD })
    expect(without.status).toBe(401)
    expect((await as(user).delete('/api/auth/account').send({ password: PASSWORD, code: codeFor(key) })).status).toBe(200)
    expect((await query('SELECT count(*)::int AS n FROM users WHERE id = $1', [user.id])).rows[0].n).toBe(0)
  })
})

describe('the stored secret', () => {
  it('cannot be read or altered without the encryption key', () => {
    const box = encrypt('JBSWY3DPEHPK3PXP')
    expect(box).not.toContain('JBSWY3DPEHPK3PXP')
    expect(encrypt('JBSWY3DPEHPK3PXP')).not.toBe(box) // fresh random IV each time
    expect(decrypt(box)).toBe('JBSWY3DPEHPK3PXP')

    const tampered = Buffer.from(box, 'base64url')
    tampered[tampered.length - 1] ^= 1
    expect(() => decrypt(tampered.toString('base64url'))).toThrow()
  })
})
