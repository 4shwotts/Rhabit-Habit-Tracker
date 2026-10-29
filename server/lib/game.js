// Game rules shared by the daily reset and the routes.
const config = require('../config')
//
// DEMO VALUES: windows, XP amounts and unlock times are shortened so the full
// flow can be tested quickly. Swap these for the real values before launch.
const XP_PER_TASK = 5
const PENALTY_XP = 15
const REFRESH_COST = 5
const XP_PER_LEVEL = 100
// TEST_TIMERS (local only, see config.js): 30-second windows and penalties,
// confirm unlocking after 10 seconds
const TEST_TIMER_SECONDS = 30
const TEST_CONFIRM_AFTER = 10

// confirm button unlocks this many seconds before the window/penalty ends
const CONFIRM_UNLOCK_BEFORE_END = config.testTimers ? TEST_TIMER_SECONDS - TEST_CONFIRM_AFTER : 60
// if a session can't fit before midnight, a late penalty is only offered when
// at least this much of the day is left; otherwise XP is deducted straight away
const LATE_PENALTY_MIN_SECONDS = 3600
// allowance for network latency and clock drift between browser and server
const TIMING_GRACE_SECONDS = 5

// demo mode — shortened windows so visitors can test the full flow quickly
function getWindowSeconds(level) {
  if (config.testTimers) return TEST_TIMER_SECONDS
  if (level <= 3) return 5 * 60
  if (level <= 6) return 4 * 60
  if (level <= 9) return 3 * 60
  return 2 * 60
}

// each level up unlocks the matching task tier
function getMaxTaskLevel(userLevel) {
  return Math.min(userLevel, 10)
}

// as the user levels up, easier tasks are phased out to keep difficulty appropriate
function getMinTaskLevel(userLevel) {
  if (userLevel <= 3) return 1
  if (userLevel === 10) return 10
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
function windowForTasks(tasks) {
  const taskLevel = tasks.length > 0 ? Math.max(...tasks.map(t => t.level)) : 1
  return getWindowSeconds(taskLevel)
}

// Removes `amount` XP, dropping levels as needed but never below level 1 / 0 XP.
function deductXp(xp, level, amount) {
  let newXp = xp - amount
  let newLevel = level
  while (newXp < 0) {
    if (newLevel > 1) { newLevel -= 1; newXp = XP_PER_LEVEL + newXp }
    else { newXp = 0; break }
  }
  return { xp: newXp, level: newLevel }
}

// Adds `amount` XP, rolling over into new levels.
function addXp(xp, level, amount) {
  let newXp = xp + amount
  let newLevel = level
  while (newXp >= XP_PER_LEVEL) { newXp -= XP_PER_LEVEL; newLevel++ }
  return { xp: newXp, level: newLevel }
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

// Replaces the user's daily tasks with a freshly rolled set for the given goal.
async function rollDailyTasks(db, userId, goal) {
  await db.query('DELETE FROM daily_tasks WHERE user_id = $1', [userId])
  if (!goal) return

  const tasks = await generateTasks(
    db, userId, goal.id, getMinTaskLevel(goal.level), getMaxTaskLevel(goal.level)
  )
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
  CONFIRM_UNLOCK_BEFORE_END,
  TEST_TIMER_SECONDS,
  LATE_PENALTY_MIN_SECONDS,
  TIMING_GRACE_SECONDS,
  getSecondsUntilMidnight,
  windowForTasks,
  getWindowSeconds,
  getMaxTaskLevel,
  getMinTaskLevel,
  getTodayInTimezone,
  deductXp,
  addXp,
  generateTasks,
  rollDailyTasks
}
