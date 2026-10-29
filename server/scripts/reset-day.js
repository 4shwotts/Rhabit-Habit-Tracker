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

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase()
  if (!email) {
    console.error('Usage: npm run reset-day -- you@example.com')
    process.exitCode = 1
    return
  }
  const { rowCount } = await query(
    "UPDATE daily_state SET last_reset = '1970-01-01' WHERE user_id = (SELECT id FROM users WHERE email = $1)",
    [email]
  )
  console.log(rowCount ? `Day reset for ${email}. Reload Home for fresh tasks.` : `No account found for ${email}.`)
}

main()
  .catch(err => { console.error(err.message); process.exitCode = 1 })
  .finally(() => pool.end())
