// The daily game through the API: the window, ticking, confirming, penalties,
// rerolls and the midnight reset in each player's own time zone.
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import {
  query, resetDb, closeDb, createPlayer, as, goalOf, dailyTasksOf, startedSecondsAgo
} from './helpers.mjs'

beforeEach(resetDb)
afterEach(() => vi.useRealTimers())
afterAll(closeDb)

const tickAll = async player => {
  for (const t of await dailyTasksOf(player)) {
    await as(player).patch(`/api/daily/tasks/${t.id}/check`).send({ checked: true })
  }
}
const setGoalXp = (player, xp, level) =>
  query('UPDATE goals SET xp = $1, level = $2 WHERE id = $3', [xp, level, player.active_goal_id])
const dayOf = async player => (await query('SELECT * FROM daily_state WHERE user_id = $1', [player.id])).rows[0]

describe('a normal day', () => {
  it('gives three tasks and a 5-minute window at level 1', async () => {
    const player = await createPlayer()
    const res = await as(player).get('/api/daily')
    expect(res.status).toBe(200)
    expect(res.body.tasks).toHaveLength(3)
    expect(res.body.windowSeconds).toBe(300)
    expect(res.body.state.started).toBe(false)
  })

  it('only allows ticking once the day has started', async () => {
    const player = await createPlayer()
    const [t] = await dailyTasksOf(player)
    const res = await as(player).patch(`/api/daily/tasks/${t.id}/check`).send({ checked: true })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Start your tasks first')
  })

  it('keeps confirm locked until the last minute of the window', async () => {
    const player = await createPlayer()
    await as(player).post('/api/daily/start')
    await tickAll(player)
    const res = await as(player).post('/api/daily/confirm')
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Confirm not yet unlocked')
  })

  it('will not confirm with a task left unticked', async () => {
    const player = await createPlayer()
    await as(player).post('/api/daily/start')
    const [first] = await dailyTasksOf(player)
    await as(player).patch(`/api/daily/tasks/${first.id}/check`).send({ checked: true })
    await startedSecondsAgo(player, 250)
    const res = await as(player).post('/api/daily/confirm')
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Tick off all your tasks first')
    expect((await goalOf(player)).xp).toBe(0)
  })

  it('awards 15 XP once, and levels up when the bar fills', async () => {
    const player = await createPlayer()
    await setGoalXp(player, 90, 1)
    await as(player).post('/api/daily/start')
    await tickAll(player)
    await startedSecondsAgo(player, 250)

    const res = await as(player).post('/api/daily/confirm')
    expect(res.body).toMatchObject({ xp: 5, level: 2, xp_earned: 15 })
    const again = await as(player).post('/api/daily/confirm')
    expect(again.status).toBe(409)
    expect((await goalOf(player)).xp).toBe(5)
  })

  it('cannot start twice', async () => {
    const player = await createPlayer()
    expect((await as(player).post('/api/daily/start')).status).toBe(200)
    const res = await as(player).post('/api/daily/start')
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Today has already started')
  })
})

describe('penalties', () => {
  it('starts a penalty when the window runs out with tasks unticked', async () => {
    const player = await createPlayer()
    await as(player).post('/api/daily/start')
    await startedSecondsAgo(player, 300 + 10)

    const res = await as(player).get('/api/daily')
    expect(res.body.outcome).toBe('window_missed')
    expect(res.body.penalty.active).toBe(true)
    expect(res.body.penalty.task_title).toBeTruthy()
  })

  it('refuses to start the penalty early, and starting it twice is harmless', async () => {
    const player = await createPlayer()
    await as(player).post('/api/daily/start')
    const early = await as(player).post('/api/daily/penalty/trigger')
    expect(early.status).toBe(409)
    expect(early.body.error).toBe('The window is still open')

    await startedSecondsAgo(player, 299) // the client's timer has just hit zero
    const first = await as(player).post('/api/daily/penalty/trigger')
    const second = await as(player).post('/api/daily/penalty/trigger')
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body.task).toEqual(first.body.task)
  })

  it('takes 15 XP when the penalty runs out, only once', async () => {
    const player = await createPlayer()
    await setGoalXp(player, 40, 2)
    await as(player).post('/api/daily/start')
    await startedSecondsAgo(player, 299)
    await as(player).post('/api/daily/penalty/trigger')
    await query(
      `UPDATE penalty_state SET started_at = now() - make_interval(secs => task_timer_seconds + 10) WHERE user_id = $1`,
      [player.id]
    )

    const first = await as(player).post('/api/daily/penalty/fail')
    const second = await as(player).post('/api/daily/penalty/fail')
    expect(first.body).toMatchObject({ xp: 25, level: 2 })
    expect(second.body).toMatchObject({ xp: 25, level: 2 })
    expect((await dayOf(player)).confirmed).toBe(true)
  })

  it('never drops below level 1 with 0 XP', async () => {
    const player = await createPlayer()
    await setGoalXp(player, 5, 1)
    await as(player).post('/api/daily/start')
    await startedSecondsAgo(player, 299)
    await as(player).post('/api/daily/penalty/trigger')
    await query(`UPDATE penalty_state SET started_at = now() - interval '1 hour' WHERE user_id = $1`, [player.id])
    const res = await as(player).get('/api/daily')
    expect(res.body.outcome).toBe('penalty_failed')
    expect(await goalOf(player)).toMatchObject({ xp: 0, level: 1 })
  })

  it('cannot confirm the penalty before it unlocks', async () => {
    const player = await createPlayer()
    await as(player).post('/api/daily/start')
    await startedSecondsAgo(player, 299)
    await as(player).post('/api/daily/penalty/trigger')
    const res = await as(player).post('/api/daily/penalty/confirm')
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Confirm not yet unlocked')
  })
})

