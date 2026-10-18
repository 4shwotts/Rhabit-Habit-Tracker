// Server-side rules for the daily session. The browser shows timers, but every
// decision about windows, penalties and XP is made here from timestamps stored
// in the database — a client can't skip a timer, replay a confirm or award
// itself XP by calling the API directly.
const { getRandomPenaltyTask } = require('../data/penaltyTasks')
const {
  PENALTY_XP, LATE_PENALTY_MIN_SECONDS, TIMING_GRACE_SECONDS,
  getSecondsUntilMidnight, windowForTasks, deductXp
} = require('./game')

function secondsSince(timestamp) {
  return (Date.now() - new Date(timestamp).getTime()) / 1000
}

// Locks and loads today's state for the user. Must be called inside a
// transaction; FOR UPDATE serialises concurrent requests (e.g. a double-clicked
// confirm), so each one sees the result of the one before.
async function loadDay(client, user) {
  const { rows: stateRows } = await client.query(
    'SELECT * FROM daily_state WHERE user_id = $1 FOR UPDATE', [user.id]
  )
  const { rows: penaltyRows } = await client.query(
    'SELECT * FROM penalty_state WHERE user_id = $1 FOR UPDATE', [user.id]
  )
  const { rows: tasks } = await client.query(
    'SELECT * FROM daily_tasks WHERE user_id = $1 ORDER BY id ASC', [user.id]
  )

  // the goal this session belongs to (falls back to the active goal)
  const goalId = stateRows[0]?.goal_id ?? user.active_goal_id
  const { rows: goalRows } = goalId
    ? await client.query('SELECT * FROM goals WHERE id = $1 AND user_id = $2 FOR UPDATE', [goalId, user.id])
    : { rows: [] }

  const state = stateRows[0]
  const tasksWindow = windowForTasks(tasks)
  return {
    state,
    penalty: penaltyRows[0],
    tasks,
    goal: goalRows[0] || null,
    // fixed at start; before starting it's what the window *would* be
    windowSeconds: state?.window_seconds || tasksWindow
  }
}

async function setGoalXp(client, user, goal, xp, level) {
  await client.query(
    'UPDATE goals SET xp = $1, level = $2 WHERE id = $3 AND user_id = $4',
    [xp, level, goal.id, user.id]
  )
  goal.xp = xp
  goal.level = level
}

async function startPenalty(client, user, day, startedAt) {
  const task = getRandomPenaltyTask()
  await client.query(
    `UPDATE penalty_state SET
       active = TRUE, task_title = $1, task_difficulty = $2,
       task_timer_seconds = $3, started_at = $4, confirmed = FALSE
     WHERE user_id = $5`,
    [task.title, task.difficulty, task.timer_seconds, startedAt, user.id]
  )
  await client.query('UPDATE daily_state SET penalty_shown = TRUE WHERE user_id = $1', [user.id])
  Object.assign(day.penalty, {
    active: true, task_title: task.title, task_difficulty: task.difficulty,
    task_timer_seconds: task.timer_seconds, started_at: startedAt, confirmed: false
  })
  day.state.penalty_shown = true
  return task
}

// Penalty failed: lose a day's XP (never below level 1 / 0 XP) and close the day.
async function failPenalty(client, user, day) {
  if (day.goal) {
    const { xp, level } = deductXp(day.goal.xp, day.goal.level, PENALTY_XP)
    await setGoalXp(client, user, day.goal, xp, level)
  }
  await client.query('UPDATE penalty_state SET active = FALSE WHERE user_id = $1', [user.id])
  await client.query('UPDATE daily_state SET confirmed = TRUE WHERE user_id = $1', [user.id])
  day.penalty.active = false
  day.state.confirmed = true
}

function penaltyExpired(penalty) {
  return penalty.active &&
    secondsSince(penalty.started_at) > penalty.task_timer_seconds + TIMING_GRACE_SECONDS
}

// Brings today's state up to date with the clock. Returns the loaded day plus
// an `outcome` describing anything that was applied on this call:
//   'penalty_failed'   — a penalty ran out without being confirmed
//   'window_missed'    — the window ran out with tasks unticked; penalty started
//   'late_penalty'     — too late in the day to start; penalty offered instead
//   'late_auto_failed' — too late even for a penalty; XP deducted immediately
async function settleDay(client, user) {
  const day = await loadDay(client, user)
  const { state, penalty, tasks } = day
  day.outcome = null
  if (!state || !penalty || state.confirmed) return day

  // 1. a running penalty whose timer has run out counts as failed
  if (penaltyExpired(penalty)) {
    await failPenalty(client, user, day)
    day.outcome = 'penalty_failed'
    return day
  }

  // 2. the window ran out with unticked tasks: the penalty starts from the
  //    moment the window ended (even if the tab was closed at the time)
  const allChecked = tasks.length > 0 && tasks.every(t => t.checked)
  if (state.started && !state.penalty_shown && !allChecked &&
      secondsSince(state.window_start) > day.windowSeconds + TIMING_GRACE_SECONDS) {
    const windowEnd = new Date(new Date(state.window_start).getTime() + day.windowSeconds * 1000)
    await startPenalty(client, user, day, windowEnd)
    day.outcome = 'window_missed'
    if (penaltyExpired(day.penalty)) {
      await failPenalty(client, user, day)
      day.outcome = 'penalty_failed'
    }
    return day
  }

  // 3. "smart late detection": not started, and the window no longer fits
  //    before midnight in the user's timezone
  if (!state.started && !state.penalty_shown && !user.pause_progression &&
      day.goal && tasks.length > 0) {
    const secondsLeft = getSecondsUntilMidnight(user.timezone)
    if (secondsLeft < day.windowSeconds) {
      if (secondsLeft >= LATE_PENALTY_MIN_SECONDS) {
        await startPenalty(client, user, day, new Date())
        day.outcome = 'late_penalty'
      } else {
        const { xp, level } = deductXp(day.goal.xp, day.goal.level, PENALTY_XP)
        await setGoalXp(client, user, day.goal, xp, level)
        await client.query(
          'UPDATE daily_state SET confirmed = TRUE, penalty_shown = TRUE WHERE user_id = $1', [user.id]
        )
        state.confirmed = true
        state.penalty_shown = true
        day.outcome = 'late_auto_failed'
      }
    }
  }

  return day
}

module.exports = { settleDay, startPenalty, failPenalty, setGoalXp, secondsSince }
