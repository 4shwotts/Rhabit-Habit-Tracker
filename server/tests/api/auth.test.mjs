// Authentication: sign-up, email verification, login, logout, sessions and
// password reset, through the real API and a real (test) database.
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  request, query, config, resetDb, closeDb, createUser, sessionCookie, as, formToken,
  outbox, emailsTo, tokenFrom, uniqueEmail, PASSWORD
} from './helpers.mjs'

beforeEach(resetDb)
afterAll(closeDb)

const GENERIC_SIGNUP = /Check your inbox/
const signup = (email, extra = {}) => request().post('/api/auth/signup').send({
  username: 'newplayer', email, password: PASSWORD, timezone: 'Europe/London', form_token: formToken(), ...extra
})
const login = (email, password = PASSWORD) => request().post('/api/auth/login').send({ email, password })
const sessionFrom = res => res.headers['set-cookie']?.find(c => c.startsWith(`${config.cookieName}=`))
const userByEmail = async email => (await query('SELECT * FROM users WHERE email = $1', [email])).rows[0]

describe('sign-up and verification', () => {
  it('creates an unverified account and emails a verification link', async () => {
    const email = uniqueEmail()
    const res = await signup(email)
    expect(res.status).toBe(202)
    expect(res.body.message).toMatch(GENERIC_SIGNUP)

    const user = await userByEmail(email)
    expect(user.email_verified).toBe(false)
    expect(user.password_hash).not.toContain(PASSWORD) // stored hashed
    expect(emailsTo(email)).toHaveLength(1)
  })

  it('verifies the email with the emailed link, once only', async () => {
    const email = uniqueEmail()
    await signup(email)
    const token = tokenFrom(emailsTo(email)[0])

    const ok = await request().post('/api/auth/verify-email').send({ token })
    expect(ok.status).toBe(200)
    expect((await userByEmail(email)).email_verified).toBe(true)

    const again = await request().post('/api/auth/verify-email').send({ token })
    expect(again.status).toBe(400)
    expect(again.body.error).toBe('This verification link is invalid or has expired.')
  })

  it('gives the same answer for an email that already has an account, without a second account', async () => {
    const existing = await createUser()
    const res = await signup(existing.email)
    expect(res.status).toBe(202)
    expect(res.body.message).toMatch(GENERIC_SIGNUP)
    const { rows } = await query('SELECT count(*)::int AS n FROM users WHERE email = $1', [existing.email])
    expect(rows[0].n).toBe(1)
    expect(emailsTo(existing.email)[0].subject).toMatch(/Sign-up attempt/)
  })

  it('quietly ignores a form sent back too quickly (bot check)', async () => {
    const email = uniqueEmail()
    const res = await signup(email, { form_token: formToken(500) })
    expect(res.status).toBe(202) // looks the same to a bot...
    expect(await userByEmail(email)).toBeUndefined() // ...but nothing was created
    expect(outbox()).toHaveLength(0)
  })

  it('quietly ignores a filled-in honeypot field', async () => {
    const email = uniqueEmail()
    const res = await signup(email, { website: 'http://spam.example' })
    expect(res.status).toBe(202)
    expect(await userByEmail(email)).toBeUndefined()
  })

  it('refuses throwaway inboxes and domains that cannot receive mail', async () => {
    for (const email of ['someone@mailinator.com', 'someone@nomail.rhabit-tests.com']) {
      const res = await signup(email)
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Please use a verified email address' })
    }
  })
})

describe('login and logout', () => {
  it('logs in with the right password and sets a secure session cookie', async () => {
    const user = await createUser()
    const res = await login(user.email)
    expect(res.status).toBe(200)
    const cookie = sessionFrom(res)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)

    const me = await request().get('/api/auth/me').set('Cookie', cookie.split(';')[0])
    expect(me.status).toBe(200)
    expect(me.body.user.email).toBe(user.email)
    expect(JSON.stringify(me.body)).not.toMatch(/password|hash|totp_secret/i)
  })

  it('accepts the email in any case and with spaces around it', async () => {
    const user = await createUser()
    expect((await login(`  ${user.email.toUpperCase()} `)).status).toBe(200)
  })

  it('gives the same 401 for a wrong password and for an unknown email', async () => {
    const user = await createUser()
    const wrong = await login(user.email, 'not-the-password')
    const unknown = await login(uniqueEmail('nobody'))
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body).toEqual({ error: 'Invalid email or password' })
    expect(unknown.body).toEqual(wrong.body)
    expect(sessionFrom(wrong)).toBeUndefined()
  })

  it('does not log in an unverified account', async () => {
    const user = await createUser({ verified: false })
    const res = await login(user.email)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED')
    expect(sessionFrom(res)).toBeUndefined()
  })

  it('clears the session cookie on logout', async () => {
    const user = await createUser()
    const res = await as(user).post('/api/auth/logout')
    expect(res.status).toBe(200)
    expect(sessionFrom(res)).toMatch(/Expires=Thu, 01 Jan 1970/)
  })

  // Bug found by this suite: logout only asked the browser to delete its
  // cookie, so a copy of the cookie kept working for up to 12 hours
  it('ends the session on the server too, on every device', async () => {
    const user = await createUser()
    const loggedIn = sessionFrom(await login(user.email)).split(';')[0]
    const otherDevice = sessionFrom(await login(user.email)).split(';')[0]

    await request().post('/api/auth/logout').set('Cookie', loggedIn)
    expect((await request().get('/api/auth/me').set('Cookie', loggedIn)).status).toBe(401)
    expect((await request().get('/api/auth/me').set('Cookie', otherDevice)).status).toBe(401)

    // logging back in works as normal
    const again = sessionFrom(await login(user.email)).split(';')[0]
    expect((await request().get('/api/auth/me').set('Cookie', again)).status).toBe(200)
  })

  it('only drops this browser\'s cookie when a new visit cleans up', async () => {
    const user = await createUser()
    const phone = sessionFrom(await login(user.email)).split(';')[0]
    const laptop = sessionFrom(await login(user.email)).split(';')[0]

    const res = await request().post('/api/auth/logout').set('Cookie', laptop).send({ this_browser_only: true })
    expect(sessionFrom(res)).toMatch(/Expires=Thu, 01 Jan 1970/)
    expect((await request().get('/api/auth/me').set('Cookie', phone)).status).toBe(200)
  })

  it('logs out cleanly with no session or a bad one', async () => {
    expect((await request().post('/api/auth/logout')).status).toBe(200)
    const res = await request().post('/api/auth/logout').set('Cookie', `${config.cookieName}=rubbish`)
    expect(res.status).toBe(200)
  })
})

