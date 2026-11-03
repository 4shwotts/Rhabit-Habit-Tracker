// Unit tests for the game rules in lib/game.js: XP, levels, task tiers,
// window lengths, and the time zone maths behind the daily reset.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRequire } from 'node:module'

// the server is CommonJS, so load it the same way it loads itself
const require = createRequire(import.meta.url)
const game = require('../../lib/game')
const {
  addXp, deductXp, getMinTaskLevel, getMaxTaskLevel, getWindowSeconds, windowForTasks,
  getTodayInTimezone, getSecondsUntilMidnight, generateTasks, rollDailyTasks,
  XP_PER_LEVEL, MAX_XP_PER_ACTION
} = game

// freeze the clock at a moment in UTC
function at(isoUtc) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(isoUtc))
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('addXp', () => {
  it('adds XP within the current level', () => {
    expect(addXp(10, 1, 5)).toEqual({ xp: 15, level: 1 })
  })

  it('levels up exactly when the bar fills', () => {
    expect(addXp(95, 1, 5)).toEqual({ xp: 0, level: 2 })
  })

  it('carries leftover XP into the new level', () => {
    expect(addXp(90, 4, 25)).toEqual({ xp: 15, level: 5 })
  })

  it('leaves XP alone for a zero amount', () => {
    expect(addXp(40, 3, 0)).toEqual({ xp: 40, level: 3 })
  })

  it('handles the largest real award (three tasks) from a nearly full bar', () => {
    expect(addXp(99, 2, 3 * game.XP_PER_TASK)).toEqual({ xp: 14, level: 3 })
  })

  // Bug found by this suite: the old loop ran once per level gained, so a
  // huge amount took seconds and Infinity never returned.
  it('caps a huge amount at one level per action and returns at once', () => {
    const started = performance.now()
    expect(addXp(0, 1, 1e12)).toEqual({ xp: 0, level: 2 })
    expect(addXp(30, 7, Number.MAX_SAFE_INTEGER)).toEqual({ xp: 30, level: 8 })
    expect(performance.now() - started).toBeLessThan(50)
  })

  it('caps at exactly MAX_XP_PER_ACTION', () => {
    expect(MAX_XP_PER_ACTION).toBe(XP_PER_LEVEL)
    expect(addXp(0, 1, MAX_XP_PER_ACTION)).toEqual(addXp(0, 1, MAX_XP_PER_ACTION + 1))
  })

  // Bug found by this suite: these used to return NaN XP (or negative XP),
  // which the database then refused, failing the whole request.
  it.each([
    ['missing', undefined],
    ['null', null],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['a string', '5'],
    ['a fraction', 2.5],
    ['negative', -30]
  ])('rejects an amount that is %s', (_, amount) => {
    expect(() => addXp(10, 2, amount)).toThrow(RangeError)
  })
})

describe('deductXp', () => {
  it('removes XP within the current level', () => {
    expect(deductXp(40, 2, 15)).toEqual({ xp: 25, level: 2 })
  })

  it('drops a level when XP goes below zero', () => {
    expect(deductXp(10, 3, 15)).toEqual({ xp: 95, level: 2 })
  })

  it('can take XP down to exactly zero', () => {
    expect(deductXp(15, 1, 15)).toEqual({ xp: 0, level: 1 })
  })

  it('never goes below level 1 with 0 XP', () => {
    expect(deductXp(10, 1, 15)).toEqual({ xp: 0, level: 1 })
    expect(deductXp(0, 1, 15)).toEqual({ xp: 0, level: 1 })
  })

  it('caps a huge amount at one level per action', () => {
    expect(deductXp(50, 5, 1e12)).toEqual({ xp: 50, level: 4 })
  })

  it.each([undefined, NaN, -Infinity, -100, 1.5])('rejects an invalid amount (%s)', amount => {
    // -100 used to *add* XP: deductXp(50, 1, -100) gave 150 XP at level 1
    expect(() => deductXp(50, 1, amount)).toThrow(RangeError)
  })

  it('undoes addXp exactly', () => {
    for (let level = 1; level <= 12; level++) {
      for (const xp of [0, 1, 50, 99]) {
        for (const amount of [0, 5, 15, 99, 100]) {
          const up = addXp(xp, level, amount)
          expect(deductXp(up.xp, up.level, amount)).toEqual({ xp, level })
        }
      }
    }
  })
})

describe('task tier unlocks', () => {
  // [level, lowest tier, highest tier]
  it.each([
    [1, 1, 1], [2, 1, 2], [3, 1, 3],
    [4, 2, 4], [6, 4, 6], [9, 7, 9],
    [10, 10, 10],
    // Bug found by this suite: past level 10 the lowest tier kept rising, so
    // level 13 and above asked for tiers 11+ that don't exist and got no tasks
    [11, 10, 10], [12, 10, 10], [13, 10, 10], [50, 10, 10]
  ])('level %i offers tiers %i to %i', (level, min, max) => {
    expect(getMinTaskLevel(level)).toBe(min)
    expect(getMaxTaskLevel(level)).toBe(max)
  })

  it('never asks for an empty range of tiers', () => {
    for (let level = 1; level <= 200; level++) {
      expect(getMinTaskLevel(level)).toBeLessThanOrEqual(getMaxTaskLevel(level))
    }
  })
})

