const db = require('../db/database')

// window shrinks as you level up to keep things challenging
function getWindowSeconds(level) {
  if (level <= 3) return 3 * 60 * 60
  if (level <= 6) return 2 * 60 * 60
  if (level <= 9) return Math.floor(1.5 * 60 * 60)
  return 1 * 60 * 60
}

// every 5 levels unlocks the next tier of tasks
function getUnlockedTaskLevel(userLevel) {
  const tier = Math.floor((userLevel - 1) / 5)
  return Math.min(tier + 1, 10)
}

// using Intl here because JS Date is unreliable across timezones
function getTodayInTimezone(timezone) {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    return formatter.format(now)
  } catch {
    return new Date().toISOString().split('T')[0]
  }
}

// always guarantee one task from the highest unlocked tier so progression feels meaningful,
// then fill the rest randomly from the full unlocked pool
function generateTasks(goalId, unlockedLevel) {
  const pool = db.prepare(`
    SELECT * FROM goal_tasks
    WHERE goal_id = ? AND title != '' AND level <= ?
  `).all(goalId, unlockedLevel)

  if (pool.length === 0) return []

  const highestTier = pool.filter(t => t.level === unlockedLevel)
  let selected = []

  if (highestTier.length > 0) {
    const pick = highestTier[Math.floor(Math.random() * highestTier.length)]
    selected.push(pick)
  }

  const rest = pool.filter(t => !selected.find(s => s.id === t.id))
  selected = [...selected, ...rest.sort(() => Math.random() - 0.5)].slice(0, 3)

  return selected
}

// runs on every API request — checks if the date has rolled over and resets if so
function checkDailyReset(req, res, next) {
  const user = db.prepare('SELECT * FROM user WHERE id = 1').get()
  if (!user) return next()

  const state = db.prepare('SELECT * FROM daily_state WHERE id = 1').get()
  if (!state) return next()

  // don't reset if the user has paused progression
  if (user.pause_progression) return next()

  const today = getTodayInTimezone(user.timezone)

  if (state.last_reset !== today) {
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(user.active_goal_id)

    db.prepare('DELETE FROM daily_tasks').run()

    if (goal) {
      const unlockedLevel = getUnlockedTaskLevel(goal.level)
      const tasks = generateTasks(goal.id, unlockedLevel)

      const insert = db.prepare(
        'INSERT INTO daily_tasks (goal_task_id, title, level, checked, refreshed) VALUES (?, ?, ?, 0, 0)'
      )
      tasks.forEach(task => insert.run(task.id, task.title, task.level))
    }

    db.prepare(`
      UPDATE daily_state SET
        started = 0,
        confirmed = 0,
        penalty_shown = 0,
        window_start = NULL,
        last_reset = ?
      WHERE id = 1
    `).run(today)

    db.prepare(`
      UPDATE penalty_state SET
        active = 0,
        task_title = NULL,
        task_difficulty = NULL,
        task_timer_seconds = NULL,
        started_at = NULL,
        confirmed = 0
      WHERE id = 1
    `).run()
  }

  next()
}

module.exports = { checkDailyReset, getWindowSeconds, getTodayInTimezone, getUnlockedTaskLevel, generateTasks }