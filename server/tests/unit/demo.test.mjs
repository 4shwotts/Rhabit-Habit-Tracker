// Unit tests for demo accounts: the seed every demo starts with, when a demo
// expires, its unusable email address, and the fast timers demos get.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const config = require('../../config')
const { buildDemoSeed, demoExpiry, demoEmail } = require('../../lib/demo')
const { timersFor, windowForTasks, getMinTaskLevel, getMaxTaskLevel, XP_PER_LEVEL } = require('../../lib/game')

describe('buildDemoSeed', () => {
  const seed = buildDemoSeed()
  const active = seed.goals.filter(g => g.active)

  it('has one active pathway, at level 4 and part-way through its bar', () => {
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({ level: 4 })
    expect(active[0].xp).toBeGreaterThan(0)
    expect(active[0].xp).toBeLessThan(XP_PER_LEVEL)
  })

  it('has other pathways at different levels, for some history', () => {
    expect(seed.goals.length).toBeGreaterThanOrEqual(3)
    expect(new Set(seed.goals.map(g => g.level)).size).toBe(seed.goals.length)
  })

  it('gives the active pathway tasks at every tier it can roll from', () => {
    const { tasks, level } = active[0]
    for (let tier = getMinTaskLevel(level); tier <= getMaxTaskLevel(level); tier++) {
      expect(tasks[tier]?.length, `tier ${tier}`).toBeGreaterThan(0)
    }
  })

  it('starts today part-done: some tasks ticked, not all', () => {
    expect(seed.tickedToday).toBeGreaterThan(0)
    expect(seed.tickedToday).toBeLessThan(3)
  })

  it('stays within the database rules and the per-user caps', () => {
    expect(seed.username.length).toBeGreaterThan(0)
    expect(seed.username.length).toBeLessThanOrEqual(30)
    expect(seed.goals.length).toBeLessThanOrEqual(config.limits.goalsPerUser)
    for (const goal of seed.goals) {
      expect(goal.name.length).toBeLessThanOrEqual(50)
      expect(goal.xp).toBeGreaterThanOrEqual(0)
      expect(goal.xp).toBeLessThan(XP_PER_LEVEL)
      for (const [level, titles] of Object.entries(goal.tasks)) {
        expect(Number(level)).toBeGreaterThanOrEqual(1)
        expect(Number(level)).toBeLessThanOrEqual(10)
        expect(titles.length).toBeLessThanOrEqual(config.limits.tasksPerLevel)
        for (const title of titles) {
          expect(title.length).toBeGreaterThan(0)
          expect(title.length).toBeLessThanOrEqual(40)
        }
      }
    }
  })

  it('returns a fresh copy each time, so one demo cannot change the next', () => {
    const first = buildDemoSeed()
    first.goals[0].tasks[1].push('changed')
    expect(buildDemoSeed().goals[0].tasks[1]).not.toContain('changed')
  })
})

describe('demoExpiry', () => {
  it('is exactly 24 hours after creation', () => {
    const created = new Date('2026-07-14T09:00:00Z')
    expect(demoExpiry(created).toISOString()).toBe('2026-07-15T09:00:00.000Z')
  })

  it('crosses midnight and month ends correctly', () => {
    expect(demoExpiry(new Date('2026-07-31T23:30:00Z')).toISOString()).toBe('2026-08-01T23:30:00.000Z')
  })
})

describe('demoEmail', () => {
  it('uses the reserved .invalid domain, which can never receive mail', () => {
    expect(demoEmail()).toMatch(/^demo-[0-9a-f]{24}@demo\.invalid$/)
  })

  it('is different every time', () => {
    const emails = new Set(Array.from({ length: 50 }, demoEmail))
    expect(emails.size).toBe(50)
  })
})

describe('timersFor', () => {
  const demo = { is_demo: true }
  const real = { is_demo: false }

  it('gives demos a 3-minute window with confirm open after 1 minute', () => {
    const timers = timersFor(demo)
    expect(timers.windowForLevel(1)).toBe(180)
    expect(timers.windowForLevel(10)).toBe(180)
    expect(timers.confirmUnlockBeforeEnd).toBe(120)
  })

  it('gives demos a 2-minute penalty with confirm open after 30 seconds', () => {
    expect(timersFor(demo)).toMatchObject({ penaltySeconds: 120, penaltyConfirmUnlockBeforeEnd: 90 })
  })

  it('keeps the normal timers for real accounts, and for no account at all', () => {
    for (const user of [real, undefined]) {
      const timers = timersFor(user)
      expect(timers.windowForLevel(1)).toBe(3 * 60 * 60)
      expect(timers.windowForLevel(10)).toBe(60 * 60)
      expect(timers).toMatchObject({
        confirmUnlockBeforeEnd: 30 * 60, penaltySeconds: 60 * 60, penaltyConfirmUnlockBeforeEnd: 10 * 60
      })
    }
  })

  it('sets the window from the account, whatever the tasks', () => {
    const tasks = [{ level: 2 }, { level: 8 }]
    expect(windowForTasks(tasks, demo)).toBe(180)
    expect(windowForTasks(tasks, real)).toBe(90 * 60)
  })
})
