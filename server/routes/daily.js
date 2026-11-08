// Daily session routes. Every handler runs settleDay() first inside a locked
// transaction, then checks the action is allowed *right now* according to the
// stored timestamps. The client never sends XP, levels or times.
const express = require('express')
const router = express.Router()
const { withTransaction } = require('../db')
const { validate, z, idParam } = require('../lib/validate')
const { settleDay, penaliseMissedWindow, failPenalty, setGoalXp, secondsSince } = require('../lib/session')
const {
  XP_PER_TASK, REFRESH_COST, TIMING_GRACE_SECONDS,
  getMaxTaskLevel, getMinTaskLevel, addXp, deductXp, windowAfterLevelUp
} = require('../lib/game')

const taskIdParams = z.strictObject({ id: idParam })

// Runs `fn(client, day)` after settling the day; `fn` returns [status, body].
async function withDay(req, res, fn) {
  const [status, body] = await withTransaction(async client => {
    const day = await settleDay(client, req.user)
    if (!day.state || !day.penalty) return [409, { error: 'Daily state missing' }]
    return fn(client, day)
  })
  res.status(status).json(body)
}

const conflict = error => [409, { error }]

// What the client needs to render the day. Timer lengths come from here so the
// UI and the server always agree.
function dayResponse(day) {
  return {
    state: day.state,
    tasks: day.tasks,
    penalty: { ...day.penalty, unlock_before_end: day.timers.penaltyConfirmUnlockBeforeEnd },
    windowSeconds: day.windowSeconds,
    confirmUnlockBeforeEnd: day.timers.confirmUnlockBeforeEnd,
    outcome: day.outcome,
    // XP lost that the player hasn't been told about yet
    xpLoss: day.state.pending_loss_reason ? {
      amount: day.state.pending_xp_loss,
      reason: day.state.pending_loss_reason,
      xp: day.goal?.xp ?? 0,
      level: day.goal?.level ?? 1
    } : null
  }
}

const clearXpLoss = (client, day) => {
  day.state.pending_xp_loss = 0
  day.state.pending_loss_reason = null
  return client.query(
    'UPDATE daily_state SET pending_xp_loss = 0, pending_loss_reason = NULL WHERE user_id = $1',
    [day.state.user_id]
  )
}

router.get('/', (req, res) =>
  withDay(req, res, async (client, day) => [200, dayResponse(day)])
)

// the client has shown the player their XP loss
router.post('/xp-loss/seen', validate(), (req, res) =>
  withDay(req, res, async (client, day) => {
    await clearXpLoss(client, day)
    return [200, { success: true }]
  })
)

// stamp the start time (and fix the window length) so the countdown is
// consistent across refreshes and can't be changed afterwards
router.post('/start', validate(), (req, res) =>
  withDay(req, res, async (client, day) => {
    const { state, penalty, tasks } = day
    if (req.user.pause_progression) return conflict('Progression is paused')
    if (state.confirmed) return conflict('Today is already complete')
    if (state.started) return conflict('Today has already started')
    if (penalty.active || state.penalty_shown) return conflict('A penalty is in progress')
    if (!day.goal || tasks.length === 0) return conflict('No tasks for today')

    const now = new Date()
    await client.query(
      'UPDATE daily_state SET started = TRUE, window_start = $1, window_seconds = $2 WHERE user_id = $3',
      [now, day.windowSeconds, req.user.id]
    )
    return [200, { success: true, window_start: now.toISOString(), windowSeconds: day.windowSeconds }]
  })
)