describe('daily windows', () => {
  it.each([
    [1, 300], [3, 300], [4, 240], [6, 240], [7, 180], [9, 180], [10, 120], [20, 120]
  ])('a level %i task gives a %i-second window', (level, seconds) => {
    expect(getWindowSeconds(level)).toBe(seconds)
  })

  it('uses the real values in tests, not the local 30-second timers', () => {
    expect(getWindowSeconds(1)).not.toBe(game.TEST_TIMER_SECONDS)
    expect(game.CONFIRM_UNLOCK_BEFORE_END).toBe(60)
  })

  it('sizes the window by the hardest task rolled', () => {
    expect(windowForTasks([{ level: 2 }, { level: 8 }, { level: 5 }])).toBe(180)
  })

  it('falls back to the level 1 window when there are no tasks', () => {
    expect(windowForTasks([])).toBe(300)
  })
})

describe('getTodayInTimezone', () => {
  it('turns over exactly at local midnight (summer time in London)', () => {
    at('2026-07-14T22:59:59Z') // 23:59:59 BST
    expect(getTodayInTimezone('Europe/London')).toBe('2026-07-14')
    vi.advanceTimersByTime(1000) // 00:00:00 BST
    expect(getTodayInTimezone('Europe/London')).toBe('2026-07-15')
  })

  it('turns over exactly at local midnight (winter time in London)', () => {
    at('2026-01-10T23:59:59Z')
    expect(getTodayInTimezone('Europe/London')).toBe('2026-01-10')
    vi.advanceTimersByTime(1000)
    expect(getTodayInTimezone('Europe/London')).toBe('2026-01-11')
  })

  it('keeps the same date across the spring clock change', () => {
    // clocks go forward at 01:00 GMT on 29 March 2026
    at('2026-03-29T00:59:59Z')
    expect(getTodayInTimezone('Europe/London')).toBe('2026-03-29')
    vi.advanceTimersByTime(1000) // now 02:00 BST
    expect(getTodayInTimezone('Europe/London')).toBe('2026-03-29')
  })

  it('starts the new day at BST midnight before the autumn clock change', () => {
    // clocks go back at 02:00 BST on 25 October 2026
    at('2026-10-24T22:59:59Z')
    expect(getTodayInTimezone('Europe/London')).toBe('2026-10-24')
    vi.advanceTimersByTime(1000)
    expect(getTodayInTimezone('Europe/London')).toBe('2026-10-25')
    vi.advanceTimersByTime(2 * 3600 * 1000) // through the repeated hour
    expect(getTodayInTimezone('Europe/London')).toBe('2026-10-25')
  })

  it('gives each time zone its own date at the same instant', () => {
    at('2026-12-31T23:30:00Z')
    expect(getTodayInTimezone('UTC')).toBe('2026-12-31')
    expect(getTodayInTimezone('Pacific/Kiritimati')).toBe('2027-01-01') // UTC+14
    expect(getTodayInTimezone('Etc/GMT+12')).toBe('2026-12-31') // UTC-12
    expect(getTodayInTimezone('Asia/Kolkata')).toBe('2027-01-01') // UTC+5:30
    expect(getTodayInTimezone('America/New_York')).toBe('2026-12-31')
  })

  it('handles a leap day', () => {
    at('2028-02-29T12:00:00Z')
    expect(getTodayInTimezone('Europe/London')).toBe('2028-02-29')
  })

  it('falls back to the UTC date for an unknown time zone', () => {
    at('2026-07-14T23:30:00Z') // already the 15th in London
    expect(getTodayInTimezone('Not/AZone')).toBe('2026-07-14')
    expect(getTodayInTimezone(null)).toBe('2026-07-14')
  })

  it('uses the server time zone when none is given', () => {
    at('2026-07-14T23:30:00Z')
    expect(getTodayInTimezone(undefined)).toBe('2026-07-14') // TZ=UTC in tests
  })

  it('follows the system clock when it jumps forwards or backwards', () => {
    at('2026-05-01T12:00:00Z')
    expect(getTodayInTimezone('Europe/London')).toBe('2026-05-01')
    vi.setSystemTime(new Date('2026-05-03T12:00:00Z'))
    expect(getTodayInTimezone('Europe/London')).toBe('2026-05-03')
    vi.setSystemTime(new Date('2026-04-30T12:00:00Z'))
    expect(getTodayInTimezone('Europe/London')).toBe('2026-04-30')
  })
})