describe('protected routes', () => {
  const routes = [
    ['get', '/api/auth/me'], ['get', '/api/user'], ['get', '/api/goals'], ['get', '/api/daily'],
    ['post', '/api/daily/start'], ['post', '/api/setup'], ['patch', '/api/user/settings']
  ]

  it.each(routes)('%s %s needs a session (401 without one)', async (method, url) => {
    const res = await request()[method](url)
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Not logged in' })
  })

  it('refuses an expired session', async () => {
    const user = await createUser()
    const res = await as(user, sessionCookie(user, { expired: true })).get('/api/user')
    expect(res.status).toBe(401)
  })

  it('refuses a session signed with the wrong secret', async () => {
    const user = await createUser()
    const res = await as(user, sessionCookie(user, { secret: 'not-the-real-secret' })).get('/api/user')
    expect(res.status).toBe(401)
  })

  it('refuses a session that has been tampered with', async () => {
    const user = await createUser()
    const other = await createUser()
    // swap in someone else's user id but keep the original signature
    const [name, token] = sessionCookie(user).split('=')
    const [head, , sig] = token.split('.')
    const body = Buffer.from(JSON.stringify({ sub: String(other.id), tv: 0 })).toString('base64url')
    const res = await as(user, `${name}=${head}.${body}.${sig}`).get('/api/user')
    expect(res.status).toBe(401)
  })

  it('refuses an unsigned ("alg: none") session', async () => {
    const user = await createUser()
    const head = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify({ sub: String(user.id), tv: 0 })).toString('base64url')
    const res = await as(user, `${config.cookieName}=${head}.${body}.`).get('/api/user')
    expect(res.status).toBe(401)
  })

  it('refuses the half-way 2FA login token as a session', async () => {
    const user = await createUser()
    const res = await as(user, sessionCookie(user, { claims: { purpose: '2fa-login' } })).get('/api/user')
    expect(res.status).toBe(401)
  })

  it('refuses a session for an account that has been deleted', async () => {
    const user = await createUser()
    await query('DELETE FROM users WHERE id = $1', [user.id])
    expect((await as(user).get('/api/user')).status).toBe(401)
  })

  it('keeps game routes closed to unverified accounts', async () => {
    const user = await createUser({ verified: false })
    const res = await as(user).get('/api/goals')
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED')
  })
})

describe('password reset', () => {
  it('resets the password with the emailed link and signs out every old session', async () => {
    const user = await createUser()
    const oldSession = sessionCookie(user)

    const forgot = await request().post('/api/auth/forgot-password').send({ email: user.email })
    expect(forgot.status).toBe(200)
    const token = tokenFrom(emailsTo(user.email)[0])

    const reset = await request().post('/api/auth/reset-password').send({ token, password: 'a-brand-new-password' })
    expect(reset.status).toBe(200)

    expect((await as(user, oldSession).get('/api/user')).status).toBe(401)
    expect((await login(user.email)).status).toBe(401)
    expect((await login(user.email, 'a-brand-new-password')).status).toBe(200)

    // the link only works once
    const again = await request().post('/api/auth/reset-password').send({ token, password: 'another-password-1' })
    expect(again.status).toBe(400)
  })

  it('answers the same for an unknown email and sends nothing', async () => {
    const user = await createUser()
    const known = await request().post('/api/auth/forgot-password').send({ email: user.email })
    const unknown = await request().post('/api/auth/forgot-password').send({ email: uniqueEmail('nobody') })
    expect(unknown.status).toBe(known.status)
    expect(unknown.body).toEqual(known.body)
    expect(outbox()).toHaveLength(1)
  })

  it('refuses a made-up reset token', async () => {
    const res = await request().post('/api/auth/reset-password')
      .send({ token: 'x'.repeat(43), password: 'a-brand-new-password' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'This reset link is invalid or has expired.' })
  })
})
