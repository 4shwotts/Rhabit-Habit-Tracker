// Game rules shared by the daily reset and the routes.
const config = require('../config')

const XP_PER_TASK = 15
// a whole day's worth of XP (three tasks)
const PENALTY_XP = 45
const REFRESH_COST = 10
const XP_PER_LEVEL = 100
// levels stop here; the final level's bar fills to 100/100 XP and stays full
const MAX_LEVEL = 10
const MAX_TOTAL_XP = MAX_LEVEL * XP_PER_LEVEL
// TEST_TIMERS (local only, see config.js): 30-second windows and penalties,
// confirm unlocking after 10 seconds
const TEST_TIMER_SECONDS = 30
const TEST_CONFIRM_AFTER = 10

// confirm button unlocks this many seconds before the window ends...
const CONFIRM_UNLOCK_BEFORE_END = config.testTimers ? TEST_TIMER_SECONDS - TEST_CONFIRM_AFTER : 30 * 60
// ...and this many seconds before a penalty ends
const PENALTY_CONFIRM_UNLOCK_BEFORE_END = config.testTimers ? TEST_TIMER_SECONDS - TEST_CONFIRM_AFTER : 10 * 60
// how long every penalty lasts. One that can't finish before midnight is never
// started; the XP is deducted straight away instead (see lib/session.js)
const PENALTY_SECONDS = config.testTimers ? TEST_TIMER_SECONDS : 60 * 60
// allowance for network latency and clock drift between browser and server
const TIMING_GRACE_SECONDS = 5

// Demo accounts (lib/demo.js) get fast timers so a visitor can see a window run
// out and a penalty start: a 3-minute window with confirm open after 1 minute,
// and a 2-minute penalty with confirm open after 30 seconds.
const DEMO_WINDOW_SECONDS = 3 * 60
const DEMO_CONFIRM_AFTER = 60
const DEMO_PENALTY_SECONDS = 2 * 60
const DEMO_PENALTY_CONFIRM_AFTER = 30

// harder task tiers get shorter windows
function getWindowSeconds(level) {
  if (config.testTimers) return TEST_TIMER_SECONDS
  if (level <= 3) return 3 * 60 * 60
  if (level <= 6) return 2 * 60 * 60
  if (level <= 9) return 90 * 60
  return 60 * 60
}

// Every timer that applies to `user`. Decided here on the server from the
// account itself, never from anything the browser sends.
function timersFor(user) {
  if (user?.is_demo) {
    return {
      windowForLevel: () => DEMO_WINDOW_SECONDS,
      confirmUnlockBeforeEnd: DEMO_WINDOW_SECONDS - DEMO_CONFIRM_AFTER,
      penaltySeconds: DEMO_PENALTY_SECONDS,
      penaltyConfirmUnlockBeforeEnd: DEMO_PENALTY_SECONDS - DEMO_PENALTY_CONFIRM_AFTER
    }
  }
  return {
    windowForLevel: getWindowSeconds,
    confirmUnlockBeforeEnd: CONFIRM_UNLOCK_BEFORE_END,
    penaltySeconds: PENALTY_SECONDS,
    penaltyConfirmUnlockBeforeEnd: PENALTY_CONFIRM_UNLOCK_BEFORE_END
  }
}

// each level up unlocks the matching task tier
function getMaxTaskLevel(userLevel) {
  return Math.min(userLevel, 10)
}

// as the user levels up, easier tasks are phased out to keep difficulty appropriate
function getMinTaskLevel(userLevel) {
  if (userLevel <= 3) return 1
  // from level 10 on only the top tier is left (tiers stop at 10, so going on
  // with `level - 2` would ask for tiers that don't exist)
  if (userLevel >= 10) return 10
  return userLevel - 2
}

// using Intl here because JS Date is unreliable across timezones
function getTodayInTimezone(timezone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    return formatter.format(new Date())
  } catch {
    return new Date().toISOString().split('T')[0]
  }
}

// Whole days from one 'YYYY-MM-DD' date to a later one.
function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000)
}

// Yesterday's 'YYYY-MM-DD' date in the user's timezone.
function getYesterdayInTimezone(timezone) {
  const today = Date.parse(getTodayInTimezone(timezone))
  return new Date(today - 86400000).toISOString().split('T')[0]
}

// Seconds left until midnight in the user's timezone (decides "too late to start").
function getSecondsUntilMidnight(timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).formatToParts(new Date())
    const get = type => parseInt(parts.find(p => p.type === type).value, 10)
    // some engines report midnight as hour 24
    const h = get('hour') % 24, m = get('minute'), s = get('second')
    return 86400 - (h * 3600 + m * 60 + s)
  } catch {
    const now = new Date()
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0)
    return Math.floor((midnight - now) / 1000)
  }
}

// window length is driven by the highest level task rolled for today
function windowForTasks(tasks, user) {
  const taskLevel = tasks.length > 0 ? Math.max(...tasks.map(t => t.level)) : 1
  return timersFor(user).windowForLevel(taskLevel)
}