// ticking is only allowed while the window is open
router.patch('/tasks/:id/check',
  validate({ params: taskIdParams, body: z.strictObject({ checked: z.boolean() }) }),
  (req, res) => withDay(req, res, async (client, day) => {
    const { state, penalty } = day
    if (!state.started) return conflict('Start your tasks first')
    if (state.confirmed || penalty.active || state.penalty_shown) return conflict('Today is already settled')
    if (secondsSince(state.window_start) > day.windowSeconds + TIMING_GRACE_SECONDS) {
      return conflict('The window has closed')
    }

    const { rowCount } = await client.query(
      'UPDATE daily_tasks SET checked = $1 WHERE id = $2 AND user_id = $3',
      [req.body.checked, req.params.id, req.user.id]
    )
    if (rowCount === 0) return [404, { error: 'Task not found' }]
    return [200, { success: true }]
  })
)

// confirm unlocks the account's confirmUnlockBeforeEnd seconds before the window ends,
// and can only ever succeed once per day
router.post('/confirm', validate(), (req, res) =>
  withDay(req, res, async (client, day) => {
    const { state, penalty, tasks, goal } = day
    if (req.user.pause_progression) return conflict('Progression is paused')
    if (!goal) return [400, { error: 'No active goal' }]
    if (!state.started) return conflict('Start your tasks first')
    if (state.confirmed) return conflict('Today is already complete')
    if (penalty.active || state.penalty_shown) return conflict('A penalty is in progress')

    const remaining = day.windowSeconds - secondsSince(state.window_start)
    const unlockBeforeEnd = day.timers.confirmUnlockBeforeEnd
    if (remaining > unlockBeforeEnd + TIMING_GRACE_SECONDS) {
      return [403, {
        error: 'Confirm not yet unlocked',
        unlocks_in: Math.ceil(remaining - unlockBeforeEnd)
      }]
    }

    // every task must be ticked off; otherwise the window runs out into a penalty
    if (!tasks.every(t => t.checked)) return conflict('Tick off all your tasks first')

    const xpEarned = tasks.filter(t => t.checked).length * XP_PER_TASK
    const previousLevel = goal.level
    const { xp, level } = addXp(goal.xp, goal.level, xpEarned)
    await setGoalXp(client, req.user, goal, xp, level)
    await client.query('UPDATE daily_state SET confirmed = TRUE WHERE user_id = $1', [req.user.id])

    const newWindowSeconds = level > previousLevel
      ? await windowAfterLevelUp(client, req.user, goal, day.windowSeconds)
      : null

    return [200, { success: true, xp, level, xp_earned: xpEarned, new_window_seconds: newWindowSeconds }]
  })
)

// Called by the client when its window timer hits zero without a confirm.
// Only allowed once the stored window has actually ended. Idempotent: if the
// penalty is already running, returns it.
router.post('/penalty/trigger', validate(), (req, res) =>
  withDay(req, res, async (client, day) => {
    const { state, penalty } = day
    if (penalty.active) {
      return [200, { success: true, task: penaltyTask(penalty) }]
    }
    if (!state.started) return conflict('Start your tasks first')
    if (state.confirmed || state.penalty_shown) return conflict('Today is already settled')
    if (secondsSince(state.window_start) < day.windowSeconds - TIMING_GRACE_SECONDS) {
      return conflict('The window is still open')
    }

    // null when no penalty fits before midnight and the XP went straight away
    const task = await penaliseMissedWindow(client, req.user, day, new Date())
    return [200, { success: true, task }]
  })
)

// confirm unlocks the account's penaltyConfirmUnlockBeforeEnd seconds before the penalty ends;
// an expired penalty has already been failed by settleDay()
router.post('/penalty/confirm', validate(), (req, res) =>
  withDay(req, res, async (client, day) => {
    const { penalty } = day
    if (day.outcome === 'penalty_failed') return conflict('The penalty time ran out')
    if (!penalty.active) return [400, { error: 'No active penalty' }]

    const unlockAt = penalty.task_timer_seconds - day.timers.penaltyConfirmUnlockBeforeEnd
    const elapsed = secondsSince(penalty.started_at)
    if (elapsed < unlockAt - TIMING_GRACE_SECONDS) {
      return [403, { error: 'Confirm not yet unlocked', unlocks_in: Math.ceil(unlockAt - elapsed) }]
    }

    await client.query('UPDATE penalty_state SET confirmed = TRUE, active = FALSE WHERE user_id = $1', [req.user.id])
    await client.query('UPDATE daily_state SET confirmed = TRUE WHERE user_id = $1', [req.user.id])
    return [200, { success: true }]
  })
)

