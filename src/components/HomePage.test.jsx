// Component tests for the Home window timer and the penalty pop-up, with a
// fake clock. The API is replaced with stand-ins, so these run without a
// server.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as api from '../api'
import HomePage from './HomePage'
import PenaltyModal from './PenaltyModal'

vi.mock('../api', () => ({
  getUser: vi.fn(), getGoals: vi.fn(), getDaily: vi.fn(), startDaily: vi.fn(),
  checkTask: vi.fn(), confirmDaily: vi.fn(), refreshTask: vi.fn(),
  triggerPenalty: vi.fn(), failPenalty: vi.fn(), confirmPenalty: vi.fn(),
  updateSettings: vi.fn(), deleteAccount: vi.fn()
}))

const NOW = new Date('2026-07-14T12:00:00Z').getTime()
const WINDOW = 30
const secondsAgo = s => new Date(NOW - s * 1000).toISOString()

const task = id => ({ id, title: `Task ${id}`, level: 1, checked: 0, refreshed: 0 })
const activePenalty = startedAt => ({
  active: true, task_title: 'Plank for 1 minute', task_difficulty: 'easy',
  task_timer_seconds: WINDOW, started_at: startedAt, confirmed: false, unlock_before_end: 20
})

// Sets up the stand-in API for a day. `started` is how many seconds ago the
// window started (null = not started yet). The server side is simulated just
// enough: triggerPenalty starts a penalty that later getDaily calls return.
function serveDay({ started = null, ticked = false, triggerResults = [{ success: true }] } = {}) {
  let penalty = { active: false, unlock_before_end: 20 }
  const results = [...triggerResults]
  api.getUser.mockResolvedValue({
    username: 'tester', timer_visible: 1, task_refresh: 0, pause_progression: 0, active_goal_id: 1
  })
  api.getGoals.mockResolvedValue([{ id: 1, name: 'Fitness', xp: 40, level: 1 }])
  api.getDaily.mockImplementation(async () => ({
    state: {
      started: started === null ? 0 : 1, confirmed: 0, penalty_shown: penalty.active ? 1 : 0,
      window_start: started === null ? null : secondsAgo(started)
    },
    tasks: [1, 2, 3].map(id => ({ ...task(id), checked: ticked ? 1 : 0 })),
    penalty,
    windowSeconds: WINDOW,
    confirmUnlockBeforeEnd: 20,
    outcome: null
  }))
  api.startDaily.mockImplementation(async () => {
    started = 0
    return { success: true, window_start: new Date().toISOString(), windowSeconds: WINDOW }
  })
  api.triggerPenalty.mockImplementation(async () => {
    const result = results.length > 1 ? results.shift() : results[0]
    if (result.success) penalty = activePenalty(new Date().toISOString())
    return result
  })
  api.failPenalty.mockResolvedValue({ success: true, xp: 25, level: 1 })
}

// moves the fake clock on, letting React and pending promises catch up
async function wait(ms) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

async function renderHome() {
  const view = render(<MemoryRouter><HomePage /></MemoryRouter>)
  await wait(0)
  return view
}

const penaltyShown = view => view.container.querySelector('.penalty-box') !== null

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('Home window timer', () => {
  // the play-through that failed: start, tick nothing, let it reach 00:00:00
  it('starts the penalty when a freshly started window runs out', async () => {
    serveDay()
    const view = await renderHome()
    await act(async () => { fireEvent.click(view.container.querySelector('.home-start-btn')) })
    await wait(WINDOW * 1000 - 2000)
    expect(api.triggerPenalty).not.toHaveBeenCalled()

    await wait(3000)
    expect(api.triggerPenalty).toHaveBeenCalledTimes(1)
    await wait(1000)
    expect(penaltyShown(view)).toBe(true)
  })

  it('asks for the penalty exactly once', async () => {
    serveDay({ started: 25 })
    await renderHome()
    await wait(20_000)
    expect(api.triggerPenalty).toHaveBeenCalledTimes(1)
  })

  // Bug: a page that loaded in the few seconds after the window ended, before
  // the server counted it as missed, sat at 00:00:00 for ever
  it('still starts the penalty when the page loads just after the window ended', async () => {
    serveDay({ started: WINDOW + 2 })
    const view = await renderHome()
    await wait(1500)
    expect(api.triggerPenalty).toHaveBeenCalledTimes(1)
    await wait(1000)
    expect(penaltyShown(view)).toBe(true)
  })

  it('does not start a penalty when every task is ticked', async () => {
    serveDay({ started: 25, ticked: true })
    const view = await renderHome()
    await wait(15_000)
    expect(api.triggerPenalty).not.toHaveBeenCalled()
    expect(penaltyShown(view)).toBe(false)
  })

  // Bug: a refused or failed request opened an empty pop-up with no penalty
  it('keeps the pop-up closed if the request fails, and tries again', async () => {
    serveDay({ started: 28, triggerResults: [{ error: 'Something went wrong' }, { success: true }] })
    const view = await renderHome()
    await wait(3000)
    expect(api.triggerPenalty).toHaveBeenCalledTimes(1)
    expect(penaltyShown(view)).toBe(false)

    await wait(5000)
    expect(api.triggerPenalty).toHaveBeenCalledTimes(2)
    await wait(1000)
    expect(penaltyShown(view)).toBe(true)
  })

  it('fails the penalty once when its own timer runs out', async () => {
    serveDay({ started: 28 })
    const view = await renderHome()
    await wait(3000) // window ends, penalty starts
    await wait(1000)
    expect(penaltyShown(view)).toBe(true)

    await wait(WINDOW * 1000 + 2000)
    expect(api.failPenalty).toHaveBeenCalledTimes(1)
    expect(penaltyShown(view)).toBe(false)
    expect(view.container.textContent).toMatch(/failed on the penalty task/)
    await wait(10_000)
    expect(api.failPenalty).toHaveBeenCalledTimes(1)
  })
})

describe('PenaltyModal', () => {
  it('counts down from the stored start time and reports running out once', async () => {
    const onPenalty = vi.fn()
    const view = render(
      <PenaltyModal penaltyData={activePenalty(secondsAgo(25))} onPenalty={onPenalty} onConfirm={() => {}} />
    )
    expect(view.getByRole('timer').getAttribute('aria-label')).toBe('00:05')
    await wait(4000)
    expect(onPenalty).not.toHaveBeenCalled()
    await wait(2000)
    expect(onPenalty).toHaveBeenCalledTimes(1)
    await wait(5000)
    expect(onPenalty).toHaveBeenCalledTimes(1)
  })

  it('unlocks confirm only once the unlock time has passed and the task is ticked', async () => {
    const view = render(
      <PenaltyModal penaltyData={activePenalty(secondsAgo(5))} onPenalty={() => {}} onConfirm={() => {}} />
    )
    const confirm = view.container.querySelector('.penalty-confirm-btn')
    expect(confirm.disabled).toBe(true)
    expect(confirm.textContent).toBe('Confirm in 00:05')
    await wait(5000)
    expect(confirm.textContent).toBe('Tick the task to confirm')
    fireEvent.click(view.container.querySelector('.penalty-task-row'))
    expect(confirm.disabled).toBe(false)
  })

  it('never reports a penalty that is not running', async () => {
    const onPenalty = vi.fn()
    render(<PenaltyModal penaltyData={{ active: false }} onPenalty={onPenalty} onConfirm={() => {}} />)
    await wait(5000)
    expect(onPenalty).not.toHaveBeenCalled()
  })
})