describe('rerolling a task', () => {
  it('costs 5 XP, works once per task and never on the first task', async () => {
    const player = await createPlayer()
    await setGoalXp(player, 20, 1)
    const [first, second] = await dailyTasksOf(player)

    expect((await as(player).post(`/api/daily/tasks/${first.id}/refresh`)).status).toBe(403)
    const res = await as(player).post(`/api/daily/tasks/${second.id}/refresh`)
    expect(res.status).toBe(200)
    expect((await goalOf(player)).xp).toBe(15)
    const again = await as(player).post(`/api/daily/tasks/${second.id}/refresh`)
    expect(again.body.error).toBe('Task already refreshed')
  })

  it('is refused with no XP to spend', async () => {
    const player = await createPlayer()
    const [, second] = await dailyTasksOf(player)
    const res = await as(player).post(`/api/daily/tasks/${second.id}/refresh`)
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Not enough XP to refresh')
  })
})

describe('the daily reset', () => {
  // Only the server's clock (Date) is faked; real timers keep the database
  // connection and HTTP requests working.
  const at = iso => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)) }

  async function finishedDay(player, lastReset) {
    await query(
      `UPDATE daily_state SET started = TRUE, confirmed = TRUE, last_reset = $1 WHERE user_id = $2`,
      [lastReset, player.id]
    )
    await query('UPDATE daily_tasks SET checked = TRUE WHERE user_id = $1', [player.id])
  }

  it('starts a fresh day at local midnight, not before', async () => {
    const player = await createPlayer({ timezone: 'Europe/London' })
    await finishedDay(player, '2026-07-14')

    at('2026-07-14T22:59:59Z') // 23:59:59 in London (BST)
    await as(player).get('/api/daily')
    expect((await dayOf(player)).confirmed).toBe(true)

    at('2026-07-14T23:00:00Z') // midnight in London
    const res = await as(player).get('/api/daily')
    const day = await dayOf(player)
    expect(day).toMatchObject({ started: false, confirmed: false, last_reset: '2026-07-15' })
    expect(res.body.tasks).toHaveLength(3)
    expect(res.body.tasks.every(t => !t.checked)).toBe(true)
  })

  it('uses each player\'s own time zone', async () => {
    const london = await createPlayer({ timezone: 'Europe/London' })
    const kiritimati = await createPlayer({ timezone: 'Pacific/Kiritimati' }) // UTC+14
    await finishedDay(london, '2026-07-14')
    await finishedDay(kiritimati, '2026-07-14')

    at('2026-07-14T12:00:00Z') // 13:00 on the 14th in London, 02:00 on the 15th in Kiritimati
    await as(london).get('/api/daily')
    await as(kiritimati).get('/api/daily')
    expect((await dayOf(london)).confirmed).toBe(true)
    expect(await dayOf(kiritimati)).toMatchObject({ confirmed: false, last_reset: '2026-07-15' })
  })

  it('resets only once however many requests arrive together', async () => {
    const player = await createPlayer()
    await finishedDay(player, '2026-07-13')
    at('2026-07-14T12:00:00Z')
    const results = await Promise.all(Array.from({ length: 5 }, () => as(player).get('/api/daily')))
    expect(results.every(r => r.status === 200)).toBe(true)
    expect(await dailyTasksOf(player)).toHaveLength(3)
  })

  it('does nothing while progression is paused', async () => {
    const player = await createPlayer()
    await finishedDay(player, '2026-07-13')
    // set directly: the settings route itself would run the reset first
    await query('UPDATE users SET pause_progression = TRUE WHERE id = $1', [player.id])
    at('2026-07-14T12:00:00Z')
    await as(player).get('/api/daily')
    expect((await dayOf(player)).last_reset).toBe('2026-07-13')
  })
})