// Called by the client when the penalty timer hits zero. Idempotent: XP is only
// ever deducted once, whether settleDay() or this handler applies it.
router.post('/penalty/fail', validate(), (req, res) =>
  withDay(req, res, async (client, day) => {
    const { penalty, goal } = day
    const current = () => [200, { success: true, xp: goal?.xp ?? 0, level: goal?.level ?? 1 }]

    // the player is watching, and the client shows its own message for this
    if (day.outcome === 'penalty_failed') {
      await clearXpLoss(client, day)
      return current()
    }
    if (!penalty.active) {
      return day.state.confirmed ? current() : [400, { error: 'No active penalty' }]
    }
    if (secondsSince(penalty.started_at) < penalty.task_timer_seconds - TIMING_GRACE_SECONDS) {
      return conflict('The penalty is still running')
    }

    await failPenalty(client, req.user, day)
    return current()
  })
)

// costs REFRESH_COST XP unless the free refresh setting is on.
// Once per task per day, never on the first (guaranteed highest-tier) task,
// and only before or during the window.
router.post('/tasks/:id/refresh', validate({ params: taskIdParams }), (req, res) =>
  withDay(req, res, async (client, day) => {
    const { state, penalty, tasks, goal } = day
    const user = req.user
    if (!goal) return [400, { error: 'No active goal' }]
    if (state.confirmed || penalty.active || state.penalty_shown) return conflict('Today is already settled')
    if (state.started && secondsSince(state.window_start) > day.windowSeconds + TIMING_GRACE_SECONDS) {
      return conflict('The window has closed')
    }

    const index = tasks.findIndex(t => t.id === req.params.id)
    const currentTask = tasks[index]
    if (!currentTask) return [404, { error: 'Task not found' }]
    if (index === 0) return [403, { error: 'This task cannot be refreshed' }]
    if (currentTask.refreshed) return [403, { error: 'Task already refreshed' }]
    if (currentTask.checked) return [403, { error: 'Completed tasks cannot be refreshed' }]

    if (!user.task_refresh && goal.xp <= 0 && goal.level <= 1) {
      return [403, { error: 'Not enough XP to refresh' }]
    }

    const currentTitles = tasks.map(t => t.title)
    const { rows: pool } = await client.query(
      `SELECT * FROM goal_tasks
       WHERE goal_id = $1 AND user_id = $2 AND title != '' AND level >= $3 AND level <= $4`,
      [goal.id, user.id, getMinTaskLevel(goal.level), getMaxTaskLevel(goal.level)]
    )
    const available = pool.filter(t => !currentTitles.includes(t.title))
    const source = available.length > 0 ? available : pool
    const newTask = source[Math.floor(Math.random() * source.length)]
    if (!newTask) return [400, { error: 'No tasks available to swap' }]

    if (!user.task_refresh) {
      const { xp, level } = deductXp(goal.xp, goal.level, REFRESH_COST)
      await setGoalXp(client, user, goal, xp, level)
    }

    await client.query(
      `UPDATE daily_tasks SET goal_task_id = $1, title = $2, level = $3, checked = FALSE, refreshed = TRUE
       WHERE id = $4 AND user_id = $5`,
      [newTask.id, newTask.title, newTask.level, currentTask.id, user.id]
    )

    return [200, {
      success: true,
      task: { id: newTask.id, title: newTask.title, level: newTask.level },
      xp: goal.xp,
      level: goal.level
    }]
  })
)

function penaltyTask(penalty) {
  return {
    title: penalty.task_title,
    difficulty: penalty.task_difficulty,
    timer_seconds: penalty.task_timer_seconds
  }
}

module.exports = router
