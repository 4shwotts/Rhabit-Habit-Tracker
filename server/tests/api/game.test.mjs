// The daily game through the API: the window, ticking, confirming, penalties,
// rerolls and the midnight reset in each player's own time zone.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import {
  query, resetDb, closeDb, createPlayer, as, goalOf, dailyTasksOf, startedSecondsAgo, secondsAgo, setClock
} from './helpers.mjs'

beforeEach(resetDb)

afterAll(closeDb)

// a level 1 window lasts 3 hours; confirm opens for the last 30 minutes
const WINDOW = 3 * 60 * 60
const CONFIRM_OPEN = WINDOW - 29 * 60

const tickAll = async player => {
  for (const t of await dailyTasksOf(player)) {
    await as(player).patch(`/api/daily/tasks/${t.id}/check`).send({ checked: true })
  }
}
const setGoalXp = (player, xp, level) =>
  query('UPDATE goals SET xp = $1, level = $2 WHERE id = $3', [xp, level, player.active_goal_id])
const dayOf = async player => (await query('SELECT * FROM daily_state WHERE user_id = $1', [player.id])).rows[0]

describe('a normal day', () => {
  it('gives three tasks and a 3-hour window at level 1', async () => {
    const player = await createPlayer()
    const res = await as(player).get('/api/daily')
    expect(res.status).toBe(200)
    expect(res.body.tasks).toHaveLength(3)
    expect(res.body.windowSeconds).toBe(WINDOW)
    expect(res.body.state.started).toBe(false)
  })

  it('only allows ticking once the day has started', async () => {
    const player = await createPlayer()
    const [t] = await dailyTasksOf(player)
    const res = await as(player).patch(`/api/daily/tasks/${t.id}/check`).send({ checked: true })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Start your tasks first')
  })

  it('keeps confirm locked until the last 30 minutes of the window', async () => {
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
    await startedSecondsAgo(player, CONFIRM_OPEN)
    const res = await as(player).post('/api/daily/confirm')
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Tick off all your tasks first')
    expect((await goalOf(player)).xp).toBe(0)
  })

  it('awards 45 XP once, and levels up when the bar fills', async () => {
    const player = await createPlayer()
    await setGoalXp(player, 90, 1)
    await as(player).post('/api/daily/start')
    await tickAll(player)
    await startedSecondsAgo(player, CONFIRM_OPEN)

    const res = await as(player).post('/api/daily/confirm')
    expect(res.body).toMatchObject({ xp: 35, level: 2, xp_earned: 45 })
    const again = await as(player).post('/api/daily/confirm')
    expect(again.status).toBe(409)
    expect((await goalOf(player)).xp).toBe(35)
  })

  it('stops at a full bar on level 10', async () => {
    const player = await createPlayer()
    await setGoalXp(player, 95, 10)
    await as(player).post('/api/daily/start')
    await tickAll(player)
    await startedSecondsAgo(player, CONFIRM_OPEN)
    const res = await as(player).post('/api/daily/confirm')
    expect(res.body).toMatchObject({ xp: 100, level: 10 })
    expect(await goalOf(player)).toMatchObject({ xp: 100, level: 10 })
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
    await startedSecondsAgo(player, WINDOW + 10)

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

    await startedSecondsAgo(player, WINDOW - 1) // the client's timer has just hit zero
    const first = await as(player).post('/api/daily/penalty/trigger')
    const second = await as(player).post('/api/daily/penalty/trigger')
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body.task).toEqual(first.body.task)
  })

  it('takes 45 XP when the penalty runs out, only once', async () => {
    const player = await createPlayer()
    await setGoalXp(player, 40, 2)
    await as(player).post('/api/daily/start')
    await startedSecondsAgo(player, WINDOW - 1)
    await as(player).post('/api/daily/penalty/trigger')
    await query(
      `UPDATE penalty_state SET started_at = $2 WHERE user_id = $1`,
      [player.id, secondsAgo(3600 + 10)]
    )

    const first = await as(player).post('/api/daily/penalty/fail')
    const second = await as(player).post('/api/daily/penalty/fail')
    expect(first.body).toMatchObject({ xp: 95, level: 1 })
    expect(second.body).toMatchObject({ xp: 95, level: 1 })
    expect((await dayOf(player)).confirmed).toBe(true)
  })

  it('never drops below level 1 with 0 XP', async () => {
    const player = await createPlayer()
    await setGoalXp(player, 5, 1)
    await as(player).post('/api/daily/start')
    await startedSecondsAgo(player, WINDOW - 1)
    await as(player).post('/api/daily/penalty/trigger')
    await query('UPDATE penalty_state SET started_at = $2 WHERE user_id = $1', [player.id, secondsAgo(2 * 3600)])
    const res = await as(player).get('/api/daily')
    expect(res.body.outcome).toBe('penalty_failed')
    expect(await goalOf(player)).toMatchObject({ xp: 0, level: 1 })
  })

  it('cannot confirm the penalty before it unlocks', async () => {
    const player = await createPlayer()
    await as(player).post('/api/daily/start')
    await startedSecondsAgo(player, WINDOW - 1)
    await as(player).post('/api/daily/penalty/trigger')
    const res = await as(player).post('/api/daily/penalty/confirm')
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Confirm not yet unlocked')
  })
})