describe('getSecondsUntilMidnight', () => {
  it('is half a day at local noon', () => {
    at('2026-07-14T11:00:00Z') // 12:00 BST
    expect(getSecondsUntilMidnight('Europe/London')).toBe(43200)
  })

  it('is 1 at one second to midnight and a full day at midnight', () => {
    at('2026-07-14T22:59:59Z')
    expect(getSecondsUntilMidnight('Europe/London')).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(getSecondsUntilMidnight('Europe/London')).toBe(86400)
  })

  it('is right near midnight on both clock change days', () => {
    at('2026-03-29T22:59:30Z') // 23:59:30 BST
    expect(getSecondsUntilMidnight('Europe/London')).toBe(30)
    vi.setSystemTime(new Date('2026-10-25T23:59:30Z')) // 23:59:30 GMT
    expect(getSecondsUntilMidnight('Europe/London')).toBe(30)
  })

  it('works for half-hour and far-off time zones', () => {
    at('2026-07-14T18:00:00Z')
    expect(getSecondsUntilMidnight('Asia/Kolkata')).toBe(1800) // 23:30 local
    expect(getSecondsUntilMidnight('Pacific/Kiritimati')).toBe(57600) // 08:00 local
    expect(getSecondsUntilMidnight('Etc/GMT+12')).toBe(64800) // 06:00 local
  })

  it('falls back to the server clock for an unknown time zone', () => {
    at('2026-07-14T18:00:00Z')
    expect(getSecondsUntilMidnight('Not/AZone')).toBe(21600)
  })

  it('is never zero or negative, and never more than a day', () => {
    at('2026-01-01T00:00:00Z')
    for (let i = 0; i < 24 * 4; i++) {
      for (const tz of ['UTC', 'Europe/London', 'Asia/Kolkata', 'Pacific/Kiritimati']) {
        const s = getSecondsUntilMidnight(tz)
        expect(s).toBeGreaterThan(0)
        expect(s).toBeLessThanOrEqual(86400)
      }
      vi.advanceTimersByTime(15 * 60 * 1000)
    }
  })
})

// a stand-in for the database: answers the pool query with `pool` and records
// every other query
function fakeDb(pool) {
  const calls = []
  return {
    calls,
    query: vi.fn(async (sql, params) => {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
      return { rows: sql.includes('FROM goal_tasks') ? pool : [] }
    })
  }
}

const task = (id, level) => ({ id, level, title: `Task ${id}` })

describe('generateTasks', () => {
  it('always includes one task from the highest unlocked tier', async () => {
    const pool = [task(1, 1), task(2, 2), task(3, 2), task(4, 3), task(5, 1)]
    for (let i = 0; i < 25; i++) {
      const picked = await generateTasks(fakeDb(pool), 7, 1, 1, 3)
      expect(picked).toHaveLength(3)
      expect(picked.some(t => t.level === 3)).toBe(true)
      expect(new Set(picked.map(t => t.id)).size).toBe(3) // no repeats
    }
  })

  it('asks only for the user\'s own tasks in the unlocked tiers', async () => {
    const db = fakeDb([])
    await generateTasks(db, 7, 42, 2, 4)
    expect(db.calls[0].params).toEqual([42, 7, 2, 4])
  })

  it('returns no tasks when the pool is empty', async () => {
    expect(await generateTasks(fakeDb([]), 7, 1, 1, 3)).toEqual([])
  })

  it('returns fewer than three when that is all there is', async () => {
    const picked = await generateTasks(fakeDb([task(1, 1), task(2, 1)]), 7, 1, 1, 1)
    expect(picked.map(t => t.id).sort()).toEqual([1, 2])
  })

  it('still fills up when the top tier has no tasks', async () => {
    const picked = await generateTasks(fakeDb([task(1, 1), task(2, 1), task(3, 2)]), 7, 1, 1, 3)
    expect(picked).toHaveLength(3)
  })
})

describe('rollDailyTasks', () => {
  it('replaces today\'s tasks with a fresh, unticked set', async () => {
    const db = fakeDb([task(1, 1), task(2, 1), task(3, 1)])
    await rollDailyTasks(db, 7, { id: 42, level: 1 })
    const [del, , ...inserts] = db.calls
    expect(del.sql).toMatch(/^DELETE FROM daily_tasks/)
    expect(inserts).toHaveLength(3)
    for (const ins of inserts) {
      expect(ins.sql).toMatch(/^INSERT INTO daily_tasks .* FALSE, FALSE/)
      expect(ins.params[0]).toBe(7)
    }
  })

  it('clears the tasks and adds none when there is no active goal', async () => {
    const db = fakeDb([task(1, 1)])
    await rollDailyTasks(db, 7, undefined)
    expect(db.calls).toHaveLength(1)
    expect(db.calls[0].sql).toMatch(/^DELETE FROM daily_tasks/)
  })

  it('still gives a level 13 goal its tasks', async () => {
    const db = fakeDb([task(1, 10), task(2, 10), task(3, 10)])
    await rollDailyTasks(db, 7, { id: 42, level: 13 })
    expect(db.calls[1].params).toEqual([42, 7, 10, 10]) // tiers 10 to 10, not 11 to 10
  })
})
