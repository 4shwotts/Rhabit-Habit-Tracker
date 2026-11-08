// Demo accounts: a throwaway account per visitor, signed in with one click and
// deleted 24 hours later. Each starts part-way through the game so there's
// something to see, and has fast timers (see timersFor in lib/game.js) so a
// visitor can watch a window run out and a penalty start.
//
// Times come from the server's clock (Date), not the database's now(), so
// creation, expiry and clean-up always agree.
const crypto = require('crypto')
const bcrypt = require('bcrypt')
const config = require('../config')
const { getTodayInTimezone, rollDailyTasks, timersFor } = require('./game')

const DEMO_EMAIL_DOMAIN = 'demo.invalid'

// when a demo created at `now` expires
function demoExpiry(now = new Date()) {
  return new Date(now.getTime() + config.demo.lifetimeHours * 60 * 60 * 1000)
}

// an address that can never receive mail: .invalid is reserved (RFC 2606)
function demoEmail() {
  return `demo-${crypto.randomBytes(12).toString('hex')}@${DEMO_EMAIL_DOMAIN}`
}

// What a new demo account starts with: a level 4 pathway part-way through its
// bar, plus two others at different points, so Goals has some history to show.
// Every value fits the database's rules and the per-user caps.
function buildDemoSeed() {
  return {
    username: 'Demo player',
    goals: [
      {
        name: 'Fitness',
        level: 4,
        xp: 55,
        active: true,
        tasks: {
          1: ['Walk 5,000 steps', 'Stretch for 10 minutes', 'Drink 2 litres of water'],
          2: ['Do 30 push-ups', 'Walk 8,000 steps', 'Hold a 1 minute plank'],
          3: ['Run 3km', 'Do 50 squats', 'Cycle for 30 minutes'],
          4: ['Run 5km', 'Do 60 push-ups', 'Complete a 30 minute workout'],
          5: ['Run 8km', 'Do 100 squats']
        }
      },
      {
        name: 'Study',
        level: 2,
        xp: 30,
        active: false,
        tasks: {
          1: ['Read for 15 minutes', 'Review yesterday\'s notes', 'Learn 5 new words'],
          2: ['Read for 30 minutes', 'Write a one-page summary', 'Do 10 practice questions'],
          3: ['Finish a chapter', 'Teach a topic out loud', 'Do a timed practice paper']
        }
      },
      {
        name: 'Art',
        level: 6,
        xp: 80,
        active: false,
        tasks: {
          4: ['Sketch for 30 minutes', 'Study one artist\'s style', 'Draw 3 hands'],
          5: ['Paint a small study', 'Draw from life for 45 minutes', 'Ink a finished sketch'],
          6: ['Finish a full illustration', 'Draw a scene from memory', 'Paint for 90 minutes']
        }
      }
    ],
    // today: started, with this many of the three tasks already ticked
    tickedToday: 1
  }
}

// Creates and seeds a demo account inside the caller's transaction. Returns the
// new user row (with token_version, ready for a session cookie).
async function createDemoAccount(client, { timezone = 'UTC', now = new Date() } = {}) {
  const seed = buildDemoSeed()
  // nobody can log in to a demo (login refuses them), but the column needs a
  // hash, so it's one of a random secret that's never kept
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 4)

  const { rows: userRows } = await client.query(
    `INSERT INTO users (email, username, password_hash, email_verified, timezone,
                        setup_complete, is_demo, expires_at)
     VALUES ($1, $2, $3, TRUE, $4, TRUE, TRUE, $5)
     RETURNING *`,
    [demoEmail(), seed.username, passwordHash, timezone, demoExpiry(now)]
  )
  const user = userRows[0]
  await client.query('INSERT INTO daily_state (user_id) VALUES ($1)', [user.id])
  await client.query('INSERT INTO penalty_state (user_id) VALUES ($1)', [user.id])

  let activeGoal = null
  for (const goal of seed.goals) {
    const { rows } = await client.query(
      `INSERT INTO goals (user_id, name, xp, level, starred) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [user.id, goal.name, goal.xp, goal.level, goal.active]
    )
    if (goal.active) activeGoal = rows[0]
    for (const [level, titles] of Object.entries(goal.tasks)) {
      for (const title of titles) {
        await client.query(
          'INSERT INTO goal_tasks (user_id, goal_id, level, title) VALUES ($1, $2, $3, $4)',
          [user.id, rows[0].id, Number(level), title]
        )
      }
    }
  }

  await client.query('UPDATE users SET active_goal_id = $1 WHERE id = $2', [activeGoal.id, user.id])
  user.active_goal_id = activeGoal.id

  // today's tasks, already started, with some ticked
  await rollDailyTasks(client, user.id, activeGoal)
  await client.query(
    `UPDATE daily_tasks SET checked = TRUE
     WHERE id IN (SELECT id FROM daily_tasks WHERE user_id = $1 ORDER BY id LIMIT $2)`,
    [user.id, seed.tickedToday]
  )
  const { rows: tasks } = await client.query('SELECT level FROM daily_tasks WHERE user_id = $1', [user.id])
  const timers = timersFor(user)
  await client.query(
    `UPDATE daily_state SET
       goal_id = $1, last_reset = $2, started = TRUE, window_start = $3, window_seconds = $4
     WHERE user_id = $5`,
    [activeGoal.id, getTodayInTimezone(timezone), now, timers.windowForLevel(Math.max(...tasks.map(t => t.level))), user.id]
  )

  return user
}

// Deletes every demo that has expired, and all of its data (every table
// cascades from users). Only ever matches demos: see migration 005.
async function deleteExpiredDemos(db, now = new Date()) {
  const { rowCount } = await db.query(
    'DELETE FROM users WHERE is_demo AND expires_at <= $1', [now]
  )
  return rowCount
}

// how many demos are still live
async function countActiveDemos(db, now = new Date()) {
  const { rows } = await db.query(
    'SELECT count(*)::int AS count FROM users WHERE is_demo AND expires_at > $1', [now]
  )
  return rows[0].count
}

module.exports = {
  DEMO_EMAIL_DOMAIN, demoExpiry, demoEmail, buildDemoSeed,
  createDemoAccount, deleteExpiredDemos, countActiveDemos
}