describe('the penalty timer', () => {
  it('lasts an hour, and confirm opens 10 minutes before the end', async () => {
    const player = await createPlayer()
    await as(player).post('/api/daily/start')
    await startedSecondsAgo(player, WINDOW - 1)
    await as(player).post('/api/daily/penalty/trigger')
    const { penalty } = (await as(player).get('/api/daily')).body
    expect(penalty).toMatchObject({ task_timer_seconds: 3600, unlock_before_end: 600 })

    const startedAgo = seconds => query(
      'UPDATE penalty_state SET started_at = $1 WHERE user_id = $2',
      [secondsAgo(seconds), player.id]
    )
    await startedAgo(45 * 60) // 15 minutes left: still locked
    expect((await as(player).post('/api/daily/penalty/confirm')).status).toBe(403)
    await startedAgo(51 * 60) // 9 minutes left: open
    expect((await as(player).post('/api/daily/penalty/confirm')).status).toBe(200)
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

describe('too late in the day', () => {
  async function player(xp = 60, level = 2) {
    const p = await createPlayer({ timezone: 'UTC' })
    await setGoalXp(p, xp, level)
    return p
  }

  it('gives a penalty at once when a window no longer fits before midnight', async () => {
    const p = await player()
    setClock('2026-07-14T22:00:00Z') // 2 hours left, the window needs 3
    const res = await as(p).get('/api/daily')
    expect(res.body.outcome).toBe('late_penalty')
    expect(res.body.penalty.active).toBe(true)
    expect(res.body.xpLoss).toBeNull()
  })

  it('takes the XP at once when not even a penalty fits', async () => {
    const p = await player()
    setClock('2026-07-14T23:30:00Z')
    const res = await as(p).get('/api/daily')
    expect(res.body.outcome).toBe('late_auto_failed')
    expect(res.body.penalty.active).toBe(false)
    expect(res.body.xpLoss).toEqual({ amount: 45, reason: 'late', xp: 15, level: 2 })
    expect(await goalOf(p)).toMatchObject({ xp: 15, level: 2 })
  })

  it('still gives a penalty for a missed window when it fits before midnight', async () => {
    const p = await player()
    setClock('2026-07-14T19:50:00Z')
    await as(p).post('/api/daily/start')
    setClock('2026-07-14T22:50:10Z') // window ended 10 seconds ago, 70 minutes left
    const res = await as(p).get('/api/daily')
    expect(res.body.outcome).toBe('window_missed')
    expect(res.body.penalty.active).toBe(true)
  })

  it('skips the penalty for a window missed with under an hour left', async () => {
    const p = await player()
    setClock('2026-07-14T20:30:00Z')
    await as(p).post('/api/daily/start')
    setClock('2026-07-14T23:30:10Z')
    const res = await as(p).get('/api/daily')
    expect(res.body.penalty.active).toBe(false)
    expect(res.body.xpLoss).toMatchObject({ amount: 45, reason: 'late' })
    expect((await goalOf(p)).xp).toBe(15)
  })

  it('does the same when the browser asks for the penalty', async () => {
    const p = await player()
    setClock('2026-07-14T20:30:00Z')
    await as(p).post('/api/daily/start')
    setClock('2026-07-14T23:30:00Z')
    const res = await as(p).post('/api/daily/penalty/trigger')
    expect(res.status).toBe(200)
    expect(res.body.task).toBeNull()
    expect((await as(p).get('/api/daily')).body.xpLoss).toMatchObject({ amount: 45, reason: 'late' })
    expect((await goalOf(p)).xp).toBe(15)
  })
})

describe('leaving a day unfinished', () => {
  const NEXT_DAY = '2026-07-15T09:00:00Z'

  async function player(xp = 60, level = 2) {
    const p = await createPlayer({ timezone: 'UTC' })
    await setGoalXp(p, xp, level)
    return p
  }

  it('costs XP for a started day the player never came back to', async () => {
    const p = await player()
    await as(p).post('/api/daily/start')
    setClock(NEXT_DAY)
    const res = await as(p).get('/api/daily')
    expect(res.body.xpLoss).toEqual({ amount: 45, reason: 'missed_day', xp: 15, level: 2 })
    expect(res.body.state.started).toBe(false) // today carries on as normal
    expect(res.body.tasks).toHaveLength(3)
  })

  it('costs XP for a day that was opened but never started', async () => {
    const p = await player()
    setClock(NEXT_DAY)
    expect((await as(p).get('/api/daily')).body.xpLoss).toMatchObject({ amount: 45, reason: 'missed_day' })
  })

  it('costs XP for a penalty left running when the day ended', async () => {
    const p = await player()
    setClock('2026-07-14T18:30:00Z')
    await as(p).post('/api/daily/start')
    setClock('2026-07-14T21:30:00Z')
    await as(p).post('/api/daily/penalty/trigger')
    setClock(NEXT_DAY)
    const res = await as(p).get('/api/daily')
    expect(res.body.penalty.active).toBe(false)
    expect(res.body.xpLoss).toMatchObject({ amount: 45, reason: 'missed_day' })
  })

  it('reports what was really lost near level 1 with 0 XP', async () => {
    const p = await player(20, 1)
    setClock(NEXT_DAY)
    expect((await as(p).get('/api/daily')).body.xpLoss).toMatchObject({ amount: 20, xp: 0, level: 1 })
  })

  it('costs XP when every task was ticked but never confirmed', async () => {
    const p = await player()
    await as(p).post('/api/daily/start')
    await tickAll(p)
    setClock(NEXT_DAY)
    expect((await as(p).get('/api/daily')).body.xpLoss).toMatchObject({ amount: 45, reason: 'missed_day' })
    expect((await goalOf(p)).xp).toBe(15)
  })

  it('costs nothing for a completed day', async () => {
    const p = await player()
    await query('UPDATE daily_state SET confirmed = TRUE WHERE user_id = $1', [p.id])
    setClock(NEXT_DAY)
    expect((await as(p).get('/api/daily')).body.xpLoss).toBeNull()
  })

  it('charges for each day the app was never opened', async () => {
    const p = await player(95, 3) // 295 XP in total
    setClock('2026-07-17T09:00:00Z') // the unfinished 14th, then the 15th and 16th
    const res = await as(p).get('/api/daily')
    expect(res.body.xpLoss).toEqual({ amount: 135, reason: 'missed_day', xp: 60, level: 2 })
    await as(p).get('/api/daily')
    expect(await goalOf(p)).toMatchObject({ xp: 60, level: 2 }) // charged once only
  })

  it('charges for absent days after a completed day too', async () => {
    const p = await player()
    await query('UPDATE daily_state SET confirmed = TRUE WHERE user_id = $1', [p.id])
    setClock('2026-07-17T09:00:00Z')
    expect((await as(p).get('/api/daily')).body.xpLoss).toMatchObject({ amount: 90 })
  })

  it('stops at level 1 with 0 XP after a long absence', async () => {
    const p = await player(50, 4) // 350 XP in total
    setClock('2027-07-14T09:00:00Z')
    expect((await as(p).get('/api/daily')).body.xpLoss).toMatchObject({ amount: 350, xp: 0, level: 1 })
  })

  it('says nothing to a player with no XP to lose', async () => {
    const p = await player(0, 1)
    setClock(NEXT_DAY)
    expect((await as(p).get('/api/daily')).body.xpLoss).toBeNull()
  })

  it('keeps telling the player until they have seen it', async () => {
    const p = await player()
    setClock(NEXT_DAY)
    expect((await as(p).get('/api/daily')).body.xpLoss).not.toBeNull()
    expect((await as(p).get('/api/daily')).body.xpLoss).not.toBeNull()
    expect((await as(p).post('/api/daily/xp-loss/seen')).status).toBe(200)
    expect((await as(p).get('/api/daily')).body.xpLoss).toBeNull()
    expect((await goalOf(p)).xp).toBe(15)
  })

  it('remembers a penalty that ran out while the player was away', async () => {
    const p = await player()
    await as(p).post('/api/daily/start')
    await startedSecondsAgo(p, WINDOW + 3600 + 60)
    const res = await as(p).get('/api/daily')
    expect(res.body.outcome).toBe('penalty_failed')
    expect(res.body.xpLoss).toMatchObject({ amount: 45, reason: 'penalty' })
  })

  it('does not punish a day that was never started while paused', async () => {
    const p = await player()
    await query('UPDATE users SET pause_progression = TRUE WHERE id = $1', [p.id])
    setClock(NEXT_DAY)
    await as(p).patch('/api/user/settings').send({ pause_progression: false })
    expect((await as(p).get('/api/daily')).body.xpLoss).toBeNull()
    expect((await goalOf(p)).xp).toBe(60)
  })

  it('still punishes a started day, even if the player then paused', async () => {
    const p = await player()
    await as(p).post('/api/daily/start')
    await query('UPDATE users SET pause_progression = TRUE WHERE id = $1', [p.id])
    setClock(NEXT_DAY)
    await as(p).patch('/api/user/settings').send({ pause_progression: false })
    expect((await as(p).get('/api/daily')).body.xpLoss).toMatchObject({ amount: 45 })
  })

  it('freezes losses for every day spent paused', async () => {
    const p = await player()
    await query('UPDATE users SET pause_progression = TRUE WHERE id = $1', [p.id])
    setClock('2026-08-14T09:00:00Z') // a month later
    await as(p).get('/api/daily') // visiting while paused changes nothing
    expect((await goalOf(p)).xp).toBe(60)
    await as(p).patch('/api/user/settings').send({ pause_progression: false })
    expect((await as(p).get('/api/daily')).body.xpLoss).toBeNull()
    expect((await goalOf(p)).xp).toBe(60)
  })

  it('charges one day, not the whole pause, for a day started before pausing', async () => {
    const p = await player()
    await as(p).post('/api/daily/start')
    await query('UPDATE users SET pause_progression = TRUE WHERE id = $1', [p.id])
    setClock('2026-08-14T09:00:00Z')
    await as(p).patch('/api/user/settings').send({ pause_progression: false })
    expect((await as(p).get('/api/daily')).body.xpLoss).toMatchObject({ amount: 45 })
    expect((await goalOf(p)).xp).toBe(15)
  })
})

describe('confirming', () => {
  it('starts a penalty when the window ends with every task ticked but no confirm', async () => {
    const player = await createPlayer()
    await as(player).post('/api/daily/start')
    await tickAll(player)
    await startedSecondsAgo(player, WINDOW + 10)
    const res = await as(player).get('/api/daily')
    expect(res.body.outcome).toBe('window_missed')
    expect(res.body.penalty.active).toBe(true)
  })

  it('lets the browser start that penalty when its timer hits zero', async () => {
    const player = await createPlayer()
    await as(player).post('/api/daily/start')
    await tickAll(player)
    await startedSecondsAgo(player, WINDOW - 1)
    expect((await as(player).post('/api/daily/penalty/trigger')).status).toBe(200)
  })
})