// Most XP a single action can add or remove: one level's worth. The largest
// real change is 15 (three tasks, or a penalty), so this only stops a bug from
// awarding or wiping a huge amount in one go.
const MAX_XP_PER_ACTION = XP_PER_LEVEL

// XP amounts must be whole numbers of 0 or more. Anything else is a bug in the
// caller, so fail loudly (the request rolls back) rather than store NaN or
// negative XP.
function checkAmount(amount) {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RangeError(`XP amount must be a whole number of 0 or more, got ${amount}`)
  }
  return Math.min(amount, MAX_XP_PER_ACTION)
}

// Levels are worked out from the total XP earned since level 1, with division
// rather than a loop, so the cost is the same whatever the amount.
const totalXp = (xp, level) => (level - 1) * XP_PER_LEVEL + xp
function fromTotal(total) {
  const capped = Math.min(total, MAX_TOTAL_XP)
  const level = Math.min(MAX_LEVEL, Math.floor(capped / XP_PER_LEVEL) + 1)
  return { xp: capped - (level - 1) * XP_PER_LEVEL, level }
}

// Removes `amount` XP, dropping levels as needed but never below level 1 / 0 XP.
function deductXp(xp, level, amount) {
  return fromTotal(Math.max(0, totalXp(xp, level) - checkAmount(amount)))
}

// Adds `amount` XP, rolling over into new levels, up to a full bar at MAX_LEVEL.
function addXp(xp, level, amount) {
  return fromTotal(totalXp(xp, level) + checkAmount(amount))
}

// A full bar at the top level ends the pathway: no more tasks, and no more
// XP to win or lose on it.
function isPathwayComplete(goal) {
  return goal.level >= MAX_LEVEL && goal.xp >= XP_PER_LEVEL
}

// always guarantee one task from the highest unlocked tier so progression feels meaningful,
// then fill the rest randomly from the full unlocked pool.
// `db` is either the shared query interface or a transaction client.
async function generateTasks(db, userId, goalId, minLevel, maxLevel) {
  const { rows: pool } = await db.query(
    `SELECT * FROM goal_tasks
     WHERE goal_id = $1 AND user_id = $2 AND title != '' AND level >= $3 AND level <= $4`,
    [goalId, userId, minLevel, maxLevel]
  )

  if (pool.length === 0) return []

  const highestTier = pool.filter(t => t.level === maxLevel)
  let selected = []

  if (highestTier.length > 0) {
    selected.push(highestTier[Math.floor(Math.random() * highestTier.length)])
  }

  const rest = pool.filter(t => !selected.find(s => s.id === t.id))
  selected = [...selected, ...rest.sort(() => Math.random() - 0.5)].slice(0, 3)

  return selected
}

// The window the player gets after levelling up, or null if it isn't changing.
// The first task rolled always comes from the top unlocked tier if that tier
// has any tasks, and the hardest task rolled sets the window. An empty tier
// leaves the window as it was until the player adds tasks to it.
async function windowAfterLevelUp(db, user, goal, currentSeconds) {
  const tier = getMaxTaskLevel(goal.level)
  const { rows } = await db.query(
    `SELECT 1 FROM goal_tasks
     WHERE goal_id = $1 AND user_id = $2 AND title != '' AND level = $3 LIMIT 1`,
    [goal.id, user.id, tier]
  )
  if (rows.length === 0) return null
  const seconds = timersFor(user).windowForLevel(tier)
  return seconds === currentSeconds ? null : seconds
}

// Today's tasks for a goal at its current level (none once it's finished).
function tasksForGoal(db, userId, goal) {
  if (isPathwayComplete(goal)) return []
  return generateTasks(db, userId, goal.id, getMinTaskLevel(goal.level), getMaxTaskLevel(goal.level))
}

// Replaces the user's daily tasks with a freshly rolled set for the given goal.
async function rollDailyTasks(db, userId, goal) {
  await db.query('DELETE FROM daily_tasks WHERE user_id = $1', [userId])
  if (!goal) return

  const tasks = await tasksForGoal(db, userId, goal)
  for (const task of tasks) {
    await db.query(
      `INSERT INTO daily_tasks (user_id, goal_task_id, title, level, checked, refreshed)
       VALUES ($1, $2, $3, $4, FALSE, FALSE)`,
      [userId, task.id, task.title, task.level]
    )
  }
}

module.exports = {
  XP_PER_TASK,
  PENALTY_XP,
  REFRESH_COST,
  XP_PER_LEVEL,
  MAX_LEVEL,
  isPathwayComplete,
  tasksForGoal,
  windowAfterLevelUp,
  MAX_XP_PER_ACTION,
  CONFIRM_UNLOCK_BEFORE_END,
  PENALTY_CONFIRM_UNLOCK_BEFORE_END,
  TEST_TIMER_SECONDS,
  PENALTY_SECONDS,
  TIMING_GRACE_SECONDS,
  getSecondsUntilMidnight,
  windowForTasks,
  getWindowSeconds,
  timersFor,
  getMaxTaskLevel,
  getMinTaskLevel,
  getTodayInTimezone,
  getYesterdayInTimezone,
  daysBetween,
  totalXp,
  deductXp,
  addXp,
  generateTasks,
  rollDailyTasks
}
