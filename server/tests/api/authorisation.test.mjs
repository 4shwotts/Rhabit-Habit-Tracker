// Authorisation: one player can never see or change another player's data.
// Someone else's ids get a 404, exactly like ids that don't exist, so they
// can't even tell the data is there.
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  query, resetDb, closeDb, createPlayer, as, goalOf, dailyTasksOf
} from './helpers.mjs'

let alice, bob, bobGoal, bobTask, bobDaily

beforeEach(async () => {
  await resetDb()
  alice = await createPlayer({ username: 'alice' })
  bob = await createPlayer({ username: 'bob' })
  bobGoal = await goalOf(bob)
  bobTask = (await query('SELECT * FROM goal_tasks WHERE user_id = $1 LIMIT 1', [bob.id])).rows[0]
  bobDaily = (await dailyTasksOf(bob))[1]
})
afterAll(closeDb)

// what Bob's data looks like, to check nothing changed
async function bobSnapshot() {
  const goals = (await query('SELECT id, name, xp, level, starred FROM goals WHERE user_id = $1 ORDER BY id', [bob.id])).rows
  const tasks = (await query('SELECT id, title, level FROM goal_tasks WHERE user_id = $1 ORDER BY id', [bob.id])).rows
  const daily = (await query('SELECT id, title, checked, refreshed FROM daily_tasks WHERE user_id = $1 ORDER BY id', [bob.id])).rows
  const user = (await query('SELECT active_goal_id, username FROM users WHERE id = $1', [bob.id])).rows[0]
  return { goals, tasks, daily, user }
}

describe('one player against another player\'s data', () => {
  it('only lists the player\'s own goals', async () => {
    const res = await as(alice).get('/api/goals')
    expect(res.status).toBe(200)
    expect(res.body.map(g => g.user_id)).toEqual([alice.id])
  })

  const attempts = [
    ['rename a goal', () => as(alice).patch(`/api/goals/${bobGoal.id}/name`).send({ name: 'Hacked' })],
    ['delete a goal', () => as(alice).delete(`/api/goals/${bobGoal.id}`)],
    ['star a goal', () => as(alice).patch(`/api/goals/${bobGoal.id}/star`)],
    ['unstar a goal', () => as(alice).patch(`/api/goals/${bobGoal.id}/unstar`)],
    ['replace a goal\'s tasks', () => as(alice).post(`/api/goals/${bobGoal.id}/tasks`).send({ level: 1, tasks: [{ title: 'Hacked' }] })],
    ['delete a goal task', () => as(alice).delete(`/api/goals/tasks/${bobTask.id}`)],
    ['make it their active goal', () => as(alice).patch('/api/user/active-goal').send({ goal_id: bobGoal.id })],
    ['reroll a daily task', () => as(alice).post(`/api/daily/tasks/${bobDaily.id}/refresh`)]
  ]

  it.each(attempts)('cannot %s (404, nothing changes)', async (_, attempt) => {
    const before = await bobSnapshot()
    const res = await attempt()
    expect(res.status).toBe(404)
    expect(await bobSnapshot()).toEqual(before)
  })

  it('cannot tick a daily task', async () => {
    await as(alice).post('/api/daily/start') // ticking needs the player's own window open
    const before = await bobSnapshot()
    const res = await as(alice).patch(`/api/daily/tasks/${bobDaily.id}/check`).send({ checked: true })
    expect(res.status).toBe(404)
    expect(await bobSnapshot()).toEqual(before)
  })

  it('gets the same 404 for someone else\'s goal as for one that doesn\'t exist', async () => {
    const theirs = await as(alice).patch(`/api/goals/${bobGoal.id}/name`).send({ name: 'x' })
    const missing = await as(alice).patch('/api/goals/999999/name').send({ name: 'x' })
    expect(theirs.status).toBe(missing.status)
    expect(theirs.body).toEqual(missing.body)
  })

  it.each(['abc', '-1', '0', '1.5', '99999999999'])('treats a malformed id (%s) as not found', async id => {
    const res = await as(alice).delete(`/api/goals/${id}`)
    expect(res.status).toBe(404)
  })

  it('only ever affects the player\'s own day', async () => {
    const before = await bobSnapshot()
    await as(alice).post('/api/daily/start')
    expect((await query('SELECT started FROM daily_state WHERE user_id = $1', [bob.id])).rows[0].started).toBe(false)
    expect(await bobSnapshot()).toEqual(before)
  })
})
