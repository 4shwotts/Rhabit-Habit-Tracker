// The wake-up call the login page makes as it loads, and the separate health
// check: /api/wake runs one trivial database query so the database wakes too,
// is rate-limited, and fails cleanly; /api/health never touches the database.
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { createRequire } from 'node:module'
import { request, resetDb, closeDb } from './helpers.mjs'

const require = createRequire(import.meta.url)
const db = require('../../db')

beforeEach(resetDb)
afterEach(() => vi.restoreAllMocks())
afterAll(closeDb)

describe('/api/wake', () => {
  it('needs no login and says the server is awake', async () => {
    const res = await request().get('/api/wake')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'awake' })
  })

  it('runs one trivial database query, so the database wakes too', async () => {
    const spy = vi.spyOn(db, 'query')
    await request().get('/api/wake')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('SELECT 1')
  })

  it('answers with a clean 503 if the database cannot be reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(db, 'query').mockRejectedValueOnce(new Error('connection terminated'))
    const res = await request().get('/api/wake')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ status: 'unavailable' })
  })

  it('is rate-limited per IP address', async () => {
    for (let i = 0; i < 60; i++) expect((await request().get('/api/wake')).status).toBe(200)
    expect((await request().get('/api/wake')).status).toBe(429)
  })

  it('only answers GET', async () => {
    expect((await request().post('/api/wake')).status).toBe(404)
  })
})

describe('/api/health', () => {
  it('stays as it was: ok, with no database query', async () => {
    const spy = vi.spyOn(db, 'query')
    const res = await request().get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
    expect(spy).not.toHaveBeenCalled()
  })
})
