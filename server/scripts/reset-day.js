// Local testing helper: gives an account a fresh day without waiting for
// midnight. Backdating last_reset makes the next game request roll new tasks and
// clear today's progress and any penalty (see middleware/checkDailyReset.js).
// XP and level are left alone.
//
//   npm run reset-day -- you@example.com
//
// Uses DATABASE_URL from server/.env, so only run it against a database you
// mean to change.
const { query, pool } = require('../db')
const { getYesterdayInTimezone } = require('../lib/game')

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase()
  if (!email) {
    console.error('Usage: npm run reset-day -- you@example.com')
    process.exitCode = 1
    return
  }
  const { rows } = await query('SELECT id, timezone FROM users WHERE email = $1', [email])
  // yesterday and confirmed, so the reset finds no missed days to charge for
  const { rowCount } = rows[0]
    ? await query(
      'UPDATE daily_state SET last_reset = $1, confirmed = TRUE WHERE user_id = $2',
      [getYesterdayInTimezone(rows[0].timezone), rows[0].id]
    )
    : { rowCount: 0 }
  console.log(rowCount ? `Day reset for ${email}. Reload Home for fresh tasks.` : `No account found for ${email}.`)
}

main()
  .catch(err => { console.error(err.message); process.exitCode = 1 })
  .finally(() => pool.end())
